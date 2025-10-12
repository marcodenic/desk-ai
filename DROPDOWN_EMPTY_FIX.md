# Model Dropdown Empty Fix

## Problem
The model dropdown appeared empty when:
1. The saved model ID wasn't in the fetched models list
2. The `<select>` element's `value` attribute pointed to a value not in the options

## Root Cause
When a `<select>` element has a `value` that doesn't match any `<option>` value, the browser displays it as empty/unselected.

## Solution
Added conditional rendering to handle this case:

```tsx
<select
  value={availableModels.includes(settings.model) ? settings.model : ''}
  onChange={(event) => onChange({ model: event.target.value })}
>
  {!availableModels.includes(settings.model) && (
    <option value="">Select a model...</option>
  )}
  {availableModels.map((modelId: string) => (
    <option key={modelId} value={modelId}>
      {modelId}
    </option>
  ))}
</select>
```

## What This Does
1. **Check if current model is valid**: `availableModels.includes(settings.model)`
2. **If valid**: Show that model as selected
3. **If invalid**: Show empty string `''` and display "Select a model..." placeholder option
4. **Render all available models** from the API

## Result
- Dropdown always shows something (either the current model or a placeholder)
- User can select any model from the list
- No more empty dropdown issue
- Still supports custom model entry via the button

## Testing
1. Open settings panel with saved model "claude-sonnet-4-20250514"
2. If model is in the list → it's selected
3. If model is NOT in the list → shows "Select a model..." placeholder
4. All available models appear in the dropdown
5. Can select any model or click "Enter custom model ID"
