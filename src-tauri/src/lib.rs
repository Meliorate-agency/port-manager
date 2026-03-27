mod commands;
mod config;
mod docker;
mod models;
mod port_scanner;
mod process_manager;

use std::sync::Mutex;

use tauri::Manager;

use commands::AppState;
use process_manager::ProcessManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let config_dir = dirs::data_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("com.internal-tools.port-manager");
            let config_path = config_dir.join("config.json");
            let app_config = config::load_config(&config_path);

            let state = AppState {
                process_manager: ProcessManager::new(),
                config: Mutex::new(app_config),
                config_path,
                system: Mutex::new(sysinfo::System::new()),
            };

            app.manage(state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_system_ports,
            commands::start_process,
            commands::stop_process,
            commands::kill_system_process,
            commands::save_config,
            commands::load_config,
            commands::get_running_status,
            commands::refresh_ports,
            commands::get_process_resources,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
