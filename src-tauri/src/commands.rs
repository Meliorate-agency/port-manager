use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

use crate::config;
use crate::models::{AppConfig, PortResources, ProcessLogResult, ProcessResources, ProcessStatus, ProcessType, RunMode, RunningProcess, SystemPortInfo};
use crate::port_scanner;
use crate::process_manager::ProcessManager;

pub struct AppState {
    pub process_manager: ProcessManager,
    pub config: Mutex<AppConfig>,
    pub config_path: PathBuf,
    pub system: Mutex<sysinfo::System>,
}

#[tauri::command]
pub fn list_system_ports() -> Vec<SystemPortInfo> {
    port_scanner::get_all_listening_ports()
}

#[tauri::command]
pub fn start_process(id: String, mode: Option<String>, state: State<'_, AppState>) -> Result<u32, String> {
    let run_mode = match mode.as_deref() {
        Some("Prod") => RunMode::Prod,
        _ => RunMode::Dev,
    };

    let config = state
        .config
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let saved = config
        .processes
        .iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "Process not found in config".to_string())?;

    // Resolve command/directory/compose_file based on run mode
    let command = if run_mode == RunMode::Prod {
        saved.prod_command.clone().unwrap_or_else(|| saved.command.clone())
    } else {
        saved.command.clone()
    };
    let directory = if run_mode == RunMode::Prod {
        saved.prod_directory.clone().unwrap_or_else(|| saved.directory.clone())
    } else {
        saved.directory.clone()
    };
    let compose_file = if run_mode == RunMode::Prod {
        saved.prod_compose_file.clone().or_else(|| saved.compose_file.clone())
    } else {
        saved.compose_file.clone()
    };
    let process_type = saved.process_type.clone();
    let container_id = saved.container_id.clone();
    drop(config);

    match process_type {
        ProcessType::DockerCompose => {
            let compose_file = compose_file.ok_or("Docker Compose process missing compose_file")?;
            // Spawn docker compose up -d
            let cmd = format!("docker compose -f {} up -d", compose_file);
            let pid = state
                .process_manager
                .spawn_process(&id, &cmd, &directory)?;
            // Mark the handle as docker so status polling uses docker compose ps
            {
                let mut processes = state
                    .process_manager
                    .processes
                    .lock()
                    .map_err(|e| format!("Lock error: {}", e))?;
                if let Some(handle) = processes.get_mut(&id) {
                    handle.is_docker = true;
                    handle.compose_file = Some(compose_file.clone());
                    handle.compose_directory = Some(directory.clone());
                    handle.run_mode = run_mode;
                }
            }
            // Start following docker compose logs in background
            let _ = state.process_manager.spawn_docker_log_follow(&id, &compose_file, &directory);
            Ok(pid)
        }
        ProcessType::Command => {
            let pid = state
                .process_manager
                .spawn_process(&id, &command, &directory)?;
            // Store the run mode on the handle
            {
                let mut processes = state
                    .process_manager
                    .processes
                    .lock()
                    .map_err(|e| format!("Lock error: {}", e))?;
                if let Some(handle) = processes.get_mut(&id) {
                    handle.run_mode = run_mode;
                }
            }
            Ok(pid)
        }
        ProcessType::DockerContainer => {
            let container_id = container_id
                .ok_or("Docker Container process missing container_id")?;

            // Start the container
            crate::docker::start_container(&container_id)?;

            // Create a handle (no spawned child — docker manages the process)
            let log_buffer = std::sync::Arc::new(crate::process_manager::LogBuffer::new());
            let handle = crate::process_manager::RunningProcessHandle {
                pid: 0,
                child: None,
                ports: Vec::new(),
                status: ProcessStatus::Starting,
                started_at: std::time::Instant::now(),
                is_docker: true,
                compose_file: None,
                compose_directory: None,
                run_mode,
                log_buffer: log_buffer.clone(),
                log_child: None,
                container_id: Some(container_id.clone()),
            };

            state.process_manager.processes
                .lock()
                .map_err(|e| format!("Lock error: {}", e))?
                .insert(id.clone(), handle);

            // Spawn docker log follow for this container
            let _ = state.process_manager.spawn_container_log_follow(&id, &container_id);

            Ok(0)
        }
    }
}

#[tauri::command]
pub fn stop_process(id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.process_manager.stop_process(&id)
}

#[tauri::command]
pub fn kill_system_process(pid: u32) -> Result<(), String> {
    crate::process_manager::kill_process_tree(pid)
}

fn validate_no_shell_metacharacters(value: &str, field_name: &str) -> Result<(), String> {
    const DANGEROUS: &[char] = &['&', '|', ';', '$', '`', '\'', '"', '<', '>', '(', ')', '{', '}', '\n', '\r'];
    if value.chars().any(|c| DANGEROUS.contains(&c)) {
        return Err(format!("{} contains invalid characters", field_name));
    }
    Ok(())
}

#[tauri::command]
pub fn save_config(config: AppConfig, state: State<'_, AppState>) -> Result<(), String> {
    // Validate inputs before saving
    for p in &config.processes {
        if let Some(ref compose_file) = p.compose_file {
            validate_no_shell_metacharacters(compose_file, "Compose file path")?;
        }
    }

    let mut current = state
        .config
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    *current = config.clone();
    config::save_config(&state.config_path, &config)
}

#[tauri::command]
pub fn load_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    let config = state
        .config
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    Ok(config.clone())
}

#[tauri::command]
pub fn get_running_status(state: State<'_, AppState>) -> Result<Vec<RunningProcess>, String> {
    let mut processes = state
        .process_manager
        .processes
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let mut results = Vec::new();
    let mut dead_ids = Vec::new();
    let mut ports_to_save: Vec<(String, Vec<u16>)> = Vec::new();

    // Pre-fetch all listening ports for fallback detection (e.g. docker compose -d)
    let all_listening = port_scanner::get_all_listening_ports();

    // Snapshot last_ports from config for orphaned process detection
    let last_ports_map: std::collections::HashMap<String, Vec<u16>> = state.config.lock()
        .ok()
        .map(|cfg| cfg.processes.iter().map(|p| (p.id.clone(), p.last_ports.clone())).collect())
        .unwrap_or_default();

    // Create system snapshot once for all PID checks
    let mut sys = sysinfo::System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    for (id, handle) in processes.iter_mut() {
        // Docker Container — query individual container by ID/name
        if let Some(container_id) = &handle.container_id {
            if let Some(cs) = crate::docker::get_container_status(container_id) {
                // Always save configured ports (available even when stopped)
                if !cs.ports.is_empty() {
                    handle.ports = cs.ports.clone();
                    ports_to_save.push((id.clone(), cs.ports.clone()));
                }

                if cs.running {
                    handle.status = ProcessStatus::Running;
                    results.push(RunningProcess {
                        id: id.clone(),
                        pid: 0,
                        status: ProcessStatus::Running,
                        ports: cs.ports,
                        run_mode: handle.run_mode.clone(),
                    });
                } else {
                    let elapsed = handle.started_at.elapsed().as_secs();
                    if elapsed < 30 {
                        handle.status = ProcessStatus::Starting;
                        results.push(RunningProcess {
                            id: id.clone(),
                            pid: 0,
                            status: ProcessStatus::Starting,
                            ports: cs.ports,
                            run_mode: handle.run_mode.clone(),
                        });
                    } else {
                        dead_ids.push(id.clone());
                        results.push(RunningProcess {
                            id: id.clone(),
                            pid: 0,
                            status: ProcessStatus::Stopped,
                            ports: cs.ports,
                            run_mode: handle.run_mode.clone(),
                        });
                    }
                }
            } else {
                dead_ids.push(id.clone());
            }
            continue;
        }

        if handle.is_docker {
            // Docker Compose process — query docker compose ps directly
            if let (Some(compose_file), Some(compose_dir)) =
                (&handle.compose_file, &handle.compose_directory)
            {
                let containers =
                    crate::docker::get_compose_status(compose_file, compose_dir);
                let running_containers: Vec<_> = containers
                    .iter()
                    .filter(|c| c.state == "running")
                    .collect();

                if !running_containers.is_empty() {
                    let mut ports: Vec<u16> = Vec::new();
                    for c in &running_containers {
                        for &p in &c.ports {
                            if !ports.contains(&p) {
                                ports.push(p);
                            }
                        }
                    }
                    handle.ports = ports.clone();
                    handle.status = ProcessStatus::Running;
                    if !ports.is_empty() {
                        ports_to_save.push((id.clone(), ports.clone()));
                    }
                    results.push(RunningProcess {
                        id: id.clone(),
                        pid: 0,
                        status: ProcessStatus::Running,
                        ports,
                        run_mode: handle.run_mode.clone(),
                    });
                } else {
                    // No running containers — check grace period
                    let elapsed = handle.started_at.elapsed().as_secs();
                    if elapsed < 90 {
                        handle.status = ProcessStatus::Starting;
                        results.push(RunningProcess {
                            id: id.clone(),
                            pid: 0,
                            status: ProcessStatus::Starting,
                            ports: Vec::new(),
                            run_mode: handle.run_mode.clone(),
                        });
                    } else {
                        dead_ids.push(id.clone());
                        results.push(RunningProcess {
                            id: id.clone(),
                            pid: 0,
                            status: ProcessStatus::Stopped,
                            ports: Vec::new(),
                            run_mode: handle.run_mode.clone(),
                        });
                    }
                }
            } else {
                dead_ids.push(id.clone());
            }
            continue;
        }

        // Regular command process — PID-based detection
        if sys.process(sysinfo::Pid::from_u32(handle.pid)).is_none() {
            // Process PID is dead — check if its expected ports are still listening.
            let mut expected_ports: Vec<u16> = handle.ports.clone();
            if let Some(config_ports) = last_ports_map.get(id) {
                for p in config_ports {
                    if !expected_ports.contains(p) {
                        expected_ports.push(*p);
                    }
                }
            }

            let still_active: Vec<u16> = expected_ports.iter()
                .filter(|port| {
                    all_listening.iter().any(|lp| lp.local_port == **port && lp.state == "Listen")
                })
                .copied()
                .collect();

            if !still_active.is_empty() {
                handle.ports = still_active.clone();
                handle.status = ProcessStatus::Running;
                ports_to_save.push((id.clone(), still_active.clone()));
                results.push(RunningProcess {
                    id: id.clone(),
                    pid: handle.pid,
                    status: ProcessStatus::Running,
                    ports: still_active,
                    run_mode: handle.run_mode.clone(),
                });
            } else {
                let elapsed = handle.started_at.elapsed().as_secs();
                if elapsed < 90 {
                    handle.status = ProcessStatus::Starting;
                    results.push(RunningProcess {
                        id: id.clone(),
                        pid: handle.pid,
                        status: ProcessStatus::Starting,
                        ports: Vec::new(),
                        run_mode: handle.run_mode.clone(),
                    });
                } else {
                    // Preserve last-known ports before removing handle
                    if !handle.ports.is_empty() {
                        ports_to_save.push((id.clone(), handle.ports.clone()));
                    }
                    dead_ids.push(id.clone());
                    results.push(RunningProcess {
                        id: id.clone(),
                        pid: handle.pid,
                        status: ProcessStatus::Stopped,
                        ports: Vec::new(),
                        run_mode: handle.run_mode.clone(),
                    });
                }
            }
            continue;
        }

        let ports = port_scanner::get_ports_for_pid_tree(handle.pid);
        handle.ports = ports.clone();

        if !ports.is_empty() && handle.status == ProcessStatus::Starting {
            handle.status = ProcessStatus::Running;
        }

        if !ports.is_empty() {
            ports_to_save.push((id.clone(), ports.clone()));
        }

        results.push(RunningProcess {
            id: id.clone(),
            pid: handle.pid,
            status: handle.status.clone(),
            ports,
            run_mode: handle.run_mode.clone(),
        });
    }

    for id in dead_ids {
        processes.remove(&id);
    }

    drop(processes);

    // Persist last-known ports to config
    if !ports_to_save.is_empty() {
        if let Ok(mut cfg) = state.config.lock() {
            let mut changed = false;
            for (id, ports) in &ports_to_save {
                if let Some(proc) = cfg.processes.iter_mut().find(|p| p.id == *id) {
                    if proc.last_ports != *ports {
                        proc.last_ports = ports.clone();
                        changed = true;
                    }
                }
            }
            if changed {
                if let Err(e) = config::save_config(&state.config_path, &cfg) {
                    eprintln!("Failed to persist port config: {}", e);
                }
            }
        }
    }

    Ok(results)
}

#[tauri::command]
pub fn get_process_resources(state: State<'_, AppState>) -> Result<Vec<ProcessResources>, String> {
    use netstat2::{get_sockets_info, AddressFamilyFlags, ProtocolFlags, ProtocolSocketInfo};
    use std::collections::{HashMap, HashSet};

    let processes = state
        .process_manager
        .processes
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let mut sys = state
        .system
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    // Build a map: port -> PID that is listening on it
    let af_flags = AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6;
    let proto_flags = ProtocolFlags::TCP | ProtocolFlags::UDP;
    let sockets = get_sockets_info(af_flags, proto_flags).unwrap_or_default();

    let mut port_to_pid: HashMap<u16, u32> = HashMap::new();
    for socket in &sockets {
        for &pid in &socket.associated_pids {
            match &socket.protocol_socket_info {
                ProtocolSocketInfo::Tcp(tcp) => {
                    if matches!(tcp.state, netstat2::TcpState::Listen) {
                        port_to_pid.entry(tcp.local_port).or_insert(pid);
                    }
                }
                ProtocolSocketInfo::Udp(udp) => {
                    port_to_pid.entry(udp.local_port).or_insert(pid);
                }
            }
        }
    }

    // Helper: get subtree PIDs for a given PID
    let get_subtree = |root_pid: u32| -> HashSet<u32> {
        let mut tree = HashSet::new();
        tree.insert(root_pid);
        let mut changed = true;
        while changed {
            changed = false;
            for (pid, process) in sys.processes() {
                if let Some(parent) = process.parent() {
                    let pid_u32 = pid.as_u32();
                    let parent_u32 = parent.as_u32();
                    if tree.contains(&parent_u32) && !tree.contains(&pid_u32) {
                        tree.insert(pid_u32);
                        changed = true;
                    }
                }
            }
        }
        tree
    };

    let mut results = Vec::new();

    for (id, handle) in processes.iter() {
        if handle.status == ProcessStatus::Stopped {
            continue;
        }

        let mut port_resources = Vec::new();

        for &port in &handle.ports {
            if let Some(&listener_pid) = port_to_pid.get(&port) {
                // Get the subtree of the PID that owns this port
                let subtree = get_subtree(listener_pid);

                let mut cpu: f32 = 0.0;
                let mut memory: u64 = 0;
                for &pid in &subtree {
                    if let Some(proc) = sys.process(sysinfo::Pid::from_u32(pid)) {
                        cpu += proc.cpu_usage();
                        memory += proc.memory();
                    }
                }

                port_resources.push(PortResources {
                    port,
                    pid: listener_pid,
                    cpu_usage: cpu,
                    memory_bytes: memory,
                });
            }
        }

        results.push(ProcessResources {
            id: id.clone(),
            port_resources,
        });
    }

    Ok(results)
}

#[tauri::command]
pub fn get_process_logs(id: String, since: usize, state: State<'_, AppState>) -> Result<ProcessLogResult, String> {
    let processes = state
        .process_manager
        .processes
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    if let Some(handle) = processes.get(&id) {
        let (lines, offset) = handle.log_buffer.get_lines_since(since);
        Ok(ProcessLogResult { lines, offset })
    } else {
        Ok(ProcessLogResult { lines: Vec::new(), offset: 0 })
    }
}
