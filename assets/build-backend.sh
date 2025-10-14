#!/bin/bash

# Build script for Desk AI - compiles Rust backend and places it for Tauri bundling

set -e

echo "Building Rust backend..."

# Navigate to rust-backend directory
cd rust-backend

# Build in release mode
cargo build --release

# Create bin directory if it doesn't exist
mkdir -p ../src-tauri/bin

# Copy the binary to the location Tauri expects
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Windows
    cp target/release/desk-ai-backend.exe ../src-tauri/bin/desk-ai-backend.exe
    echo "Copied desk-ai-backend.exe to src-tauri/bin/"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    cp target/release/desk-ai-backend ../src-tauri/bin/desk-ai-backend-x86_64-apple-darwin
    cp target/release/desk-ai-backend ../src-tauri/bin/desk-ai-backend-aarch64-apple-darwin
    echo "Copied desk-ai-backend to src-tauri/bin/ for macOS"
else
    # Linux
    cp target/release/desk-ai-backend ../src-tauri/bin/desk-ai-backend-x86_64-unknown-linux-gnu
    echo "Copied desk-ai-backend to src-tauri/bin/ for Linux"
fi

echo "Rust backend build complete!"
