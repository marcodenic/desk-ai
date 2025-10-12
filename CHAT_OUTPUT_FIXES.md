# Chat Output and Tool Visibility Fixes

## Problem Statement
The chat interface had two major issues:
1. **Message Overwriting**: Initial AI responses (like "let me check") were being completely overwritten by final responses
2. **Invisible Tool Calls**: Tool usage was happening behind the scenes with no visual feedback to users

## Solutions Implemented

### 1. Fixed Message Overwriting (App.tsx)
**Issue**: The `handleFinal` function was replacing all streamed content with `payload.text`, causing the entire message to be overwritten.

**Fix**: Modified `handleFinal` to only mark streaming as false without overwriting content:
```typescript
const handleFinal = useCallback((payload: BackendEvent) => {
  if (payload && typeof payload === "object" && "type" in payload && payload.type === "final") {
    setMessages((current) =>
      current.map((message) =>
        message.id === payload.id
          ? {
              ...message,
              // Don't overwrite content - it's already been streamed via tokens
              // Just mark as no longer streaming
              streaming: false,
            }
          : message
      )
    );
  }
}, []);
```

### 2. Added Tool Call Visibility

#### A. Extended Type System (types.ts)
- Added `"tool"` to `MessageRole` type
- Extended `ChatMessage` interface with tool-specific fields:
  - `toolName?: string` - Name of the tool being called
  - `toolArgs?: Record<string, any>` - Tool arguments
  - `toolStatus?: "pending" | "executing" | "completed" | "failed"` - Status indicator
- Added new event types:
  - `ToolCallStartEvent` - Emitted when a tool starts executing
  - `ToolCallEndEvent` - Emitted when a tool completes

#### B. Backend Event Emission (backend.py)
Modified `handle_tool_call` to emit events at tool lifecycle stages:
- **Start**: Emits `tool_call_start` with tool name, arguments, and unique ID
- **End**: Emits `tool_call_end` with result status (success/failed)

```python
# Emit tool call start event
await self.emit_event({
    "type": "tool_call_start",
    "toolCallId": tool_call_id,
    "name": name,
    "arguments": arguments,
    "promptId": prompt_id,
})

# ... tool execution ...

# Emit tool call end event
await self.emit_event({
    "type": "tool_call_end",
    "toolCallId": tool_call_id,
    "result": output[:200] + ("..." if len(output) > 200 else ""),
})
```

#### C. Frontend Event Handlers (App.tsx)
Added two new handlers:

**handleToolCallStart**: Creates a tool message when a tool begins executing
```typescript
const handleToolCallStart = useCallback((payload: ToolCallStartEvent) => {
  const toolMessage: ChatMessage = {
    id: payload.toolCallId,
    role: "tool",
    content: formatToolCall(payload.name, payload.arguments),
    toolName: payload.name,
    toolArgs: payload.arguments,
    toolStatus: "executing",
    createdAt: new Date().toISOString(),
  };
  setMessages((current) => [...current, toolMessage]);
}, []);
```

**handleToolCallEnd**: Updates the tool message status when complete
```typescript
const handleToolCallEnd = useCallback((payload: ToolCallEndEvent) => {
  setMessages((current) =>
    current.map((message) =>
      message.id === payload.toolCallId
        ? {
            ...message,
            toolStatus: payload.error ? "failed" : "completed",
            content: payload.error 
              ? `${message.content} - ${payload.error}`
              : message.content,
          }
        : message
    )
  );
}, []);
```

**formatToolCall Helper**: Formats tool calls into human-readable descriptions
- `run_shell` → "Running: [command]"
- `read_file` → "Reading file: [path]"
- `write_file` → "Writing file: [path]"
- `list_directory` → "Listing directory: [path]"
- `delete_path` → "Deleting: [path]"

#### D. Tool Message Display (Chat.tsx)
Updated `MessageBubble` to render tool messages as chips:
```typescript
if (isTool) {
  return (
    <div className="message tool">
      <div className="tool-call-chip">
        <span className="tool-icon">
          {message.toolStatus === "executing" ? "⚙️" : 
           message.toolStatus === "completed" ? "✓" : "✗"}
        </span>
        <span className="tool-name">{message.toolName}</span>
        <span className="tool-description">{message.content}</span>
      </div>
    </div>
  );
}
```

#### E. Visual Styling (index.css)
Added styling for tool call chips:
- Centered in chat with rounded pill shape
- Blue accent color with subtle transparency
- Icon shows status (⚙️ executing, ✓ completed, ✗ failed)
- Tool name in accent color
- Description in muted text

## User Experience Flow

**Before:**
1. User asks: "what OS is this?"
2. AI responds: "let me check" (briefly visible)
3. Tool executes invisibly
4. Message overwrites to final response
5. User sees no indication of what happened

**After:**
1. User asks: "what OS is this?"
2. AI responds: "let me check" (streams in)
3. Tool chip appears: "⚙️ run_shell Running: uname -a"
4. Tool chip updates: "✓ run_shell Running: uname -a"
5. AI continues streaming: "This is Ubuntu Linux..."
6. All messages remain visible in order

## Benefits
- ✅ No more message overwriting - all content is preserved
- ✅ Users see exactly what tools are being called
- ✅ Visual feedback shows tool execution progress
- ✅ Better transparency and trust in AI actions
- ✅ Easier to understand multi-step reasoning
