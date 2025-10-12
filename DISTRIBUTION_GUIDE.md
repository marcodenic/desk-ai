# Distribution Guide for Desk AI

This guide will help you package and distribute your Desk AI application to end users on Windows, macOS, and Linux.

## Prerequisites

### Development Machine Setup

You'll need different machines/VMs or CI/CD to build for all platforms:
- **Windows builds**: Windows 10/11 machine
- **macOS builds**: macOS machine (for .dmg and .app bundles)
- **Linux builds**: Linux machine (for .deb, .AppImage, etc.)

**Note**: You cannot cross-compile Tauri apps from one OS to another due to native dependencies.

### Required Tools on Each Platform

#### All Platforms
```bash
# Node.js 18+ and npm
node --version  # Should be >= 18
npm --version

# Rust toolchain
rustc --version
cargo --version
```

#### Windows Specific
- Visual Studio Build Tools or Visual Studio with C++ development tools
- WebView2 (usually pre-installed on Windows 10/11)

#### macOS Specific
- Xcode Command Line Tools: `xcode-select --install`

#### Linux Specific
```bash
# Debian/Ubuntu
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev

# Fedora
sudo dnf install webkit2gtk4.0-devel \
    openssl-devel \
    curl \
    wget \
    file \
    libappindicator-gtk3-devel \
    librsvg2-devel

# Arch
sudo pacman -S webkit2gtk \
    base-devel \
    curl \
    wget \
    file \
    openssl \
    appmenu-gtk-module \
    gtk3 \
    libappindicator-gtk3 \
    librsvg
```

## Configuration Checklist

### 1. Update Bundle Identifier ✅ (Already Done)
The bundle identifier has been changed from `com.example.deskai` to `com.marcodenic.deskai`.

### 2. Version Your App
Update version in both files when releasing:
- `package.json` - line 3: `"version": "0.1.0"`
- `src-tauri/tauri.conf.json` - line 11: `"version": "0.1.0"`
- `src-tauri/Cargo.toml` - line 3: `version = "0.1.0"`

Keep these in sync!

### 3. Update Metadata in Cargo.toml
Edit `src-tauri/Cargo.toml`:
```toml
[package]
name = "desk-ai"
version = "0.1.0"
description = "Desktop AI assistant with sandboxed workspace and streaming chat"
authors = ["Marco Denic <your-email@example.com>"]
license = "MIT"
repository = "https://github.com/marcodenic/desk-ai"
homepage = "https://github.com/marcodenic/desk-ai"
edition = "2021"
```

### 4. Configure Build Targets
Your `tauri.conf.json` now includes `"targets": "all"` which will build all available formats for your platform:
- **Windows**: `.exe` installer, `.msi` installer
- **macOS**: `.dmg`, `.app` bundle
- **Linux**: `.deb`, `.AppImage`

To build specific targets only:
```json
"targets": ["msi"]  // Windows MSI only
"targets": ["dmg"]  // macOS DMG only
"targets": ["deb", "appimage"]  // Linux formats
```

### 5. Code Signing (Optional but Recommended)

#### macOS Code Signing
Required for distribution outside the App Store:
```bash
# Set environment variables
export APPLE_CERTIFICATE=<base64-encoded-certificate>
export APPLE_CERTIFICATE_PASSWORD=<certificate-password>
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name"
export APPLE_ID=<your-apple-id>
export APPLE_PASSWORD=<app-specific-password>
export APPLE_TEAM_ID=<your-team-id>
```

Add to `tauri.conf.json`:
```json
"bundle": {
  "macOS": {
    "signingIdentity": "Developer ID Application: Your Name",
    "entitlements": null,
    "exceptionDomain": null,
    "providerShortName": null
  }
}
```

#### Windows Code Signing
Required to avoid SmartScreen warnings:
```bash
# Set environment variables
export TAURI_PRIVATE_KEY=<path-to-pfx-file>
export TAURI_KEY_PASSWORD=<pfx-password>
```

#### Linux
No signing required for most distributions.

### 6. App Icons
Your app already has icons in `src-tauri/icons/`. Make sure you have:
- `icon.png` (1024x1024 or 512x512)
- `icon.icns` (macOS)
- `icon.ico` (Windows)
- Various PNG sizes (32x32, 128x128, 256x256, etc.)

You can regenerate icons using: `npm install -g @tauri-apps/cli` then `tauri icon path/to/icon.png`

## Building for Distribution

### Step 1: Install Dependencies
```bash
npm install
pip install -r python/requirements.txt
```

### Step 2: Build the Application
```bash
# This builds the frontend and creates platform-specific installers
npm run tauri:build
```

Build artifacts will be in:
```
src-tauri/target/release/bundle/
├── dmg/          (macOS)
├── macos/        (macOS .app)
├── msi/          (Windows)
├── nsis/         (Windows .exe installer)
├── deb/          (Linux Debian/Ubuntu)
└── appimage/     (Linux AppImage)
```

### Step 3: Test the Build
Install the generated package on a clean machine to ensure:
- ✅ The app launches successfully
- ✅ Python backend starts correctly
- ✅ All dependencies are bundled
- ✅ Settings persist correctly
- ✅ File operations work in sandbox
- ✅ API keys can be entered and saved

## Distribution Methods

### 1. GitHub Releases (Recommended for Open Source)
```bash
# Create a new release
git tag v0.1.0
git push origin v0.1.0

# Upload build artifacts to GitHub Releases:
# - desk-ai_0.1.0_x64.dmg
# - desk-ai_0.1.0_x64_en-US.msi
# - desk-ai_0.1.0_amd64.deb
# - desk-ai_0.1.0_amd64.AppImage
```

### 2. Direct Download
Host the installers on your website or cloud storage:
- Amazon S3
- DigitalOcean Spaces
- Cloudflare R2
- Your own web server

### 3. Package Managers

#### Windows - Winget
Submit to Windows Package Manager: https://github.com/microsoft/winget-pkgs

#### macOS - Homebrew
Create a Homebrew cask: https://github.com/Homebrew/homebrew-cask

#### Linux - Flatpak/Snap
- Flatpak: https://docs.flatpak.org/
- Snap: https://snapcraft.io/

### 4. Auto-Updates (Advanced)
Tauri supports auto-updates. Add to `tauri.conf.json`:
```json
"updater": {
  "active": true,
  "endpoints": [
    "https://your-domain.com/releases/{{target}}/{{current_version}}"
  ],
  "dialog": true,
  "pubkey": "YOUR_PUBLIC_KEY"
}
```

## CI/CD Setup (Automated Builds)

### GitHub Actions Example
Create `.github/workflows/release.yml`:

```yaml
name: Release
on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  release:
    strategy:
      fail-fast: false
      matrix:
        platform: [macos-latest, ubuntu-22.04, windows-latest]
    runs-on: ${{ matrix.platform }}
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
      
      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
      
      - name: Install dependencies (Ubuntu only)
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.0-dev libappindicator3-dev librsvg2-dev patchelf
      
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install Python dependencies
        run: |
          pip install -r python/requirements.txt
      
      - name: Install Node dependencies
        run: npm install
      
      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'Desk AI ${{ github.ref_name }}'
          releaseBody: 'See the CHANGELOG.md for details.'
          releaseDraft: true
          prerelease: false
```

## Python Backend Considerations

Your app bundles Python scripts in `python/backend.py`. Make sure:

1. **Dependencies are bundled**: The `python/requirements.txt` packages need to be available
2. **Python runtime**: Users need Python installed, OR you can bundle Python with your app

### Option A: Require Python Installation (Current)
- Add to README and installer docs: "Python 3.10+ required"
- Detect Python in your Rust backend and show helpful error if missing

### Option B: Bundle Python (Recommended for End Users)
Use PyInstaller or similar to create a standalone executable:

```bash
# Install PyInstaller
pip install pyinstaller

# Create standalone executable
pyinstaller --onefile --name desk-ai-backend python/backend.py
```

Then update `tauri.conf.json` to bundle the executable instead of the Python script.

## Pre-Release Checklist

- [ ] Update version numbers in all files
- [ ] Update CHANGELOG.md with release notes
- [ ] Test build on all target platforms
- [ ] Test fresh install on clean machines
- [ ] Verify Python backend works correctly
- [ ] Test with both OpenAI and Anthropic APIs
- [ ] Verify workspace sandboxing works
- [ ] Test approval flows for all operations
- [ ] Review and update README.md
- [ ] Update screenshots/demos if UI changed
- [ ] Prepare release notes
- [ ] Set up code signing (if not already done)

## Security & Privacy Notes

1. **API Keys**: Document that keys are stored locally in app data
2. **Workspace**: Emphasize the sandboxing feature
3. **Network**: Document all external connections (OpenAI/Anthropic APIs)
4. **Updates**: Plan for security patches and updates
5. **License**: Review Open Interpreter's AGPL license implications

## Support & Documentation

Create user documentation covering:
1. Installation instructions for each platform
2. First-time setup guide
3. How to get API keys
4. Workspace configuration
5. Troubleshooting common issues
6. FAQ

## Quick Build Commands Reference

```bash
# Development
npm run tauri:dev

# Production build (current platform only)
npm run tauri:build

# Clean build
rm -rf src-tauri/target
npm run tauri:build

# Check for issues before building
npm run check
cargo check --manifest-path=src-tauri/Cargo.toml
```

## Next Steps

1. Choose your distribution method (GitHub Releases recommended to start)
2. Set up CI/CD for automated builds (optional but highly recommended)
3. Decide on Python bundling strategy
4. Get code signing certificates if needed
5. Build and test on all platforms
6. Create release notes and documentation
7. Publish your first release!

## Resources

- [Tauri Documentation](https://tauri.app/v1/guides/)
- [Tauri Build Guide](https://tauri.app/v1/guides/building/)
- [Tauri Distribution Guide](https://tauri.app/v1/guides/distribution/)
- [Code Signing Guide](https://tauri.app/v1/guides/distribution/sign-macos)
- [GitHub Actions for Tauri](https://github.com/tauri-apps/tauri-action)

---

Good luck with your release! 🚀
