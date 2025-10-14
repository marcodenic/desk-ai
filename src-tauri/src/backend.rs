use std::{path::PathBuf, sync::Arc};

#[cfg(unix)]
use std::os::unix::process::ExitStatusExt;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use anyhow::{anyhow, Context, Result};
use parking_lot::Mutex;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use tokio::{
  io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
  process::{Child, ChildStdin, Command},
  sync::{Mutex as AsyncMutex, Notify},
};
use uuid::Uuid;

/// Log macro that only outputs in debug builds
macro_rules! log_debug {
  ($($arg:tt)*) => {
    #[cfg(debug_assertions)]
    eprintln!("[TAURI] {}", format!($($arg)*));
  };
}

/// Log macro for important info that should always be logged
macro_rules! log_info {
  ($($arg:tt)*) => {
    eprintln!("[TAURI] {}", format!($($arg)*));
  };
}

/// Log macro for errors that should always be logged
macro_rules! log_error {
  ($($arg:tt)*) => {
    eprintln!("[TAURI ERROR] {}", format!($($arg)*));
  };
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendConfig {
  pub provider: Provider,
  pub api_key: String,
  pub model: String,
  pub workdir: PathBuf,
  #[serde(default = "default_true")]
  pub auto_approve_reads: bool,
  #[serde(default = "default_true")]
  pub confirm_writes: bool,
  #[serde(default = "default_true")]
  pub confirm_shell: bool,
  #[serde(default = "default_false")]
  pub allow_system_wide: bool,
  #[serde(default = "default_false")]
  pub allow_elevated_commands: bool,
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
  Openai,
  Anthropic,
}

#[derive(Default)]
pub struct BackendState {
  inner: Mutex<Option<Arc<BackendHandle>>>,
}

impl BackendState {
  pub fn new() -> Self {
    Self::default()
  }

  pub fn get(&self) -> Option<Arc<BackendHandle>> {
    self.inner.lock().clone()
  }

  pub fn replace(&self, handle: Option<Arc<BackendHandle>>) -> Option<Arc<BackendHandle>> {
    std::mem::replace(&mut *self.inner.lock(), handle)
  }
}

pub struct BackendHandle {
  stdin: Arc<AsyncMutex<ChildStdin>>,
  child: Arc<AsyncMutex<Child>>,
  shutdown: Arc<Notify>,
  #[allow(dead_code)]
  stdout_task: tauri::async_runtime::JoinHandle<()>,
  #[allow(dead_code)]
  stderr_task: tauri::async_runtime::JoinHandle<()>,
  #[allow(dead_code)]
  wait_task: tauri::async_runtime::JoinHandle<()>,
}

impl BackendHandle {
  async fn send_line<S: Serialize>(&self, payload: &S) -> Result<()> {
    let mut stdin = self.stdin.lock().await;
    let serialized = serde_json::to_string(payload)?;
    log_debug!("Sending to backend: {}", serialized);
    stdin.write_all(serialized.as_bytes()).await?;
    stdin.write_all(b"\n").await?;
    stdin.flush().await?;
    Ok(())
  }

  pub async fn send_prompt(&self, message: PromptMessage) -> Result<()> {
    self
      .send_line(&json!({
        "type": "prompt",
        "id": message.id,
        "text": message.text
      }))
      .await
  }

  pub async fn send_approval(&self, approval: ToolApproval) -> Result<()> {
    self.send_line(&approval).await
  }

  pub async fn send_config(&self, config: &RuntimeConfig<'_>) -> Result<()> {
    self.send_line(config).await
  }

  pub async fn kill_session(&self, session_id: &str) -> Result<()> {
    self
      .send_line(&json!({
        "type": "kill",
        "sessionId": session_id
      }))
      .await
  }

  pub async fn stop_current_request(&self) -> Result<()> {
    // Kill the current backend process to stop the API call
    // This will terminate any ongoing OpenAI requests
    {
      let mut child = self.child.lock().await;
      if let Err(err) = child.kill().await {
        if err.kind() != std::io::ErrorKind::InvalidInput {
          return Err(err.into());
        }
      }
    }
    Ok(())
  }

  pub async fn shutdown(&self) -> Result<()> {
    self.shutdown.notify_waiters();
    {
      let mut child = self.child.lock().await;
      if let Err(err) = child.kill().await {
        if err.kind() != std::io::ErrorKind::InvalidInput {
          return Err(err.into());
        }
      }
    }
    Ok(())
  }
}

#[derive(Serialize)]
pub(crate) struct RuntimeConfig<'a> {
  #[serde(rename = "type")]
  msg_type: &'static str,
  provider: &'a Provider,
  model: &'a str,
  #[serde(rename = "apiKey")]
  api_key: &'a str,
  workdir: &'a str,
  #[serde(rename = "autoApproveReads")]
  auto_approve_reads: bool,
  #[serde(rename = "confirmWrites")]
  confirm_writes: bool,
  #[serde(rename = "confirmShell")]
  confirm_shell: bool,
  #[serde(rename = "allowSystemWide")]
  allow_system_wide: bool,
  #[serde(rename = "allowElevatedCommands")]
  allow_elevated_commands: bool,
}

#[derive(Serialize)]
pub(crate) struct ToolApproval {
  #[serde(rename = "type")]
  msg_type: &'static str,
  #[serde(rename = "requestId")]
  request_id: String,
  approved: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  overrides: Option<Value>,
}

#[derive(Serialize)]
pub(crate) struct PromptMessage {
  id: Uuid,
  text: String,
}

fn default_true() -> bool {
  true
}

fn default_false() -> bool {
  false
}

pub async fn start_backend(
  app: AppHandle,
  state: tauri::State<'_, BackendState>,
  config: BackendConfig,
) -> Result<()> {
  if !config.workdir.exists() {
    return Err(anyhow!("Selected working directory does not exist."));
  }

  if !config.workdir.is_dir() {
    return Err(anyhow!("Working directory path must point to a directory."));
  }

  if config.api_key.trim().is_empty() {
    return Err(anyhow!("API key must not be empty."));
  }

  let BackendConfig {
    provider,
    api_key,
    model,
    workdir,
    auto_approve_reads,
    confirm_writes,
    confirm_shell,
    allow_system_wide,
    allow_elevated_commands,
  } = config;

  let workdir = workdir
    .canonicalize()
    .context("Failed to resolve working directory path")?;

  // Check if backend is already running
  if let Some(existing_handle) = state.get() {
    log_info!("Backend already running, updating configuration");
    
    let workdir_str = workdir.to_string_lossy().into_owned();
    let runtime_config = RuntimeConfig {
      msg_type: "config",
      provider: &provider,
      model: &model,
      api_key: &api_key,
      workdir: &workdir_str,
      auto_approve_reads,
      confirm_writes,
      confirm_shell,
      allow_system_wide,
      allow_elevated_commands,
    };

    existing_handle
      .send_config(&runtime_config)
      .await
      .context("Failed to send config update to backend")?;
    
    return Ok(());
  }

  // If not running, start a new backend
  let script_path = resolve_backend_script(&app).context("Unable to locate backend")?;

  log_info!("Starting backend process");
  log_debug!("Backend path: {:?}", script_path);
  log_debug!("Working directory: {:?}", workdir);

  let mut command = Command::new(&script_path);
  command.current_dir(&workdir);
  command.kill_on_drop(true);

  // On Windows, prevent console window from appearing for the subprocess
  #[cfg(target_os = "windows")]
  {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
  }

  let mut child = command
    .stdin(std::process::Stdio::piped())
    .stdout(std::process::Stdio::piped())
    .stderr(std::process::Stdio::piped())
    .spawn()
    .context("Failed to spawn backend process")?;

  log_info!("Backend process started successfully");

  let stdout = child
    .stdout
    .take()
    .ok_or_else(|| anyhow!("Failed to capture backend stdout"))?;
  let stderr = child
    .stderr
    .take()
    .ok_or_else(|| anyhow!("Failed to capture backend stderr"))?;
  let stdin = child
    .stdin
    .take()
    .ok_or_else(|| anyhow!("Failed to capture backend stdin"))?;

  let child = Arc::new(AsyncMutex::new(child));
  let stdin = Arc::new(AsyncMutex::new(stdin));
  let shutdown = Arc::new(Notify::new());

  let handle = Arc::new(BackendHandle {
    stdin: stdin.clone(),
    child: child.clone(),
    shutdown: shutdown.clone(),
    stdout_task: spawn_stdout_listener(app.clone(), stdout, shutdown.clone()),
    stderr_task: spawn_stderr_listener(app.clone(), stderr),
    wait_task: spawn_wait_task(app.clone(), child.clone()),
  });

  let workdir_str = workdir.to_string_lossy().into_owned();

  let runtime_config = RuntimeConfig {
    msg_type: "config",
    provider: &provider,
    model: &model,
    api_key: &api_key,
    workdir: &workdir_str,
    auto_approve_reads,
    confirm_writes,
    confirm_shell,
    allow_system_wide,
    allow_elevated_commands,
  };

  handle
    .send_config(&runtime_config)
    .await
    .context("Failed to send initial configuration to backend")?;

  state.replace(Some(handle));

  Ok(())
}

pub async fn update_config(
  state: tauri::State<'_, BackendState>,
  config: BackendConfig,
) -> Result<()> {
  if !config.workdir.exists() {
    return Err(anyhow!("Selected working directory does not exist."));
  }

  if !config.workdir.is_dir() {
    return Err(anyhow!("Working directory path must point to a directory."));
  }

  if config.api_key.trim().is_empty() {
    return Err(anyhow!("API key must not be empty."));
  }

  let handle = state
    .get()
    .ok_or_else(|| anyhow!("Backend process is not running. Call start_backend first."))?;

  let workdir = config.workdir
    .canonicalize()
    .context("Failed to resolve working directory path")?;

  let workdir_str = workdir.to_string_lossy().into_owned();

  let runtime_config = RuntimeConfig {
    msg_type: "config",
    provider: &config.provider,
    model: &config.model,
    api_key: &config.api_key,
    workdir: &workdir_str,
    auto_approve_reads: config.auto_approve_reads,
    confirm_writes: config.confirm_writes,
    confirm_shell: config.confirm_shell,
    allow_system_wide: config.allow_system_wide,
    allow_elevated_commands: config.allow_elevated_commands,
  };

  log_info!("Updating backend configuration");
  handle
    .send_config(&runtime_config)
    .await
    .context("Failed to send config update to backend")?;

  Ok(())
}

fn spawn_stdout_listener(
  app: AppHandle,
  stdout: tokio::process::ChildStdout,
  shutdown: Arc<Notify>,
) -> tauri::async_runtime::JoinHandle<()> {
  tauri::async_runtime::spawn(async move {
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();
    loop {
      tokio::select! {
        biased;
        _ = shutdown.notified() => {
          break;
        }
        line = lines.next_line() => {
          match line {
            Ok(Some(line)) => {
              if line.trim().is_empty() {
                continue;
              }
              log_debug!("Backend output: {}", line);
              match serde_json::from_str::<Value>(&line) {
                Ok(json) => {
                  if let Some(event_type) = json.get("type").and_then(|v| v.as_str()) {
                    let event_name = format!("backend://{}", event_type);
                    log_debug!("Emitting event: {}", event_name);
                    let _ = app.emit(&event_name, json.clone());
                  } else {
                    log_error!("Received JSON without type field: {}", line);
                    let _ = app.emit("backend://error", json!({"message": "Received JSON without a type", "raw": line}));
                  }
                }
                Err(err) => {
                  log_error!("Failed to parse backend JSON: {} - Raw: {}", err, line);
                  let _ = app.emit(
                    "backend://error",
                    json!({ "message": "Failed to parse backend JSON", "raw": line, "error": err.to_string() }),
                  );
                }
              }
            }
            Ok(None) => {
              log_info!("Backend stdout stream closed");
              break;
            }
            Err(err) => {
              log_error!("Error reading backend stdout: {}", err);
              let _ = app.emit(
                "backend://error",
                json!({ "message": "Failed reading backend output", "error": err.to_string() }),
              );
              break;
            }
          }
        }
      }
    }
  })
}

fn spawn_stderr_listener(app: AppHandle, stderr: tokio::process::ChildStderr) -> tauri::async_runtime::JoinHandle<()> {
  tauri::async_runtime::spawn(async move {
    let reader = BufReader::new(stderr);
    let mut lines = reader.lines();
    while let Ok(Some(line)) = lines.next_line().await {
      let trimmed = line.trim();
      if trimmed.is_empty() {
        continue;
      }
      log_info!("Backend stderr: {}", trimmed);
      let _ = app.emit(
        "backend://stderr",
        json!({ "message": trimmed }),
      );
    }
    log_info!("Backend stderr stream closed");
  })
}

fn spawn_wait_task(app: AppHandle, child: Arc<AsyncMutex<Child>>) -> tauri::async_runtime::JoinHandle<()> {
  tauri::async_runtime::spawn(async move {
    let status = {
      let mut guard = child.lock().await;
      guard.wait().await
    };

    match status {
      Ok(status) => {
        #[cfg(unix)]
        let signal = status.signal();
        #[cfg(not(unix))]
        let signal: Option<i32> = None;
        
        log_info!("Backend process exited with code: {:?}, signal: {:?}", status.code(), signal);
        let _ = app.emit(
          "backend://exit",
          json!({ "code": status.code(), "signal": signal }),
        );
      }
      Err(err) => {
        log_error!("Backend process wait failed: {}", err);
        let _ = app.emit(
          "backend://error",
          json!({ "message": "Backend process wait failed", "error": err.to_string() }),
        );
      }
    }
  })
}

pub async fn send_prompt(
  state: tauri::State<'_, BackendState>,
  text: String,
) -> Result<Uuid> {
  let handle = state
    .get()
    .ok_or_else(|| anyhow!("Backend process is not running"))?;

  let message = PromptMessage {
    id: Uuid::new_v4(),
    text,
  };

  let message_id = message.id;
  handle.send_prompt(message).await?;
  Ok(message_id)
}

pub async fn send_approval_command(
  state: tauri::State<'_, BackendState>,
  request_id: String,
  approved: bool,
  overrides: Option<Value>,
) -> Result<()> {
  let handle = state
    .get()
    .ok_or_else(|| anyhow!("Backend process is not running"))?;

  let approval = ToolApproval {
    msg_type: "approval",
    request_id,
    approved,
    overrides,
  };

  handle.send_approval(approval).await
}

pub async fn stop_current_request(
  state: tauri::State<'_, BackendState>,
) -> Result<()> {
  let handle = state
    .get()
    .ok_or_else(|| anyhow!("Backend process is not running"))?;
  handle.stop_current_request().await
}

pub async fn kill_session(
  state: tauri::State<'_, BackendState>,
  session_id: String,
) -> Result<()> {
  let handle = state
    .get()
    .ok_or_else(|| anyhow!("Backend process is not running"))?;
  handle.kill_session(&session_id).await
}

pub async fn shutdown_backend(state: tauri::State<'_, BackendState>) -> Result<()> {
  if let Some(handle) = state.replace(None) {
    handle.shutdown().await?;
  }
  Ok(())
}

fn resolve_backend_script(app: &AppHandle) -> Result<PathBuf> {
  log_debug!("Resolving backend binary location");
  
  let target_triple = if cfg!(target_os = "windows") {
    "x86_64-pc-windows-msvc"
  } else if cfg!(target_os = "macos") {
    if cfg!(target_arch = "aarch64") {
      "aarch64-apple-darwin"
    } else {
      "x86_64-apple-darwin"
    }
  } else {
    "x86_64-unknown-linux-gnu"
  };
  
  let possible_paths = vec![
    format!("bin/desk-ai-backend-{}", target_triple),
    format!("bin/desk-ai-backend-{}.exe", target_triple),
    "bin/desk-ai-backend".to_string(),
    "bin/desk-ai-backend.exe".to_string(),
    "desk-ai-backend".to_string(),
    "desk-ai-backend.exe".to_string(),
  ];
  
  // Try resource directory first
  if let Ok(resource_dir) = app.path().resource_dir() {
    for path_str in &possible_paths {
      let path = resource_dir.join(path_str);
      log_debug!("Checking: {:?}", path);
      if path.exists() {
        log_info!("Found backend binary: {:?}", path);
        return Ok(path);
      }
    }
  }

  log_error!("Backend binary not found in any expected location");
  Err(anyhow!("Unable to locate Rust backend binary. Make sure it's built and copied to src-tauri/bin/"))
}
