# Linux System Tray Setup Guide

The system tray icon in Desk AI works differently on Linux compared to Windows/macOS due to platform limitations.

## Platform Differences

### Windows & macOS
- **Left-click**: Toggles the popup window (show/hide)
- **Right-click**: Shows menu with "Show/Hide Desk AI" and "Quit"

### Linux
- **Any click**: Shows menu with "Show/Hide Desk AI" and "Quit"
- Left-click events are **not delivered** to the application due to libappindicator limitations
- Users interact with the tray icon exclusively through the menu

## Why Linux is Different

Tauri uses `libappindicator` (or `libayatana-appindicator`) on Linux for system tray support. This library:
- Only supports menu-based interactions
- Does not emit left-click events to applications
- Is the standard way to implement tray icons on modern Linux desktops

## Requirements for Linux

### 1. Install Required Libraries

**Debian/Ubuntu/Mint:**
```bash
sudo apt install libayatana-appindicator3-1
# or
sudo apt install libappindicator3-1
```

**Fedora/RHEL:**
```bash
sudo dnf install libappindicator-gtk3
```

**Arch:**
```bash
sudo pacman -S libappindicator-gtk3
```

### 2. Desktop Environment Support

Different desktop environments handle tray icons differently:

#### GNOME (Ubuntu, RHEL, Fedora default)
GNOME **removed** native system tray support. You **must** install an extension:

**GNOME Shell Extension:**
- Install "AppIndicator and KStatusNotifierItem Support" extension
- Via GNOME Extensions website: https://extensions.gnome.org/extension/615/appindicator-support/
- Or via command line:
  ```bash
  sudo apt install gnome-shell-extension-appindicator
  ```
- After installation, **enable the extension** in GNOME Extensions app or GNOME Tweaks

Without this extension, the tray icon **will not appear** on GNOME.

#### KDE Plasma
- System tray support is built-in
- Icons should appear automatically

#### Cinnamon (Linux Mint default)
- System tray support is built-in
- Icons should appear automatically

#### Xfce
- System tray support is built-in
- Icons should appear automatically

## Verifying Your Setup

1. **Check if libraries are installed:**
   ```bash
   ldconfig -p | grep appindicator
   ```
   You should see `libappindicator` or `libayatana-appindicator` listed.

2. **Check your desktop environment:**
   ```bash
   echo $XDG_CURRENT_DESKTOP
   ```

3. **For GNOME users, verify the extension is enabled:**
   ```bash
   gnome-extensions list --enabled | grep -i appindicator
   ```

## Troubleshooting

### Icon doesn't appear
1. Ensure `libappindicator` is installed (see above)
2. If using GNOME, verify the AppIndicator extension is installed and enabled
3. Restart the application after installing dependencies
4. Try logging out and back in after enabling GNOME extensions

### Icon appears but doesn't respond to clicks
- This is expected on Linux - you **must** use the menu
- Try right-clicking to see the menu
- The menu has "Show/Hide Desk AI" to toggle the window

### Application works but prefers native behavior
Currently, the cross-platform implementation prioritizes:
- Native Windows/macOS experience (left-click toggle)
- Linux compatibility through menu-based approach

## Technical Details

The implementation uses platform-specific compilation:
- On Windows/macOS: `.on_tray_icon_event()` handler processes left-clicks
- On Linux: This handler is compiled but never receives events
- Menu items work on all platforms and provide the fallback for Linux

For more information, see:
- [Tauri tray-icon library](https://github.com/tauri-apps/tray-icon)
- [libappindicator documentation](https://github.com/ubuntu/gnome-shell-extension-appindicator)
