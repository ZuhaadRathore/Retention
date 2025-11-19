#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};
use tauri::{Manager, State, Emitter};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::UpdaterExt;

// Flash-AI Tauri Application
// This is a Tauri wrapper that provides a desktop window for the React frontend
// and manages the Python FastAPI sidecar process.
//
// Architecture:
// - Frontend (React + Tauri): This application - handles UI
// - Backend (FastAPI + Python): Bundled sidecar - handles AI scoring, database, ML model
//
// The sidecar is automatically started when the app launches and stopped when it closes.

struct SidecarPort(Arc<Mutex<Option<u16>>>);

#[tauri::command]
fn get_sidecar_port(port_state: State<SidecarPort>) -> Option<u16> {
    *port_state.0.lock().unwrap()
}

#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<String, String> {
    match app.updater() {
        Ok(updater) => {
            match updater.check().await {
                Ok(Some(update)) => {
                    Ok(format!("Update available: v{}", update.version))
                },
                Ok(None) => Ok("No updates available".to_string()),
                Err(e) => Err(format!("Failed to check for updates: {}", e)),
            }
        }
        Err(e) => Err(format!("Failed to get updater: {}", e)),
    }
}

#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<String, String> {
    match app.updater() {
        Ok(updater) => {
            match updater.check().await {
                Ok(Some(update)) => {
                    // Download and install the update
                    match update.download_and_install(|chunk_length, content_length| {
                        // Emit progress events to the frontend
                        if let Some(total) = content_length {
                            let progress = (chunk_length as f64 / total as f64) * 100.0;
                            let _ = app.emit("update-progress", progress);
                        }
                    }, || {
                        // Called when download is finished
                        let _ = app.emit("update-downloaded", ());
                    }).await {
                        Ok(_) => Ok("Update installed successfully. Please restart the application.".to_string()),
                        Err(e) => Err(format!("Failed to install update: {}", e)),
                    }
                },
                Ok(None) => Err("No updates available".to_string()),
                Err(e) => Err(format!("Failed to check for updates: {}", e)),
            }
        }
        Err(e) => Err(format!("Failed to get updater: {}", e)),
    }
}

fn main() {
    let sidecar_port = Arc::new(Mutex::new(None));
    let port_clone = Arc::clone(&sidecar_port);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(SidecarPort(sidecar_port))
        .invoke_handler(tauri::generate_handler![
            get_sidecar_port,
            check_for_updates,
            install_update
        ])
        .setup(move |app| {
            let shell = app.shell();

            // Spawn the sidecar process
            #[cfg(debug_assertions)]
            {
                // In dev mode, run the Python module directly
                use tauri_plugin_shell::process::CommandEvent;

                let (mut rx, _child) = shell
                    .command("python")
                    .args(["-m", "python_sidecar"])
                    .spawn()
                    .expect("Failed to spawn Python sidecar in dev mode");

                // Read output to get the port
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        if let CommandEvent::Stdout(line) = event {
                            let line_str = String::from_utf8_lossy(&line);
                            if line_str.starts_with("SIDECAR_PORT=") {
                                if let Some(port_str) = line_str.strip_prefix("SIDECAR_PORT=") {
                                    if let Ok(port) = port_str.trim().parse::<u16>() {
                                        *port_clone.lock().unwrap() = Some(port);
                                        println!("Sidecar started on port: {}", port);
                                    }
                                }
                            }
                        }
                    }
                });
            }

            #[cfg(not(debug_assertions))]
            {
                // In production, use the bundled sidecar binary
                use tauri_plugin_shell::process::CommandEvent;

                let (mut rx, _child) = shell
                    .sidecar("retention-sidecar")
                    .expect("Failed to create sidecar command")
                    .spawn()
                    .expect("Failed to spawn sidecar");

                // Read output to get the port
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        if let CommandEvent::Stdout(line) = event {
                            let line_str = String::from_utf8_lossy(&line);
                            if line_str.starts_with("SIDECAR_PORT=") {
                                if let Some(port_str) = line_str.strip_prefix("SIDECAR_PORT=") {
                                    if let Ok(port) = port_str.trim().parse::<u16>() {
                                        *port_clone.lock().unwrap() = Some(port);
                                        println!("Sidecar started on port: {}", port);
                                    }
                                }
                            }
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Flash-AI application");
}
