@echo off
REM Build script for Desk AI on Windows - compiles Rust backend

echo Building Rust backend...

cd rust-backend

REM Build in release mode
cargo build --release

REM Create bin directory if it doesn't exist
if not exist "..\src-tauri\bin" mkdir "..\src-tauri\bin"

REM Copy the binary to the location Tauri expects
copy /Y "target\release\desk-ai-backend.exe" "..\src-tauri\bin\desk-ai-backend-x86_64-pc-windows-msvc.exe"

echo Rust backend build complete!

cd ..
