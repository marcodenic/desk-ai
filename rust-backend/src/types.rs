use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum IncomingMessage {
    Config(BackendConfig),
    Prompt {
        id: Option<String>,
        text: String,
    },
    Approval {
        #[serde(rename = "requestId")]
        request_id: String,
        approved: bool,
        overrides: Option<serde_json::Value>,
    },
    Kill {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
}

#[derive(Debug, Clone, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    OpenAI,
    Anthropic,
}

fn default_true() -> bool {
    true
}

fn default_false() -> bool {
    false
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OutgoingEvent {
    Status {
        status: String,
        message: String,
    },
    Token {
        id: String,
        text: String,
    },
    Final {
        id: String,
        text: String,
    },
    Error {
        message: String,
    },
    ToolRequest {
        #[serde(rename = "requestId")]
        request_id: String,
        action: String,
        #[serde(flatten)]
        details: HashMap<String, serde_json::Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        elevated: Option<bool>,
    },
    ToolCallStart {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        name: String,
        arguments: serde_json::Value,
        #[serde(rename = "promptId")]
        prompt_id: String,
    },
    ToolCallEnd {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        result: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    ShellStart {
        #[serde(rename = "sessionId")]
        session_id: String,
        cmd: String,
        cwd: String,
        ts: String,
    },
    ShellData {
        #[serde(rename = "sessionId")]
        session_id: String,
        chunk: String,
        stream: String,
    },
    ShellEnd {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "exitCode")]
        exit_code: i32,
    },
    ToolLog {
        message: String,
        ts: String,
    },
}

#[derive(Debug, Clone)]
pub struct ApprovalResponse {
    pub approved: bool,
    pub overrides: Option<serde_json::Value>,
}

pub type ApprovalSender = tokio::sync::oneshot::Sender<ApprovalResponse>;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ToolCallArgs {
    // Common fields
    pub path: Option<String>,
    pub command: Option<String>,

    // run_shell
    pub timeout: Option<u64>,

    // read_file
    pub max_bytes: Option<usize>,

    // write_file
    pub content: Option<String>,

    // list_directory
    pub pattern: Option<String>,

    // delete_path
    pub recursive: Option<bool>,

    // search_files
    pub query: Option<String>,
    pub file_pattern: Option<String>,
    pub regex: Option<bool>,
    pub case_sensitive: Option<bool>,
    pub max_results: Option<usize>,
}

impl Default for ToolCallArgs {
    fn default() -> Self {
        Self {
            path: None,
            command: None,
            timeout: None,
            max_bytes: None,
            content: None,
            pattern: None,
            recursive: None,
            query: None,
            file_pattern: None,
            regex: None,
            case_sensitive: None,
            max_results: None,
        }
    }
}

impl ToolCallArgs {
    pub fn from_value(value: &serde_json::Value) -> Self {
        serde_json::from_value(value.clone()).unwrap_or_else(|_| ToolCallArgs::default())
    }
}
