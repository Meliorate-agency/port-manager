mod commands;
mod config;
mod docker;
mod models;
mod port_scanner;
mod process_manager;

use std::sync::Mutex;

use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::image::Image;

use commands::AppState;
use process_manager::ProcessManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // A second instance was launched — focus the existing window instead
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Register plugins
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            app.handle().plugin(tauri_plugin_opener::init())?;

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

            // --- System Tray ---
            let show_item = MenuItemBuilder::with_id("show", "Show").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let tray_icon = Image::from_path("icons/icon.png")
                .unwrap_or_else(|_| Image::from_bytes(include_bytes!("../icons/icon.png")).expect("Failed to load tray icon"));

            TrayIconBuilder::new()
                .icon(tray_icon)
                .menu(&tray_menu)
                .tooltip("Port Manager")
                .show_menu_on_left_click(false)
                .on_tray_icon_event({
                    let app_handle = app.handle().clone();
                    move |_tray, event| {
                        if let tauri::tray::TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            button_state: tauri::tray::MouseButtonState::Up,
                            ..
                        } = event
                        {
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .on_menu_event({
                    let app_handle = app.handle().clone();
                    move |_app, event| {
                        match event.id().as_ref() {
                            "show" => {
                                if let Some(window) = app_handle.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                }
                            }
                            "quit" => {
                                app_handle.exit(0);
                            }
                            _ => {}
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Intercept window close: hide to tray instead of quitting
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_system_ports,
            commands::start_process,
            commands::stop_process,
            commands::kill_system_process,
            commands::save_config,
            commands::load_config,
            commands::get_running_status,
            commands::get_process_resources,
            commands::get_process_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
