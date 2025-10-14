# Code Quality Issues

This document tracks code quality issues identified for future refactoring. These items should be addressed before production release.

---

## 1. Excessive Debug Logging

**Priority:** High  
**Location:** `src-tauri/src/backend.rs`, `src-tauri/src/main.rs`, frontend components
**Status:** ✅ **RESOLVED**

**Issue:**
- 38+ `eprintln!` debug statements scattered throughout Tauri backend
- Multiple `console.log` statements in frontend (Chat.tsx, App.tsx, SettingsPanel.tsx)
- Debug logs are hardcoded in production code instead of using proper logging levels/framework

**Solution Implemented:**
- Created logging macros in src-tauri:
  - `log_debug!()` - Only outputs in debug builds (controlled by `#[cfg(debug_assertions)]`)
  - `log_info!()` - Always outputs important events (e.g., backend start, config updates)
  - `log_error!()` - Always outputs errors
- All logs go to stderr, which is captured by the rust-backend logger and written to log file
- Removed excessive frontend console.log statements, kept only error logging
- Users can access logs via "Open Log File" button in settings

**Benefits:**
- Production builds are less verbose but still log important events
- Debug builds show detailed tracing for development
- All logs are captured in the log file for user feedback/debugging
- Consistent logging approach across the codebase

---

## 2. Hardcoded Magic Numbers

**Priority:** Medium  
**Location:** Multiple files

**Issue:**
Magic numbers scattered throughout codebase without constants or configuration:

| Value | Location | Purpose |
|-------|----------|---------|
| 200 | `rust-backend/src/tools.rs:78` | Character truncation limit for tool output |
| 5000 | `src/App.tsx:502` | Settings save timeout (ms) |
| 300 | `src/App.tsx:547` | Config processing delay (ms) |
| 120 | `rust-backend/src/tools.rs:241` | Default shell command timeout (seconds) |

**Solution:**
- Extract all magic numbers to named constants at module level
- Consider moving to configuration file for runtime adjustability
- Add documentation explaining the reasoning behind each value

**Example:**
```rust
/// Maximum characters to display in tool output before truncation
const TOOL_OUTPUT_PREVIEW_LENGTH: usize = 200;

/// Default timeout for shell commands in seconds
const DEFAULT_SHELL_TIMEOUT_SECS: u64 = 120;
```

---

## 3. Hardcoded URLs

**Priority:** Medium  
**Location:** `src/components/SettingsPanel.tsx:46`

**Issue:**
- Models API URL (`https://models.dev/api.json`) is hardcoded directly in component
- No fallback mechanism if URL changes or service is unavailable
- Makes testing difficult (can't mock easily)

**Solution:**
- Move to environment variables or configuration file
- Create API client abstraction layer
- Add fallback/cache mechanism for offline operation
- Consider bundling a static model list as fallback

**Example:**
```typescript
const MODELS_API_URL = import.meta.env.VITE_MODELS_API_URL || 'https://models.dev/api.json';
```

---

## 4. Dangerous Error Handling

**Priority:** High  
**Location:** `src-tauri/src/backend.rs`, `src-tauri/src/main.rs`

**Issue:**
- `.unwrap()` used in debug logging (`src-tauri/src/backend.rs:105`)
  - Could panic if serialization fails
- `.expect()` on main app run (`src-tauri/src/main.rs:193`)
  - Will crash entire app instead of graceful error handling

**Solution:**
- Replace all `.unwrap()` with proper error handling
- Use `unwrap_or_default()` or `unwrap_or_else()` where appropriate
- For debug logging, use `map()` or `if let` patterns
- Implement graceful shutdown and error reporting for main()

**Example:**
```rust
// Instead of:
eprintln!("Config: {:?}", serde_json::to_string(config).unwrap());

// Use:
eprintln!("Config: {:?}", serde_json::to_string(config).unwrap_or_else(|e| format!("Failed to serialize: {}", e)));
```

---

## 5. Incomplete TODO Comments

**Priority:** Low  
**Location:** `rust-backend/src/tools.rs:60`

**Issue:**
```rust
// TODO: Apply overrides to args
```
- Feature for applying approval overrides is partially implemented but incomplete
- User can provide overrides in approval modal, but they're never actually applied
- Creates false expectation for users

**Solution:**
- Either implement the override functionality completely
- Or remove the override option from the UI if not needed
- Document why overrides are/aren't supported

---

## 6. Missing Type Safety

**Priority:** Medium  
**Location:** Multiple TypeScript files

**Issue:**
- `Record<string, any>` used in multiple places (App.tsx, types.ts)
- `any` types used where proper types should be defined
- Loses TypeScript's type checking benefits

**Locations:**
- `src/App.tsx:41` - `formatToolCall(name: string, args: Record<string, any>)`
- `src/types.ts` - Various interfaces using `any`

**Solution:**
- Define proper interfaces for all data structures
- Use discriminated unions for tool arguments
- Enable stricter TypeScript settings (`noImplicitAny`, `strictNullChecks`)

**Example:**
```typescript
interface ShellToolArgs {
  command: string;
  timeout?: number;
}

interface FileReadArgs {
  path: string;
}

type ToolArgs = ShellToolArgs | FileReadArgs | ...;
```

---

## 7. No Environment Configuration

**Priority:** Medium  
**Location:** Project root

**Issue:**
- No `.env` file or environment configuration system
- API URLs, timeouts, limits hardcoded throughout
- Difficult to change behavior between dev/staging/production
- Can't customize behavior without code changes

**Solution:**
- Create `.env` and `.env.example` files
- Add `dotenv` support for Rust backend
- Use Vite's `import.meta.env` for frontend
- Document all configurable values
- Add validation for required environment variables

**Suggested Variables:**
```bash
# API Configuration
MODELS_API_URL=https://models.dev/api.json
MODELS_API_TIMEOUT_MS=30000

# Tool Execution Limits
DEFAULT_SHELL_TIMEOUT_SECS=120
TOOL_OUTPUT_TRUNCATE_LENGTH=200
TOOL_OUTPUT_MAX_LENGTH=10000

# UI Timeouts
CONFIG_SAVE_TIMEOUT_MS=5000
CONFIG_APPLY_DELAY_MS=300

# Logging
LOG_LEVEL=info
RUST_LOG=warn
```

---

## 8. Inconsistent Error Messages

**Priority:** Low  
**Location:** Throughout codebase

**Issue:**
- Some errors are user-friendly: "API key and working directory are required"
- Others expose technical details: "Failed to canonicalize path"
- No consistent error message formatting
- Mix of sentence case, capitalization, punctuation

**Solution:**
- Create error message guidelines
- Implement error message formatter utility
- Separate user-facing messages from logged technical details
- Consider error codes for support/debugging

**Example Structure:**
```rust
pub enum UserError {
    InvalidApiKey,
    WorkdirNotFound,
    PermissionDenied { path: String },
}

impl UserError {
    pub fn user_message(&self) -> String {
        match self {
            Self::InvalidApiKey => "Please provide a valid API key.".to_string(),
            Self::WorkdirNotFound => "The selected directory doesn't exist.".to_string(),
            // ...
        }
    }
}
```

---

## 9. Missing Input Validation

**Priority:** Medium  
**Location:** Frontend settings, backend config

**Issue:**
- No validation that selected model actually exists/is valid
- Working directory validation only checks existence, not permissions
- API keys not validated for format before saving
- Model dropdown can have stale/invalid selection

**Solution:**
- Add frontend validation before allowing save
- Validate API key format (not just empty check)
- Check directory write permissions during selection
- Validate model exists in available models list
- Add debounced validation feedback in UI

**Validation Needed:**
- API key format (starts with sk- for OpenAI, etc.)
- Working directory is readable AND writable
- Model selection is in available models list
- Timeout values are positive integers
- Port numbers are in valid range

---

## 10. Code Duplication

**Priority:** Medium  
**Location:** Multiple backend files

**Issue:**
Config validation logic is duplicated between:
- `rust-backend/src/config.rs:validate_config()`
- `src-tauri/src/backend.rs:start_backend()` (lines 179-189)
- `src-tauri/src/backend.rs:update_config()` (lines 313-327)

Similar error handling patterns repeated throughout without abstraction.

**Solution:**
- Create shared validation utilities
- Extract common error handling into helper functions
- Consider creating a validated config type (newtype pattern)
- Use Result extension traits for common operations

**Example:**
```rust
// Single source of truth for validation
pub struct ValidatedConfig {
    inner: BackendConfig,
}

impl ValidatedConfig {
    pub fn new(config: BackendConfig) -> Result<Self> {
        validate_config(&config)?;
        Ok(Self { inner: config })
    }
}

// Then use ValidatedConfig in function signatures
pub async fn start_backend(config: ValidatedConfig) -> Result<()> {
    // No need to re-validate here
}
```

---

## Summary Statistics

- **High Priority:** 2 issues (Debug logging, Dangerous error handling)
- **Medium Priority:** 6 issues (Magic numbers, URLs, Type safety, Environment config, Validation, Duplication)
- **Low Priority:** 2 issues (TODOs, Error messages)

**Estimated Effort:**
- High Priority: ~4-6 hours
- Medium Priority: ~8-12 hours  
- Low Priority: ~2-3 hours
- **Total:** ~14-21 hours

---

## Notes

Last reviewed: 14 October 2025  
Project: Desk AI (Tauri 2 branch)  
Status: Development phase - pre-production

These issues do not prevent the application from functioning but should be addressed to improve maintainability, reliability, and user experience before production release.
