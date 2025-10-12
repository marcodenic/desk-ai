#!/usr/bin/env python3
"""
Build standalone executables of the Python backend using PyInstaller.
This creates a single executable that includes Python and all dependencies.
"""
import sys
import subprocess
import os
from pathlib import Path

def build():
    # Install PyInstaller if not present
    try:
        import PyInstaller
    except ImportError:
        print("Installing PyInstaller...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])
    
    # Build the executable
    backend_path = Path(__file__).parent / "backend.py"
    
    # PyInstaller command
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",  # Single executable
        "--clean",  # Clean cache
        "--name", "desk-ai-backend",  # Output name
        "--hidden-import", "openai",
        "--hidden-import", "anthropic",
        "--hidden-import", "interpreter",
        "--collect-all", "openai",
        "--collect-all", "anthropic",
        "--collect-all", "interpreter",
        str(backend_path)
    ]
    
    print(f"Building standalone executable...")
    print(f"Command: {' '.join(cmd)}")
    subprocess.check_call(cmd)
    
    print("\nBuild complete!")
    print(f"Executable: {Path('dist') / 'desk-ai-backend'}")

if __name__ == "__main__":
    build()
