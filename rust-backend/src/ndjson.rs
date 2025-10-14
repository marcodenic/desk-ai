use crate::config::validate_config;
use crate::providers::{AnthropicProvider, OpenAIProvider};
use crate::types::{
    ApprovalResponse, ApprovalSender, BackendConfig, IncomingMessage, OutgoingEvent,
};
use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::io::{BufRead, Write};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub struct ConversationMessage {
    pub role: String,
    pub content: String,
}

pub struct NdjsonBridge {
    config: Arc<RwLock<Option<BackendConfig>>>,
    pending_approvals: Arc<RwLock<HashMap<String, ApprovalSender>>>,
    active_prompt_id: Arc<RwLock<Option<String>>>,
    conversation_history: Arc<RwLock<Vec<ConversationMessage>>>,
}

const MAX_HISTORY_MESSAGES: usize = 5;

impl NdjsonBridge {
    pub fn new() -> Self {
        Self {
            config: Arc::new(RwLock::new(None)),
            pending_approvals: Arc::new(RwLock::new(HashMap::new())),
            active_prompt_id: Arc::new(RwLock::new(None)),
            conversation_history: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub async fn run(&mut self) -> Result<()> {
        self.emit_status("starting", "Awaiting configuration.")
            .await;

        let stdin = std::io::stdin();
        let mut reader = stdin.lock();
        let mut line = String::new();

        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => {
                    // EOF
                    break;
                }
                Ok(_) => {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    eprintln!("[STDIN] Received: {}", &trimmed[..trimmed.len().min(200)]);

                    match serde_json::from_str::<IncomingMessage>(trimmed) {
                        Ok(message) => {
                            if let Err(e) = self.handle_message(message).await {
                                self.emit_error(&format!("Error handling message: {}", e))
                                    .await;
                            }
                        }
                        Err(e) => {
                            self.emit_error(&format!("Invalid JSON: {}", e)).await;
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[STDIN] Read error: {}", e);
                    break;
                }
            }
        }

        Ok(())
    }

    async fn handle_message(&mut self, message: IncomingMessage) -> Result<()> {
        match message {
            IncomingMessage::Config(config) => {
                self.apply_config(config).await?;
            }
            IncomingMessage::Prompt { id, text } => {
                self.handle_prompt(id, text).await?;
            }
            IncomingMessage::Approval {
                request_id,
                approved,
                overrides,
            } => {
                self.resolve_approval(request_id, approved, overrides)
                    .await?;
            }
            IncomingMessage::Kill { session_id } => {
                eprintln!("[KILL] Session kill requested: {}", session_id);
                // Shell sessions are handled within the tool executor
                // For now, we'll just log this
            }
        }
        Ok(())
    }

    async fn apply_config(&mut self, config: BackendConfig) -> Result<()> {
        if let Err(e) = validate_config(&config) {
            self.emit_status("error", &e.to_string()).await;
            return Ok(());
        }

        *self.config.write().await = Some(config.clone());

        self.emit_status("ready", &format!("{:?} connection ready.", config.provider))
            .await;

        Ok(())
    }

    async fn handle_prompt(&mut self, id: Option<String>, text: String) -> Result<()> {
        let prompt_id = id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        *self.active_prompt_id.write().await = Some(prompt_id.clone());

        // Add user message to conversation history
        Self::push_and_trim_history(
            &self.conversation_history,
            ConversationMessage {
                role: "user".to_string(),
                content: text.clone(),
            },
        )
        .await;

        let config_guard = self.config.read().await;
        let config = config_guard
            .as_ref()
            .ok_or_else(|| anyhow!("Backend not configured"))?
            .clone();
        drop(config_guard);

        let bridge_ref = BridgeRef {
            pending_approvals: self.pending_approvals.clone(),
            conversation_history: self.conversation_history.clone(),
        };

        // Spawn task to handle prompt async
        let prompt_id_clone = prompt_id.clone();
        tokio::spawn(async move {
            if let Err(e) = Self::process_prompt(bridge_ref, config, prompt_id_clone, text).await {
                eprintln!("[PROMPT] Error processing prompt: {}", e);
            }
        });

        Ok(())
    }

    async fn push_and_trim_history(
        history: &Arc<RwLock<Vec<ConversationMessage>>>,
        message: ConversationMessage,
    ) {
        let mut history_guard = history.write().await;
        history_guard.push(message);
        if history_guard.len() > MAX_HISTORY_MESSAGES {
            let excess = history_guard.len() - MAX_HISTORY_MESSAGES;
            history_guard.drain(0..excess);
        }
    }

    async fn process_prompt(
        bridge: BridgeRef,
        config: BackendConfig,
        prompt_id: String,
        text: String,
    ) -> Result<()> {
        match config.provider {
            crate::types::Provider::OpenAI => {
                let provider = OpenAIProvider::new(&config.api_key, &config.model);
                provider
                    .handle_prompt(&config, &bridge, &prompt_id, &text)
                    .await?;
            }
            crate::types::Provider::Anthropic => {
                let provider = AnthropicProvider::new(&config.api_key, &config.model);
                provider
                    .handle_prompt(&config, &bridge, &prompt_id, &text)
                    .await?;
            }
        }
        Ok(())
    }

    async fn resolve_approval(
        &mut self,
        request_id: String,
        approved: bool,
        overrides: Option<serde_json::Value>,
    ) -> Result<()> {
        eprintln!("[APPROVAL] Resolving approval {}: {}", request_id, approved);

        let sender = self.pending_approvals.write().await.remove(&request_id);

        if let Some(sender) = sender {
            let response = ApprovalResponse {
                approved,
                overrides,
            };
            let _ = sender.send(response);
            eprintln!("[APPROVAL] Sent approval response");
        } else {
            eprintln!("[APPROVAL] No pending approval found for {}", request_id);
        }

        Ok(())
    }

    async fn emit_status(&self, status: &str, message: &str) {
        let event = OutgoingEvent::Status {
            status: status.to_string(),
            message: message.to_string(),
        };
        self.emit_event(event).await;
    }

    async fn emit_error(&self, message: &str) {
        let event = OutgoingEvent::Error {
            message: message.to_string(),
        };
        self.emit_event(event).await;
    }

    async fn emit_event(&self, event: OutgoingEvent) {
        if let Ok(json) = serde_json::to_string(&event) {
            let mut stdout = std::io::stdout();
            let _ = writeln!(stdout, "{}", json);
            let _ = stdout.flush();
        }
    }
}

// A clonable reference to bridge internals for use in spawned tasks
#[derive(Clone)]
pub struct BridgeRef {
    pub pending_approvals: Arc<RwLock<HashMap<String, ApprovalSender>>>,
    pub conversation_history: Arc<RwLock<Vec<ConversationMessage>>>,
}

impl BridgeRef {
    pub async fn emit_event(&self, event: OutgoingEvent) {
        if let Ok(json) = serde_json::to_string(&event) {
            let mut stdout = std::io::stdout();
            let _ = writeln!(stdout, "{}", json);
            let _ = stdout.flush();
        }
    }

    pub async fn emit_token(&self, prompt_id: &str, text: &str) {
        self.emit_event(OutgoingEvent::Token {
            id: prompt_id.to_string(),
            text: text.to_string(),
        })
        .await;
    }

    pub async fn emit_final(&self, prompt_id: &str, text: &str) {
        // Store assistant response in history
        NdjsonBridge::push_and_trim_history(
            &self.conversation_history,
            ConversationMessage {
                role: "assistant".to_string(),
                content: text.to_string(),
            },
        )
        .await;

        self.emit_event(OutgoingEvent::Final {
            id: prompt_id.to_string(),
            text: text.to_string(),
        })
        .await;
    }

    pub async fn get_conversation_history(&self) -> Vec<ConversationMessage> {
        self.conversation_history.read().await.clone()
    }

    pub async fn emit_error(&self, message: &str) {
        self.emit_event(OutgoingEvent::Error {
            message: message.to_string(),
        })
        .await;
    }
}
