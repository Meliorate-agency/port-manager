use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

use crate::config;
use crate::models::{AppConfig, ProcessStatus, RunningProcess, SystemPortInfo};
use crate::port_scanner;
use crate::process_manager::ProcessManager;

pub struct AppState {
    pub process_manager: ProcessManager,
    pub config: Mutex<AppConfig>,
    pub config_path: PathBuf,
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
