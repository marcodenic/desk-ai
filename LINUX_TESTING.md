# Linux/macOS Testing Guide

This document provides instructions for testing the Rust backend on Linux or macOS, where the GNU toolchain works seamlessly without the Windows-specific build issues.

## Prerequisites

On Linux/macOS, you only need:
- Rust toolchain (install from https://rustup.rs)
- Node.js and npm
- Basic build tools (usually pre-installed or easily available)

```bash
# Install Rust if not already installed
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Verify installation
rustc --version
cargo --version
```

## Build Steps

1. **Build the Rust Backend**
   ```bash
   cd rust-backend
   cargo build --release
   ```

2. **Copy the Binary to Tauri**
   ```bash
   # The script will auto-detect your platform
   ./build-backend.sh
   ```
   
   Or manually:
   ```bash
   # Get your platform triple
   PLATFORM=$(rustc -vV | grep host | cut -d' ' -f2)
   
   # Copy the binary
   mkdir -p ../src-tauri/bin
   cp target/release/desk-ai-backend ../src-tauri/bin/desk-ai-backend-${PLATFORM}
   ```

3. **Run the Application**
   ```bash
   cd ..
   npm install  # if you haven't already
   npm run tauri:dev
   ```

## What to Test

### 1. Basic Functionality
- [ ] App launches without errors
- [ ] Console shows "Found standalone backend sidecar" (not Python fallback)
- [ ] Can enter prompts and receive responses
- [ ] Streaming works (tokens appear incrementally)

### 2. OpenAI Provider
- [ ] Set OpenAI API key and model
- [ ] Send a simple prompt
- [ ] Verify response is correct
- [ ] Check tool calls work (try asking it to list files)

### 3. Anthropic Provider  
- [ ] Switch to Anthropic provider
- [ ] Set Anthropic API key and model
- [ ] Send a prompt
- [ ] Verify response and tool calls

### 4. Tool System (All 6 Tools)

**read_file**:
- [ ] Ask: "What's in the README.md file?"
- [ ] Verify file contents are returned

**write_file**:
- [ ] Ask: "Create a file test.txt with 'Hello World'"
- [ ] Approval modal should appear
- [ ] Approve and verify file is created

**list_directory**:
- [ ] Ask: "List all files in the current directory"
- [ ] Verify directory listing is accurate

**run_shell**:
- [ ] Ask: "Run 'ls -la' command"
- [ ] Approval modal should appear
- [ ] Approve and verify output is streamed
- [ ] Try a command that produces lots of output (verify streaming)

**delete_path**:
- [ ] Ask: "Delete the test.txt file"
- [ ] Approval modal should appear
- [ ] Approve and verify file is deleted

**search_files**:
- [ ] Ask: "Search for files containing 'Tauri'"
- [ ] Verify search results are correct

### 5. Approval Workflow
- [ ] Verify approval modal appears for shell commands
- [ ] Verify approval modal appears for file writes
- [ ] Verify approval modal appears for file deletes
- [ ] Try denying an approval - should handle gracefully
- [ ] Verify read operations don't require approval (by default)

### 6. Security & Sandboxing
- [ ] Try accessing a file outside workdir (should be blocked)
- [ ] Try writing outside workdir (should be blocked)
- [ ] Verify all paths are properly validated

### 7. Error Handling
- [ ] Try using tool with invalid arguments
- [ ] Try reading non-existent file
- [ ] Try with invalid API key
- [ ] Verify errors are shown in UI properly

### 8. Multi-Turn Conversations
- [ ] Have a conversation requiring multiple tool calls
- [ ] Verify context is maintained across turns
- [ ] Verify tool results are incorporated into responses

## Performance Comparison

Once everything works, compare against Python backend (if you still have it):

```bash
# Time to first response
# Memory usage (check task manager/Activity Monitor)
# Binary size
# Startup time
```

Expected improvements:
- **Startup**: ~50-100ms (vs ~500-1000ms for Python)
- **Memory**: ~10-20 MB (vs ~50-100 MB for Python)
- **Binary size**: ~15-20 MB (vs ~30-50 MB for Python bundled)

## Troubleshooting

### "Backend process exited"
- Check console for error messages
- Run `./rust-backend/target/release/desk-ai-backend` directly to see errors
- Verify permissions on the binary

### "No backend found"
- Verify binary is in `src-tauri/bin/` with correct platform name
- Check `src-tauri/src/backend.rs` resolve_backend_script() logic
- Run `ls -la src-tauri/bin/` to verify

### Tool calls not working
- Check NDJSON protocol messages in console
- Verify workdir is set correctly in config
- Check file permissions

## Success Criteria

The refactor is successful when:
1. ✅ All 6 tools work correctly
2. ✅ Both OpenAI and Anthropic providers work
3. ✅ Approval workflow functions properly
4. ✅ Streaming works smoothly
5. ✅ Security sandboxing is enforced
6. ✅ No crashes or errors in normal usage
7. ✅ Performance is better than Python backend

## Next Steps After Testing

1. **If everything works**: Push to GitHub, set up CI/CD for Windows builds
2. **If issues found**: Document them, fix in Rust backend, rebuild and re-test
3. **Once stable**: Remove Python backend entirely
4. **Update README**: Document the Rust backend as the primary implementation

## Questions/Issues

If you encounter problems:
1. Check the console for detailed error messages
2. Look at NDJSON messages being sent/received
3. Review `IMPLEMENTATION_SUMMARY.md` for architecture details
4. Check `BUILD.md` for any platform-specific notes

---

**Good luck with testing!** The hard work is done - this should just be validation that everything works as expected. 🚀
