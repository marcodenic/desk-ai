#!/usr/bin/env python3
"""
Build standalone executables of the Python backend.

Tries Nuitka first (native compilation, no AV false positives).
Falls back to PyInstaller if Nuitka is unavailable or fails.
"""
import sys
import subprocess
import os
import platform
from pathlib import Path

def try_nuitka_build(backend_path: Path) -> bool:
    """Try building with Nuitka. Returns True if successful."""
    try:
        import nuitka
    except ImportError:
        print("Installing Nuitka...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "nuitka", "ordered-set"], 
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except:
            return False
    
    print("Building with Nuitka (native C compilation - no AV false positives)...")
    
    cmd = [
        sys.executable, "-m", "nuitka",
        "--onefile",
        "--output-dir=dist",
        "--output-filename=desk-ai-backend",
        "--remove-output",
        "--assume-yes-for-downloads",
    ]
    
    if platform.system() == "Windows":
        cmd.append("--windows-console-mode=attach")
    
    cmd.extend([
        "--product-name=Desk AI",
        "--product-version=0.1.0",
        "--file-version=0.1.0.0",
        "--copyright=Copyright (c) 2025 Marco De Nichilo",
        "--file-description=Desk AI Backend",
        "--company-name=Marco Denic",
    ])
    
    cmd.append(str(backend_path))
    
    try:
        subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        print("✓ Nuitka build successful!")
        return True
    except subprocess.CalledProcessError:
        print("✗ Nuitka build failed (may need regular Python, not Windows Store Python)")
        return False

def pyinstaller_build(backend_path: Path):
    """Fallback: Build with PyInstaller."""
    try:
        import PyInstaller
    except ImportError:
        print("Installing PyInstaller...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])
    
    print("Building with PyInstaller (fallback)...")
    print("⚠️  Note: PyInstaller may trigger Windows Defender false positives")
    
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--clean",
        "--name", "desk-ai-backend",
        "--noupx",
        "--hidden-import", "openai",
        "--hidden-import", "anthropic",
        "--hidden-import", "interpreter",
        "--collect-all", "openai",
        "--collect-all", "anthropic",
        "--collect-all", "interpreter",
        str(backend_path)
    ]
    
    subprocess.check_call(cmd)
    print("✓ PyInstaller build complete!")

def build():
    backend_path = Path(__file__).parent / "backend.py"
    
    # Try Nuitka first (preferred - no AV issues)
    if try_nuitka_build(backend_path):
        return
    
    # Fall back to PyInstaller
    print("\nFalling back to PyInstaller...")
    pyinstaller_build(backend_path)
    
    executable_name = "desk-ai-backend.exe" if platform.system() == "Windows" else "desk-ai-backend"
    print(f"\nExecutable: {Path('dist') / executable_name}")

if __name__ == "__main__":
    build()
