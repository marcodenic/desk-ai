# System Tray Implementation Summary

## Overview

The system tray icon has been implemented with a **cross-platform approach** that respects the capabilities and limitations of each operating system.

## Implementation Details

### Cross-Platform Behavior

#### Windows & macOS
- **Left-click**: Toggles the popup window (400x600, positioned bottom-right near taskbar)
- **Right-click**: Shows context menu with:
  - "Show/Hide Desk AI" - Alternative way to toggle window
  - "Quit" - Properly shuts down backend and exits

#### Linux
- **Any click**: Shows context menu (libappindicator limitation)
- **Menu items**:
  - "Show/Hide Desk AI" - Toggles popup window
  - "Quit" - Properly shuts down backend and exits
- Left-click events are **not delivered** by libappindicator, so all interaction is menu-based

### Code Structure

**File**: `src-tauri/src/main.rs`

```rust
// Platform-specific imports
#[cfg(not(target_os = "linux"))]
use tauri::tray::{TrayIconEvent, MouseButtonState};

// Tray setup with menu
let toggle = MenuItemBuilder::with_id("toggle", "Show/Hide Desk AI").build(app)?;
let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
let menu = MenuBuilder::new(app).items(&[&toggle, &quit]).build()?;

let _tray = TrayIconBuilder::new()
    .icon(app.default_window_icon().unwrap().clone())
    .menu(&menu)
    .tooltip("Desk AI - Click to toggle")
    .show_menu_on_left_click(false)  // Windows/macOS only
    .on_menu_event(|app, event| {
        // Handles "toggle" and "quit" menu items
        // Works on all platforms
    })
    .on_tray_icon_event(move |_tray, _event| {
        #[cfg(not(target_os = "linux"))]
        // Handles left-click on Windows/macOS
        // Compiled out on Linux since events aren't delivered
    })
    .build(app)?;
```

### Window Behavior

**Popup Mode**:
- Size: 400x600 pixels
- Frameless window (no decorations)
- Always on top
- Not resizable
- Positioned bottom-right (10px from edge)
- Emits `window-mode-changed` event with `popup: true`

**Toggle Logic**:
- If visible: hide window
- If hidden: show in popup mode at specified position

### Linux-Specific Considerations

**Why Linux is Different:**
1. Tauri uses `libappindicator` for tray icons on Linux
2. libappindicator only supports menu-based interactions
3. Left-click events are never delivered to the application
4. This is a platform limitation, not a bug

**Requirements for Linux Users:**
- `libappindicator3` or `libayatana-appindicator3` must be installed
- GNOME users must enable "AppIndicator and KStatusNotifierItem Support" extension
- Other DEs (KDE, Cinnamon, Xfce) work out-of-the-box

See [LINUX_TRAY_SETUP.md](LINUX_TRAY_SETUP.md) for detailed setup instructions.

## Testing the Implementation

### On Windows/macOS
1. Start the application
2. Look for tray icon in system tray/menubar
3. **Left-click** icon → popup window should appear bottom-right
4. **Left-click** again → popup should hide
5. **Right-click** → menu appears with "Show/Hide Desk AI" and "Quit"
6. Click "Quit" → backend shuts down, app exits

### On Linux
1. Ensure `libappindicator3` is installed
2. If using GNOME, enable AppIndicator extension
3. Start the application
4. Look for tray icon in system tray
5. **Click** (any button) → menu appears
6. Click "Show/Hide Desk AI" → popup window toggles
7. Click "Quit" → backend shuts down, app exits

## Additional Features

### Global Keyboard Shortcut
- **Windows/Linux**: `Ctrl+Shift+Space`
- **macOS**: `Cmd+Shift+Space`
- Toggles window visibility from anywhere
- Focuses input field when showing window

### Window Close Behavior
- Clicking window's close button **hides** the window (doesn't quit)
- App continues running in system tray
- Use tray menu "Quit" to fully exit

### Backend Integration
- "Quit" action properly calls `backend::shutdown_backend()`
- Ensures backend process terminates before app exit
- Prevents orphaned processes

## Files Modified

1. `src-tauri/src/main.rs` - Main tray implementation
2. `src/App.tsx` - Popup mode state management
3. `src/components/Chat.tsx` - Compact UI for popup mode
4. `LINUX_TRAY_SETUP.md` - **NEW** - Linux setup documentation
5. `README.md` - Added tray icon and keyboard shortcut documentation
6. `TODO.md` - Marked system tray feature as complete

## Future Improvements

### Possible Enhancements:
1. **Position Awareness**: Detect tray icon position and show popup near it
2. **macOS Menubar Item**: Use native macOS menubar for better integration
3. **Linux Native**: Wait for Tauri to adopt `ksni` crate for better Linux support
4. **Tray Animation**: Show notification badge or animation for events
5. **Custom Tray Menu**: Add more menu items (Settings, About, etc.)

### Known Limitations:
1. **Linux tooltip**: May not show on GNOME (extension limitation)
2. **Popup position**: Currently hardcoded to bottom-right
3. **No tray badge**: Can't show unread message count on icon
4. **GNOME requirement**: Requires extension installation

## Resources

- [Tauri Tray Icon Docs](https://v2.tauri.app/learn/system-tray/)
- [tray-icon crate](https://github.com/tauri-apps/tray-icon)
- [libappindicator limitations](https://github.com/tauri-apps/tauri/issues/11293)
- [GNOME AppIndicator Extension](https://github.com/ubuntu/gnome-shell-extension-appindicator)

## Success Criteria

- ✅ Tray icon appears on all platforms
- ✅ Click behavior works according to platform capabilities
- ✅ Popup window appears in correct position
- ✅ Menu items work on all platforms
- ✅ Quit properly shuts down backend
- ✅ Window close hides (doesn't quit)
- ✅ Global shortcut toggles window
- ✅ Documentation for Linux setup provided
- ✅ No compilation warnings
- ✅ Cross-platform compatibility maintained
