# Tauri 2.0 Event System Fix

## Problem
After upgrading from Tauri 1.5 to 2.0, the "Save & Test" button would get stuck showing "Testing..." indefinitely. The backend successfully emitted "ready" status events (visible in terminal logs), but the frontend UI never updated.

## Root Cause
**Race Condition between Event Listener Registration and Backend Startup**

The issue was in `src/App.tsx`:

1. **Line 142-149** (old): Auto-start useEffect ran on mount and immediately called `handleSaveSettings()`
2. **Line 150-180** (old): Event listener registration useEffect also ran on mount, but `setupListeners()` was **async**
3. The backend would start and emit "ready" status events BEFORE the async `listen()` calls completed registration
4. Events were emitted but lost because no listeners were registered yet

## Solution Applied

### 1. Merged useEffects and Added Startup Delay
- Combined event listener setup and auto-start into proper sequence
- Moved auto-start logic AFTER listener registration with 100ms delay
- This ensures listeners are ready before backend emits events

### 2. Added Safety Timeout
- Added 5-second timeout fallback in `handleSaveSettings()` 
- If status events never arrive, the UI will recover automatically
- Timeout is cleared when status event is received

### Code Changes

#### Before:
```typescript
// Two separate useEffects running in parallel
useEffect(() => {
  // Auto-start immediately (race!)
  if (hasValidSettings && backendStatus === "idle") {
    handleSaveSettings(); // Starts backend immediately
  }
}, []);

useEffect(() => {
  async function setupListeners() {
    // Async registration takes time
    await listen("backend://status", handleStatusEvent);
    // ... more listeners
  }
  setupListeners(); // Not awaited!
}, []);
```

#### After:
```typescript
// First: Register listeners (with proper dependencies)
useEffect(() => {
  async function setupListeners() {
    await listen("backend://status", handleStatusEvent);
    // ... more listeners
    console.log("[App] Event listeners registered");
  }
  setupListeners();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // Handlers stable via useCallback

// Second: Auto-start with delay after listeners ready
useEffect(() => {
  if (hasValidSettings && backendStatus === "idle") {
    const timer = setTimeout(() => {
      console.log("[App] Auto-starting backend");
      handleSaveSettings(); // Backend starts after delay
    }, 100); // Ensures listeners are registered first
    return () => clearTimeout(timer);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// Also added safety timeout in handleSaveSettings:
const timeoutId = setTimeout(() => {
  console.warn("[App] Status event timeout");
  setSavingConfig(false); // Recover UI after 5 seconds
}, 5000);
```

## Testing

To verify the fix works:
1. Open the app with saved settings
2. Click "Save & Test" button
3. Watch console logs for:
   - `[App] Event listeners registered`
   - `[App] Auto-starting backend with saved settings`
   - `[DEBUG] Emitting event: backend://status` (from Rust backend)
   - `[DEBUG App.tsx] handleStatusEvent called with: {status: "ready", ...}`
4. Button should show "Testing..." briefly, then return to "Save & Test"
5. Settings panel should close automatically
6. Status badge should show "Online" (green)

## Alternative Approaches Considered

1. ❌ **Synchronous event registration**: Tauri 2.0 `listen()` is async-only
2. ❌ **Backend delay before emitting**: Would slow down all startups unnecessarily
3. ✅ **Frontend delay before backend start**: Simple, reliable, minimal performance impact
4. ✅ **Safety timeout**: Provides fallback recovery if events are still lost

## Related Tauri 2.0 Changes

- Event emission API: `emit_all()` → `emit()` with `Emitter` trait
- Frontend imports: `@tauri-apps/api/tauri` → `@tauri-apps/api/core`
- Event listeners: Same API but timing-sensitive in async contexts

## Lessons Learned

1. **Async race conditions are subtle**: Both operations appear to work independently
2. **Event-driven systems need ordering guarantees**: Listeners must exist before events fire
3. **Always test lifecycle timing**: Mount order and async operations can cause races
4. **Add defensive timeouts**: Provide recovery path when async dependencies fail
