use std::fs;
use std::path::Path;

use crate::models::{AppConfig, ProcessType, SavedProcess};

pub fn load_config(path: &Path) -> AppConfig {
    let mut config = match fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    };

    // Ensure the "Port Manager (This)" self-referencing entry always exists
    let self_id = "port-manager-self";
    if !config.processes.iter().any(|p| p.id == self_id) {
        config.processes.insert(
            0,
            SavedProcess {
                id: self_id.to_string(),
                name: "Port Manager (This)".to_string(),
                command: "npm run tauri:dev".to_string(),
                directory: std::env::current_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("."))
                    .to_string_lossy()
                    .to_string(),
                group_id: None,
                last_ports: vec![9090],
                process_type: ProcessType::Command,
                compose_file: None,
            },
        );
        // Save the updated config so it persists
        let _ = save_config(path, &config);
    }

    config
}

pub fn save_config(path: &Path, config: &AppConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(path, json).map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}
