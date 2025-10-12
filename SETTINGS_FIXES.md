# Settings Panel Fixes

## Problems Fixed

### 1. **Model Dropdown Not Populating**
- **Issue**: The models.dev API returns a nested object structure `{ provider: { models: { modelId: modelData } } }`, not a flat array
- **Fix**: Updated `fetchModels()` function to correctly parse the nested structure:
  - Access `data.openai.models` and `data.anthropic.models`
  - Use `Object.values()` to get model objects
  - Filter by `tool_call: true` (not `supportsFunctionCalling`)
  - Extract model IDs and sort them

### 2. **"← Back to model list" Button Showing on Load**
- **Issue**: When component loads, `availableModels` is empty, so it incorrectly thinks the current model is custom
- **Fix**: Changed initialization of `showCustomModel` to `false` and only update it after models finish loading
  - Added check for `!loadingModels && availableModels.length > 0` before setting custom mode

### 3. **No Way to Reset Settings**
- **Issue**: Users had no way to clear settings and start fresh
- **Fix**: Added a "Reset" button that:
  - Clears all settings to defaults
  - Removes localStorage entry
  - Resets backend status
  - Clears chat history and approvals
  - Shows a confirmation dialog

## Changes Made

### `/src/components/SettingsPanel.tsx`
1. Fixed `ModelData` and `ProviderData` interfaces to match actual API response
2. Updated `fetchModels()` to parse nested structure correctly
3. Fixed `showCustomModel` state initialization logic
4. Added `onReset` optional prop to interface
5. Added Reset button with confirmation dialog

### `/src/App.tsx`
1. Added `handleResetSettings()` callback that resets everything
2. Passed `onReset={handleResetSettings}` to SettingsPanel component

## How to Test

1. **Model Dropdown**:
   - Open settings panel
   - Should see "Loading models..." briefly
   - Then see a dropdown with models like "claude-sonnet-4-20250514", "gpt-4o", etc.
   - Should NOT see the "← Back to model list" button unless you click "Enter custom model ID"

2. **Custom Model Entry**:
   - Click "Enter custom model ID" button
   - Should switch to text input
   - Click "← Back to model list" to return to dropdown

3. **Reset Settings**:
   - Click "Reset" button at bottom of settings
   - Confirm the dialog
   - All settings should clear (API key, workdir, model, etc.)
   - Backend status should return to "Idle"

## API Structure Reference

```json
{
  "anthropic": {
    "id": "anthropic",
    "models": {
      "claude-sonnet-4-20250514": {
        "id": "claude-sonnet-4-20250514",
        "name": "Claude Sonnet 4",
        "tool_call": true,
        ...
      }
    }
  },
  "openai": {
    "id": "openai", 
    "models": {
      "gpt-4o": {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "tool_call": true,
        ...
      }
    }
  }
}
```

## Default Settings

```typescript
{
  provider: "anthropic",
  apiKey: "",
  model: "claude-sonnet-4-20250514",
  workdir: "",
  autoApproveReads: true,
  confirmWrites: true,
  confirmShell: true,
  autoApproveAll: false
}
```

## Notes

- The 401 authentication error is NOT related to these settings panel issues - that's an invalid API key
- Models are filtered to only show those with `tool_call: true` (function calling support)
- Models are sorted alphabetically for easy browsing
- If the models.dev API fails, empty arrays are returned (graceful degradation)
