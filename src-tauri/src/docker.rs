use serde::Deserialize;
use serde_json::Value;
use std::process::Command;

#[derive(Debug, Clone)]
pub struct DockerContainer {
    pub name: String,
    pub state: String,
    pub ports: Vec<u16>,
}

#[derive(Debug, Deserialize)]
struct ComposeService {
    #[serde(alias = "Name")]
    name: Option<String>,
    #[serde(alias = "State")]
    state: Option<String>,
    #[serde(alias = "Publishers")]
    publishers: Option<Vec<Publisher>>,
}

#[derive(Debug, Deserialize)]
struct Publisher {
    #[serde(alias = "PublishedPort")]
    published_port: Option<u16>,
}

pub fn get_compose_status(compose_file: &str, directory: &str) -> Vec<DockerContainer> {
    let output = Command::new("docker")
        .args(["compose", "-f", compose_file, "ps", "--format", "json"])
        .current_dir(directory)
        .output();

    let output = match output {
        Ok(o) => o,
        Err(_) => return Vec::new(),
    };

    if !output.status.success() {
        return Vec::new();
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut containers = Vec::new();

    // Docker compose ps --format json outputs NDJSON (one JSON object per line)
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(svc) = serde_json::from_str::<ComposeService>(line) {
            let mut ports = Vec::new();
            if let Some(publishers) = &svc.publishers {
                for p in publishers {
                    if let Some(port) = p.published_port {
                        if port > 0 && !ports.contains(&port) {
                            ports.push(port);
                        }
                    }
                }
            }
            containers.push(DockerContainer {
                name: svc.name.unwrap_or_default(),
                state: svc.state.unwrap_or_default(),
                ports,
            });
        }
    }

    containers
}

// ===== Individual Container Operations =====

#[derive(Debug, Clone)]
pub struct ContainerStatus {
    pub running: bool,
    pub ports: Vec<u16>,
}

pub fn start_container(container_id: &str) -> Result<(), String> {
    let output = Command::new("docker")
        .args(["start", container_id])
        .output()
        .map_err(|e| format!("Failed to run docker start: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("docker start failed: {}", stderr));
    }

    Ok(())
}

pub fn stop_container(container_id: &str) -> Result<(), String> {
    let output = Command::new("docker")
        .args(["stop", container_id])
        .output()
        .map_err(|e| format!("Failed to run docker stop: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("docker stop failed: {}", stderr));
    }

    Ok(())
}

pub fn get_container_status(container_id: &str) -> Option<ContainerStatus> {
    let output = Command::new("docker")
        .args(["inspect", "--format", "{{json .}}", container_id])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json: Value = serde_json::from_str(stdout.trim()).ok()?;

    let running = json
        .get("State")
        .and_then(|s| s.get("Running"))
        .and_then(|r| r.as_bool())
        .unwrap_or(false);

    // Extract published ports — try NetworkSettings.Ports first (populated when running),
    // fall back to HostConfig.PortBindings (always present, even when stopped)
    let mut ports = Vec::new();

    // Helper closure to extract host ports from a port map
    let extract_ports = |port_map: &serde_json::Map<String, Value>, ports: &mut Vec<u16>| {
        for (_container_port, bindings) in port_map {
            if let Some(bindings) = bindings.as_array() {
                for binding in bindings {
                    if let Some(host_port_str) = binding.get("HostPort").and_then(|p| p.as_str()) {
                        if let Ok(port) = host_port_str.parse::<u16>() {
                            if port > 0 && !ports.contains(&port) {
                                ports.push(port);
                            }
                        }
                    }
                }
            }
        }
    };

    // Try NetworkSettings.Ports first (active bindings when running)
    if let Some(port_map) = json
        .get("NetworkSettings")
        .and_then(|ns| ns.get("Ports"))
        .and_then(|p| p.as_object())
    {
        extract_ports(port_map, &mut ports);
    }

    // If no ports found (container stopped), try HostConfig.PortBindings (configured ports)
    if ports.is_empty() {
        if let Some(port_map) = json
            .get("HostConfig")
            .and_then(|hc| hc.get("PortBindings"))
            .and_then(|p| p.as_object())
        {
            extract_ports(port_map, &mut ports);
        }
    }

    Some(ContainerStatus { running, ports })
}

// ===== Docker Compose Operations =====

pub fn stop_compose(compose_file: &str, directory: &str) -> Result<(), String> {
    let output = Command::new("docker")
        .args(["compose", "-f", compose_file, "down"])
        .current_dir(directory)
        .output()
        .map_err(|e| format!("Failed to run docker compose down: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("docker compose down failed: {}", stderr));
    }

    Ok(())
}
