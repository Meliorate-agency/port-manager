use std::collections::HashMap;
use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use crate::models::{ProcessStatus, RunMode};

const LOG_BUFFER_CAPACITY: usize = 1000;

pub struct LogBuffer {
    lines: Mutex<VecDeque<String>>,
    capacity: usize,
}

impl LogBuffer {
    pub fn new() -> Self {
        Self {
            lines: Mutex::new(VecDeque::with_capacity(LOG_BUFFER_CAPACITY)),
            capacity: LOG_BUFFER_CAPACITY,
        }
    }

    pub fn push_line(&self, line: String) {
        if let Ok(mut buf) = self.lines.lock() {
            if buf.len() >= self.capacity {
                buf.pop_front();
            }
            buf.push_back(line);
        }
    }

    pub fn get_lines_since(&self, since: usize) -> (Vec<String>, usize) {
        if let Ok(buf) = self.lines.lock() {
            let total = buf.len();
            if since < total {
                let lines: Vec<String> = buf.iter().skip(since).cloned().collect();
                (lines, total)
            } else {
                (Vec::new(), total)
            }
        } else {
            (Vec::new(), 0)
        }
    }
}

pub struct RunningProcessHandle {
    pub pid: u32,
    pub child: Option<Child>,
    pub ports: Vec<u16>,
    pub status: ProcessStatus,
    pub started_at: Instant,
    pub is_docker: bool,
    pub compose_file: Option<String>,
    pub compose_directory: Option<String>,
    pub run_mode: RunMode,
    pub log_buffer: Arc<LogBuffer>,
    pub log_child: Option<Child>,
    pub container_id: Option<String>,
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
        let mut child = Command::new("cmd")
            .args(["/C", command])
            .current_dir(directory)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn process: {}", e))?;

        let pid = child.id();
        let log_buffer = Arc::new(LogBuffer::new());

        // Spawn stdout reader thread
        if let Some(stdout) = child.stdout.take() {
            let buf = Arc::clone(&log_buffer);
            std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    match line {
                        Ok(text) => buf.push_line(text),
                        Err(_) => break,
                    }
                }
            });
        }

        // Spawn stderr reader thread
        if let Some(stderr) = child.stderr.take() {
            let buf = Arc::clone(&log_buffer);
            std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    match line {
                        Ok(text) => buf.push_line(format!("[stderr] {}", text)),
                        Err(_) => break,
                    }
                }
            });
        }

        let handle = RunningProcessHandle {
            pid,
            child: Some(child),
            ports: Vec::new(),
            status: ProcessStatus::Starting,
            started_at: Instant::now(),
            is_docker: false,
            compose_file: None,
            compose_directory: None,
            run_mode: RunMode::Dev,
            log_buffer,
            log_child: None,
            container_id: None,
        };

        self.processes
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?
            .insert(id.to_string(), handle);

        Ok(pid)
    }

    pub fn spawn_docker_log_follow(
        &self,
        id: &str,
        compose_file: &str,
        directory: &str,
    ) -> Result<(), String> {
        let mut processes = self
            .processes
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;

        if let Some(handle) = processes.get_mut(id) {
            let mut log_child = Command::new("docker")
                .args(["compose", "-f", compose_file, "logs", "-f", "--no-color"])
                .current_dir(directory)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("Failed to spawn docker logs: {}", e))?;

            // Spawn stdout reader for docker logs
            if let Some(stdout) = log_child.stdout.take() {
                let buf = Arc::clone(&handle.log_buffer);
                std::thread::spawn(move || {
                    let reader = BufReader::new(stdout);
                    for line in reader.lines() {
                        match line {
                            Ok(text) => buf.push_line(text),
                            Err(_) => break,
                        }
                    }
                });
            }

            // Spawn stderr reader for docker logs
            if let Some(stderr) = log_child.stderr.take() {
                let buf = Arc::clone(&handle.log_buffer);
                std::thread::spawn(move || {
                    let reader = BufReader::new(stderr);
                    for line in reader.lines() {
                        match line {
                            Ok(text) => buf.push_line(format!("[stderr] {}", text)),
                            Err(_) => break,
                        }
                    }
                });
            }

            handle.log_child = Some(log_child);
        }

        Ok(())
    }

    pub fn spawn_container_log_follow(
        &self,
        id: &str,
        container_id: &str,
    ) -> Result<(), String> {
        let mut processes = self
            .processes
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;

        if let Some(handle) = processes.get_mut(id) {
            let mut log_child = Command::new("docker")
                .args(["logs", "-f", "--tail", "200", container_id])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("Failed to spawn docker logs: {}", e))?;

            if let Some(stdout) = log_child.stdout.take() {
                let buf = Arc::clone(&handle.log_buffer);
                std::thread::spawn(move || {
                    let reader = BufReader::new(stdout);
                    for line in reader.lines() {
                        match line {
                            Ok(text) => buf.push_line(text),
                            Err(_) => break,
                        }
                    }
                });
            }

            if let Some(stderr) = log_child.stderr.take() {
                let buf = Arc::clone(&handle.log_buffer);
                std::thread::spawn(move || {
                    let reader = BufReader::new(stderr);
                    for line in reader.lines() {
                        match line {
                            Ok(text) => buf.push_line(format!("[stderr] {}", text)),
                            Err(_) => break,
                        }
                    }
                });
            }

            handle.log_child = Some(log_child);
        }

        Ok(())
    }

    pub fn stop_process(&self, id: &str) -> Result<(), String> {
        let mut processes = self
            .processes
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;

        if let Some(mut handle) = processes.remove(id) {
            let pid = handle.pid;
            let ports = handle.ports.clone();
            let is_docker = handle.is_docker;
            let compose_file = handle.compose_file.clone();
            let compose_directory = handle.compose_directory.clone();
            let container_id = handle.container_id.clone();

            // Kill the docker log follow child if it exists
            if let Some(ref mut log_child) = handle.log_child {
                let _ = log_child.kill();
            }

            drop(processes);

            if let Some(cid) = container_id {
                // Docker container — stop by container ID/name
                crate::docker::stop_container(&cid)?;
            } else if is_docker {
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
