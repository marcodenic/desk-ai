#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend;

use backend::{BackendConfig, BackendState};
use tauri::{Emitter, Manager, menu::{MenuBuilder, MenuItemBuilder}, tray::TrayIconBuilder, PhysicalPosition, PhysicalSize};
use std::sync::atomic::{AtomicBool, Ordering};

// Platform-specific imports for tray icon events (Linux doesn't support click events)
#[cfg(not(target_os = "linux"))]
use tauri::tray::{TrayIconEvent, MouseButtonState};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

// Global state to track if window is in mini mode
static MINI_MODE: AtomicBool = AtomicBool::new(false);

/// Log macro that only outputs in debug builds
macro_rules! log_debug {
  ($($arg:tt)*) => {
    #[cfg(debug_assertions)]
    eprintln!("[TAURI MAIN] {}", format!($($arg)*));
  };
}

/// Log macro for important info that should always be logged
macro_rules! log_info {
  ($($arg:tt)*) => {
    eprintln!("[TAURI MAIN] {}", format!($($arg)*));
  };
}

/// Log macro for errors that should always be logged
macro_rules! log_error {
  ($($arg:tt)*) => {
    eprintln!("[TAURI MAIN ERROR] {}", format!($($arg)*));
  };
}

#[tauri::command]
async fn start_backend(
  app: tauri::AppHandle,
  state: tauri::State<'_, BackendState>,
  config: BackendConfig,
) -> Result<(), String> {
  log_info!("start_backend command called");
  log_debug!("Config: provider={:?}, model={}, workdir={}", config.provider, config.model, config.workdir.display());
  
  let result = backend::start_backend(app.clone(), state, config).await;
  
  if let Err(ref err) = result {
    log_error!("Failed to start backend: {}", err);
    let _ = app.emit("backend://error", serde_json::json!({
      "type": "error",
      "message": format!("Failed to start backend: {}", err)
    }));
  } else {
    log_info!("Backend started successfully");
  }
  
  result.map_err(|err| err.to_string())
}

#[tauri::command]
async fn update_backend_config(
  state: tauri::State<'_, BackendState>,
  config: BackendConfig,
) -> Result<(), String> {
  log_info!("update_backend_config command called");
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

#[tauri::command]
async fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
  if let Some(window) = app.get_webview_window("main") {
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
  } else {
    Err("Main window not found".to_string())
  }
}

#[tauri::command]
async fn hide_main_window(app: tauri::AppHandle) -> Result<(), String> {
  if let Some(window) = app.get_webview_window("main") {
    window.hide().map_err(|e| e.to_string())?;
    Ok(())
  } else {
    Err("Main window not found".to_string())
  }
}

#[tauri::command]
async fn toggle_window_mode(app: tauri::AppHandle, popup_mode: bool) -> Result<(), String> {
  // Update the global state
  MINI_MODE.store(popup_mode, Ordering::SeqCst);
  
  if let Some(window) = app.get_webview_window("main") {
    apply_window_mode(&window, popup_mode).await?;
    window.emit("window-mode-changed", popup_mode).map_err(|e| e.to_string())?;
    Ok(())
  } else {
    Err("Main window not found".to_string())
  }
}

// Helper function to apply window mode configuration
async fn apply_window_mode(window: &tauri::WebviewWindow, popup_mode: bool) -> Result<(), String> {
  if popup_mode {
    // Popup mode: smaller window near taskbar
    // First, ensure we can resize (in case it was locked)
    window.set_resizable(true).map_err(|e| e.to_string())?;
    
    // Set the size with a small delay to ensure previous operations complete
    #[cfg(target_os = "linux")]
    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    
    window.set_size(PhysicalSize::new(400, 600)).map_err(|e| e.to_string())?;
    
    // Add delay before setting decorations and positioning
    #[cfg(target_os = "linux")]
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    
    window.set_resizable(false).map_err(|e| e.to_string())?;
    window.set_decorations(false).map_err(|e| e.to_string())?;
    window.set_always_on_top(true).map_err(|e| e.to_string())?;
    
    // Position near taskbar (bottom-right corner)
    if let Ok(monitor) = window.current_monitor() {
      if let Some(monitor) = monitor {
        let screen_size = monitor.size();
        let window_size = window.outer_size().map_err(|e| e.to_string())?;
        
        // Position 10px from right edge and 50px from bottom (above taskbar)
        let x = screen_size.width as i32 - window_size.width as i32 - 10;
        let y = screen_size.height as i32 - window_size.height as i32 - 50;
        
        window.set_position(PhysicalPosition::new(x, y)).map_err(|e| e.to_string())?;
      }
    }
  } else {
    // Normal mode: larger resizable window
    // First enable resizing before changing size
    window.set_resizable(true).map_err(|e| e.to_string())?;
    
    #[cfg(target_os = "linux")]
    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    
    window.set_size(PhysicalSize::new(1100, 720)).map_err(|e| e.to_string())?;
    
    #[cfg(target_os = "linux")]
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    
    window.set_decorations(true).map_err(|e| e.to_string())?;
    window.set_always_on_top(false).map_err(|e| e.to_string())?;
    window.center().map_err(|e| e.to_string())?;
  }
  Ok(())
}

fn main() {
  // Initialize X11 threading support on Linux to prevent xcb threading errors
  // This fixes the "XInitThreads has not been called" error when toggling window modes
  #[cfg(target_os = "linux")]
  {
    use std::os::raw::c_int;
    
    #[link(name = "X11")]
    extern "C" {
      fn XInitThreads() -> c_int;
    }
    
    // SAFETY: XInitThreads must be called before any other X11 calls.
    // It's safe to call multiple times - subsequent calls are ignored.
    // This is required for multi-threaded applications using X11.
    unsafe {
      XInitThreads();
    }
    log_info!("X11 threading initialized");
  }
  
  log_info!("Desk AI starting...");
  
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .setup(|app| {
      // Setup system tray - cross-platform approach
      // Linux: Uses menu for all interactions (libappindicator doesn't support left-click events)
      // Windows/macOS: Left-click toggles popup, right-click shows menu
      let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
      let toggle = MenuItemBuilder::with_id("toggle", "Show/Hide Desk AI").build(app)?;
      let mini_mode = MenuItemBuilder::with_id("mini_mode", "Mini Mode").build(app)?;
      let menu = MenuBuilder::new(app)
        .items(&[&toggle, &mini_mode, &quit])
        .build()?;
      
      let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("Desk AI - Click to toggle")
        // On Windows/macOS: prevent left-click from opening menu (use for toggle instead)
        // On Linux: this has no effect; left-click events are not delivered by libappindicator
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
          match event.id.as_ref() {
            "toggle" => {
              // Toggle window visibility (respects current mode state)
              if let Some(window) = app.get_webview_window("main") {
                let is_visible = window.is_visible().unwrap_or(false);
                
                if is_visible {
                  let _ = window.hide();
                } else {
                  // Show window in whatever mode is currently set
                  let mini_mode = MINI_MODE.load(Ordering::SeqCst);
                  
                  // Apply the current window mode
                  let app_handle = app.clone();
                  tauri::async_runtime::spawn(async move {
                    if let Some(window) = app_handle.get_webview_window("main") {
                      let _ = apply_window_mode(&window, mini_mode).await;
                      let _ = window.show();
                      let _ = window.set_focus();
                      let _ = window.emit("window-mode-changed", mini_mode);
                    }
                  });
                }
              }
            }
            "mini_mode" => {
              // Toggle mini mode on/off
              let current_mini_mode = MINI_MODE.load(Ordering::SeqCst);
              let new_mini_mode = !current_mini_mode;
              MINI_MODE.store(new_mini_mode, Ordering::SeqCst);
              
              // Apply the new mode if window is visible
              if let Some(window) = app.get_webview_window("main") {
                let is_visible = window.is_visible().unwrap_or(false);
                if is_visible {
                  let app_handle = app.clone();
                  tauri::async_runtime::spawn(async move {
                    if let Some(window) = app_handle.get_webview_window("main") {
                      let _ = apply_window_mode(&window, new_mini_mode).await;
                      let _ = window.emit("window-mode-changed", new_mini_mode);
                    }
                  });
                }
              }
              
              log_info!("Mini mode toggled to: {}", new_mini_mode);
            }
            "quit" => {
              log_info!("Quit requested from tray menu");
              let app_handle = app.clone();
              tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<BackendState>();
                let _ = backend::shutdown_backend(state).await;
                std::process::exit(0);
              });
            }
            _ => {}
          }
        })
        .on_tray_icon_event(move |_tray, _event| {
          // On Windows/macOS: left-click toggles window (respects current mode)
          // On Linux: this event won't fire (libappindicator doesn't deliver left-clicks)
          #[cfg(not(target_os = "linux"))]
          match _event {
            TrayIconEvent::Click { button_state: MouseButtonState::Up, .. } => {
              let app = _tray.app_handle();
              if let Some(window) = app.get_webview_window("main") {
                let is_visible = window.is_visible().unwrap_or(false);
                
                if is_visible {
                  let _ = window.hide();
                } else {
                  // Show window in whatever mode is currently set
                  let mini_mode = MINI_MODE.load(Ordering::SeqCst);
                  
                  tauri::async_runtime::spawn(async move {
                    if let Some(window) = app.get_webview_window("main") {
                      let _ = apply_window_mode(&window, mini_mode).await;
                      let _ = window.show();
                      let _ = window.set_focus();
                      let _ = window.emit("window-mode-changed", mini_mode);
                    }
                  });
                }
              }
            }
            _ => {}
          }
        })
        .build(app)?;

      // Register global shortcut (Ctrl+Shift+Space or Cmd+Shift+Space)
      let app_handle = app.handle().clone();
      app.global_shortcut().on_shortcut("CommandOrControl+Shift+Space", move |_app, _shortcut, _event| {
        if let Some(window) = app_handle.get_webview_window("main") {
          if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
          } else {
            let _ = window.show();
            let _ = window.set_focus();
            // Emit event to focus input field
            let _ = window.emit("focus-input", ());
          }
        }
      })?;
      
      // Try to register the shortcut, ignore if already registered
      if let Err(e) = app.global_shortcut().register("CommandOrControl+Shift+Space") {
        log_info!("Global shortcut already registered or failed to register: {}", e);
      } else {
        log_info!("Global shortcut registered successfully");
      }
      
      log_info!("System tray initialized");
      Ok(())
    })
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
      open_log_file,
      show_main_window,
      hide_main_window,
      toggle_window_mode
    ])
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        log_info!("Window close requested, hiding window instead of closing");
        window.hide().unwrap();
        api.prevent_close();
      }
    })
    .run(tauri::generate_context!())
    .unwrap_or_else(|err| {
      log_error!("Fatal error running Desk AI: {}", err);
      std::process::exit(1);
    });
}
