# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.3] - 2025-10-25

### Fixed
- **macOS Compatibility**: Fixed DMG installation issues on macOS 26 and newer versions
- **macOS Icon**: Fixed application icon not displaying properly on macOS (was showing generic "DA" instead of custom icon)
- **macOS Bundle**: Added proper macOS deployment target and hardened runtime configuration

### Technical Changes
- Created proper ICNS file from PNG source with all required resolutions
- Added macOS-specific configuration in Tauri bundle settings
- Set minimum macOS system version to 10.15 for better compatibility

## [0.2.2] - 2025-10-XX

### Features
- Multi-platform releases (Windows, macOS, Linux)
- Rust backend with no Python dependencies
- Desktop AI assistant functionality

### Platform Support
- ✅ Windows x86_64 (MSVC)
- ✅ macOS Apple Silicon (also works on Intel via Rosetta)
- ✅ Linux x86_64