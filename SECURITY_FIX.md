# Security Fix: Removing Exposed API Keys from Git History

## Problem
GitGuardian detected exposed API keys in your repository. The `.env` file was committed in commit `e73c9a925246a4ace1477cab46ce4608ce7f0480` and contains your `MASSIVE_API_KEY`.

## Immediate Actions Required

### 1. **ROTATE YOUR API KEYS IMMEDIATELY**
   - The exposed API keys are now public in your git history
   - **Generate new API keys** from your Massive API provider
   - Update your local `.env` file with the new keys

### 2. Remove Secrets from Git History

You have two options:

#### Option A: Using git-filter-repo (Recommended - Cleaner)

```bash
# Install git-filter-repo if needed
pip install git-filter-repo

# Remove .env file from entire git history
git filter-repo --path .env --invert-paths

# Force push to update remote (WARNING: This rewrites history)
git push origin --force --all
```

#### Option B: Using git filter-branch (Built-in)

```bash
# Remove .env from entire git history
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all

# Force push to update remote (WARNING: This rewrites history)
git push origin --force --all
```

### 3. Update Your Local .env File

Create or update `.env` in the project root:

```bash
# Massive market data provider
MASSIVE_API_KEY="your_new_api_key_here"
READ_API_TOKEN="your_new_read_token_here"

# Optional overrides
MASSIVE_BASE_URL="https://api.massive.com"
MASSIVE_HTTP_TIMEOUT="10"
```

### 4. Verify Changes

```bash
# Verify .env is no longer in git history
git log --all --full-history -- .env

# Should return nothing if successfully removed

# Verify .env is ignored
git status
# .env should not appear in untracked files
```

## Prevention Measures (Already Implemented)

✅ **Updated `.gitignore`** - Now explicitly excludes `.env` files
✅ **Updated `config.yaml`** - Now uses environment variables instead of hardcoded secrets
✅ **Configuration pattern** - Uses `${VAR_NAME}` syntax for environment variable substitution

## Going Forward

### Best Practices:
1. **Never commit `.env` files** - Always use `.env.example` as a template
2. **Use environment variables** - Store secrets in `.env` files or system environment variables
3. **Use `config.example.yaml`** - Keep this updated, never commit `config.yaml` with secrets
4. **Pre-commit hooks** - Consider using tools like `git-secrets` or `pre-commit` hooks to prevent accidental commits

### To Add New Secrets:
1. Add to your local `.env` file (never commit this)
2. Update `config.yaml` to reference the environment variable: `${VAR_NAME}`
3. Document required variables in `config.example.yaml` or `README.md`

## Important Notes

⚠️ **Force Push Warning**: Removing files from git history requires force pushing, which rewrites history. If others are working on this repository, coordinate with them first.

⚠️ **GitHub Secret Scanning**: Even after removing from history, GitHub may still have the secrets cached. Consider:
   - Rotating all exposed keys immediately
   - Using GitHub's secret scanning alerts to track exposed secrets
   - Setting up branch protection rules to prevent force pushes on main branch

⚠️ **Shared Repositories**: If this is a shared repository, you may need to:
   - Coordinate with team members
   - Have everyone re-clone the repository after the history rewrite
   - Or use a more surgical approach to only remove specific commits

