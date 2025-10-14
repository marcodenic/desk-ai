# Elevated Commands Feature

## Overview
This document describes the implementation of elevated/privileged command execution in Desk AI, allowing the AI to run commands that require administrator/root privileges with proper user authorization.

## Platform-Specific Implementations

### Linux
- **Primary Method**: `pkexec` (PolicyKit)
  - Shows a graphical password dialog
  - User-friendly and secure
  - No password handling in the app
- **Fallback**: `sudo`
  - Used if pkexec is not available
  - Requires passwordless sudo configuration or fails gracefully

### macOS
- **Method**: `osascript`
  - Uses native macOS authentication dialog
  - Triggers "do shell script with administrator privileges"
  - Secure and familiar to macOS users

### Windows
- **Method**: PowerShell with `Start-Process -Verb RunAs`
  - Triggers UAC (User Account Control) elevation dialog
  - Native Windows authentication flow
  - No password input needed in most cases

## Features Implemented

### 1. Automatic Detection
Commands that require elevation are automatically detected:
- Linux/macOS: Commands starting with `sudo`, `pkexec`, or `doas`
- Windows: Commands containing `reg add`, `sc.exe`, `net user`, etc.

### 2. Settings Control
- **New Setting**: "Allow elevated commands (sudo/admin)"
- Default: Disabled (for security)
- Located in: Settings → Permissions section
- Warning icon to indicate security implications

### 3. Enhanced Approval Modal
When an elevated command is requested:
- ⚠️ Special warning banner appears
- Clear indication of elevated privileges requirement
- Note that OS authentication dialog will appear
- User must explicitly approve

### 4. Persistent Logging
All important events are logged to a persistent file:

**Log Location:**
- Linux: `~/.local/share/desk-ai/logs/desk-ai.log`
- macOS: `~/Library/Application Support/DeskAI/logs/desk-ai.log`
- Windows: `%LOCALAPPDATA%\DeskAI\logs\desk-ai.log`

**Logged Events:**
- All elevated command attempts (with approval status)
- Tool executions
- Errors and warnings
- Backend startup/shutdown

**Access:** Settings → Permissions → "Open Log File" button

## Security Considerations

### ✅ Good Security Practices
1. **No Password Storage**: Passwords are never stored or handled by the app
2. **Native OS Dialogs**: All authentication uses platform-native dialogs
3. **Explicit Approval**: Each elevated command requires user approval
4. **Disabled by Default**: Elevated commands must be explicitly enabled
5. **Audit Trail**: All elevated commands are logged with timestamps
6. **Visual Warnings**: Clear UI indicators for elevated operations

### ⚠️ User Responsibilities
1. Review each elevated command before approving
2. Only enable elevated commands if needed
3. Periodically review the log file
4. Understand the implications of running commands as admin/root

## Usage Example

### User: "Update my system packages"

**Without elevated commands enabled:**
```
AI attempts: sudo apt update
Result: Error - "Elevated commands are disabled in settings"
```

**With elevated commands enabled:**
1. AI requests to run: `sudo apt update`
2. Approval modal appears with ⚠️ warning
3. User clicks "Allow"
4. pkexec password dialog appears (Linux)
5. User enters password
6. Command executes with elevated privileges
7. Event logged to file

## Technical Details

### Backend Components
- `rust-backend/src/logger.rs` - Persistent logging module
- `rust-backend/src/tools.rs` - Elevation detection and execution
- `rust-backend/src/types.rs` - Type definitions for elevated flags

### Frontend Components
- `src/types.ts` - TypeScript type definitions
- `src/components/ApprovalModal.tsx` - Enhanced approval UI
- `src/components/SettingsPanel.tsx` - Settings controls
- `src/index.css` - Elevated warning styles

### Tauri Integration
- `src-tauri/src/backend.rs` - Config passing
- `src-tauri/src/main.rs` - Log path command

## Testing

### Linux
```bash
# Test with pkexec
sudo apt update

# Test reading system files
sudo cat /etc/shadow
```

### macOS
```bash
# Test system modification
sudo chmod 755 /some/protected/file

# Test system info
sudo ls /var/root
```

### Windows (PowerShell)
```powershell
# Test registry access
reg query HKLM\SOFTWARE\Microsoft

# Test service management
sc query
```

## Future Enhancements

Potential improvements for future versions:
1. Command whitelist/blacklist for auto-approval
2. Time-limited elevated sessions
3. Role-based access control
4. Integration with system audit logs
5. Command history with replay protection
6. Session recording for elevated operations

## Troubleshooting

### Linux: "Failed to spawn pkexec"
- Install PolicyKit: `sudo apt install policykit-1`
- Or configure passwordless sudo: `sudo visudo`

### macOS: "User cancelled authentication"
- Normal - user declined in auth dialog
- No action needed

### Windows: "Access Denied"
- Ensure UAC is enabled
- Run Desk AI with user privileges (not as admin)
- UAC should prompt for elevation when needed

## Documentation Updates

Remember to update the TODO.md file to mark this feature as complete:
```markdown
- ✅ I would like to have some way for users to allow the AI to handle commands 
  that require auth like sudo commands (implemented with platform-specific 
  elevation and logging)
```
