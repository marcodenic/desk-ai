# Desk AI

Desk AI is a lightweight desktop companion that pairs a streaming AI chat experience with a transparent terminal so you always see (and approve) the commands and file operations the agent performs. The app is built with Tauri + React on the frontend and a Python backend that leverages Open Interpreter with the OpenAI Responses API or Anthropic Claude models.

## Highlights

- **Dual provider support** – quickly switch between OpenAI (Responses API) and Anthropic Claude 3.5 models.
- **Workspace sandbox** – every action is restricted to a user-selected directory; attempts to escape are rejected.
- **Real-time approvals** – reads can be auto-approved, while writes, deletes, and shell commands always request confirmation.
- **Live terminal feed** – every approved shell command streams into a terminal drawer with stdout/stderr, status chips, and a Stop button.
- **NDJSON bridge** – the Rust backend brokers an NDJSON protocol to the Python agent, ensuring all tool calls and responses are streamed to the UI.

## Prerequisites

- Node.js ≥ 18 and npm
- Rust toolchain (required by Tauri)
- Python 3.10+ with `pip`

## Getting Started

```bash
# Install JS dependencies
npm install

# Install Python dependencies (inside a virtualenv if desired)
python -m pip install -r python/requirements.txt

# Run the desktop app in development mode
npm run tauri:dev
```

This spins up the Vite dev server and launches the Tauri shell.

## Using the App

1. **Provider setup** – choose OpenAI or Anthropic, paste an API key, and set the default model. Click **Save & Test** to validate credentials.
2. **Workspace selection** – pick a working directory. The Python backend is jailed to this path.
3. **Chat** – converse with the assistant, ask it to inspect or modify files, and request shell commands. Tokens stream in real time.
4. **Approvals** – when a tool action needs confirmation, an approval modal appears with details. Allow or deny each request.
5. **Terminal drawer** – the bottom drawer lists every shell session and concise logs for reads/writes. Kill a running command at any time.

Settings persist across sessions (except API keys) and can be adjusted on the fly.

## Project Structure

```
desk-ai/
├─ index.html              # Vite entry
├─ package.json            # Frontend dependencies & scripts
├─ src/                    # React UI
├─ src-tauri/              # Tauri (Rust) backend
└─ python/backend.py       # Python agent runtime (NDJSON bridge)
```

Key components:

- **Rust backend (`src-tauri/`)** – spawns and supervises the Python process, relays NDJSON events, and exposes Tauri commands (`start_python_backend`, `approve_tool`, `kill_command`, etc.).
- **React frontend (`src/`)** – settings panel, streaming chat interface, approval modal, and terminal drawer wired to Tauri events.
- **Python agent (`python/backend.py`)** – orchestrates Open Interpreter with provider-specific streaming, handles tool execution inside the sandbox, and emits NDJSON messages.

## Building

```bash
# Build the frontend assets and desktop bundles
npm run build
npm run tauri:build
```

The Tauri configuration embeds the Python backend into the bundle (`src-tauri/tauri.conf.json`).

## License

Desk AI is distributed under the MIT License. Open Interpreter (AGPL) is a runtime dependency; review its terms before distributing a closed-source variant.
