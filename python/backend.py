"""NDJSON bridge between the Tauri desktop app and the AI agent runtime.

The backend receives configuration, prompts, approval decisions, and kill
signals over STDIN and emits streaming events over STDOUT. The protocol is
documented in the project README and mirrors the requirements shared with the
desktop application.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import sys
import traceback
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    from openai import OpenAI  # type: ignore
except ImportError as exc:  # pragma: no cover
    raise SystemExit("openai package is required. Install via `pip install openai>=1.40.0`.") from exc

try:
    from anthropic import Anthropic, AsyncAnthropic  # type: ignore
except ImportError as exc:  # pragma: no cover
    raise SystemExit("anthropic package is required. Install via `pip install anthropic>=0.25.0`.") from exc

try:
    from interpreter import OpenInterpreter  # type: ignore
except ImportError as exc:  # pragma: no cover
    raise SystemExit("open-interpreter package is required. Install via `pip install open-interpreter>=0.3`.") from exc


JsonDict = Dict[str, Any]


SYSTEM_PROMPT = (
    "You are Desk AI, a local development assistant with access to tools. "
    "IMPORTANT: When you need information from the system or files, you MUST use tools - never make assumptions. "
    "Available tools: run_shell (for commands like ls, cat, grep, free -h, etc.), "
    "read_file, write_file, list_directory, delete_path. "
    "For system information queries (RAM, CPU, disk, etc.), ALWAYS use run_shell with appropriate commands. "
    "After calling a tool, wait for its output before responding to the user. "
    "Keep responses concise and actionable."
)


def now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def json_dumps(data: JsonDict) -> str:
    return json.dumps(data, separators=(",", ":"), ensure_ascii=False)


@dataclass
class BackendConfig:
    provider: str
    api_key: str
    model: str
    workdir: Path
    auto_approve_reads: bool = True
    confirm_writes: bool = True
    confirm_shell: bool = True
    show_terminal_on_command: bool = True

    @classmethod
    def from_payload(cls, payload: JsonDict) -> "BackendConfig":
        try:
            provider = payload["provider"]
            api_key = payload["apiKey"]
            model = payload["model"]
            workdir = Path(payload["workdir"]).expanduser()
        except KeyError as err:
            raise ValueError(f"Missing configuration field: {err}") from err

        if provider not in {"openai", "anthropic"}:
            raise ValueError("Provider must be 'openai' or 'anthropic'.")

        if not api_key:
            raise ValueError("API key must not be empty.")

        if not workdir.exists() or not workdir.is_dir():
            raise ValueError("Working directory must reference an existing directory.")

        return cls(
            provider=provider,
            api_key=api_key,
            model=model,
            workdir=workdir.resolve(),
            auto_approve_reads=bool(payload.get("autoApproveReads", True)),
            confirm_writes=bool(payload.get("confirmWrites", True)),
            confirm_shell=bool(payload.get("confirmShell", True)),
            show_terminal_on_command=bool(payload.get("showTerminalOnCommand", True)),
        )


class ToolExecutionError(Exception):
    """Raised when a tool execution fails."""


class DeskBackend:
    """Coordinates provider requests, local tool execution, and the NDJSON bridge."""

    def __init__(self) -> None:
        self.loop = asyncio.get_event_loop()
        self.config: Optional[BackendConfig] = None
        self.history: List[JsonDict] = []

        self.openai_client: Optional[OpenAI] = None
        self.anthropic_client: Optional[AsyncAnthropic] = None

        self.pending_approvals: Dict[str, asyncio.Future] = {}
        self.shell_processes: Dict[str, asyncio.subprocess.Process] = {}
        self.interpreter = OpenInterpreter()  # Satisfies requirement; used for code evaluation helpers if needed.

        self.prompt_lock = asyncio.Lock()
        self.active_prompt_id: Optional[str] = None

    async def run(self) -> None:
        await self.emit_status("starting", "Awaiting configuration.")
        while True:
            line = await asyncio.to_thread(sys.stdin.readline)
            if not line:
                await asyncio.sleep(0.05)
                continue
            line = line.strip()
            if not line:
                continue
            print(f"[STDIN] Received: {line[:200]}", file=sys.stderr, flush=True)
            try:
                payload = json.loads(line)
                print(f"[STDIN] Parsed type: {payload.get('type')}", file=sys.stderr, flush=True)
            except json.JSONDecodeError:
                await self.emit_error(f"Invalid JSON from frontend: {line}")
                continue
            await self.handle_message(payload)

    async def handle_message(self, message: JsonDict) -> None:
        message_type = message.get("type")
        if message_type == "config":
            await self.apply_config(message)
        elif message_type == "prompt":
            await self.handle_prompt(message)
        elif message_type == "approval":
            await self.resolve_approval(message)
        elif message_type == "kill":
            await self.handle_kill(message)
        else:
            await self.emit_error(f"Unknown message type: {message_type}")

    async def apply_config(self, payload: JsonDict) -> None:
        try:
            config = BackendConfig.from_payload(payload)
        except ValueError as error:
            await self.emit_status("error", str(error))
            return

        self.config = config
        self.history.clear()

        # Configure provider clients.
        if config.provider == "openai":
            self.openai_client = OpenAI(api_key=config.api_key)
            self.anthropic_client = None
        else:
            self.anthropic_client = AsyncAnthropic(api_key=config.api_key)
            self.openai_client = None

        # Skip validation to save tokens - will fail on first actual request if invalid
        await self.emit_status("ready", f"{config.provider.title()} connection ready.")

    async def test_credentials(self) -> None:
        if not self.config:
            raise RuntimeError("Backend not configured.")

        prompt = [{"role": "user", "content": [{"type": "text", "text": "Say OK"}]}]

        if self.config.provider == "openai":
            if not self.openai_client:
                raise RuntimeError("OpenAI client not initialised.")
            response = self.openai_client.responses.create(
                model=self.config.model,
                input=prompt,
                max_output_tokens=16,
            )
            text = "".join(response.output_text or [])
        else:
            if not self.anthropic_client:
                raise RuntimeError("Anthropic client not initialised.")
            response = self.anthropic_client.messages.create(
                model=self.config.model,
                max_tokens=16,
                system=SYSTEM_PROMPT,
                messages=prompt,
            )
            text = "".join(block.text for block in response.content if getattr(block, "text", ""))

        if "ok" not in text.lower():
            raise RuntimeError("API response did not contain expected acknowledgement.")

    async def handle_prompt(self, payload: JsonDict) -> None:
        if not self.config:
            await self.emit_error("Backend not configured.")
            return

        text = payload.get("text", "")
        prompt_id = payload.get("id") or str(uuid.uuid4())
        self.active_prompt_id = prompt_id

        # Create a task so we don't block stdin reading
        task = asyncio.create_task(self._process_prompt_async(prompt_id, text))
        
        # Don't await the task - let it run in background so stdin can continue to be read
        def handle_task_result(t: asyncio.Task) -> None:
            try:
                t.result()
            except Exception as error:
                asyncio.create_task(self.emit_error(f"Prompt failed: {error}"))
                traceback.print_exc()
            finally:
                self.active_prompt_id = None
        
        task.add_done_callback(handle_task_result)

    async def resolve_approval(self, payload: JsonDict) -> None:
        request_id = payload.get("requestId")
        print(f"[APPROVAL] Received approval for {request_id}: {payload}", file=sys.stderr, flush=True)
        if not request_id:
            await self.emit_error("Approval payload missing requestId.")
            return
        future = self.pending_approvals.pop(request_id, None)
        if not future:
            await self.emit_error(f"No pending approval for {request_id}")
            print(f"[APPROVAL] ERROR: No pending future found. Pending: {list(self.pending_approvals.keys())}", file=sys.stderr, flush=True)
            return
        if future.done():
            print(f"[APPROVAL] WARNING: Future already done", file=sys.stderr, flush=True)
            return
        print(f"[APPROVAL] Setting future result", file=sys.stderr, flush=True)
        future.set_result(
            (
                bool(payload.get("approved")),
                payload.get("overrides") or {},
            )
        )
        print(f"[APPROVAL] Future result set successfully", file=sys.stderr, flush=True)

    async def handle_kill(self, payload: JsonDict) -> None:
        session_id = payload.get("sessionId")
        if not session_id:
            await self.emit_error("Kill payload missing sessionId.")
            return
        process = self.shell_processes.get(session_id)
        if not process:
            await self.emit_error(f"No running shell session {session_id}")
            return
        process.terminate()
        await self.emit_tool_log(f"stop shell session {session_id}")

    async def _process_prompt_async(self, prompt_id: str, text: str) -> None:
        if not self.config:
            raise RuntimeError("Backend not configured.")

        input_messages = self._build_messages(text)
        tools = self._tool_definitions()
        aggregated_text: List[str] = []
        had_followup = False  # Track if we had a follow-up response

        if self.config.provider == "openai":
            if not self.openai_client:
                raise RuntimeError("OpenAI client missing.")
            with self.openai_client.responses.stream(
                model=self.config.model,
                input=input_messages,
                tools=tools,
            ) as stream:
                for event in stream:
                    event_dict = event.model_dump()
                    event_type = event_dict.get("type")

                    if event_type == "response.output_text.delta":
                        delta = event_dict.get("delta") or {}
                        text_delta = delta.get("text") or ""
                        if text_delta:
                            aggregated_text.append(text_delta)
                            asyncio.run_coroutine_threadsafe(
                                self.emit_token(prompt_id, text_delta),
                                self.loop,
                            )

                    elif event_type == "response.output_tool_call":
                        data = event_dict.get("output_tool_call") or event_dict.get("data") or {}
                        call_id = data.get("id") or data.get("tool_call_id")
                        name = data.get("name") or data.get("function", {}).get("name")
                        arguments = data.get("arguments") or data.get("function", {}).get("arguments")
                        if arguments and isinstance(arguments, str):
                            try:
                                arguments = json.loads(arguments)
                            except json.JSONDecodeError:
                                arguments = {}
                        if not call_id or not name:
                            continue
                        tool_output = asyncio.run_coroutine_threadsafe(
                            self.handle_tool_call(name, arguments, prompt_id),
                            self.loop,
                        ).result()
                        stream.submit_tool_outputs(
                            [
                                {
                                    "tool_call_id": call_id,
                                    "output": tool_output,
                                }
                            ]
                        )

                    elif event_type == "response.completed":
                        break

                final = stream.get_final_response()
                if final and final.output_text:
                    aggregated_text = ["".join(final.output_text)]

        else:
            if not self.anthropic_client:
                raise RuntimeError("Anthropic client missing.")
            
            tool_results = []
            
            async with self.anthropic_client.messages.stream(
                model=self.config.model,
                max_tokens=8192,
                system=SYSTEM_PROMPT,
                messages=input_messages,
                tools=tools,
            ) as stream:
                tool_buffers: Dict[str, Dict[str, Any]] = {}
                async for event in stream:
                    event_dict = event.model_dump()
                    event_type = event_dict.get("type")
                    # Debug: log all event types
                    print(f"[STREAM EVENT] {event_type}: {event_dict}", file=sys.stderr, flush=True)

                    if event_type == "content_block_delta":
                        delta = event_dict.get("delta") or {}
                        index = event_dict.get("index", 0)
                        if delta.get("type") == "text_delta":
                            text_delta = delta.get("text") or ""
                            if text_delta:
                                aggregated_text.append(text_delta)
                                await self.emit_token(prompt_id, text_delta)
                        elif delta.get("type") == "input_json_delta":
                            # Track tool input JSON as it streams
                            if index not in tool_buffers:
                                tool_buffers[index] = {"input_json": ""}
                            tool_buffers[index]["input_json"] += delta.get("partial_json", "")

                    elif event_type == "content_block_start":
                        block = event_dict.get("content_block") or {}
                        index = event_dict.get("index", 0)
                        if block.get("type") == "tool_use":
                            tool_buffers[index] = {
                                "id": block.get("id"),
                                "name": block.get("name"),
                                "input_json": "",
                            }

                    elif event_type == "content_block_stop":
                        # Get the complete content_block from the event
                        block = event_dict.get("content_block") or {}
                        index = event_dict.get("index", 0)
                        
                        if block.get("type") == "tool_use":
                            tool_id = block.get("id")
                            name = block.get("name")
                            # Use the complete input from content_block
                            arguments = block.get("input", {})
                            
                            print(f"[TOOL CALL] Executing {name} with args: {arguments}", file=sys.stderr, flush=True)
                            
                            tool_output = await self.handle_tool_call(name, arguments, prompt_id)
                            
                            print(f"[TOOL CALL] Got output: {tool_output[:100]}...", file=sys.stderr, flush=True)
                            
                            # Store tool result to send after stream completes
                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": tool_id,
                                "content": tool_output,
                            })

                    elif event_type == "message_delta":
                        delta = event_dict.get("delta") or {}
                        text_delta = delta.get("text") or ""
                        if text_delta:
                            aggregated_text.append(text_delta)
                            asyncio.run_coroutine_threadsafe(
                                self.emit_token(prompt_id, text_delta),
                                self.loop,
                            )

                    elif event_type == "message_stop":
                        # Check if the message had any tool use blocks
                        if not tool_buffers:
                            # Log that the response completed without tools
                            await self.emit_tool_log("Response completed without using tools")
                        break

                final_message = await stream.get_final_message()
                # Debug: log the final message structure
                if final_message:
                    print(f"[FINAL MESSAGE] stop_reason: {final_message.stop_reason}", file=sys.stderr, flush=True)
                    print(f"[FINAL MESSAGE] content blocks: {len(final_message.content)}", file=sys.stderr, flush=True)
                    for idx, block in enumerate(final_message.content):
                        print(f"[FINAL MESSAGE] block {idx} type: {block.type}", file=sys.stderr, flush=True)
                
                # Don't collect text here if we have tool calls - we'll get the real response in the follow-up
                # if final_message and final_message.content:
                #     aggregated_text = [
                #         "".join(
                #             block.text for block in final_message.content if getattr(block, "text", "")
                #         )
                #     ]
            
            # If we collected tool results, handle them recursively
            if tool_results:
                await self._handle_tool_results_recursively(
                    tool_results=tool_results,
                    input_messages=input_messages,
                    final_message=final_message,
                    tools=tools,
                )
                had_followup = True

        final_text = "".join(aggregated_text).strip()
        asyncio.run_coroutine_threadsafe(self.emit_final(prompt_id, final_text), self.loop)

        # Update conversation history with the user's message
        self.history.append({"role": "user", "content": text})
        
        # Only add the initial assistant response if we didn't have a follow-up
        # If we had a follow-up, it already added the complete response to history
        if final_text and not had_followup:
            self.history.append({"role": "assistant", "content": final_text})

    async def _handle_tool_results_recursively(
        self,
        tool_results: List[JsonDict],
        input_messages: List[JsonDict],
        final_message: Any,
        tools: List[JsonDict],
    ) -> None:
        """Recursively handle tool results until Claude stops calling tools."""
        print(f"[TOOL RESULTS] Sending {len(tool_results)} tool results back to Claude", file=sys.stderr, flush=True)
        
        # Add assistant's message with tool uses to history
        assistant_content = []
        if final_message:
            for block in final_message.content:
                if hasattr(block, 'text') and block.text:
                    assistant_content.append({"type": "text", "text": block.text})
                elif hasattr(block, 'type') and block.type == 'tool_use':
                    assistant_content.append({
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    })
        
        # Build new messages with tool results
        follow_up_messages = input_messages + [
            {"role": "assistant", "content": assistant_content},
            {"role": "user", "content": tool_results},
        ]
        
        # Create a NEW message ID for the follow-up response
        followup_id = str(uuid.uuid4())
        
        print(f"[TOOL RESULTS] Starting follow-up stream with NEW message ID: {followup_id}", file=sys.stderr, flush=True)
        
        # Stream the follow-up response WITH tools so Claude can continue if needed
        async with self.anthropic_client.messages.stream(
            model=self.config.model,
            max_tokens=8192,
            system=SYSTEM_PROMPT,
            messages=follow_up_messages,
            tools=tools,
        ) as follow_stream:
            followup_text = []
            followup_tool_results = []
            
            async for event in follow_stream:
                event_dict = event.model_dump()
                event_type = event_dict.get("type")
                
                if event_type == "content_block_delta":
                    delta = event_dict.get("delta") or {}
                    if delta.get("type") == "text_delta":
                        text_delta = delta.get("text") or ""
                        if text_delta:
                            followup_text.append(text_delta)
                            await self.emit_token(followup_id, text_delta)
                
                elif event_type == "content_block_stop":
                    # Check if this was a tool use block
                    block = event_dict.get("content_block") or {}
                    if block.get("type") == "tool_use":
                        tool_id = block.get("id")
                        name = block.get("name")
                        arguments = block.get("input", {})
                        
                        print(f"[RECURSIVE TOOL] Executing {name}", file=sys.stderr, flush=True)
                        
                        # Execute the tool
                        tool_output = await self.handle_tool_call(name, arguments, followup_id)
                        
                        # Store for potential additional follow-up
                        followup_tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": tool_id,
                            "content": tool_output,
                        })
                
                elif event_type == "message_stop":
                    break
            
            # Get the final message from the follow-up
            followup_final = await follow_stream.get_final_message()
            
            # Emit final for this follow-up message (even if there are more tool calls)
            final_followup_text = "".join(followup_text).strip()
            await self.emit_final(followup_id, final_followup_text)
            
            # If there were MORE tool calls, recurse
            if followup_tool_results:
                print(f"[RECURSIVE] Got {len(followup_tool_results)} more tool calls - recursing", file=sys.stderr, flush=True)
                await self._handle_tool_results_recursively(
                    tool_results=followup_tool_results,
                    input_messages=follow_up_messages,
                    final_message=followup_final,
                    tools=tools,
                )
            else:
                # No more tool calls - add the follow-up response to history
                if final_followup_text:
                    self.history.append({"role": "assistant", "content": final_followup_text})

    def _build_messages(self, user_text: str) -> List[JsonDict]:
        """Build messages array for Anthropic (no system message in array)."""
        messages: List[JsonDict] = []
        messages.extend(
            {
                "role": item["role"],
                "content": [{"type": "text", "text": item["content"]}],
            }
            for item in self.history
        )
        messages.append({"role": "user", "content": [{"type": "text", "text": user_text}]})
        return messages

    def _tool_definitions(self) -> List[JsonDict]:
        """Return tool definitions in Anthropic's format."""
        return [
            {
                "name": "run_shell",
                "description": "Run a shell command in the workspace. Use cautiously.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "command": {"type": "string", "description": "Command to run."},
                        "timeout": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 300,
                            "default": 120,
                        },
                    },
                    "required": ["command"],
                },
            },
            {
                "name": "read_file",
                "description": "Read text content from a file inside the workspace.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "max_bytes": {"type": "integer", "default": 20000},
                    },
                    "required": ["path"],
                },
            },
            {
                "name": "write_file",
                "description": "Write text to a file inside the workspace, replacing existing content.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "content": {"type": "string"},
                    },
                    "required": ["path", "content"],
                },
            },
            {
                "name": "list_directory",
                "description": "List files and directories relative to the workspace.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Relative directory path."},
                        "pattern": {"type": "string", "description": "Optional glob."},
                    },
                },
            },
            {
                "name": "delete_path",
                "description": "Delete a file or directory inside the workspace.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "recursive": {"type": "boolean", "default": False},
                    },
                    "required": ["path"],
                },
            },
        ]

    async def handle_tool_call(self, name: str, arguments: Optional[JsonDict], prompt_id: str) -> str:
        if not self.config:
            raise RuntimeError("Backend not configured.")

        arguments = arguments or {}
        
        # Generate a unique tool call ID
        tool_call_id = str(uuid.uuid4())
        
        # Emit tool call start event
        await self.emit_event({
            "type": "tool_call_start",
            "toolCallId": tool_call_id,
            "name": name,
            "arguments": arguments,
            "promptId": prompt_id,
        })

        approval_required = False
        approval_reason = ""
        if name == "run_shell":
            approval_required = self.config.confirm_shell
            approval_reason = arguments.get("command", "")
        elif name in {"write_file", "delete_path"}:
            approval_required = self.config.confirm_writes
            approval_reason = arguments.get("path", "")
        elif name in {"read_file", "list_directory"}:
            approval_required = not self.config.auto_approve_reads
            approval_reason = arguments.get("path", "")

        if approval_required:
            approved, overrides = await self.request_approval(
                name,
                {
                    "path": arguments.get("path"),
                    "command": arguments.get("command"),
                    "description": approval_reason,
                    "bytes": len(arguments.get("content", "") or ""),
                },
            )
            if not approved:
                result = "User denied the request."
                await self.emit_event({
                    "type": "tool_call_end",
                    "toolCallId": tool_call_id,
                    "result": result,
                    "error": "denied",
                })
                return result
            if overrides:
                arguments.update(overrides)

        try:
            if name == "run_shell":
                output = await self.execute_shell(arguments, prompt_id)
            elif name == "read_file":
                output = await self.read_file(arguments)
            elif name == "write_file":
                output = await self.write_file(arguments)
            elif name == "list_directory":
                output = await self.list_directory(arguments)
            elif name == "delete_path":
                output = await self.delete_path(arguments)
            else:
                output = f"Unknown tool: {name}"
        except ToolExecutionError as error:
            await self.emit_error(str(error))
            result = f"Tool execution failed: {error}"
            await self.emit_event({
                "type": "tool_call_end",
                "toolCallId": tool_call_id,
                "result": result,
                "error": str(error),
            })
            return result

        # Emit tool call end event
        await self.emit_event({
            "type": "tool_call_end",
            "toolCallId": tool_call_id,
            "result": output[:200] + ("..." if len(output) > 200 else ""),  # Truncate for display
        })

        return output

    async def request_approval(self, action: str, details: JsonDict) -> Tuple[bool, JsonDict]:
        request_id = str(uuid.uuid4())
        future: asyncio.Future = self.loop.create_future()
        self.pending_approvals[request_id] = future
        print(f"[APPROVAL] Created approval request {request_id} for {action}", file=sys.stderr, flush=True)
        action_map = {
            "run_shell": "shell",
            "read_file": "read",
            "write_file": "write",
            "list_directory": "list",
            "delete_path": "delete",
        }
        await self.emit_event(
            {
                "type": "tool_request",
                "requestId": request_id,
                "action": action_map.get(action, action),
                **{k: v for k, v in details.items() if v},
            }
        )
        print(f"[APPROVAL] Waiting for approval response...", file=sys.stderr, flush=True)
        result = await future
        print(f"[APPROVAL] Got approval result: {result}", file=sys.stderr, flush=True)
        return result  # type: ignore[return-value]

    async def execute_shell(self, arguments: JsonDict, prompt_id: str) -> str:
        if not self.config:
            raise RuntimeError("Backend not configured.")

        command = arguments.get("command")
        if not command:
            raise ToolExecutionError("Shell command missing.")

        timeout = int(arguments.get("timeout", 120))
        session_id = str(uuid.uuid4())

        await self.emit_event(
            {
                "type": "shell_start",
                "sessionId": session_id,
                "cmd": command,
                "cwd": str(self.config.workdir),
                "ts": now_iso(),
            }
        )

        process = await asyncio.create_subprocess_shell(
            command,
            cwd=str(self.config.workdir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=self._shell_environment(),
        )
        self.shell_processes[session_id] = process

        stdout_buffer: List[str] = []
        stderr_buffer: List[str] = []

        async def stream_reader(stream: asyncio.StreamReader, stream_name: str, buffer: List[str]) -> None:
            while True:
                chunk = await stream.readline()
                if not chunk:
                    break
                text = chunk.decode(errors="replace")
                buffer.append(text)
                await self.emit_event(
                    {
                        "type": "shell_data",
                        "sessionId": session_id,
                        "chunk": text,
                        "stream": stream_name,
                    }
                )

        stdout_task = asyncio.create_task(stream_reader(process.stdout, "stdout", stdout_buffer))  # type: ignore[arg-type]
        stderr_task = asyncio.create_task(stream_reader(process.stderr, "stderr", stderr_buffer))  # type: ignore[arg-type]

        exit_code: int = -1
        try:
            await asyncio.wait_for(asyncio.gather(stdout_task, stderr_task), timeout=timeout)
            exit_code = await process.wait()
        except asyncio.TimeoutError:
            process.terminate()
            exit_code = -1
            await self.emit_error(f"Command timed out after {timeout}s: {command}")
        finally:
            for task in (stdout_task, stderr_task):
                if not task.done():
                    task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
            if session_id in self.shell_processes:
                self.shell_processes.pop(session_id, None)
            if process.returncode is None:
                exit_code = await process.wait()
            else:
                exit_code = process.returncode

        await self.emit_event(
            {
                "type": "shell_end",
                "sessionId": session_id,
                "exitCode": exit_code,
            }
        )

        combined = "".join(stdout_buffer + stderr_buffer)
        truncated = combined[-6000:] if len(combined) > 6000 else combined
        
        return truncated if truncated else "(no output)"

    async def read_file(self, arguments: JsonDict) -> str:
        config = self.config
        if not config:
            raise RuntimeError("Backend not configured.")
        path = self._resolve_path(arguments.get("path"))
        max_bytes = int(arguments.get("max_bytes", 20000))
        if not path.exists():
            raise ToolExecutionError(f"File does not exist: {path}")
        if not path.is_file():
            raise ToolExecutionError(f"Path is not a file: {path}")
        data = path.read_bytes()
        if len(data) > max_bytes:
            data = data[:max_bytes]
        text = data.decode(errors="replace")
        await self.emit_tool_log(f"read {path.relative_to(config.workdir)} ({len(data)} bytes)")
        return text

    async def write_file(self, arguments: JsonDict) -> str:
        config = self.config
        if not config:
            raise RuntimeError("Backend not configured.")
        path = self._resolve_path(arguments.get("path"))
        content = arguments.get("content", "")
        if not isinstance(content, str):
            raise ToolExecutionError("Content must be a string.")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        await self.emit_tool_log(
            f"write {path.relative_to(config.workdir)} ({len(content.encode('utf-8'))} bytes)"
        )
        return f"Wrote {len(content.encode('utf-8'))} bytes to {path.name}."

    async def list_directory(self, arguments: JsonDict) -> str:
        config = self.config
        if not config:
            raise RuntimeError("Backend not configured.")
        rel_path = arguments.get("path") or "."
        directory = self._resolve_path(rel_path)
        if not directory.exists():
            raise ToolExecutionError(f"Directory does not exist: {directory}")
        if not directory.is_dir():
            raise ToolExecutionError(f"Path is not a directory: {directory}")

        entries: List[str] = []
        for item in sorted(directory.iterdir()):
            name = item.name + ("/" if item.is_dir() else "")
            entries.append(name)
        await self.emit_tool_log(f"list {directory.relative_to(config.workdir)} ({len(entries)} entries)")
        return "\n".join(entries[:400])

    async def delete_path(self, arguments: JsonDict) -> str:
        config = self.config
        if not config:
            raise RuntimeError("Backend not configured.")
        target = self._resolve_path(arguments.get("path"))
        recursive = bool(arguments.get("recursive", False))
        if not target.exists():
            raise ToolExecutionError(f"Path does not exist: {target}")
        if target.is_dir():
            if recursive:
                for sub in sorted(target.rglob("*"), reverse=True):
                    if sub.is_file() or sub.is_symlink():
                        sub.unlink()
                    elif sub.is_dir():
                        sub.rmdir()
                target.rmdir()
            else:
                target.rmdir()
        else:
            target.unlink()
        await self.emit_tool_log(f"delete {target.relative_to(config.workdir)}")
        return f"Deleted {target.name}."

    def _resolve_path(self, relative: Optional[str]) -> Path:
        if not self.config:
            raise RuntimeError("Backend not configured.")
        if not relative:
            raise ToolExecutionError("Path argument is required.")
        candidate = (self.config.workdir / relative).resolve()
        if not str(candidate).startswith(str(self.config.workdir)):
            raise ToolExecutionError("Access outside of workspace is denied.")
        return candidate

    async def emit_token(self, prompt_id: str, delta: str) -> None:
        await self.emit_event({"type": "token", "id": prompt_id, "text": delta})

    async def emit_final(self, prompt_id: str, text: str) -> None:
        await self.emit_event({"type": "final", "id": prompt_id, "text": text})

    async def emit_status(self, status: str, message: str) -> None:
        await self.emit_event({"type": "status", "status": status, "message": message})

    async def emit_error(self, message: str) -> None:
        await self.emit_event({"type": "error", "message": message})

    async def emit_tool_log(self, message: str) -> None:
        await self.emit_event({"type": "tool_log", "message": message, "ts": now_iso()})

    async def emit_event(self, payload: JsonDict) -> None:
        try:
            sys.stdout.write(json_dumps(payload) + "\n")
            sys.stdout.flush()
        except BrokenPipeError:  # pragma: no cover - occurs on shutdown.
            pass

    def _shell_environment(self) -> Dict[str, str]:
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        return env


async def main() -> None:
    backend = DeskBackend()
    try:
        await backend.run()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    asyncio.run(main())
