use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

use crate::config;
use crate::models::{AppConfig, PortResources, ProcessResources, ProcessStatus, RunningProcess, SystemPortInfo};
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
pub fn start_process(id: String, state: State<'_, AppState>) -> Result<u32, String> {
    let config = state
        .config
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let saved = config
        .processes
        .iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "Process not found in config".to_string())?;

    let command = saved.command.clone();
    let directory = saved.directory.clone();
    drop(config);

    state
        .process_manager
        .spawn_process(&id, &command, &directory)
}

#[tauri::command]
pub fn stop_process(id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.process_manager.stop_process(&id)
}

#[tauri::command]
pub fn kill_system_process(pid: u32) -> Result<(), String> {
    crate::process_manager::kill_process_tree(pid)
}

#[tauri::command]
pub fn save_config(config: AppConfig, state: State<'_, AppState>) -> Result<(), String> {
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

    for (id, handle) in processes.iter_mut() {
        let mut sys = sysinfo::System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

        if sys.process(sysinfo::Pid::from_u32(handle.pid)).is_none() {
            dead_ids.push(id.clone());
            results.push(RunningProcess {
                id: id.clone(),
                pid: handle.pid,
                status: ProcessStatus::Stopped,
                ports: Vec::new(),
            });
            continue;
        }

        let ports = port_scanner::get_ports_for_pid_tree(handle.pid);
        handle.ports = ports.clone();

        if !ports.is_empty() && handle.status == ProcessStatus::Starting {
            handle.status = ProcessStatus::Running;
        }

        // Save discovered ports for persistence
        if !ports.is_empty() {
            ports_to_save.push((id.clone(), ports.clone()));
        }

        results.push(RunningProcess {
            id: id.clone(),
            pid: handle.pid,
            status: handle.status.clone(),
            ports,
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
                let _ = config::save_config(&state.config_path, &cfg);
            }
        }
    }

    Ok(results)
}

#[tauri::command]
pub fn refresh_ports(state: State<'_, AppState>) -> Result<Vec<RunningProcess>, String> {
    get_running_status(state)
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
