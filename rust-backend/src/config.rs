use crate::types::BackendConfig;
use anyhow::{anyhow, Result};

/// Validates backend configuration ensuring all required fields are properly set
pub fn validate_config(config: &BackendConfig) -> Result<()> {
    // Validate API key
    if config.api_key.trim().is_empty() {
        return Err(anyhow!("API key cannot be empty"));
    }

    // Validate working directory exists
    if !config.workdir.exists() {
        return Err(anyhow!("The selected working directory does not exist"));
    }

    // Validate working directory is actually a directory
    if !config.workdir.is_dir() {
        return Err(anyhow!("The working directory path must be a directory"));
    }

    Ok(())
}

pub fn get_system_prompt(config: &BackendConfig) -> String {
    let os_info = if cfg!(target_os = "windows") {
        "Windows (use PowerShell commands like Get-Process, Get-Item, dir, etc.)"
    } else if cfg!(target_os = "macos") {
        "macOS (use Unix commands like ls, ps, grep, etc.)"
    } else if cfg!(target_os = "linux") {
        "Linux (use Unix commands like ls, ps, grep, etc.)"
    } else {
        "Unknown OS"
    };

    let elevated_info = if config.allow_elevated_commands {
        if cfg!(target_os = "windows") {
            " ELEVATED COMMANDS ENABLED: You can run commands that require administrator privileges. \
Use commands that will trigger UAC elevation when needed for system operations."
        } else {
            " ELEVATED COMMANDS ENABLED: You can use 'sudo' prefix for commands that require root/administrator privileges. \
When a task requires elevated access (like reading /root, system logs, installing packages, etc.), \
use 'sudo' in your command (e.g., 'sudo ls /root', 'sudo cat /var/log/syslog'). \
The user will be prompted for authentication via a secure OS dialog."
        }
    } else {
        ""
    };

    format!(
        "You are Desk AI, a helpful desktop assistant for system management and tech support. \
You can help with system tasks, file operations, troubleshooting, running commands, and general computer help. \
IMPORTANT: When you need information from the system or files, you MUST use tools - never make assumptions. \
Available tools: run_shell (for commands), read_file, write_file, list_directory, delete_path, search_files. \
SYSTEM INFORMATION: You are running on {}. Always use commands appropriate for this operating system. \
For system information queries (RAM, CPU, disk, processes, etc.), ALWAYS use run_shell with appropriate commands for {}.{} \
After calling a tool, wait for its output before responding to the user. \
Keep responses concise and actionable.",
        os_info,
        os_info,
        elevated_info
    )
}
