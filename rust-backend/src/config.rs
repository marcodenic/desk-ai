use crate::types::BackendConfig;
use anyhow::{anyhow, Result};

pub fn validate_config(config: &BackendConfig) -> Result<()> {
    if config.api_key.trim().is_empty() {
        return Err(anyhow!("API key must not be empty"));
    }
    
    if !config.workdir.exists() {
        return Err(anyhow!("Working directory must exist"));
    }
    
    if !config.workdir.is_dir() {
        return Err(anyhow!("Working directory must be a directory"));
    }
    
    Ok(())
}

pub const SYSTEM_PROMPT: &str = "You are Desk AI, a helpful desktop assistant for system management and tech support. \
You can help with system tasks, file operations, troubleshooting, running commands, and general computer help. \
IMPORTANT: When you need information from the system or files, you MUST use tools - never make assumptions. \
Available tools: run_shell (for commands like ls, cat, grep, free -h, ps, etc.), \
read_file, write_file, list_directory, delete_path. \
For system information queries (RAM, CPU, disk, processes, etc.), ALWAYS use run_shell with appropriate commands. \
After calling a tool, wait for its output before responding to the user. \
Keep responses concise and actionable.";
