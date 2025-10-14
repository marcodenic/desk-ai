# Development Notes

## System Tray Implementation

### Linux Requirements
- System tray functionality requires `libayatana-appindicator3-dev` (Ubuntu/Debian) or `libappindicator-gtk3` (Fedora/RHEL)
- Install: `sudo apt-get install libayatana-appindicator3-dev libgtk-3-dev libwebkit2gtk-4.1-dev`
- Menu items: Show/Hide, Mini Mode, Quit
- Global shortcut: Ctrl+Shift+Space

### Known Issues
- First show on Linux may appear in wrong position (fixed with 50ms delay)
- X11 threading must be initialized before Tauri setup
- Icon transparency varies by desktop environment

## Elevated Commands

### Windows
- Commands requiring admin: disk management, service control, firewall, registry
- User must run app as administrator or will be prompted

### Linux
- Use `sudo` prefix for privileged operations
- Approval required for all sudo commands
- Check permissions with `sudo -v` before batch operations

### macOS
- System commands may require Full Disk Access
- Grant in System Preferences > Privacy & Security

## Mini Mode
- Compact 400px width view for quick interactions
- Stacked command layout (no icons)
- Status indicator always visible
- Toggle via menu or maximize/minimize buttons
- State persists across show/hide
