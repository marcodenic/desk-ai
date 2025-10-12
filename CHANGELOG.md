# Changelog

All notable changes to Desk AI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release preparation
- Distribution configuration for Windows, macOS, and Linux
- GitHub Actions workflow for automated builds

## [0.1.0] - TBD

### Added
- Dual provider support (OpenAI Responses API and Anthropic Claude)
- Workspace sandbox with path restriction
- Real-time approval system for file operations and shell commands
- Live terminal feed with stdout/stderr streaming
- NDJSON bridge between Rust backend and Python agent
- Settings panel with API key management
- Chat interface with streaming responses
- Terminal drawer for command history and logs
- Auto-approval option for read operations
- Stop button for running commands

### Security
- Workspace sandboxing prevents operations outside selected directory
- API keys stored locally (not included in bundles)
- All write/delete/execute operations require explicit approval

---

## Release Notes Template

Copy this template when creating a new release:

```markdown
## Changes in this Release

### 🎉 New Features
- Feature description

### 🐛 Bug Fixes
- Bug fix description

### 🔧 Improvements
- Improvement description

### 📚 Documentation
- Documentation update

### ⚠️ Breaking Changes
- Breaking change description

## Installation

### Windows
1. Download `desk-ai_x.x.x_x64_en-US.msi`
2. Run the installer
3. Launch Desk AI from the Start Menu

### macOS
1. Download `desk-ai_x.x.x_x64.dmg`
2. Open the DMG file
3. Drag Desk AI to Applications folder
4. First launch: Right-click → Open (to bypass Gatekeeper)

### Linux
**Debian/Ubuntu (.deb)**
```bash
sudo dpkg -i desk-ai_x.x.x_amd64.deb
```

**AppImage**
```bash
chmod +x desk-ai_x.x.x_amd64.AppImage
./desk-ai_x.x.x_amd64.AppImage
```

## Requirements
- Python 3.10 or higher
- OpenAI API key OR Anthropic API key

## Known Issues
- List any known issues

## Contributors
- @contributor-name - Feature/fix description
```
