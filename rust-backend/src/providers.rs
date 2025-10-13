use crate::config::get_system_prompt;
use crate::ndjson::BridgeRef;
use crate::tools::ToolExecutor;
use crate::types::{BackendConfig, ToolCallArgs};
use anyhow::{anyhow, Result};
use async_openai::{
    config::OpenAIConfig,
    types::{
        ChatCompletionRequestMessage, ChatCompletionRequestSystemMessage,
        ChatCompletionRequestUserMessage, ChatCompletionTool, ChatCompletionToolType,
        CreateChatCompletionRequest, CreateChatCompletionRequestArgs,
    },
    Client,
};
use futures::StreamExt;
use serde_json::json;

pub struct OpenAIProvider {
    api_key: String,
    model: String,
}

impl OpenAIProvider {
    pub fn new(api_key: &str, model: &str) -> Self {
        Self {
            api_key: api_key.to_string(),
            model: model.to_string(),
        }
    }

    pub async fn handle_prompt(
        &self,
        config: &BackendConfig,
        bridge: &BridgeRef,
        prompt_id: &str,
        text: &str,
    ) -> Result<()> {
        let openai_config = OpenAIConfig::new().with_api_key(&self.api_key);
        let client = Client::with_config(openai_config);

        let tools = self.get_tool_definitions();
        
        // Start with system message
        let mut messages = vec![
            ChatCompletionRequestMessage::System(ChatCompletionRequestSystemMessage {
                content: async_openai::types::ChatCompletionRequestSystemMessageContent::Text(
                    get_system_prompt(),
                ),
                name: None,
            }),
        ];
        
        // Add conversation history (excluding the current user message)
        let history = bridge.get_conversation_history().await;
        let history_len = history.len();
        
        // Keep last N messages to avoid context length issues (e.g., last 20 messages = 10 exchanges)
        let max_history_messages = 20;
        let start_idx = if history_len > max_history_messages + 1 {
            history_len - max_history_messages - 1 // -1 to exclude current user message
        } else {
            0
        };
        
        for msg in &history[start_idx..history_len.saturating_sub(1)] {
            match msg.role.as_str() {
                "user" => {
                    messages.push(ChatCompletionRequestMessage::User(ChatCompletionRequestUserMessage {
                        content: async_openai::types::ChatCompletionRequestUserMessageContent::Text(
                            msg.content.clone(),
                        ),
                        name: None,
                    }));
                }
                "assistant" => {
                    messages.push(ChatCompletionRequestMessage::Assistant(
                        async_openai::types::ChatCompletionRequestAssistantMessage {
                            content: Some(async_openai::types::ChatCompletionRequestAssistantMessageContent::Text(
                                msg.content.clone(),
                            )),
                            name: None,
                            tool_calls: None,
                            ..Default::default()
                        },
                    ));
                }
                _ => {}
            }
        }
        
        // Add the current user message
        messages.push(ChatCompletionRequestMessage::User(ChatCompletionRequestUserMessage {
            content: async_openai::types::ChatCompletionRequestUserMessageContent::Text(
                text.to_string(),
            ),
            name: None,
        }));

        let mut aggregated_text = String::new();
        let max_iterations = 10;

        for iteration in 0..max_iterations {
            eprintln!("[OPENAI] Iteration {}", iteration + 1);

            let request = CreateChatCompletionRequestArgs::default()
                .model(&self.model)
                .messages(messages.clone())
                .tools(tools.clone())
                .stream(true)
                .build()?;

            let mut stream = client.chat().create_stream(request).await?;

            let mut current_text = String::new();
            let mut tool_calls: Vec<(String, String, String)> = Vec::new(); // (id, name, args)
            let mut current_tool_call: Option<(String, String, String)> = None;

            while let Some(result) = stream.next().await {
                match result {
                    Ok(response) => {
                        for choice in response.choices {
                            if let Some(delta) = choice.delta.content {
                                current_text.push_str(&delta);
                                bridge.emit_token(prompt_id, &delta).await;
                            }

                            // Handle tool calls
                            if let Some(tool_call_deltas) = choice.delta.tool_calls {
                                for tc_delta in tool_call_deltas {
                                    if let Some(id) = tc_delta.id {
                                        // Start of a new tool call
                                        if let Some(existing) = current_tool_call.take() {
                                            tool_calls.push(existing);
                                        }
                                        current_tool_call = Some((
                                            id,
                                            tc_delta.function.as_ref().and_then(|f| f.name.clone()).unwrap_or_default(),
                                            String::new(),
                                        ));
                                    }

                                    if let Some(function) = tc_delta.function {
                                        if let Some(args_delta) = function.arguments {
                                            if let Some((_, _, args)) = current_tool_call.as_mut() {
                                                args.push_str(&args_delta);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[OPENAI] Stream error: {}", e);
                        return Err(anyhow!("OpenAI stream error: {}", e));
                    }
                }
            }

            // Add final tool call if any
            if let Some(tc) = current_tool_call.take() {
                tool_calls.push(tc);
            }

            // If no tool calls, we're done
            if tool_calls.is_empty() {
                aggregated_text.push_str(&current_text);
                break;
            }

            eprintln!("[OPENAI] Iteration {} has {} tool calls", iteration + 1, tool_calls.len());

            // Execute tool calls
            let executor = ToolExecutor::new(config.clone(), bridge.clone());

            for (call_id, name, args_str) in tool_calls {
                eprintln!("[OPENAI] Executing tool: {} with args: {}", name, args_str);

                let args: serde_json::Value = serde_json::from_str(&args_str).unwrap_or(json!({}));
                let tool_args = ToolCallArgs::from_value(&args);

                let tool_output = match executor.execute_tool(&name, &tool_args, prompt_id).await {
                    Ok(output) => output,
                    Err(e) => format!("Tool execution failed: {}", e),
                };

                // Add assistant message with tool call
                messages.push(ChatCompletionRequestMessage::Assistant(
                    async_openai::types::ChatCompletionRequestAssistantMessage {
                        content: None,
                        name: None,
                        tool_calls: Some(vec![async_openai::types::ChatCompletionMessageToolCall {
                            id: call_id.clone(),
                            r#type: ChatCompletionToolType::Function,
                            function: async_openai::types::FunctionCall {
                                name: name.clone(),
                                arguments: args_str.clone(),
                            },
                        }]),
                        ..Default::default()
                    },
                ));

                // Add tool response
                messages.push(ChatCompletionRequestMessage::Tool(
                    async_openai::types::ChatCompletionRequestToolMessage {
                        content: async_openai::types::ChatCompletionRequestToolMessageContent::Text(
                            tool_output,
                        ),
                        tool_call_id: call_id,
                    },
                ));
            }
        }

        bridge.emit_final(prompt_id, &aggregated_text).await;
        Ok(())
    }

    fn get_tool_definitions(&self) -> Vec<ChatCompletionTool> {
        vec![
            ChatCompletionTool {
                r#type: ChatCompletionToolType::Function,
                function: async_openai::types::FunctionObject {
                    name: "run_shell".to_string(),
                    description: Some("Run a shell command in the workspace. Use cautiously.".to_string()),
                    parameters: Some(json!({
                        "type": "object",
                        "properties": {
                            "command": {"type": "string", "description": "Command to run."},
                            "timeout": {"type": "integer", "default": 120, "minimum": 1, "maximum": 300}
                        },
                        "required": ["command"]
                    })),
                    strict: None,
                },
            },
            ChatCompletionTool {
                r#type: ChatCompletionToolType::Function,
                function: async_openai::types::FunctionObject {
                    name: "read_file".to_string(),
                    description: Some("Read text content from a file inside the workspace.".to_string()),
                    parameters: Some(json!({
                        "type": "object",
                        "properties": {
                            "path": {"type": "string", "description": "Relative path to the file."},
                            "max_bytes": {"type": "integer", "default": 20000}
                        },
                        "required": ["path"]
                    })),
                    strict: None,
                },
            },
            ChatCompletionTool {
                r#type: ChatCompletionToolType::Function,
                function: async_openai::types::FunctionObject {
                    name: "write_file".to_string(),
                    description: Some("Write text to a file inside the workspace, replacing existing content.".to_string()),
                    parameters: Some(json!({
                        "type": "object",
                        "properties": {
                            "path": {"type": "string", "description": "Relative path to the file."},
                            "content": {"type": "string", "description": "Content to write to the file."}
                        },
                        "required": ["path", "content"]
                    })),
                    strict: None,
                },
            },
            ChatCompletionTool {
                r#type: ChatCompletionToolType::Function,
                function: async_openai::types::FunctionObject {
                    name: "list_directory".to_string(),
                    description: Some("List files and directories relative to the workspace.".to_string()),
                    parameters: Some(json!({
                        "type": "object",
                        "properties": {
                            "path": {"type": "string", "default": ".", "description": "Relative directory path."},
                            "pattern": {"type": "string", "description": "Optional glob pattern."}
                        }
                    })),
                    strict: None,
                },
            },
            ChatCompletionTool {
                r#type: ChatCompletionToolType::Function,
                function: async_openai::types::FunctionObject {
                    name: "delete_path".to_string(),
                    description: Some("Delete a file or directory inside the workspace.".to_string()),
                    parameters: Some(json!({
                        "type": "object",
                        "properties": {
                            "path": {"type": "string", "description": "Relative path to delete."},
                            "recursive": {"type": "boolean", "default": false}
                        },
                        "required": ["path"]
                    })),
                    strict: None,
                },
            },
            ChatCompletionTool {
                r#type: ChatCompletionToolType::Function,
                function: async_openai::types::FunctionObject {
                    name: "search_files".to_string(),
                    description: Some("Search for text content across multiple files in the workspace.".to_string()),
                    parameters: Some(json!({
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "Text pattern to search for."},
                            "path": {"type": "string", "default": ".", "description": "Directory to search in."},
                            "file_pattern": {"type": "string", "description": "Glob pattern to filter files."},
                            "regex": {"type": "boolean", "default": false},
                            "case_sensitive": {"type": "boolean", "default": false},
                            "max_results": {"type": "integer", "default": 100}
                        },
                        "required": ["query"]
                    })),
                    strict: None,
                },
            },
        ]
    }
}

pub struct AnthropicProvider {
    api_key: String,
    model: String,
}

impl AnthropicProvider {
    pub fn new(api_key: &str, model: &str) -> Self {
        Self {
            api_key: api_key.to_string(),
            model: model.to_string(),
        }
    }

    pub async fn handle_prompt(
        &self,
        config: &BackendConfig,
        bridge: &BridgeRef,
        prompt_id: &str,
        text: &str,
    ) -> Result<()> {
        use eventsource_stream::Eventsource;
        use futures::TryStreamExt;

        let tools = self.get_tool_definitions();
        
        // Build messages from conversation history
        let mut messages = Vec::new();
        
        // Get conversation history (excluding the current user message)
        let history = bridge.get_conversation_history().await;
        let history_len = history.len();
        
        // Keep last N messages to avoid context length issues
        let max_history_messages = 20;
        let start_idx = if history_len > max_history_messages + 1 {
            history_len - max_history_messages - 1
        } else {
            0
        };
        
        for msg in &history[start_idx..history_len.saturating_sub(1)] {
            messages.push(json!({
                "role": msg.role,
                "content": msg.content
            }));
        }
        
        // Add current user message
        messages.push(json!({
            "role": "user",
            "content": text
        }));

        let mut aggregated_text = String::new();
        let max_iterations = 10;

        for iteration in 0..max_iterations {
            eprintln!("[ANTHROPIC] Iteration {}", iteration + 1);

            let client = reqwest::Client::new();
            let request_body = json!({
                "model": self.model,
                "max_tokens": 8192,
                "system": get_system_prompt(),
                "messages": messages,
                "tools": tools,
                "stream": true
            });

            let response = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", &self.api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&request_body)
                .send()
                .await?;

            let mut stream = response.bytes_stream().eventsource();

            let mut current_text = String::new();
            let mut tool_uses: Vec<(String, String, serde_json::Value)> = Vec::new();
            let mut current_tool_use: Option<(String, String, String)> = None;

            while let Some(event) = stream.try_next().await? {
                if event.event == "content_block_start" {
                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(&event.data) {
                        if let Some(content_block) = data.get("content_block") {
                            if content_block.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                                current_tool_use = Some((
                                    content_block.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string(),
                                    content_block.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string(),
                                    String::new(),
                                ));
                            }
                        }
                    }
                } else if event.event == "content_block_delta" {
                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(&event.data) {
                        if let Some(delta) = data.get("delta") {
                            if delta.get("type").and_then(|t| t.as_str()) == Some("text_delta") {
                                if let Some(text_delta) = delta.get("text").and_then(|t| t.as_str()) {
                                    current_text.push_str(text_delta);
                                    bridge.emit_token(prompt_id, text_delta).await;
                                }
                            } else if delta.get("type").and_then(|t| t.as_str()) == Some("input_json_delta") {
                                if let Some(json_delta) = delta.get("partial_json").and_then(|j| j.as_str()) {
                                    if let Some((_, _, input_json)) = current_tool_use.as_mut() {
                                        input_json.push_str(json_delta);
                                    }
                                }
                            }
                        }
                    }
                } else if event.event == "content_block_stop" {
                    if let Some((id, name, input_json)) = current_tool_use.take() {
                        let input: serde_json::Value = serde_json::from_str(&input_json).unwrap_or(json!({}));
                        tool_uses.push((id, name, input));
                    }
                } else if event.event == "message_stop" {
                    break;
                }
            }

            // If no tool uses, we're done
            if tool_uses.is_empty() {
                aggregated_text.push_str(&current_text);
                break;
            }

            eprintln!("[ANTHROPIC] Processing {} tool uses", tool_uses.len());

            // Build assistant message with tool uses
            let mut assistant_content = Vec::new();
            if !current_text.is_empty() {
                assistant_content.push(json!({"type": "text", "text": current_text}));
            }
            for (id, name, input) in &tool_uses {
                assistant_content.push(json!({
                    "type": "tool_use",
                    "id": id,
                    "name": name,
                    "input": input
                }));
            }
            messages.push(json!({
                "role": "assistant",
                "content": assistant_content
            }));

            // Execute tools and build tool results
            let executor = ToolExecutor::new(config.clone(), bridge.clone());
            let mut tool_results = Vec::new();

            for (id, name, input) in tool_uses {
                eprintln!("[ANTHROPIC] Executing tool: {}", name);

                let tool_args = ToolCallArgs::from_value(&input);
                let tool_output = match executor.execute_tool(&name, &tool_args, prompt_id).await {
                    Ok(output) => output,
                    Err(e) => format!("Tool execution failed: {}", e),
                };

                tool_results.push(json!({
                    "type": "tool_result",
                    "tool_use_id": id,
                    "content": tool_output
                }));
            }

            // Add tool results as user message
            messages.push(json!({
                "role": "user",
                "content": tool_results
            }));
        }

        bridge.emit_final(prompt_id, &aggregated_text).await;
        Ok(())
    }

    fn get_tool_definitions(&self) -> Vec<serde_json::Value> {
        vec![
            json!({
                "name": "run_shell",
                "description": "Run a shell command in the workspace. Use cautiously.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "command": {"type": "string", "description": "Command to run."},
                        "timeout": {"type": "integer", "default": 120, "minimum": 1, "maximum": 300}
                    },
                    "required": ["command"]
                }
            }),
            json!({
                "name": "read_file",
                "description": "Read text content from a file inside the workspace.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "max_bytes": {"type": "integer", "default": 20000}
                    },
                    "required": ["path"]
                }
            }),
            json!({
                "name": "write_file",
                "description": "Write text to a file inside the workspace, replacing existing content.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "content": {"type": "string"}
                    },
                    "required": ["path", "content"]
                }
            }),
            json!({
                "name": "list_directory",
                "description": "List files and directories relative to the workspace.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Relative directory path."},
                        "pattern": {"type": "string", "description": "Optional glob."}
                    }
                }
            }),
            json!({
                "name": "delete_path",
                "description": "Delete a file or directory inside the workspace.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "recursive": {"type": "boolean", "default": false}
                    },
                    "required": ["path"]
                }
            }),
            json!({
                "name": "search_files",
                "description": "Search for text content across multiple files in the workspace.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Text pattern to search for."},
                        "path": {"type": "string", "default": ".", "description": "Directory to search in."},
                        "file_pattern": {"type": "string", "description": "Glob pattern to filter files."},
                        "regex": {"type": "boolean", "default": false},
                        "case_sensitive": {"type": "boolean", "default": false},
                        "max_results": {"type": "integer", "default": 100}
                    },
                    "required": ["query"]
                }
            }),
        ]
    }
}

pub enum Provider {
    OpenAI,
    Anthropic,
}
