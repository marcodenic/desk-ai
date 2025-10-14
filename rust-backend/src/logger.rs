use anyhow::Result;
use chrono::Utc;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Logger that writes important events to a persistent log file
pub struct Logger {
    file: Arc<Mutex<std::fs::File>>,
}

impl Logger {
    /// Create a new logger with the specified log file path
    pub fn new(path: PathBuf) -> Result<Self> {
        // Create parent directory if it doesn't exist
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)?;

        Ok(Self {
            file: Arc::new(Mutex::new(file)),
        })
    }

    /// Get the default log file path based on the platform
    pub fn default_path() -> Result<PathBuf> {
        let log_dir = if cfg!(target_os = "windows") {
            // Windows: %APPDATA%\DeskAI\logs
            dirs::data_local_dir()
                .ok_or_else(|| anyhow::anyhow!("Could not find local data directory"))?
                .join("DeskAI")
                .join("logs")
        } else if cfg!(target_os = "macos") {
            // macOS: ~/Library/Application Support/DeskAI/logs
            dirs::data_dir()
                .ok_or_else(|| anyhow::anyhow!("Could not find data directory"))?
                .join("DeskAI")
                .join("logs")
        } else {
            // Linux: ~/.local/share/desk-ai/logs
            dirs::data_local_dir()
                .ok_or_else(|| anyhow::anyhow!("Could not find local data directory"))?
                .join("desk-ai")
                .join("logs")
        };

        Ok(log_dir.join("desk-ai.log"))
    }

    /// Log a general info message
    pub fn info(&self, message: &str) {
        let _ = self.write_log("INFO", message);
    }

    /// Log an error message
    pub fn error(&self, message: &str) {
        let _ = self.write_log("ERROR", message);
    }

    /// Log an elevated/privileged command execution
    pub fn elevated_command(&self, command: &str, approved: bool) {
        let status = if approved { "APPROVED" } else { "DENIED" };
        let message = format!("ELEVATED COMMAND {}: {}", status, command);
        let _ = self.write_log("SECURITY", &message);
    }

    /// Log a tool execution
    pub fn tool_call(&self, tool_name: &str, details: &str) {
        let message = format!("{}: {}", tool_name, details);
        let _ = self.write_log("TOOL", &message);
    }

    /// Write a formatted log entry
    fn write_log(&self, level: &str, message: &str) -> Result<()> {
        let timestamp = Utc::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let log_line = format!("[{}] [{}] {}\n", timestamp, level, message);
        
        // Write to stderr for development/debugging
        eprint!("{}", log_line);
        
        // Write to file
        if let Ok(mut file) = self.file.lock() {
            file.write_all(log_line.as_bytes())?;
            file.flush()?;
        }
        
        Ok(())
    }
}

/// Global logger instance
static LOGGER: once_cell::sync::OnceCell<Logger> = once_cell::sync::OnceCell::new();

/// Initialize the global logger
pub fn init_logger() -> Result<PathBuf> {
    let log_path = Logger::default_path()?;
    let logger = Logger::new(log_path.clone())?;
    
    LOGGER.set(logger).map_err(|_| {
        anyhow::anyhow!("Logger already initialized")
    })?;
    
    Ok(log_path)
}

/// Get a reference to the global logger
pub fn get_logger() -> Option<&'static Logger> {
    LOGGER.get()
}

/// Log an info message using the global logger
pub fn info(message: &str) {
    if let Some(logger) = get_logger() {
        logger.info(message);
    }
}

/// Log an error message using the global logger
pub fn error(message: &str) {
    if let Some(logger) = get_logger() {
        logger.error(message);
    }
}

/// Log an elevated command using the global logger
pub fn elevated_command(command: &str, approved: bool) {
    if let Some(logger) = get_logger() {
        logger.elevated_command(command, approved);
    }
}

/// Log a tool call using the global logger
pub fn tool_call(tool_name: &str, details: &str) {
    if let Some(logger) = get_logger() {
        logger.tool_call(tool_name, details);
    }
}
