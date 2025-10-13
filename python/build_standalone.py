#!/usr/bin/env python3
"""
Build standalone executables of the Python backend using Nuitka.
Nuitka compiles Python to native C code, resulting in proper executables
that don't trigger antivirus false positives like PyInstaller does.
"""
import sys
import subprocess
import os
import platform
from pathlib import Path

def build():
    # Install Nuitka if not present
    try:
        import nuitka
    except ImportError:
        print("Installing Nuitka...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "nuitka", "ordered-set"])
    
    # On Windows, we need a C compiler (MSVC or MinGW)
    if platform.system() == "Windows":
        print("\nNote: Nuitka requires a C compiler on Windows.")
        print("If build fails, install: https://visualstudio.microsoft.com/downloads/ (Build Tools)")
    
    # Build the executable
    backend_path = Path(__file__).parent / "backend.py"
    
    # Nuitka command - compiles to native C code
    cmd = [
        sys.executable, "-m", "nuitka",
        "--onefile",  # Single executable
        "--output-dir=dist",
        "--output-filename=desk-ai-backend",
        "--remove-output",  # Clean build directory
        "--assume-yes-for-downloads",
    ]
    
    # Windows-specific: Don't show console window
    if platform.system() == "Windows":
        cmd.append("--windows-console-mode=attach")
    
    # Add product metadata for Windows
    cmd.extend([
        "--product-name=Desk AI",
        "--product-version=0.1.0",
        "--file-version=0.1.0.0",
        "--copyright=Copyright (c) 2025 Marco Denic",
        "--file-description=Desk AI Backend - AI assistant backend service",
        "--company-name=Marco Denic",
    ])
    
    cmd.append(str(backend_path))
    
    print(f"Building with Nuitka (compiling to native C)...")
    print(f"Platform: {platform.system()}")
    print(f"Command: {' '.join(cmd)}")
    print("\nThis may take several minutes on first build...")
    
    try:
        subprocess.check_call(cmd)
        print("\n✓ Build complete!")
        executable_name = "desk-ai-backend.exe" if platform.system() == "Windows" else "desk-ai-backend"
        print(f"Executable: {Path('dist') / executable_name}")
    except subprocess.CalledProcessError as e:
        print(f"\n✗ Build failed: {e}")
        print("\nIf you see a compiler error on Windows, install:")
        print("https://visualstudio.microsoft.com/downloads/ (Build Tools for Visual Studio)")
        sys.exit(1)

if __name__ == "__main__":
    build()
