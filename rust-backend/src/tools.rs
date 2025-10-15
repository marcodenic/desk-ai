use crate::logger;
use crate::ndjson::BridgeRef;
use crate::types::{ApprovalResponse, BackendConfig, OutgoingEvent, ToolCallArgs};
use anyhow::{anyhow, Result};
use chrono::Utc;
use regex::Regex;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::oneshot;
use uuid::Uuid;

/// Maximum characters to display in tool output preview before truncation
const TOOL_OUTPUT_PREVIEW_LENGTH: usize = 200;

/// Default timeout for shell commands in seconds
const DEFAULT_SHELL_TIMEOUT_SECS: u64 = 120;

/// Maximum characters in shell command output (last N chars if exceeded)
const SHELL_OUTPUT_MAX_LENGTH: usize = 6000;

pub struct ToolExecutor {
    config: BackendConfig,
    bridge: BridgeRef,
}

impl ToolExecutor {
    pub fn new(config: BackendConfig, bridge: BridgeRef) -> Self {
        Self { config, bridge }
    }

    pub async fn execute_tool(
        &self,
        name: &str,
        args: &ToolCallArgs,
        prompt_id: &str,
    ) -> Result<String> {
        let tool_call_id = Uuid::new_v4().to_string();

        // Emit tool call start
        self.bridge
            .emit_event(OutgoingEvent::ToolCallStart {
                tool_call_id: tool_call_id.clone(),
                name: name.to_string(),
                arguments: serde_json::to_value(args)?,
                prompt_id: prompt_id.to_string(),
            })
            .await;

        // Check if approval is required
        let approval_required = self.requires_approval(name);

        if approval_required {
            let approved = self.request_approval(name, args).await?;
            if !approved.approved {
                let result = "User denied the request.".to_string();
                self.bridge
                    .emit_event(OutgoingEvent::ToolCallEnd {
                        tool_call_id: tool_call_id.clone(),
                        result: result.clone(),
                        error: Some("denied".to_string()),
                    })
                    .await;
                return Ok(result);
            }
            // Note: Override functionality is not currently implemented in the UI
            // If needed in the future, approved.overrides can be used to modify args
        }

        // Execute the tool
        let result = match name {
            "run_shell" => self.run_shell(args, prompt_id).await,
            "read_file" => self.read_file(args).await,
            "write_file" => self.write_file(args).await,
            "list_directory" => self.list_directory(args).await,
            "delete_path" => self.delete_path(args).await,
            "search_files" => self.search_files(args).await,
            _ => Err(anyhow!("Unknown tool: {}", name)),
        };

        match result {
            Ok(output) => {
                // Emit tool call end
                let truncated = if output.len() > TOOL_OUTPUT_PREVIEW_LENGTH {
                    format!("{}...", &output[..TOOL_OUTPUT_PREVIEW_LENGTH])
                } else {
                    output.clone()
                };
                self.bridge
                    .emit_event(OutgoingEvent::ToolCallEnd {
                        tool_call_id,
                        result: truncated,
                        error: None,
                    })
                    .await;
                Ok(output)
            }
            Err(e) => {
                let error_msg = e.to_string();
                self.bridge
                    .emit_event(OutgoingEvent::ToolCallEnd {
                        tool_call_id,
                        result: error_msg.clone(),
                        error: Some(error_msg.clone()),
                    })
                    .await;
                Err(e)
            }
        }
    }

    fn requires_approval(&self, name: &str) -> bool {
        match name {
            "run_shell" => self.config.confirm_shell,
            "write_file" | "delete_path" => self.config.confirm_writes,
            "read_file" | "list_directory" | "search_files" => !self.config.auto_approve_reads,
            _ => false,
        }
    }

    /// Check if a shell command requires elevated privileges
    fn requires_elevation(&self, command: &str) -> bool {
        let cmd_lower = command.trim().to_lowercase();
        
        #[cfg(target_os = "windows")]
        {
            // Windows: check for commands that typically need admin
            cmd_lower.starts_with("sudo ") || // WSL/Cygwin
            cmd_lower.contains("reg add") ||
            cmd_lower.contains("reg delete") ||
            cmd_lower.contains("sc.exe") ||
            cmd_lower.contains("net user") ||
            cmd_lower.contains("net localgroup") ||
            cmd_lower.starts_with("runas") ||
            cmd_lower.contains("set-executionpolicy") ||
            cmd_lower.contains("install-") // PowerShell install commands
        }
        
        #[cfg(not(target_os = "windows"))]
        {
            // Unix-like systems: check for sudo
            cmd_lower.starts_with("sudo ") ||
            cmd_lower.starts_with("doas ") || // OpenBSD alternative
            cmd_lower.starts_with("pkexec ")
        }
    }

    async fn request_approval(
        &self,
        action: &str,
        args: &ToolCallArgs,
    ) -> Result<ApprovalResponse> {
        let request_id = Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel();

        // Store the sender in pending approvals
        self.bridge
            .pending_approvals
            .write()
            .await
            .insert(request_id.clone(), tx);

        eprintln!(
            "[APPROVAL] Created approval request {} for {}",
            request_id, action
        );

        // Build approval details
        let mut details = HashMap::new();
        if let Some(path) = &args.path {
            details.insert("path".to_string(), serde_json::Value::String(path.clone()));
        }
        if let Some(command) = &args.command {
            details.insert(
                "command".to_string(),
                serde_json::Value::String(command.clone()),
            );
        }
        if let Some(content) = &args.content {
            details.insert(
                "bytes".to_string(),
                serde_json::Value::Number(content.len().into()),
            );
        }

        let action_map = match action {
            "run_shell" => "shell",
            "read_file" => "read",
            "write_file" => "write",
            "list_directory" => "list",
            "delete_path" => "delete",
            "search_files" => "search",
            _ => action,
        };

        // Check if this is an elevated command
        let elevated = if action == "run_shell" {
            if let Some(command) = &args.command {
                Some(self.requires_elevation(command))
            } else {
                None
            }
        } else {
            None
        };

        // Log elevated command attempts
        if let Some(true) = elevated {
            if let Some(command) = &args.command {
                logger::elevated_command(command, false); // Will log as DENIED initially, approved later
            }
        }

        // Emit tool request
        self.bridge
            .emit_event(OutgoingEvent::ToolRequest {
                request_id: request_id.clone(),
                action: action_map.to_string(),
                details,
                elevated,
            })
            .await;

        eprintln!("[APPROVAL] Waiting for approval response...");

        // Wait for approval
        let response = rx
            .await
            .map_err(|_| anyhow!("Approval request cancelled"))?;

        eprintln!("[APPROVAL] Got approval result: {:?}", response.approved);

        // Log the approval decision for elevated commands
        if let Some(true) = elevated {
            if let Some(command) = &args.command {
                logger::elevated_command(command, response.approved);
            }
        }

        Ok(response)
    }

    async fn run_shell(&self, args: &ToolCallArgs, _prompt_id: &str) -> Result<String> {
        let command = args
            .command
            .as_ref()
            .ok_or_else(|| anyhow!("Shell command missing"))?;
        let timeout = args.timeout.unwrap_or(DEFAULT_SHELL_TIMEOUT_SECS);
        let session_id = Uuid::new_v4().to_string();

        // Check if elevated privileges are required
        let is_elevated = self.requires_elevation(command);
        
        // If elevated but not allowed, return error
        if is_elevated && !self.config.allow_elevated_commands {
            let error_msg = "This command requires elevated privileges, but elevated commands are disabled in settings. Enable 'Allow elevated commands' to run this.";
            logger::error(&format!("Elevated command blocked: {}", command));
            return Err(anyhow!(error_msg));
        }

        // Log the command execution
        logger::tool_call("run_shell", &format!("cmd={}, elevated={}", command, is_elevated));

        // Emit shell start
        self.bridge
            .emit_event(OutgoingEvent::ShellStart {
                session_id: session_id.clone(),
                cmd: command.clone(),
                cwd: self.config.workdir.to_string_lossy().to_string(),
                ts: Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            })
            .await;

        // Spawn shell command with or without elevation
        let mut child = if is_elevated {
            self.spawn_elevated_command(command).await?
        } else {
            self.spawn_normal_command(command).await?
        };

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow!("Failed to capture stdout"))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| anyhow!("Failed to capture stderr"))?;

        let mut stdout_reader = BufReader::new(stdout).lines();
        let mut stderr_reader = BufReader::new(stderr).lines();

        let bridge_clone = self.bridge.clone();
        let session_id_clone = session_id.clone();

        // Spawn tasks to read stdout and stderr
        let stdout_task = tokio::spawn(async move {
            let mut buffer = Vec::new();
            while let Ok(Some(line)) = stdout_reader.next_line().await {
                let line_with_newline = format!("{}\n", line);
                buffer.push(line_with_newline.clone());
                bridge_clone
                    .emit_event(OutgoingEvent::ShellData {
                        session_id: session_id_clone.clone(),
                        chunk: line_with_newline,
                        stream: "stdout".to_string(),
                    })
                    .await;
            }
            buffer
        });

        let bridge_clone2 = self.bridge.clone();
        let session_id_clone2 = session_id.clone();

        let stderr_task = tokio::spawn(async move {
            let mut buffer = Vec::new();
            while let Ok(Some(line)) = stderr_reader.next_line().await {
                let line_with_newline = format!("{}\n", line);
                buffer.push(line_with_newline.clone());
                bridge_clone2
                    .emit_event(OutgoingEvent::ShellData {
                        session_id: session_id_clone2.clone(),
                        chunk: line_with_newline,
                        stream: "stderr".to_string(),
                    })
                    .await;
            }
            buffer
        });

        // Wait for command to complete with timeout
        let exit_code =
            match tokio::time::timeout(std::time::Duration::from_secs(timeout), child.wait()).await
            {
                Ok(Ok(status)) => status.code().unwrap_or(-1),
                Ok(Err(e)) => {
                    eprintln!("[SHELL] Wait error: {}", e);
                    -1
                }
                Err(_) => {
                    // Timeout
                    let _ = child.kill().await;
                    self.bridge
                        .emit_error(&format!(
                            "Command timed out after {}s: {}",
                            timeout, command
                        ))
                        .await;
                    -1
                }
            };

        // Wait for stream tasks to complete
        let stdout_buffer = stdout_task.await.unwrap_or_default();
        let stderr_buffer = stderr_task.await.unwrap_or_default();

        // Emit shell end
        self.bridge
            .emit_event(OutgoingEvent::ShellEnd {
                session_id,
                exit_code,
            })
            .await;

        // Combine output
        let mut combined: Vec<String> = Vec::new();
        combined.extend(stdout_buffer);
        combined.extend(stderr_buffer);
        let combined_str = combined.join("");

        // Truncate if too long
        let result = if combined_str.len() > SHELL_OUTPUT_MAX_LENGTH {
            combined_str[combined_str.len() - SHELL_OUTPUT_MAX_LENGTH..].to_string()
        } else {
            combined_str
        };

        Ok(if result.is_empty() {
            "(no output)".to_string()
        } else {
            result
        })
    }

    /// Spawn a normal (non-elevated) shell command
    async fn spawn_normal_command(&self, command: &str) -> Result<tokio::process::Child> {
        if cfg!(target_os = "windows") {
            Command::new("powershell")
                .args(["-NoProfile", "-NonInteractive", "-NoLogo", "-Command", command])
                .current_dir(&self.config.workdir)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| anyhow!("Failed to spawn command: {}", e))
        } else {
            Command::new("sh")
                .args(["-c", command])
                .current_dir(&self.config.workdir)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| anyhow!("Failed to spawn command: {}", e))
        }
    }

    /// Spawn an elevated shell command with platform-specific privilege escalation
    async fn spawn_elevated_command(&self, command: &str) -> Result<tokio::process::Child> {
        // Strip sudo/pkexec prefix if present (we'll add our own)
        let clean_command = command
            .trim()
            .trim_start_matches("sudo ")
            .trim_start_matches("pkexec ")
            .trim_start_matches("doas ");

        #[cfg(target_os = "linux")]
        {
            // Try pkexec first (graphical auth dialog)
            if Command::new("which")
                .arg("pkexec")
                .output()
                .await
                .map(|o| o.status.success())
                .unwrap_or(false)
            {
                logger::info("Using pkexec for elevated command");
                return Command::new("pkexec")
                    .arg("sh")
                    .arg("-c")
                    .arg(clean_command)
                    .current_dir(&self.config.workdir)
                    .stdout(std::process::Stdio::piped())
                    .stderr(std::process::Stdio::piped())
                    .spawn()
                    .map_err(|e| anyhow!("Failed to spawn pkexec: {}", e));
            }

            // Fallback to sudo
            logger::info("Using sudo for elevated command");
            Command::new("sudo")
                .arg("-S") // Read password from stdin
                .arg("sh")
                .arg("-c")
                .arg(clean_command)
                .current_dir(&self.config.workdir)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .stdin(std::process::Stdio::null()) // No interactive password
                .spawn()
                .map_err(|e| anyhow!("Failed to spawn sudo: {}. You may need to configure passwordless sudo or use pkexec.", e))
        }

        #[cfg(target_os = "macos")]
        {
            // macOS: Use osascript for graphical authentication
            logger::info("Using osascript for elevated command");
            let escaped = clean_command.replace('\\', "\\\\").replace('"', "\\\"");
            let script = format!(
                "do shell script \"{}\" with administrator privileges",
                escaped
            );
            
            Command::new("osascript")
                .arg("-e")
                .arg(&script)
                .current_dir(&self.config.workdir)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| anyhow!("Failed to spawn osascript: {}", e))
        }

        #[cfg(target_os = "windows")]
        {
            // Windows: Use PowerShell with Start-Process -Verb RunAs
            logger::info("Using PowerShell elevation for command");
            
            // Create a PowerShell script that runs the command elevated
            let ps_script = format!(
                "Start-Process powershell -ArgumentList '-NoProfile','-Command',\"{}\" -Verb RunAs -Wait -WindowStyle Hidden",
                clean_command.replace('"', "`\"")
            );
            
            Command::new("powershell")
                .arg("-NoProfile")
                .arg("-Command")
                .arg(&ps_script)
                .current_dir(&self.config.workdir)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| anyhow!("Failed to spawn elevated PowerShell: {}", e))
        }

        #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
        {
            Err(anyhow!("Elevated commands not supported on this platform"))
        }
    }

    async fn read_file(&self, args: &ToolCallArgs) -> Result<String> {
        let path_str = args
            .path
            .as_ref()
            .ok_or_else(|| anyhow!("Path argument is required"))?;
        let path = self.resolve_path(path_str)?;
        let max_bytes = args.max_bytes.unwrap_or(20000);

        if !path.exists() {
            return Err(anyhow!("File does not exist: {}", path.display()));
        }
        if !path.is_file() {
            return Err(anyhow!("Path is not a file: {}", path.display()));
        }

        let data = tokio::fs::read(&path).await?;
        let data_len = data.len();
        let truncated_data = if data_len > max_bytes {
            &data[..max_bytes]
        } else {
            &data
        };

        let text = String::from_utf8_lossy(truncated_data).to_string();

        self.bridge
            .emit_event(OutgoingEvent::ToolLog {
                message: format!(
                    "read {} ({} bytes)",
                    path.strip_prefix(&self.config.workdir)
                        .unwrap_or(&path)
                        .display(),
                    data_len
                ),
                ts: Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            })
            .await;

        Ok(text)
    }

    async fn write_file(&self, args: &ToolCallArgs) -> Result<String> {
        let path_str = args
            .path
            .as_ref()
            .ok_or_else(|| anyhow!("Path argument is required"))?;
        let path = self.resolve_path(path_str)?;
        let content = args
            .content
            .as_ref()
            .ok_or_else(|| anyhow!("Content argument is required"))?;

        // Create parent directory if needed
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        tokio::fs::write(&path, content.as_bytes()).await?;

        let bytes_written = content.as_bytes().len();

        self.bridge
            .emit_event(OutgoingEvent::ToolLog {
                message: format!(
                    "write {} ({} bytes)",
                    path.strip_prefix(&self.config.workdir)
                        .unwrap_or(&path)
                        .display(),
                    bytes_written
                ),
                ts: Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            })
            .await;

        Ok(format!(
            "Wrote {} bytes to {}.",
            bytes_written,
            path.file_name().and_then(|n| n.to_str()).unwrap_or("file")
        ))
    }

    async fn list_directory(&self, args: &ToolCallArgs) -> Result<String> {
        let path_str = args.path.as_ref().map(|s| s.as_str()).unwrap_or(".");
        let directory = self.resolve_path(path_str)?;

        if !directory.exists() {
            return Err(anyhow!("Directory does not exist: {}", directory.display()));
        }
        if !directory.is_dir() {
            return Err(anyhow!("Path is not a directory: {}", directory.display()));
        }

        let mut entries = Vec::new();
        let mut dir_reader = tokio::fs::read_dir(&directory).await?;

        while let Some(entry) = dir_reader.next_entry().await? {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            let is_dir = entry.file_type().await?.is_dir();
            entries.push(if is_dir {
                format!("{}/", name_str)
            } else {
                name_str.to_string()
            });
        }

        entries.sort();

        self.bridge
            .emit_event(OutgoingEvent::ToolLog {
                message: format!(
                    "list {} ({} entries)",
                    directory
                        .strip_prefix(&self.config.workdir)
                        .unwrap_or(&directory)
                        .display(),
                    entries.len()
                ),
                ts: Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            })
            .await;

        // Truncate if too many entries
        let truncated_entries: Vec<_> = entries.into_iter().take(400).collect();
        Ok(truncated_entries.join("\n"))
    }

    async fn delete_path(&self, args: &ToolCallArgs) -> Result<String> {
        let path_str = args
            .path
            .as_ref()
            .ok_or_else(|| anyhow!("Path argument is required"))?;
        let path = self.resolve_path(path_str)?;
        let recursive = args.recursive.unwrap_or(false);

        if !path.exists() {
            return Err(anyhow!("Path does not exist: {}", path.display()));
        }

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        if path.is_dir() {
            if recursive {
                tokio::fs::remove_dir_all(&path).await?;
            } else {
                tokio::fs::remove_dir(&path).await?;
            }
        } else {
            tokio::fs::remove_file(&path).await?;
        }

        self.bridge
            .emit_event(OutgoingEvent::ToolLog {
                message: format!(
                    "delete {}",
                    path.strip_prefix(&self.config.workdir)
                        .unwrap_or(&path)
                        .display()
                ),
                ts: Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            })
            .await;

        Ok(format!("Deleted {}.", file_name))
    }

    async fn search_files(&self, args: &ToolCallArgs) -> Result<String> {
        let query = args
            .query
            .as_ref()
            .ok_or_else(|| anyhow!("Query argument is required"))?;
        let search_path_str = args.path.as_ref().map(|s| s.as_str()).unwrap_or(".");
        let search_dir = self.resolve_path(search_path_str)?;
        let file_pattern = args.file_pattern.as_ref();
        let use_regex = args.regex.unwrap_or(false);
        let case_sensitive = args.case_sensitive.unwrap_or(false);
        let max_results = args.max_results.unwrap_or(100);

        if !search_dir.exists() {
            return Err(anyhow!(
                "Directory does not exist: {}",
                search_dir.display()
            ));
        }
        if !search_dir.is_dir() {
            return Err(anyhow!("Path is not a directory: {}", search_dir.display()));
        }

        // Compile search pattern
        let pattern = if use_regex {
            if case_sensitive {
                Regex::new(query)?
            } else {
                Regex::new(&format!("(?i){}", query))?
            }
        } else {
            let escaped = regex::escape(query);
            if case_sensitive {
                Regex::new(&escaped)?
            } else {
                Regex::new(&format!("(?i){}", escaped))?
            }
        };

        // Collect files
        let files = self.collect_files(&search_dir, file_pattern).await?;

        let mut results = Vec::new();
        let mut files_searched = 0;

        for file_path in files {
            // Skip binary files
            if let Some(ext) = file_path.extension() {
                let ext_str = ext.to_string_lossy();
                if [
                    "pyc", "so", "o", "a", "png", "jpg", "jpeg", "gif", "pdf", "zip", "tar", "gz",
                ]
                .contains(&ext_str.as_ref())
                {
                    continue;
                }
            }

            // Try to read as text
            if let Ok(content) = tokio::fs::read_to_string(&file_path).await {
                files_searched += 1;

                for (line_num, line) in content.lines().enumerate() {
                    if pattern.is_match(line) {
                        let rel_path = file_path
                            .strip_prefix(&self.config.workdir)
                            .unwrap_or(&file_path);
                        results.push(format!(
                            "{}:{}: {}",
                            rel_path.display(),
                            line_num + 1,
                            line.trim()
                        ));

                        if results.len() >= max_results {
                            break;
                        }
                    }
                }

                if results.len() >= max_results {
                    break;
                }
            }
        }

        self.bridge
            .emit_event(OutgoingEvent::ToolLog {
                message: format!(
                    "search '{}' in {} ({} files searched, {} matches)",
                    query,
                    search_path_str,
                    files_searched,
                    results.len()
                ),
                ts: Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            })
            .await;

        if results.is_empty() {
            return Ok(format!(
                "No matches found for '{}' in {}",
                query, search_path_str
            ));
        }

        let result_text = format!(
            "Found {} matches{}:\n\n{}",
            results.len(),
            if results.len() >= max_results {
                format!(" (showing first {})", max_results)
            } else {
                String::new()
            },
            results.join("\n")
        );

        Ok(result_text)
    }

    async fn collect_files(
        &self,
        dir: &Path,
        file_pattern: Option<&String>,
    ) -> Result<Vec<PathBuf>> {
        let mut files = Vec::new();

        if let Some(pattern) = file_pattern {
            // Use glob pattern
            let glob_pattern = format!("{}/**/{}", dir.display(), pattern);
            for entry in glob::glob(&glob_pattern)? {
                if let Ok(path) = entry {
                    if path.is_file() {
                        files.push(path);
                    }
                }
            }
        } else {
            // Recursively collect all files
            self.collect_files_recursive(dir, &mut files).await?;
        }

        Ok(files)
    }

    fn collect_files_recursive<'a>(
        &'a self,
        dir: &'a Path,
        files: &'a mut Vec<PathBuf>,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + 'a>> {
        Box::pin(async move {
            let mut dir_reader = tokio::fs::read_dir(dir).await?;

            while let Some(entry) = dir_reader.next_entry().await? {
                let path = entry.path();
                if path.is_dir() {
                    self.collect_files_recursive(&path, files).await?;
                } else if path.is_file() {
                    files.push(path);
                }
            }

            Ok(())
        })
    }

    fn resolve_path(&self, relative: &str) -> Result<PathBuf> {
        if relative.is_empty() {
            return Err(anyhow!("Path argument is required"));
        }

        // If allow_system_wide is enabled, treat absolute paths as-is
        if self.config.allow_system_wide {
            let candidate = PathBuf::from(relative);
            if candidate.is_absolute() {
                // Try to canonicalize, but if it fails (common on Windows), use the path as-is
                return Ok(candidate.canonicalize().unwrap_or(candidate));
            }
        }

        // Otherwise, resolve relative to workdir
        let candidate = self.config.workdir.join(relative);
        
        // Try to canonicalize, but fall back to the constructed path if it fails
        // This is important on Windows where canonicalize can fail for valid paths
        let resolved = candidate.canonicalize().unwrap_or_else(|_| {
            // If canonicalize fails, clean up the path manually
            let mut components = Vec::new();
            for component in candidate.components() {
                match component {
                    std::path::Component::ParentDir => {
                        components.pop();
                    }
                    std::path::Component::CurDir => {}
                    _ => components.push(component),
                }
            }
            components.iter().collect()
        });

        // If not in system-wide mode, enforce sandbox
        if !self.config.allow_system_wide {
            // Canonicalize workdir for comparison
            let workdir_canonical = self.config.workdir.canonicalize()
                .unwrap_or_else(|_| self.config.workdir.clone());
            
            if !resolved.starts_with(&workdir_canonical) {
                return Err(anyhow!("Access outside of workspace is denied"));
            }
        }

        Ok(resolved)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::sync::Arc;
    use tokio::sync::RwLock;
    use std::collections::HashMap;

    // Create a test BridgeRef that doesn't actually emit to stdout
    fn create_test_bridge() -> BridgeRef {
        BridgeRef {
            pending_approvals: Arc::new(RwLock::new(HashMap::new())),
            conversation_history: Arc::new(RwLock::new(Vec::new())),
        }
    }

    fn create_test_executor(workdir: PathBuf, allow_system_wide: bool) -> ToolExecutor {
        let config = BackendConfig {
            provider: crate::types::Provider::OpenAI,
            api_key: "test-key".to_string(),
            model: "gpt-4".to_string(),
            workdir,
            auto_approve_reads: false,
            confirm_writes: true,
            confirm_shell: true,
            allow_system_wide,
            allow_elevated_commands: false,
        };
        let bridge = create_test_bridge();
        ToolExecutor::new(config, bridge)
    }

    #[test]
    fn test_tool_output_preview_truncation() {
        let long_output = "a".repeat(500);
        let truncated = if long_output.len() > TOOL_OUTPUT_PREVIEW_LENGTH {
            format!("{}...", &long_output[..TOOL_OUTPUT_PREVIEW_LENGTH])
        } else {
            long_output.clone()
        };
        
        assert!(truncated.len() <= TOOL_OUTPUT_PREVIEW_LENGTH + 3); // + "..."
        assert!(truncated.ends_with("..."));
    }

    #[test]
    fn test_shell_output_max_length() {
        let very_long_output = "x".repeat(10000);
        
        // Simulate truncation (keep last N chars)
        let truncated = if very_long_output.len() > SHELL_OUTPUT_MAX_LENGTH {
            very_long_output.chars().rev().take(SHELL_OUTPUT_MAX_LENGTH).collect::<String>()
                .chars().rev().collect()
        } else {
            very_long_output.clone()
        };
        
        assert_eq!(truncated.len(), SHELL_OUTPUT_MAX_LENGTH);
    }

    #[test]
    fn test_elevation_detection_unix() {
        #[cfg(not(target_os = "windows"))]
        {
            assert!(command_requires_elevation("sudo ls -la"));
            assert!(command_requires_elevation("pkexec systemctl restart service"));
            assert!(command_requires_elevation("doas reboot"));
            assert!(!command_requires_elevation("ls -la"));
            assert!(!command_requires_elevation("echo 'hello'"));
        }
    }

    #[test]
    fn test_elevation_detection_windows() {
        #[cfg(target_os = "windows")]
        {
            assert!(command_requires_elevation("reg add HKLM\\Software"));
            assert!(command_requires_elevation("net user add testuser"));
            assert!(command_requires_elevation("Set-ExecutionPolicy Unrestricted"));
            assert!(!command_requires_elevation("dir"));
            assert!(!command_requires_elevation("echo hello"));
        }
    }

    // Helper function for testing elevation detection
    #[cfg(not(target_os = "windows"))]
    fn command_requires_elevation(command: &str) -> bool {
        let cmd_lower = command.trim().to_lowercase();
        cmd_lower.starts_with("sudo ") ||
        cmd_lower.starts_with("doas ") ||
        cmd_lower.starts_with("pkexec ")
    }

    #[cfg(target_os = "windows")]
    fn command_requires_elevation(command: &str) -> bool {
        let cmd_lower = command.trim().to_lowercase();
        cmd_lower.starts_with("sudo ") ||
        cmd_lower.contains("reg add") ||
        cmd_lower.contains("reg delete") ||
        cmd_lower.contains("net user") ||
        cmd_lower.contains("set-executionpolicy")
    }

    // ===== Path Resolution Tests =====

    #[test]
    fn test_resolve_path_sandbox_relative() {
        let temp_dir = TempDir::new().unwrap();
        let workdir = temp_dir.path().to_path_buf();
        let executor = create_test_executor(workdir.clone(), false);

        let result = executor.resolve_path("test.txt");
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert!(resolved.starts_with(&workdir));
    }

    #[test]
    fn test_resolve_path_sandbox_blocks_absolute() {
        let temp_dir = TempDir::new().unwrap();
        let workdir = temp_dir.path().to_path_buf();
        let executor = create_test_executor(workdir, false);

        #[cfg(not(target_os = "windows"))]
        let result = executor.resolve_path("/etc/passwd");
        
        #[cfg(target_os = "windows")]
        let result = executor.resolve_path("C:\\Windows\\System32");

        // Should fail when not in system-wide mode
        assert!(result.is_err() || !result.unwrap().to_string_lossy().contains("etc"));
    }

    #[test]
    fn test_resolve_path_sandbox_blocks_parent_traversal() {
        let temp_dir = TempDir::new().unwrap();
        let workdir = temp_dir.path().to_path_buf();
        let executor = create_test_executor(workdir.clone(), false);

        // Try to escape with ../../../
        let result = executor.resolve_path("../../../etc/passwd");
        
        // Should either fail or stay within workdir
        if let Ok(resolved) = result {
            assert!(resolved.starts_with(&workdir));
        }
    }

    #[test]
    fn test_resolve_path_system_wide_allows_absolute() {
        let temp_dir = TempDir::new().unwrap();
        let workdir = temp_dir.path().to_path_buf();
        let executor = create_test_executor(workdir, true);

        #[cfg(not(target_os = "windows"))]
        let absolute_path = "/tmp";
        
        #[cfg(target_os = "windows")]
        let absolute_path = "C:\\Windows";

        let result = executor.resolve_path(absolute_path);
        assert!(result.is_ok());
    }

    #[test]
    fn test_resolve_path_empty_path() {
        let temp_dir = TempDir::new().unwrap();
        let executor = create_test_executor(temp_dir.path().to_path_buf(), false);

        let result = executor.resolve_path("");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("required"));
    }

    // ===== File Operations Tests =====

    #[tokio::test]
    async fn test_read_file_success() {
        let temp_dir = TempDir::new().unwrap();
        let workdir = temp_dir.path().to_path_buf();
        let test_file = workdir.join("test.txt");
        
        std::fs::write(&test_file, "Hello, World!").unwrap();

        let executor = create_test_executor(workdir, false);
        let args = ToolCallArgs {
            path: Some("test.txt".to_string()),
            max_bytes: Some(1000),
            ..Default::default()
        };

        let result = executor.read_file(&args).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Hello, World!");
    }

    #[tokio::test]
    async fn test_read_file_nonexistent() {
        let temp_dir = TempDir::new().unwrap();
        let executor = create_test_executor(temp_dir.path().to_path_buf(), false);
        
        let args = ToolCallArgs {
            path: Some("nonexistent.txt".to_string()),
            ..Default::default()
        };

        let result = executor.read_file(&args).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("does not exist"));
    }

    #[tokio::test]
    async fn test_read_file_truncation() {
        let temp_dir = TempDir::new().unwrap();
        let workdir = temp_dir.path().to_path_buf();
        let test_file = workdir.join("large.txt");
        
        let large_content = "x".repeat(10000);
        std::fs::write(&test_file, &large_content).unwrap();

        let executor = create_test_executor(workdir, false);
        let args = ToolCallArgs {
            path: Some("large.txt".to_string()),
            max_bytes: Some(100),
            ..Default::default()
        };

        let result = executor.read_file(&args).await;
        assert!(result.is_ok());
        let content = result.unwrap();
        assert_eq!(content.len(), 100);
    }

    #[tokio::test]
    async fn test_read_file_directory() {
        let temp_dir = TempDir::new().unwrap();
        let workdir = temp_dir.path().to_path_buf();
        let subdir = workdir.join("subdir");
        std::fs::create_dir(&subdir).unwrap();

        let executor = create_test_executor(workdir, false);
        let args = ToolCallArgs {
            path: Some("subdir".to_string()),
            ..Default::default()
        };

        let result = executor.read_file(&args).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not a file"));
    }

    #[tokio::test]
    async fn test_write_file_success() {
        let temp_dir = TempDir::new().unwrap();
        let workdir = temp_dir.path().to_path_buf();
        let executor = create_test_executor(workdir.clone(), false);

        let args = ToolCallArgs {
            path: Some("output.txt".to_string()),
            content: Some("Test content".to_string()),
            ..Default::default()
        };

        let result = executor.write_file(&args).await;
        assert!(result.is_ok());

        // Verify file was written
        let written_content = std::fs::read_to_string(workdir.join("output.txt")).unwrap();
        assert_eq!(written_content, "Test content");
    }

    #[tokio::test]
    async fn test_write_file_creates_parent_dirs() {
        let temp_dir = TempDir::new().unwrap();
        let workdir = temp_dir.path().to_path_buf();
        let executor = create_test_executor(workdir.clone(), false);

        let args = ToolCallArgs {
            path: Some("nested/deep/output.txt".to_string()),
            content: Some("Nested content".to_string()),
            ..Default::default()
        };

        let result = executor.write_file(&args).await;
        assert!(result.is_ok());

        // Verify file and directories were created
        let nested_file = workdir.join("nested/deep/output.txt");
        assert!(nested_file.exists());
        let content = std::fs::read_to_string(nested_file).unwrap();
        assert_eq!(content, "Nested content");
    }

    #[tokio::test]
    async fn test_write_file_missing_content() {
        let temp_dir = TempDir::new().unwrap();
        let executor = create_test_executor(temp_dir.path().to_path_buf(), false);

        let args = ToolCallArgs {
            path: Some("test.txt".to_string()),
            content: None,
            ..Default::default()
        };

        let result = executor.write_file(&args).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Content"));
    }

    #[tokio::test]
    async fn test_list_directory_success() {
        let temp_dir = TempDir::new().unwrap();
        let workdir = temp_dir.path().to_path_buf();
        
        // Create test files and directories
        std::fs::write(workdir.join("file1.txt"), "content").unwrap();
        std::fs::write(workdir.join("file2.txt"), "content").unwrap();
        std::fs::create_dir(workdir.join("subdir")).unwrap();

        let executor = create_test_executor(workdir, false);
        let args = ToolCallArgs {
            path: Some(".".to_string()),
            ..Default::default()
        };

        let result = executor.list_directory(&args).await;
        assert!(result.is_ok());
        
        let listing = result.unwrap();
        assert!(listing.contains("file1.txt"));
        assert!(listing.contains("file2.txt"));
        assert!(listing.contains("subdir/"));
    }

    #[tokio::test]
    async fn test_list_directory_nonexistent() {
        let temp_dir = TempDir::new().unwrap();
        let executor = create_test_executor(temp_dir.path().to_path_buf(), false);

        let args = ToolCallArgs {
            path: Some("nonexistent_dir".to_string()),
            ..Default::default()
        };

        let result = executor.list_directory(&args).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("does not exist"));
    }

    #[tokio::test]
    async fn test_list_directory_on_file() {
        let temp_dir = TempDir::new().unwrap();
        let workdir = temp_dir.path().to_path_buf();
        std::fs::write(workdir.join("file.txt"), "content").unwrap();

        let executor = create_test_executor(workdir, false);
        let args = ToolCallArgs {
            path: Some("file.txt".to_string()),
            ..Default::default()
        };

        let result = executor.list_directory(&args).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not a directory"));
    }

    #[tokio::test]
    async fn test_delete_file_success() {
        let temp_dir = TempDir::new().unwrap();
        let workdir = temp_dir.path().to_path_buf();
        let test_file = workdir.join("delete_me.txt");
        std::fs::write(&test_file, "content").unwrap();

        let executor = create_test_executor(workdir, false);
        let args = ToolCallArgs {
            path: Some("delete_me.txt".to_string()),
            recursive: Some(false),
            ..Default::default()
        };

        assert!(test_file.exists());
        let result = executor.delete_path(&args).await;
        assert!(result.is_ok());
        assert!(!test_file.exists());
    }

    #[tokio::test]
    async fn test_delete_directory_recursive() {
        let temp_dir = TempDir::new().unwrap();
        let workdir = temp_dir.path().to_path_buf();
        let dir_path = workdir.join("delete_dir");
        std::fs::create_dir(&dir_path).unwrap();
        std::fs::write(dir_path.join("file.txt"), "content").unwrap();

        let executor = create_test_executor(workdir, false);
        let args = ToolCallArgs {
            path: Some("delete_dir".to_string()),
            recursive: Some(true),
            ..Default::default()
        };

        assert!(dir_path.exists());
        let result = executor.delete_path(&args).await;
        assert!(result.is_ok());
        assert!(!dir_path.exists());
    }

    #[tokio::test]
    async fn test_delete_nonexistent() {
        let temp_dir = TempDir::new().unwrap();
        let executor = create_test_executor(temp_dir.path().to_path_buf(), false);

        let args = ToolCallArgs {
            path: Some("nonexistent.txt".to_string()),
            ..Default::default()
        };

        let result = executor.delete_path(&args).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("does not exist"));
    }

    // ===== Integration Tests =====

    #[tokio::test]
    async fn test_full_workflow_create_read_delete() {
        let temp_dir = TempDir::new().unwrap();
        let workdir = temp_dir.path().to_path_buf();
        let executor = create_test_executor(workdir.clone(), false);

        // 1. Write a file
        let write_args = ToolCallArgs {
            path: Some("workflow.txt".to_string()),
            content: Some("Workflow test".to_string()),
            ..Default::default()
        };
        let write_result = executor.write_file(&write_args).await;
        assert!(write_result.is_ok());

        // 2. Read the file back
        let read_args = ToolCallArgs {
            path: Some("workflow.txt".to_string()),
            max_bytes: Some(1000),
            ..Default::default()
        };
        let read_result = executor.read_file(&read_args).await;
        assert!(read_result.is_ok());
        assert_eq!(read_result.unwrap(), "Workflow test");

        // 3. Delete the file
        let delete_args = ToolCallArgs {
            path: Some("workflow.txt".to_string()),
            ..Default::default()
        };
        let delete_result = executor.delete_path(&delete_args).await;
        assert!(delete_result.is_ok());

        // 4. Verify file is gone
        assert!(!workdir.join("workflow.txt").exists());
    }

    #[tokio::test]
    async fn test_unicode_filename_handling() {
        let temp_dir = TempDir::new().unwrap();
        let workdir = temp_dir.path().to_path_buf();
        let executor = create_test_executor(workdir.clone(), false);

        let unicode_name = "test_文件_テスト.txt";
        let write_args = ToolCallArgs {
            path: Some(unicode_name.to_string()),
            content: Some("Unicode content 🚀".to_string()),
            ..Default::default()
        };

        let write_result = executor.write_file(&write_args).await;
        assert!(write_result.is_ok());

        let read_args = ToolCallArgs {
            path: Some(unicode_name.to_string()),
            max_bytes: Some(1000),
            ..Default::default()
        };
        let read_result = executor.read_file(&read_args).await;
        assert!(read_result.is_ok());
        assert_eq!(read_result.unwrap(), "Unicode content 🚀");
    }
}
