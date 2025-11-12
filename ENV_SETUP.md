# Environment Variables Setup

## Quick Guide: How to Use API Keys Without Committing Them

### ✅ Current Setup (Already Configured)

1. **`.env` file is in `.gitignore`** - Git will never commit it
2. **`config.yaml` uses environment variables** - No hardcoded secrets
3. **Application auto-loads `.env`** - Your app reads it on startup

### 🔑 Adding Your New API Key

1. **Open `.env` file** in your editor
2. **Update the values**:
   ```bash
   MASSIVE_API_KEY="your_new_api_key_here"
   READ_API_TOKEN="your_read_token_here"  # if you have one
   ```
3. **Save the file** - That's it!

### 🛡️ How It Works (You Won't Commit Keys)

The application loads secrets in this order:

1. **`.env` file** (loaded automatically by `app/main.py`)
   - Contains: `MASSIVE_API_KEY="actual_key"`
   - **Never committed** (in `.gitignore`)

2. **`config.yaml`** (references environment variables)
   - Contains: `api_key_env: "MASSIVE_API_KEY"` (variable name, not the key)
   - Contains: `read_api_token: "${READ_API_TOKEN}"` (variable reference)
   - **Can be committed** (doesn't contain actual secrets)

3. **Application reads**:
   - Looks up `MASSIVE_API_KEY` from environment (loaded from `.env`)
   - Uses that value for API calls

### ✅ Verification: Git Won't Commit Your Keys

**Test it yourself:**
```bash
# Check if .env is ignored
git status
# .env should NOT appear in the output

# Try to add it (should be ignored)
git add .env
git status
# Still won't appear

# Verify with check-ignore
git check-ignore .env
# Should output: .env
```

### 📝 Safe Workflow

1. **Edit `.env`** → Add your real API keys here
2. **Edit `config.yaml`** → Use `${VAR_NAME}` syntax for environment variables
3. **Commit changes** → Git automatically skips `.env` (it's ignored)
4. **Push to GitHub** → No secrets in your commits! ✅

### ⚠️ What NOT to Do

- ❌ Don't put API keys directly in `config.yaml`
- ❌ Don't use `git add -f .env` (force add - this bypasses .gitignore)
- ❌ Don't commit `config.yaml` with hardcoded secrets
- ✅ Do use environment variables: `${VAR_NAME}` in `config.yaml`
- ✅ Do keep real keys only in `.env` file

### 🔍 Double-Check Before Committing

Before you commit, verify:
```bash
git status
# Should NOT show .env or any files with secrets

git diff
# Review what you're about to commit - no secrets should be visible
```

Your setup is already configured correctly! Just update `.env` with your new API key and you're good to go.


