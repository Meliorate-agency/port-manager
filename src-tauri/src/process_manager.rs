use std::collections::HashMap;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use crate::models::ProcessStatus;

pub struct RunningProcessHandle {
    pub pid: u32,
    pub child: Child,
    pub ports: Vec<u16>,
    pub status: ProcessStatus,
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
            child,
            ports: Vec::new(),
            status: ProcessStatus::Starting,
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
            drop(processes);
            kill_process_tree(pid)?;
            Ok(())
        } else {
            Err("Process not found".to_string())
        }
    }

    pub fn is_process_alive(&self, id: &str) -> bool {
        let processes = match self.processes.lock() {
            Ok(p) => p,
            Err(_) => return false,
        };

        if let Some(handle) = processes.get(id) {
            let mut sys = sysinfo::System::new();
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
            sys.process(sysinfo::Pid::from_u32(handle.pid)).is_some()
        } else {
            false
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
