use std::{path::PathBuf, sync::Arc};

#[cfg(unix)]
use std::os::unix::process::ExitStatusExt;

use anyhow::{anyhow, Context, Result};
use parking_lot::Mutex;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tokio::{
  io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
  process::{Child, ChildStdin, Command},
  sync::{Mutex as AsyncMutex, Notify},
};
use uuid::Uuid;

const PYTHON_BACKEND_RELATIVE: &str = "python/backend.py";
const STANDALONE_BACKEND_NAME: &str = "desk-ai-backend";

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
  pub python_path: Option<String>,
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
    eprintln!("[DEBUG] Writing to Python STDIN: {}", serialized);
    stdin.write_all(serialized.as_bytes()).await?;
    stdin.write_all(b"\n").await?;
    stdin.flush().await?;
    eprintln!("[DEBUG] Successfully wrote and flushed to Python STDIN");
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
    eprintln!("[DEBUG] Sending config to Python backend: {:?}", serde_json::to_string(config).unwrap());
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
    python_path,
  } = config;

  let workdir = workdir
    .canonicalize()
    .context("Failed to resolve working directory path")?;

  // Check if backend is already running
  if let Some(existing_handle) = state.get() {
    eprintln!("[DEBUG] Backend already running, sending config update instead of restarting");
    
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
    };

    existing_handle
      .send_config(&runtime_config)
      .await
      .context("Failed to send config update to backend")?;
    
    return Ok(());
  }

  // If not running, start a new backend
  let script_path = resolve_backend_script(&app).context("Unable to locate backend")?;

  eprintln!("[DEBUG] Backend path: {:?}", script_path);
  eprintln!("[DEBUG] Working dir: {:?}", workdir);

  // Check if this is a standalone executable or needs Python
  let is_standalone = script_path.extension().map_or(false, |ext| ext == "exe") 
    || !script_path.extension().map_or(false, |ext| ext == "py");

  let mut command = if is_standalone {
    // Run standalone executable directly
    eprintln!("[DEBUG] Using standalone executable");
    Command::new(&script_path)
  } else {
    // Run Python script
    eprintln!("[DEBUG] Using Python interpreter");
    let python_path = resolve_python_executable(python_path.as_deref())
      .context("Unable to locate a Python 3 executable")?;
    eprintln!("[DEBUG] Python path: {:?}", python_path);
    let mut cmd = Command::new(&python_path);
    cmd.arg(&script_path);
    cmd
  };

  command.current_dir(&workdir);
  command.kill_on_drop(true);
  command.env("PYTHONUNBUFFERED", "1");

  eprintln!("[DEBUG] About to spawn: {:?}", script_path);

  let mut child = command
    .stdin(std::process::Stdio::piped())
    .stdout(std::process::Stdio::piped())
    .stderr(std::process::Stdio::piped())
    .spawn()
    .context("Failed to spawn python backend process")?;

  eprintln!("[DEBUG] Process spawned successfully");

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
    .ok_or_else(|| anyhow!("Backend process is not running. Call start_python_backend first."))?;

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
  };

  eprintln!("[DEBUG] Sending config update to running backend");
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
              eprintln!("[DEBUG] Received from Python STDOUT: {}", line);
              if line.trim().is_empty() {
                continue;
              }
              match serde_json::from_str::<Value>(&line) {
                Ok(json) => {
                  if let Some(event_type) = json.get("type").and_then(|v| v.as_str()) {
                    eprintln!("[DEBUG] Emitting event: backend://{}", event_type);
                    let _ = app.emit_all(&format!("backend://{}", event_type), json);
                  } else {
                    eprintln!("[DEBUG] Received JSON without type field");
                    let _ = app.emit_all("backend://error", json!({"message": "Received JSON without a type", "raw": line}));
                  }
                }
                Err(err) => {
                  eprintln!("[DEBUG] Failed to parse JSON: {}", err);
                  let _ = app.emit_all(
                    "backend://error",
                    json!({ "message": "Failed to parse backend JSON", "raw": line, "error": err.to_string() }),
                  );
                }
              }
            }
            Ok(None) => {
              eprintln!("[DEBUG] Python STDOUT closed");
              break;
            }
            Err(err) => {
              eprintln!("[DEBUG] Error reading Python STDOUT: {}", err);
              let _ = app.emit_all(
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
      eprintln!("[DEBUG] Python STDERR: {}", trimmed);
      let _ = app.emit_all(
        "backend://python_stderr",
        json!({ "message": trimmed }),
      );
    }
    eprintln!("[DEBUG] Python STDERR stream closed");
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
        
        let _ = app.emit_all(
          "backend://exit",
          json!({ "code": status.code(), "signal": signal }),
        );
      }
      Err(err) => {
        let _ = app.emit_all(
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

fn resolve_python_executable(custom: Option<&str>) -> Result<String> {
  if let Some(path) = custom {
    return Ok(path.to_string());
  }

  let candidates = ["python3", "python"];
  for candidate in candidates {
    if let Ok(path) = which::which(candidate) {
      return Ok(path.to_string_lossy().to_string());
    }
  }

  Err(anyhow!("Python executable not found. Make sure Python 3 is installed."))
}

fn resolve_backend_script(app: &AppHandle) -> Result<PathBuf> {
  eprintln!("[DEBUG] Starting backend resolution...");
  
  // First try the standalone sidecar binary (for production builds)
  // Try various possible locations
  let possible_paths = vec![
    format!("bin/{}", STANDALONE_BACKEND_NAME),
    format!("bin/{}.exe", STANDALONE_BACKEND_NAME),
    format!("{}", STANDALONE_BACKEND_NAME),
    format!("{}.exe", STANDALONE_BACKEND_NAME),
  ];
  
  for path_str in possible_paths {
    if let Some(path) = app.path_resolver().resolve_resource(&path_str) {
      eprintln!("[DEBUG] Checking: {:?} -> {:?} (exists: {})", path_str, path, path.exists());
      if path.exists() {
        eprintln!("[DEBUG] Found standalone backend sidecar: {:?}", path);
        return Ok(path);
      }
    } else {
      eprintln!("[DEBUG] Could not resolve resource: {:?}", path_str);
    }
  }

  // Fall back to bundled Python script
  if let Some(path) = app.path_resolver().resolve_resource(PYTHON_BACKEND_RELATIVE) {
    eprintln!("[DEBUG] Checking Python script: {:?} (exists: {})", path, path.exists());
    if path.exists() {
      eprintln!("[DEBUG] Found backend script via resource resolver: {:?}", path);
      return Ok(path);
    }
  } else {
    eprintln!("[DEBUG] Could not resolve Python script resource: {:?}", PYTHON_BACKEND_RELATIVE);
  }

  // In development, try relative to current dir
  let dev_path = std::env::current_dir()?.join(PYTHON_BACKEND_RELATIVE);
  eprintln!("[DEBUG] Trying dev path from current_dir: {:?}", dev_path);
  if dev_path.exists() {
    return Ok(dev_path);
  }

  // Try one directory up (in case we're in src-tauri/)
  let parent_dev_path = std::env::current_dir()?.join("..").join(PYTHON_BACKEND_RELATIVE);
  eprintln!("[DEBUG] Trying dev path from parent: {:?}", parent_dev_path);
  if parent_dev_path.exists() {
    return Ok(parent_dev_path.canonicalize()?);
  }

  Err(anyhow!(
    "Unable to locate backend. Tried sidecar, bundled resources, and dev paths."
  ))
}
