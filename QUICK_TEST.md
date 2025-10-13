# 🚀 Quick Testing Guide

## Current Status: ✅ App is Running!

The Tauri app is running in dev mode. You should see the Desk AI window open on your screen.

---

## 🎯 Quick Test (5 minutes)

### Step 1: Open Browser Console
1. Press `F12` or `Ctrl+Shift+I` in the app window
2. Go to the **Console** tab
3. Look for: `[DEBUG] Found standalone backend sidecar`
4. ✅ This confirms the Rust backend is being used!

### Step 2: Configure Settings
1. Click the **⚙️ Settings** icon (top-right)
2. **Choose Provider**: OpenAI or Anthropic
3. **Select Model**: 
   - OpenAI: `gpt-4o` or `gpt-4o-mini`
   - Anthropic: `claude-3-5-sonnet-latest`
4. **Paste API Key**: Your API key
5. **Working Directory**: `/home/marco/Documents/GitHub/desk-ai`
6. Click **"Save & Test"**
7. ✅ Should show "Ready" status

### Step 3: Test Basic Chat
Type in the chat: **"Hello! Can you help me test the system?"**

✅ You should see:
- Response streams token-by-token
- Text appears smoothly
- No errors in console

### Step 4: Test a Tool
Type: **"List all files in the current directory"**

✅ You should see:
- AI uses `list_directory` tool
- Files are listed (package.json, rust-backend/, src/, etc.)
- AI provides summary

### Step 5: Test Approval Workflow
Type: **"Create a file called test.txt with 'Hello World'"**

✅ You should see:
- 🚨 Approval modal pops up
- Shows file path and content
- Click **"Approve"**
- AI confirms file created
- Verify: `ls test.txt` should show the file

### Step 6: Test Shell Command
Type: **"Run the command 'uname -a'"**

✅ You should see:
- 🚨 Approval modal appears
- Shows command to be executed
- Click **"Approve"**
- Command output streams
- Shows your Linux system info

---

## ✅ If All Tests Pass

**Congratulations!** Your Rust backend is working perfectly!

Next steps:
1. Continue testing with `TESTING_SESSION.md` for comprehensive tests
2. Test production build: `npm run tauri:build`
3. Set up GitHub Actions for cross-platform builds

---

## 🐛 If Something Fails

### Backend Not Detected
**Console shows**: "Found backend script" (Python, not sidecar)

**Fix**:
```bash
ls -la src-tauri/bin/
# Should show: desk-ai-backend-x86_64-unknown-linux-gnu
```

If missing, run:
```bash
./build-backend.sh
```

### API Key Error
**Error**: "Invalid API key" or "Unauthorized"

**Check**:
- OpenAI keys start with: `sk-`
- Anthropic keys start with: `sk-ant-`
- No extra spaces
- Key has active credits

### Tools Not Working
**Symptom**: AI responds but doesn't execute tools

**Debug**:
1. Check console for NDJSON errors
2. Verify working directory exists and is accessible
3. Check backend process in terminal running `npm run tauri:dev`

### Approval Modal Not Appearing
**Symptom**: Commands execute without approval

**Check settings**:
- "Confirm writes" should be ON
- "Confirm shell" should be ON
- These are in Settings panel

---

## 📋 Full Testing Checklist

For comprehensive testing, use: `TESTING_SESSION.md`

This includes:
- All 6 tools
- Both providers
- Edge cases
- Security tests
- Performance checks

---

## 🎉 Success Criteria

You're ready for production builds when:
- ✅ Backend detected as "sidecar" (not Python)
- ✅ Configuration saves and connects
- ✅ Chat responses stream smoothly
- ✅ All 6 tools execute correctly
- ✅ Approval workflow works
- ✅ No crashes or errors

---

## 📞 Need Help?

1. Check console for error messages
2. Look at terminal running `npm run tauri:dev` for backend logs
3. Review `TESTING_SESSION.md` for detailed test steps
4. Check `BUILD.md` for build issues

---

## 🔄 Restart App

If you need to restart:

```bash
# Stop current dev server
# Press Ctrl+C in the terminal running tauri:dev

# Restart
npm run tauri:dev
```

---

**Happy Testing! 🚀**

If everything works, you've successfully migrated from Python to Rust! 🎉
