# Security Guidelines

## 🔒 Protecting API Keys and Credentials

### Never Commit Secrets

**DO NOT** hardcode API keys, tokens, or credentials in your code. This includes:

- API keys (OpenAI, Anthropic, etc.)
- Database passwords
- Private keys (.pem, .key files)
- OAuth tokens
- Any sensitive configuration data

### ✅ Correct Way: Use Environment Variables

```python
# ✅ GOOD: Load from environment
import os
api_key = os.getenv("ANTHROPIC_API_KEY")
```

```javascript
// ✅ GOOD: Load from environment
const apiKey = process.env.ANTHROPIC_API_KEY;
```

### ❌ Wrong Way: Hardcoding

```python
# ❌ BAD: Never do this!
api_key = "sk-ant-api03-..."
```

## 🛡️ Built-in Protection

This repository has multiple layers of protection:

### 1. `.gitignore`
Automatically excludes:
- Test files (`test_*.py`, `*_test.py`)
- Environment files (`.env`, `.env.local`)
- Credential files (`*.key`, `secrets.*`)

### 2. Pre-commit Hook
Scans your staged changes for:
- API key patterns
- Hardcoded credentials
- Suspicious variable assignments

The hook will **block** commits containing potential secrets.

### 3. GitHub Secret Scanning
GitHub automatically scans public repositories for leaked credentials and notifies relevant services.

## 🚨 If You Accidentally Commit a Secret

1. **Revoke the credential immediately** at the provider (Anthropic, OpenAI, etc.)
2. **Do NOT just delete the file** - it remains in git history
3. **Contact the maintainer** or follow these steps:
   - Use `git-filter-repo` to remove it from history
   - Force push the cleaned history
   - Verify removal on GitHub

## 📝 Best Practices

### For Development

1. **Use `.env` files** (already in `.gitignore`)
   ```bash
   # .env
   ANTHROPIC_API_KEY=your-key-here
   OPENAI_API_KEY=your-key-here
   ```

2. **Create `.env.example`** for documentation
   ```bash
   # .env.example
   ANTHROPIC_API_KEY=sk-ant-api03-...
   OPENAI_API_KEY=sk-proj-...
   ```

3. **Load in your code**
   ```python
   from dotenv import load_dotenv
   load_dotenv()
   ```

### For Test Files

- Keep test files in `.gitignore` if they use real APIs
- Use mock/fake credentials in committed tests
- Document the required environment variables

### For Production

- Use proper secret management (AWS Secrets Manager, HashiCorp Vault, etc.)
- Rotate credentials regularly
- Use least-privilege access principles

## 🔍 Checking for Leaked Secrets

You can manually scan your repository:

```bash
# Search for potential API keys
git log -p | grep -E "sk-ant-|sk-proj-|api_key.*=.*['\"]"

# Search in current files
grep -r "sk-ant-\|sk-proj-" . --exclude-dir=.git --exclude-dir=node_modules
```

## 📚 Additional Resources

- [GitHub: Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Anthropic API Security](https://docs.anthropic.com/claude/reference/api-security)
- [OpenAI API Best Practices](https://platform.openai.com/docs/guides/safety-best-practices)

---

**Remember:** Once a secret is committed to a public repository, consider it compromised. Revoke it immediately and rotate to a new credential.
