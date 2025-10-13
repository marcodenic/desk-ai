#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend;

use backend::{BackendConfig, BackendState};
use tauri::{api::dialog::FileDialogBuilder, Manager};

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
    let _ = app.emit_all("backend://error", serde_json::json!({
      "type": "error",
      "message": format!("Failed to start backend: {}", err)
    }));
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
async fn select_working_directory() -> Result<Option<String>, String> {
  let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();
  FileDialogBuilder::new().pick_folder(move |path| {
    let selected = path.map(|p| p.to_string_lossy().to_string());
    let _ = tx.send(selected);
  });

  rx.await
    .map_err(|_| "Dialog channel dropped unexpectedly".to_string())
}

fn main() {
  tauri::Builder::default()
    .manage(BackendState::new())
    .invoke_handler(tauri::generate_handler![
      start_backend,
      update_backend_config,
      send_agent_message,
      approve_tool,
      kill_command,
      select_working_directory
    ])
    .on_window_event(|event| {
      if let tauri::WindowEvent::CloseRequested { .. } = event.event() {
        let app_handle = event.window().app_handle();
        tauri::async_runtime::spawn(async move {
          let state = app_handle.state::<BackendState>();
          let _ = backend::shutdown_backend(state).await;
        });
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running Desk AI");
}
