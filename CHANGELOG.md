# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2025-10-26

### Fixed
- **Backend Resolution**: Fixed "Unable to locate backend" error in production builds by ensuring architecture-specific backend binary (`desk-ai-backend-aarch64-apple-darwin`) is properly bundled in app Resources
- **macOS Dock Icon**: Fixed square dock icon issue by regenerating proper `.icns` files with correct format for native macOS rounded corners appearance
- **Production Binary Path**: Fixed backend binary resolution logic to correctly locate binaries in bundled app structure

### Improved
- **Icon Generation**: Regenerated all platform icons using Tauri's icon generator for consistent, high-quality appearance across all platforms
- **Release Process**: Enhanced build process to ensure backend binaries are correctly named and bundled for each target architecture

### Technical Changes
- Updated backend binary bundling to include both generic (`desk-ai-backend`) and architecture-specific (`desk-ai-backend-aarch64-apple-darwin`) versions
- Regenerated `.icns` files with proper macOS format specifications
- Added comprehensive multi-resolution icon sets for Windows, macOS, Linux, Android, and iOS platforms

## [0.2.4] - 2025-10-25

### Fixed
- **Backend Location**: Fixed "Unable to locate backend" error when launching application
- **Release Builds**: Fixed CI/CD to create both platform-specific and generic binary names that Tauri expects

### Technical Changes
- Updated GitHub Actions to copy backend binary as both `desk-ai-backend-{target}` and `desk-ai-backend`
- Ensures Tauri can find the external binary in release builds across all platforms

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