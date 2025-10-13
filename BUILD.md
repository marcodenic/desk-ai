# Desk AI - Rust Backend Build Instructions

## Overview

The Desk AI application now uses a Rust backend instead of Python, eliminating runtime bloat and Windows Defender false positives while maintaining all functionality.

## Prerequisites

### Windows

You need ONE of the following:

**Option A: Visual Studio Build Tools (Recommended)**
1. Download Visual Studio Build Tools from Microsoft
2. Install with "Desktop development with C++" workload
3. Use `stable-msvc` Rust toolchain

**Option B: MinGW-W64**
1. Download from [mingw-w64.org](https://www.mingw-w64.org/) or use a package manager:
   ```powershell
   winget install -e --id=MSYS2.MSYS2
   ```
2. Add MinGW bin directory to PATH (e.g., `C:\msys64\mingw64\bin`)
3. Use `stable-gnu` Rust toolchain

### macOS

No additional prerequisites needed beyond Xcode Command Line Tools:
```bash
xcode-select --install
```

### Linux

Install build essentials:
```bash
# Debian/Ubuntu
sudo apt install build-essential

# Fedora
sudo dnf groupinstall "Development Tools"
```

## Building

### 1. Build the Rust Backend

```bash
# Navigate to rust-backend directory
cd rust-backend

# Build in release mode
cargo build --release
```

### 2. Copy Binary to Tauri

The binary needs to be in `src-tauri/bin/` with a platform-specific name.

**Windows:**
```powershell
# Create directory if needed
New-Item -ItemType Directory -Force -Path ..\src-tauri\bin

# Copy with platform-specific name
Copy-Item target\release\desk-ai-backend.exe ..\src-tauri\bin\desk-ai-backend-x86_64-pc-windows-msvc.exe
```

**macOS:**
```bash
mkdir -p ../src-tauri/bin
cp target/release/desk-ai-backend ../src-tauri/bin/desk-ai-backend-$(rustc -vV | grep host | cut -d' ' -f2)
```

**Linux:**
```bash
mkdir -p ../src-tauri/bin
cp target/release/desk-ai-backend ../src-tauri/bin/desk-ai-backend-$(rustc -vV | grep host | cut -d' ' -f2)
```

### 3. Build the Tauri Application

```bash
cd ..
npm install
npm run tauri:build
```

## Quick Build Script

Alternatively, use the provided build scripts:

**Windows:**
```powershell
.\build-backend.bat
npm run tauri:build
```

**macOS/Linux:**
```bash
chmod +x build-backend.sh
./build-backend.sh
npm run tauri:build
```

## Development Mode

During development, you can test the backend without building Tauri:

```bash
# Terminal 1: Start the Tauri dev server
npm run tauri:dev

# The app will automatically use the Python backend as fallback
# if the Rust binary isn't found
```

To test with the Rust backend in dev mode:
```bash
# Build Rust backend first
cd rust-backend && cargo build --release && cd ..

# Copy to dev location
# (Follow platform-specific copy commands above)

# Run Tauri dev
npm run tauri:dev
```

## Troubleshooting

### Windows: "dlltool not found"

If using GNU toolchain, ensure MinGW-W64 is installed and in PATH:
```powershell
$env:PATH = "C:\msys64\mingw64\bin;$env:PATH"
rustup default stable-gnu
```

Or switch to MSVC toolchain (requires Visual Studio Build Tools):
```powershell
rustup default stable-msvc
```

### Windows: "link.exe not found"

This means Visual Studio Build Tools aren't installed. Either:
1. Install VS Build Tools with C++ support, OR
2. Switch to GNU toolchain (see above)

### macOS: "ld: library not found"

Install Xcode Command Line Tools:
```bash
xcode-select --install
```

### Linux: "cannot find -lpthread"

Install build essentials:
```bash
sudo apt install build-essential pkg-config
```

## Architecture

The Rust backend communicates with the Tauri frontend via NDJSON over stdin/stdout:

```
Tauri Frontend (TypeScript/React)
      ↕ NDJSON Protocol
Rust Backend (desk-ai-backend)
      ↕ HTTP APIs
OpenAI / Anthropic
```

### Features Implemented

✅ **NDJSON Protocol**: Bi-directional communication with Tauri
✅ **OpenAI Integration**: Streaming Chat Completions with tool calling
✅ **Anthropic Integration**: Streaming Messages API with tool use
✅ **Tool System**: All 6 tools with approval workflow
  - `run_shell`: Execute terminal commands
  - `read_file`: Read file contents
  - `write_file`: Write/create files
  - `list_directory`: List directory contents
  - `delete_path`: Delete files/directories
  - `search_files`: Search across multiple files
✅ **Security**: Workdir sandboxing and path validation
✅ **Approval Workflow**: User confirmation for sensitive operations

## Verification

After building, verify the binary is in the correct location:

```bash
# Check if binary exists
ls -la src-tauri/bin/

# You should see something like:
# desk-ai-backend-x86_64-pc-windows-msvc.exe  (Windows MSVC)
# desk-ai-backend-x86_64-pc-windows-gnu.exe   (Windows GNU)
# desk-ai-backend-x86_64-apple-darwin         (macOS Intel)
# desk-ai-backend-aarch64-apple-darwin        (macOS ARM)
# desk-ai-backend-x86_64-unknown-linux-gnu    (Linux)
```

## Testing

Run the application and verify:

1. **Backend Detection**: Check console logs for "Found standalone backend sidecar"
2. **Configuration**: Test connecting with OpenAI or Anthropic API key
3. **Streaming**: Verify responses stream token-by-token
4. **Tools**: Test each tool:
   - Run a shell command (e.g., `echo "test"` or `dir`/`ls`)
   - Read a file
   - Write to a new file
   - List a directory
   - Delete a test file
   - Search for text across files
5. **Approvals**: Verify approval prompts appear for sensitive operations

## Fallback Behavior

The application maintains Python backend support as a fallback:

1. Tauri checks for Rust binary first
2. If not found, falls back to Python backend
3. This allows gradual migration and testing

To force Python backend (for testing):
```bash
# Temporarily rename Rust binary
mv src-tauri/bin/desk-ai-backend-* src-tauri/bin/desk-ai-backend-.bak
```

## Distribution

When building for distribution:

```bash
npm run tauri:build
```

The installer will automatically include:
- Rust backend binary (platform-specific)
- Python backend (fallback)
- Frontend assets
- Application resources

The final application is self-contained with no external dependencies.
