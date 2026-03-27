use serde::Deserialize;
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
