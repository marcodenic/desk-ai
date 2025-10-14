#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend;

use backend::{BackendConfig, BackendState};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
async fn start_backend(
  app: tauri::AppHandle,
  state: tauri::State<'_, BackendState>,
  config: BackendConfig,
) -> Result<(), String> {
  eprintln!("[COMMAND] start_backend called");
  eprintln!("[COMMAND] Config: {:?}", config);
  
  let result = backend::start_backend(app.clone(), state, config).await;
  
  if let Err(ref err) = result {
    eprintln!("[COMMAND ERROR] Failed to start backend: {}", err);
    if let Err(e) = app.emit("backend://error", serde_json::json!({
      "type": "error",
      "message": format!("Failed to start backend: {}", err)
    })) {
      eprintln!("[COMMAND ERROR] Failed to emit error event: {}", e);
    }
  }
  
  result.map_err(|err| err.to_string())
}

#[tauri::command]
async fn update_backend_config(
  state: tauri::State<'_, BackendState>,
  config: BackendConfig,
) -> Result<(), String> {
  eprintln!("[COMMAND] update_backend_config called");
  backend::update_config(state, config)
    .await
    .map_err(|err| err.to_string())
}

#[tauri::command]
async fn send_agent_message(
  state: tauri::State<'_, BackendState>,
  message: String,
) -> Result<String, String> {
  backend::send_prompt(state, message)
    .await
    .map(|id| id.to_string())
    .map_err(|err| err.to_string())
}

#[tauri::command]
async fn stop_agent_message(
  state: tauri::State<'_, BackendState>,
) -> Result<(), String> {
  backend::stop_current_request(state)
    .await
    .map_err(|err| err.to_string())
}

#[tauri::command]
async fn approve_tool(
  state: tauri::State<'_, BackendState>,
  request_id: String,
  approved: bool,
  overrides: Option<serde_json::Value>,
) -> Result<(), String> {
  backend::send_approval_command(state, request_id, approved, overrides)
    .await
    .map_err(|err| err.to_string())
}

#[tauri::command]
async fn kill_command(
  state: tauri::State<'_, BackendState>,
  session_id: String,
) -> Result<(), String> {
  backend::kill_session(state, session_id)
    .await
    .map_err(|err| err.to_string())
}

#[tauri::command]
async fn select_working_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
  let folder = app.dialog()
    .file()
    .blocking_pick_folder();
  
    Ok(folder.and_then(|p| p.as_path().map(|path| path.to_string_lossy().to_string())))
}

#[tauri::command]
async fn get_log_path() -> Result<String, String> {
  // Return the log file path (matches the one used in rust-backend)
  let log_dir = if cfg!(target_os = "windows") {
    dirs::data_local_dir()
      .ok_or_else(|| "Could not find local data directory".to_string())?
      .join("DeskAI")
      .join("logs")
  } else if cfg!(target_os = "macos") {
    dirs::data_dir()
      .ok_or_else(|| "Could not find data directory".to_string())?
      .join("DeskAI")
      .join("logs")
  } else {
    dirs::data_local_dir()
      .ok_or_else(|| "Could not find local data directory".to_string())?
      .join("desk-ai")
      .join("logs")
  };

  Ok(log_dir.join("desk-ai.log").to_string_lossy().to_string())
}

#[tauri::command]
async fn open_log_file() -> Result<(), String> {
  let log_dir = if cfg!(target_os = "windows") {
    dirs::data_local_dir()
      .ok_or_else(|| "Could not find local data directory".to_string())?
      .join("DeskAI")
      .join("logs")
  } else if cfg!(target_os = "macos") {
    dirs::data_dir()
      .ok_or_else(|| "Could not find data directory".to_string())?
      .join("DeskAI")
      .join("logs")
  } else {
    dirs::data_local_dir()
      .ok_or_else(|| "Could not find local data directory".to_string())?
      .join("desk-ai")
      .join("logs")
  };

  let log_path = log_dir.join("desk-ai.log");
  
  // Use the opener crate or std::process::Command to open the file
  #[cfg(target_os = "linux")]
  {
    std::process::Command::new("xdg-open")
      .arg(&log_path)
      .spawn()
      .map_err(|e| format!("Failed to open log file: {}", e))?;
  }
  
  #[cfg(target_os = "macos")]
  {
    std::process::Command::new("open")
      .arg(&log_path)
      .spawn()
      .map_err(|e| format!("Failed to open log file: {}", e))?;
  }
  
  #[cfg(target_os = "windows")]
  {
    std::process::Command::new("cmd")
      .args(&["/C", "start", "", &log_path.to_string_lossy()])
      .spawn()
      .map_err(|e| format!("Failed to open log file: {}", e))?;
  }
  
  Ok(())
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_http::init())
    .manage(BackendState::new())
    .invoke_handler(tauri::generate_handler![
      start_backend,
      update_backend_config,
      send_agent_message,
      stop_agent_message,
      approve_tool,
      kill_command,
      select_working_directory,
      get_log_path,
      open_log_file
    ])
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { .. } = event {
        let app_handle = window.app_handle().clone();
        tauri::async_runtime::spawn(async move {
          let state = app_handle.state::<BackendState>();
          let _ = backend::shutdown_backend(state).await;
        });
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running Desk AI");
}
