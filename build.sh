#!/bin/bash

# Build script for Desk AI
# This script helps you build the application for distribution

set -e

echo "🚀 Building Desk AI for distribution..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18 or higher."
    exit 1
fi

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust is not installed. Please install Rust toolchain."
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.10 or higher."
    exit 1
fi

echo "✅ All required tools are installed"
echo ""

# Install Node dependencies
echo "📦 Installing Node dependencies..."
npm install

# Install Python dependencies
echo "🐍 Installing Python dependencies..."
pip install -r python/requirements.txt

# Type check
echo "🔍 Running type check..."
npm run check

# Build the application
echo "🔨 Building Tauri application..."
npm run tauri:build

echo ""
echo "✅ Build complete!"
echo ""
echo "📦 Build artifacts are located in:"
echo "   src-tauri/target/release/bundle/"
echo ""
echo "Platform-specific installers:"

if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "   - macOS: src-tauri/target/release/bundle/dmg/"
    echo "   - macOS: src-tauri/target/release/bundle/macos/"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "   - Linux: src-tauri/target/release/bundle/deb/"
    echo "   - Linux: src-tauri/target/release/bundle/appimage/"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    echo "   - Windows: src-tauri/target/release/bundle/msi/"
    echo "   - Windows: src-tauri/target/release/bundle/nsis/"
fi

echo ""
echo "🎉 Ready for distribution!"
