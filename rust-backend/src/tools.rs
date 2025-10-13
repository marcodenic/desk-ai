use crate::ndjson::BridgeRef;
use crate::types::{ApprovalResponse, BackendConfig, OutgoingEvent, ToolCallArgs};
use anyhow::{anyhow, Result};
use chrono::Utc;
use regex::Regex;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::oneshot;
use uuid::Uuid;

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
        let approval_reason = self.get_approval_reason(name, args);

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
            // Apply overrides if provided
            if let Some(_overrides) = approved.overrides {
                // TODO: Apply overrides to args
            }
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
                let truncated = if output.len() > 200 {
                    format!("{}...", &output[..200])
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

    fn get_approval_reason(&self, name: &str, args: &ToolCallArgs) -> String {
        match name {
            "run_shell" => args.command.clone().unwrap_or_default(),
            "write_file" | "delete_path" | "read_file" | "list_directory" => {
                args.path.clone().unwrap_or_default()
            }
            "search_files" => args.query.clone().unwrap_or_default(),
            _ => String::new(),
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

        // Emit tool request
        self.bridge
            .emit_event(OutgoingEvent::ToolRequest {
                request_id: request_id.clone(),
                action: action_map.to_string(),
                details,
            })
            .await;

        eprintln!("[APPROVAL] Waiting for approval response...");

        // Wait for approval
        let response = rx
            .await
            .map_err(|_| anyhow!("Approval request cancelled"))?;

        eprintln!("[APPROVAL] Got approval result: {:?}", response.approved);

        Ok(response)
    }

    async fn run_shell(&self, args: &ToolCallArgs, prompt_id: &str) -> Result<String> {
        let command = args
            .command
            .as_ref()
            .ok_or_else(|| anyhow!("Shell command missing"))?;
        let timeout = args.timeout.unwrap_or(120);
        let session_id = Uuid::new_v4().to_string();

        // Emit shell start
        self.bridge
            .emit_event(OutgoingEvent::ShellStart {
                session_id: session_id.clone(),
                cmd: command.clone(),
                cwd: self.config.workdir.to_string_lossy().to_string(),
                ts: Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            })
            .await;

        // Spawn shell command
        let mut child = if cfg!(target_os = "windows") {
            Command::new("cmd")
                .args(["/C", command])
                .current_dir(&self.config.workdir)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()?
        } else {
            Command::new("sh")
                .args(["-c", command])
                .current_dir(&self.config.workdir)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()?
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

        let mut stdout_buffer = Vec::new();
        let mut stderr_buffer = Vec::new();

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
        stdout_buffer = stdout_task.await.unwrap_or_default();
        stderr_buffer = stderr_task.await.unwrap_or_default();

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
        let result = if combined_str.len() > 6000 {
            combined_str[combined_str.len() - 6000..].to_string()
        } else {
            combined_str
        };

        Ok(if result.is_empty() {
            "(no output)".to_string()
        } else {
            result
        })
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
                return Ok(candidate.canonicalize()?);
            }
        }

        // Otherwise, resolve relative to workdir
        let candidate = self.config.workdir.join(relative).canonicalize()?;

        // If not in system-wide mode, enforce sandbox
        if !self.config.allow_system_wide {
            if !candidate.starts_with(&self.config.workdir) {
                return Err(anyhow!("Access outside of workspace is denied"));
            }
        }

        Ok(candidate)
    }
}
