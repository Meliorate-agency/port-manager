use std::collections::HashMap;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Instant;

use crate::models::ProcessStatus;

pub struct RunningProcessHandle {
    pub pid: u32,
    pub child: Option<Child>,
    pub ports: Vec<u16>,
    pub status: ProcessStatus,
    pub started_at: Instant,
    pub is_docker: bool,
    pub compose_file: Option<String>,
    pub compose_directory: Option<String>,
}

pub struct ProcessManager {
    pub processes: Mutex<HashMap<String, RunningProcessHandle>>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            processes: Mutex::new(HashMap::new()),
        }
    }

    pub fn spawn_process(
        &self,
        id: &str,
        command: &str,
        directory: &str,
    ) -> Result<u32, String> {
        let child = Command::new("cmd")
            .args(["/C", command])
            .current_dir(directory)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to spawn process: {}", e))?;

        let pid = child.id();

        let handle = RunningProcessHandle {
            pid,
            child: Some(child),
            ports: Vec::new(),
            status: ProcessStatus::Starting,
            started_at: Instant::now(),
            is_docker: false,
            compose_file: None,
            compose_directory: None,
        };

        self.processes
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?
            .insert(id.to_string(), handle);

        Ok(pid)
    }

    pub fn stop_process(&self, id: &str) -> Result<(), String> {
        let mut processes = self
            .processes
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;

        if let Some(handle) = processes.remove(id) {
            let pid = handle.pid;
            let ports = handle.ports.clone();
            let is_docker = handle.is_docker;
            let compose_file = handle.compose_file.clone();
            let compose_directory = handle.compose_directory.clone();
            drop(processes);

            if is_docker {
                // For docker compose processes, run docker compose down
                if let (Some(file), Some(dir)) = (compose_file, compose_directory) {
                    crate::docker::stop_compose(&file, &dir)?;
                }
            } else {
                // Try to kill the original process tree
                let _ = kill_process_tree(pid);

                // Also kill any processes still listening on the tracked ports.
                if !ports.is_empty() {
                    let listening = crate::port_scanner::get_all_listening_ports();
                    let mut killed_pids = std::collections::HashSet::new();
                    for port_info in &listening {
                        if ports.contains(&port_info.local_port)
                            && port_info.state == "Listen"
                            && !killed_pids.contains(&port_info.pid)
                        {
                            killed_pids.insert(port_info.pid);
                            let _ = kill_process_tree(port_info.pid);
                        }
                    }
                }
            }

            Ok(())
        } else {
            Err("Process not found".to_string())
        }
    }

}

pub fn kill_process_tree(pid: u32) -> Result<(), String> {
    let result = kill_tree::blocking::kill_tree(pid);
    match result {
        Ok(_) => Ok(()),
        Err(e) => {
            // Process might already be dead
            let err_str = format!("{}", e);
            if err_str.contains("not found") || err_str.contains("No such process") {
                Ok(())
            } else {
                Err(format!("Failed to kill process tree: {}", e))
            }
        }
    }
}
