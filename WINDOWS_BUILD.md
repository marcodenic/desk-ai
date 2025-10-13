# Quick Windows Build Guide

This guide will help you set up your Windows machine to build the Rust backend.

## Option 1: Visual Studio Build Tools (Recommended)

### Install Visual Studio Build Tools

1. Download from: https://visualstudio.microsoft.com/downloads/
2. Scroll down to "All Downloads" → "Tools for Visual Studio"
3. Download "Build Tools for Visual Studio 2022"
4. Run the installer
5. Select "Desktop development with C++"
6. Click Install (this will take 5-10 minutes)

### Configure Rust

```powershell
# Set Rust to use MSVC toolchain
rustup default stable-msvc

# Verify
rustc --version
cargo --version
```

### Build the Backend

```powershell
# Navigate to rust-backend
cd rust-backend

# Build in release mode
cargo build --release

# Copy to Tauri
New-Item -ItemType Directory -Force -Path ..\src-tauri\bin
Copy-Item target\release\desk-ai-backend.exe ..\src-tauri\bin\desk-ai-backend-x86_64-pc-windows-msvc.exe

# Verify
ls ..\src-tauri\bin
```

## Option 2: MinGW-W64 (Alternative)

### Install MSYS2 and MinGW-W64

```powershell
# Install MSYS2 using winget
winget install -e --id=MSYS2.MSYS2

# Or download manually from: https://www.msys2.org/
```

### Add MinGW to PATH

```powershell
# Add to your PATH (replace with your actual MSYS2 installation path)
$env:PATH = "C:\msys64\mingw64\bin;$env:PATH"

# Make it permanent
[Environment]::SetEnvironmentVariable("Path", "C:\msys64\mingw64\bin;" + [Environment]::GetEnvironmentVariable("Path", "User"), "User")
```

### Install MinGW Toolchain

Open MSYS2 terminal and run:

```bash
pacman -Syu
pacman -S mingw-w64-x86_64-toolchain
```

### Configure Rust

```powershell
# Set Rust to use GNU toolchain
rustup default stable-gnu

# Verify
rustc --version
cargo --version
```

### Build the Backend

```powershell
# Navigate to rust-backend
cd rust-backend

# Build in release mode
cargo build --release

# Copy to Tauri
New-Item -ItemType Directory -Force -Path ..\src-tauri\bin
Copy-Item target\release\desk-ai-backend.exe ..\src-tauri\bin\desk-ai-backend-x86_64-pc-windows-gnu.exe

# Verify
ls ..\src-tauri\bin
```

## Build the Complete Application

Once the Rust backend is built and copied:

```powershell
# Navigate back to project root
cd ..

# Install Node dependencies (if not already done)
npm install

# Build the Tauri application
npm run tauri:build
```

Your installer will be in: `src-tauri\target\release\bundle\msi\`

## Troubleshooting

### "rustc not found"

Install Rust from https://rustup.rs/ and restart your terminal.

### "cargo build" fails with "link.exe not found"

You're using MSVC toolchain but don't have VS Build Tools. Either:
1. Install VS Build Tools (Option 1 above), OR
2. Switch to GNU toolchain (Option 2 above)

### "dlltool.exe not found"

You're using GNU toolchain but MinGW isn't in PATH. Either:
1. Add MinGW to PATH (see Option 2), OR
2. Switch to MSVC toolchain (Option 1)

### "cannot find -lwindows"

Clean and rebuild:
```powershell
cd rust-backend
cargo clean
cargo build --release
```

### Verify Your Setup

```powershell
# Check Rust installation
rustc --version
cargo --version

# Check active toolchain
rustup show

# Check if linker is available
# For MSVC:
where.exe link

# For GNU:
where.exe gcc
where.exe dlltool
```

## Quick Build Script

Save this as `quick-build.ps1`:

```powershell
# Quick build script for Desk AI on Windows

Write-Host "Building Rust backend..." -ForegroundColor Green

# Build backend
Set-Location rust-backend
cargo build --release

if ($LASTEXITCODE -ne 0) {
    Write-Host "Backend build failed!" -ForegroundColor Red
    exit 1
}

# Determine toolchain
$toolchain = rustup show active-toolchain
if ($toolchain -match "msvc") {
    $target = "x86_64-pc-windows-msvc"
} else {
    $target = "x86_64-pc-windows-gnu"
}

# Copy binary
New-Item -ItemType Directory -Force -Path ..\src-tauri\bin | Out-Null
Copy-Item "target\release\desk-ai-backend.exe" "..\src-tauri\bin\desk-ai-backend-$target.exe" -Force

Write-Host "Backend built successfully!" -ForegroundColor Green
Write-Host "Binary: src-tauri\bin\desk-ai-backend-$target.exe" -ForegroundColor Cyan

# Back to root
Set-Location ..

# Build Tauri app
Write-Host "`nBuilding Tauri application..." -ForegroundColor Green
npm run tauri:build

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nBuild complete!" -ForegroundColor Green
    Write-Host "Installer: src-tauri\target\release\bundle\msi\" -ForegroundColor Cyan
} else {
    Write-Host "`nTauri build failed!" -ForegroundColor Red
    exit 1
}
```

Run it with:
```powershell
.\quick-build.ps1
```

## Next Steps

After successfully building:

1. Run the application: `.\src-tauri\target\release\desk-ai.exe`
2. Test with your API key
3. Verify all tools work correctly
4. Package for distribution if needed

For more detailed information, see [BUILD.md](BUILD.md).
