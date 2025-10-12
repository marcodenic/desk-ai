# 🖥️ Desk AI

Your personal AI-powered system administrator and technical assistant. Desk AI brings advanced AI capabilities directly to your desktop—no complicated setup, no browser extensions, just a clean, focused tool for getting things done on your computer.

Whether you need to troubleshoot system issues, search through project files, automate repetitive tasks, or get instant answers about your system configuration, Desk AI provides an intelligent assistant that can actually interact with your files and execute commands—all while keeping you in complete control.

## ✨ Features

- **🤖 Dual AI Provider Support** – Choose between OpenAI or Anthropic Claude for powerful natural language understanding
- **🔒 Sandboxed Workspace** – All operations are restricted to your selected directory—escapes are automatically blocked
- **✅ Granular Approval System** – Review and approve file writes, deletes, and shell commands before execution
- **💬 Streaming Chat Interface** – Real-time responses with inline tool execution visibility
- **🛠️ Comprehensive Tool Suite**:
  - `run_shell` – Execute terminal commands with live streaming output
  - `read_file` – Read and analyze file contents
  - `write_file` – Create or modify files
  - `list_directory` – Browse directory contents
  - `delete_path` – Remove files or directories safely
  - `search_files` – Search across multiple files with regex support
- **⚡ Real-Time Feedback** – See every command, file operation, and tool call as it happens
- **🎨 Clean, Distraction-Free UI** – No IDE bloat, just a focused assistant for getting work done
- **🔍 Intelligent Context** – The AI understands your system, file structure, and can reason about technical problems
- **🚀 Zero Configuration** – Works immediately with just an API key and workspace selection

## 📋 Prerequisites

- **Node.js** ≥ 18 and npm
- **Rust** toolchain (required by Tauri)
- **Python** 3.10+ with pip

## 🚀 Getting Started

### Installation

```bash
# Clone the repository
git clone https://github.com/marcodenic/desk-ai.git
cd desk-ai

# Install JavaScript dependencies
npm install

# Install Python dependencies
pip install -r python/requirements.txt
```

### Development

```bash
# Run in development mode
npm run tauri:dev
```

This starts the Vite dev server and launches the Tauri desktop application.

### Building

```bash
# Build production bundles
npm run build
npm run tauri:build
```

The bundled application includes the Python backend and all necessary dependencies.

## 💡 How to Use

### Initial Setup

1. **🔑 Configure Provider**
   - Choose between OpenAI or Anthropic
   - Enter your API key
   - Select your preferred model (e.g., `gpt-4o-mini` or `claude-3-5-sonnet-latest`)
   - Click **Save & Test** to verify credentials

2. **📁 Select Workspace**
   - Choose a working directory
   - All AI operations will be restricted to this folder and its subfolders
   - Perfect for isolating projects or limiting access to sensitive areas

### Working with Desk AI

- **Ask questions** about your system, files, or configuration
- **Request analysis** of codebases, logs, or documentation
- **Execute commands** through natural language (e.g., "show me disk usage")
- **Search and filter** across multiple files with complex queries
- **Troubleshoot issues** by letting the AI investigate logs and system state
- **Automate tasks** like file organization, batch operations, or report generation

Tool calls appear inline with real-time execution status. When approval is required, you'll see exactly what the AI wants to do before it happens.

### Approval Controls

- **Auto-approve reads**: Enable to skip confirmations for file reads and directory listings
- **Confirm writes**: Control whether file modifications need approval
- **Confirm shell commands**: Require approval before executing terminal commands
- **Auto-approve all**: Disable all approval prompts (use with caution!)

### Example Prompts

**Real-World Problems Desk AI Can Solve:**
```
"My Bluetooth mouse keeps disconnecting, help me figure out why"
"Find the directories using the most hard drive space and tell me what's in them"
"My laptop is running slow, check what's consuming resources"
"I can't connect to the database, help me debug the connection"
"Find all instances where I'm using deprecated functions"
"My Docker container won't start, check the logs and tell me what's wrong"
"Clean up old npm/pip cache files to free up space"
```

**System Administration & Troubleshooting:**
```
"Check my disk space and tell me which directories are taking up the most room"
"What processes are using the most CPU right now?"
"Find all log files modified in the last 24 hours"
"Check if port 8080 is in use and tell me what's using it"
"What's my current memory usage?"
"Find all Python processes running on my system"
"Why is my system running hot? Check CPU usage and running processes"
```

**File Management & Search:**
```
"Search for all TODO comments in my Python files"
"Find all files larger than 100MB in this directory"
"List all markdown files that mention 'API' or 'authentication'"
"Show me all configuration files in this project"
"Find duplicate files by comparing checksums"
"What files have been modified in the last week?"
```

**Project Analysis & Documentation:**
```
"Read all the Python files and explain what this project does"
"Find all the API endpoints defined in this codebase"
"List all the dependencies used in this project"
"Summarize the README and tell me how to get started"
"Find all database queries in this application"
"What environment variables does this project need?"
```

**System Configuration & Setup:**
```
"Check if Docker is installed and what version"
"List all installed Python packages and their versions"
"What version of Node.js do I have?"
"Show me my git configuration"
"What's in my PATH environment variable?"
"Check my SSH config and list available keys"
```

**Automation & Batch Operations:**
```
"Rename all .txt files to .md in this directory"
"Create a backup of all Python files to a backup folder"
"Generate a CSV listing all files with their sizes"
"Find and remove all __pycache__ directories"
"Create a project structure for a new Python application"
"Generate a comprehensive file tree of this directory"
```

**Debugging & Error Analysis:**
```
"Search all log files for error messages from today"
"Find stack traces in the application logs"
"Check if there are any broken symbolic links"
"List all files with permission issues"
"Find TODO, FIXME, and HACK comments across the codebase"
"Check for common security issues in configuration files"
```

## 🏗️ Project Structure

```
desk-ai/
├── src/                      # React frontend
│   ├── components/          # UI components (Chat, Settings, Terminal)
│   ├── App.tsx             # Main application logic
│   └── types.ts            # TypeScript type definitions
├── src-tauri/               # Rust/Tauri backend
│   ├── src/
│   │   ├── main.rs         # Tauri app entry point
│   │   └── backend.rs      # Python process management
│   └── tauri.conf.json     # Tauri configuration
├── python/
│   ├── backend.py          # Python agent with NDJSON protocol
│   └── requirements.txt    # Python dependencies
└── package.json            # Node.js dependencies & scripts
```

## 🔐 Security

Desk AI takes security seriously:

- **Workspace Sandboxing**: All file operations are restricted to the selected directory
- **Approval System**: Sensitive operations require user confirmation
- **Pre-commit Hooks**: Prevents accidental API key commits
- **Credential Protection**: API keys stored locally, never committed to git

See [SECURITY.md](SECURITY.md) for detailed security guidelines.

## 🛠️ Technical Details

### Architecture

- **Frontend**: React 18 + TypeScript + Vite
- **Desktop Shell**: Tauri (Rust-based)
- **AI Backend**: Python with asyncio
- **Communication**: NDJSON protocol over stdin/stdout
- **AI Providers**: OpenAI API & Anthropic Claude API

### How It Works

1. Tauri spawns the Python backend as a child process
2. Frontend sends commands via Tauri's IPC to the Rust backend
3. Rust backend forwards messages to Python via stdin (NDJSON)
4. Python streams responses back via stdout (NDJSON)
5. Rust backend emits events that React components listen to
6. UI updates in real-time as tokens and tool calls stream in

## 📝 License

MIT License - see LICENSE file for details.

**Note**: This project uses `open-interpreter` (AGPL licensed) as a dependency. Review AGPL terms if you plan to distribute a modified closed-source version.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## 🙏 Acknowledgments

Built with:
- [Tauri](https://tauri.app/) - Desktop application framework
- [React](https://react.dev/) - UI framework
- [OpenAI](https://openai.com/) & [Anthropic](https://anthropic.com/) - AI providers
- [Open Interpreter](https://github.com/KillianLucas/open-interpreter) - AI agent runtime
