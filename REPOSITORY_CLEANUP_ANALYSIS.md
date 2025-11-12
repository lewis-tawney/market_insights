# Repository Cleanup Analysis

## Summary

This document analyzes the repository structure, cross-references it with actual usage, and provides recommendations on what should **STAY** or **GO** with reasoning.

---

## 🚨 **CRITICAL ISSUES - Broken/Missing Code**

### ❌ **MUST FIX: `engine/jobs/` directory doesn't exist**

**Status**: **BROKEN** - Makefile references non-existent modules

**Evidence**:
- `Makefile` references: `engine.jobs.breadth_run`, `engine.jobs.individual_stocks`, `engine.jobs.prune_stooq`, `engine.jobs.list_eligible`, `engine.jobs.relayout_stooq`
- Directory `engine/jobs/` does NOT exist
- All Makefile targets will fail when executed

**Impact**: 
- All batch processing commands in Makefile are broken
- Commands like `make materialize-breadth`, `make individual-stocks` will fail

**Recommendation**: 
- **Option A**: Create the missing `engine/jobs/` directory and implement the referenced modules
- **Option B**: Remove broken Makefile targets if these features are no longer needed
- **Option C**: Update Makefile to reference correct modules if they exist elsewhere

**Files affected**:
- `Makefile` (lines 9-48) - All targets reference non-existent modules

---

### ❌ **MUST FIX: `engine.providers.current_view` module doesn't exist**

**Status**: **BROKEN** - Tools import from non-existent module

**Evidence**:
- `tools/view_ohlcv.py` imports: `from engine.providers.current_view import ...`
- `tools/init_overlay_scaffold.py` imports: `from engine.providers.current_view import ...`
- Module `engine/providers/current_view.py` does NOT exist

**Impact**:
- `tools/view_ohlcv.py` will fail on import
- `tools/init_overlay_scaffold.py` will fail on import
- These tools are unusable

**Recommendation**: 
- **Option A**: Create `engine/providers/current_view.py` with the required functions
- **Option B**: Remove these tools if they're no longer needed
- **Option C**: Update imports if functionality exists elsewhere

**Files affected**:
- `tools/view_ohlcv.py` - Line 11
- `tools/init_overlay_scaffold.py` - Line 15

---

### ❌ **MUST FIX: `engine/out/` directory referenced but doesn't exist**

**Status**: **WARNING** - Directory may be created at runtime, but referenced before creation

**Evidence**:
- `config.example.yaml` references: `engine/out/fact_breadth_individual.parquet`, etc.
- `app/routes/api.py` references: `engine/out/individual_stocks.parquet`
- `Makefile` writes to: `engine/out/individual_stocks.parquet`, etc.
- Directory `engine/out/` does NOT exist in repository

**Impact**:
- Code may fail if directory doesn't exist when writing files
- Should be created if jobs are actually used

**Recommendation**: 
- **Option A**: Create `engine/out/` directory and add to `.gitignore` (for generated files)
- **Option B**: Update code to create directory if missing before writing
- **Option C**: Remove references if these features are deprecated

**Files affected**:
- `config.example.yaml` - Lines 101-104
- `app/routes/api.py` - Line 311
- `Makefile` - Multiple references

---

## 📁 **FOLDER ANALYSIS**

### ✅ **KEEP: `app/` - Backend API Application**

**Status**: **ESSENTIAL** - Core application layer

**Reasoning**:
- FastAPI server that powers the API
- Actively used by frontend
- Contains routes, services, middleware, security
- All files are imported and used

**Verdict**: **KEEP** - All files are necessary

---

### ⚠️ **REVIEW: `engine/` - Data Processing Engine**

**Status**: **MOSTLY ESSENTIAL** - But has issues

**Files to KEEP**:
- ✅ `engine/cache.py` - Used by app
- ✅ `engine/metrics.py` - Used by app
- ✅ `engine/schemas.py` - Used by app
- ✅ `engine/providers/base.py` - Interface for providers
- ✅ `engine/providers/massive_provider.py` - Core provider implementation
- ✅ `engine/providers/synthetic.py` - Test provider (useful for testing)

**Files/Missing**:
- ❌ `engine/jobs/` - **DOESN'T EXIST** but referenced in Makefile
- ❌ `engine/providers/current_view.py` - **DOESN'T EXIST** but imported by tools
- ❌ `engine/out/` - **DOESN'T EXIST** but referenced in config/code

**Verdict**: **KEEP** core files, **FIX** missing modules or **REMOVE** references

---

### ✅ **KEEP: `frontend/` - React Frontend Application**

**Status**: **ESSENTIAL** - User-facing application

**Reasoning**:
- Complete React + TypeScript application
- All components are used
- Active development

**Note**: Has both `package-lock.json` and `pnpm-lock.yaml` - typically only need one

**Verdict**: **KEEP** - Consider removing one lock file (see below)

---

### ⚠️ **REVIEW: `server/` - Background Job Server**

**Status**: **ESSENTIAL** - But location may be confusing

**Reasoning**:
- `server/jobs/eod_snapshot.py` is actively used
- Imported by: `app/services/jobs.py`, multiple test files
- Critical for daily snapshot generation

**Potential Issue**: 
- Name `server/` is confusing (could be `jobs/` or `workers/`)
- Only contains one job file
- Could be moved to `app/jobs/` for consistency

**Verdict**: **KEEP** - But consider renaming/moving for clarity

---

### ✅ **KEEP: `tests/` - Backend Test Suite**

**Status**: **ESSENTIAL** - Test coverage

**Reasoning**:
- All test files are valid and used
- Tests cover: endpoints, providers, snapshots, jobs
- `conftest.py` provides fixtures

**Verdict**: **KEEP** - All files are necessary

---

### ⚠️ **REVIEW: `tools/` - Utility Scripts**

**Status**: **MIXED** - Some broken, some useful

**Files to KEEP**:
- ✅ `tools/ds_query.py` - Query DuckDB (useful for debugging)
- ✅ `tools/show_ticker_snapshot.py` - Display snapshot data (useful)
- ✅ `tools/run_eod_snapshot.sh` - Wrapper for EOD job (useful)

**Files to FIX/REMOVE**:
- ❌ `tools/view_ohlcv.py` - **BROKEN** (imports non-existent `engine.providers.current_view`)
- ❌ `tools/init_overlay_scaffold.py` - **BROKEN** (imports non-existent `engine.providers.current_view`)

**Verdict**: **KEEP** working tools, **FIX or REMOVE** broken tools

---

### ✅ **KEEP: `data/` - Data Storage**

**Status**: **ESSENTIAL** - Contains DuckDB database

**Reasoning**:
- `data/market.duckdb` is actively used by application
- Contains sector membership, snapshots, metrics
- Critical for application functionality

**Verdict**: **KEEP** - Essential data storage

---

### ✅ **KEEP: `snapshots/` - Sector Volume Snapshots**

**Status**: **ESSENTIAL** - Active snapshot storage

**Reasoning**:
- Contains dated JSON snapshots from EOD job
- Used by `/metrics/sectors/volume` endpoint
- Checksums for data integrity
- Active files present (recent dates)

**Verdict**: **KEEP** - Essential for snapshot functionality

---

### ✅ **KEEP: `config/` - Configuration Templates**

**Status**: **ESSENTIAL** - Sector definitions

**Reasoning**:
- `config/sectors_snapshot_base.json` used by EOD snapshot job
- Seeds DuckDB tables on first run
- Referenced in code

**Verdict**: **KEEP** - Essential configuration

---

### ✅ **KEEP: `deploy/` - Deployment Configuration**

**Status**: **ESSENTIAL** - Production deployment

**Reasoning**:
- `deploy/nginx.conf` used by Docker Compose
- Configures reverse proxy for frontend/backend
- Required for production deployment

**Verdict**: **KEEP** - Essential for deployment

---

### ⚠️ **REVIEW: `docs/` - Documentation**

**Status**: **QUESTIONABLE** - Reference code, not actively used

**Files**:
- `docs/breadth_metrics_reference.py` - Reference implementation

**Evidence**:
- Not imported anywhere in codebase
- Only mentioned in `FOLDER_GUIDE.md` (which I created)
- Contains reference implementation for breadth metrics

**Recommendation**:
- **Option A**: **KEEP** if it's useful reference documentation
- **Option B**: **REMOVE** if it's outdated/dead code
- **Option C**: Move to `docs/` as markdown documentation instead of Python code

**Verdict**: **DECISION NEEDED** - Not used, but may be valuable reference

---

### ⚠️ **REVIEW: `logs/` - Application Logs**

**Status**: **KEEP** - But should be in `.gitignore`

**Reasoning**:
- Contains `eod_snapshot.log` (runtime logs)
- Logs should not be committed to git
- Should be generated at runtime

**Recommendation**: Ensure `logs/` is in `.gitignore` and remove committed log files

**Verdict**: **KEEP** directory, **REMOVE** committed log files

---

### ✅ **KEEP: `var/` - Variable/Temporary Files**

**Status**: **ESSENTIAL** - Runtime temporary files

**Reasoning**:
- Used by EOD snapshot job for temporary processing
- Should be in `.gitignore`
- Directory structure needed for runtime

**Verdict**: **KEEP** - Essential for runtime

---

### ❌ **REMOVE: `venv/` - Python Virtual Environment**

**Status**: **SHOULD NOT BE IN REPO** - Should be in `.gitignore`

**Reasoning**:
- Virtual environment should never be committed
- Contains platform-specific binaries
- Should be created locally via `python -m venv venv`

**Recommendation**: 
- Add to `.gitignore` if not already
- Remove from repository

**Verdict**: **REMOVE** - Should not be committed

---

## 📄 **ROOT-LEVEL FILE ANALYSIS**

### ✅ **KEEP: Core Configuration Files**

- ✅ `config.example.yaml` - Template for configuration
- ✅ `config.yaml` - Active configuration (may contain secrets, should be gitignored)
- ✅ `requirements.txt` - Python dependencies
- ✅ `requirements-dev.txt` - Development dependencies
- ✅ `Makefile` - Build commands (but needs fixing - see above)
- ✅ `docker-compose.yml` - Docker orchestration
- ✅ `Dockerfile` - Container image definition
- ✅ `README.md` - Project documentation
- ✅ `LICENSE` - License file

**Verdict**: **KEEP** all

---

### ⚠️ **REVIEW: Documentation Files**

**Files**:
- `ENV_SETUP.md` - Environment setup guide
- `SECURITY_FIX.md` - Historical security fix documentation
- `AGENTS.md` - Repository guidelines for AI agents
- `FOLDER_GUIDE.md` - Folder guide (just created)

**Analysis**:
- ✅ `ENV_SETUP.md` - **KEEP** - Useful setup documentation
- ⚠️ `SECURITY_FIX.md` - **REVIEW** - Historical document, may be outdated
  - If security issue is resolved, can be archived/removed
  - If it's still relevant, keep
- ✅ `AGENTS.md` - **KEEP** - Useful for AI agent context
- ✅ `FOLDER_GUIDE.md` - **KEEP** - New documentation

**Verdict**: **KEEP** most, **REVIEW** `SECURITY_FIX.md`

---

### ⚠️ **REVIEW: Shell Scripts**

**Files**:
- `dev.sh` - Development startup script
- `start.sh` - Production startup script

**Analysis**:
- ✅ Both are useful for different environments
- ✅ `dev.sh` - Development mode with reload
- ✅ `start.sh` - Production mode with workers

**Verdict**: **KEEP** both

---

### ❌ **REMOVE: Duplicate Lock Files**

**Files**:
- `package-lock.json` (root level)
- `frontend/package-lock.json`
- `frontend/pnpm-lock.yaml`

**Analysis**:
- Root level `package-lock.json` - **UNNECESSARY** - No Node.js project at root
- `frontend/package-lock.json` and `pnpm-lock.yaml` - **CHOOSE ONE**
  - Typically use one package manager (npm OR pnpm)
  - Having both causes confusion

**Recommendation**:
- Remove root `package-lock.json`
- Choose one package manager for frontend (npm or pnpm) and remove the other lock file

**Verdict**: **REMOVE** root `package-lock.json`, **CHOOSE ONE** for frontend

---

### ❌ **REMOVE: Log Files**

**Files**:
- `uvicorn.log` - Uvicorn server log

**Analysis**:
- Log files should not be committed
- Should be in `.gitignore`
- Generated at runtime

**Verdict**: **REMOVE** - Should not be committed

---

## 🔄 **DUPLICATION ANALYSIS**

### ⚠️ **REVIEW: Provider Duplication**

**Issue**: Two provider implementations for Massive

**Files**:
- `app/providers/massive.py` - Wrapper around engine provider
- `engine/providers/massive_provider.py` - Core implementation

**Analysis**:
- `app/providers/massive.py` wraps `engine/providers/massive_provider.py`
- Adds app-specific formatting (converts to app record format)
- Both are used: `app/providers/factory.py` uses `app/providers/massive.py`
- `engine/providers/massive_provider.py` is the core implementation

**Reasoning**:
- This is actually **GOOD ARCHITECTURE** - separation of concerns
- `engine/providers/` - Core data provider (reusable)
- `app/providers/` - Application-specific wrapper (formatting)

**Verdict**: **KEEP BOTH** - This is intentional separation, not duplication

---

## 📊 **SUMMARY TABLE**

| Category | Item | Status | Action |
|----------|------|--------|--------|
| **CRITICAL FIXES** | `engine/jobs/` directory | ❌ Missing | Create or remove Makefile targets |
| **CRITICAL FIXES** | `engine.providers.current_view` | ❌ Missing | Create or fix tools |
| **CRITICAL FIXES** | `engine/out/` directory | ⚠️ Missing | Create or remove references |
| **FOLDERS** | `app/` | ✅ Essential | KEEP |
| **FOLDERS** | `engine/` | ⚠️ Has issues | KEEP core, fix missing |
| **FOLDERS** | `frontend/` | ✅ Essential | KEEP |
| **FOLDERS** | `server/` | ✅ Essential | KEEP (consider rename) |
| **FOLDERS** | `tests/` | ✅ Essential | KEEP |
| **FOLDERS** | `tools/` | ⚠️ Some broken | Fix or remove broken |
| **FOLDERS** | `data/` | ✅ Essential | KEEP |
| **FOLDERS** | `snapshots/` | ✅ Essential | KEEP |
| **FOLDERS** | `config/` | ✅ Essential | KEEP |
| **FOLDERS** | `deploy/` | ✅ Essential | KEEP |
| **FOLDERS** | `docs/` | ⚠️ Unused | Decision needed |
| **FOLDERS** | `logs/` | ⚠️ Has files | KEEP, remove committed logs |
| **FOLDERS** | `var/` | ✅ Essential | KEEP |
| **FOLDERS** | `venv/` | ❌ Shouldn't be in repo | REMOVE |
| **FILES** | `package-lock.json` (root) | ❌ Unnecessary | REMOVE |
| **FILES** | `uvicorn.log` | ❌ Shouldn't be in repo | REMOVE |
| **FILES** | `SECURITY_FIX.md` | ⚠️ Historical | Review and decide |
| **DUPLICATES** | Frontend lock files | ⚠️ Two package managers | Choose one |

---

## 🎯 **RECOMMENDED ACTION PLAN**

### **Priority 1: Fix Broken Code** (Must fix before they cause issues)

1. **Fix `engine/jobs/` references**:
   - Option A: Create `engine/jobs/` with required modules
   - Option B: Remove broken Makefile targets
   - Option C: Update Makefile to reference correct locations

2. **Fix `engine.providers.current_view` imports**:
   - Option A: Create `engine/providers/current_view.py`
   - Option B: Remove `tools/view_ohlcv.py` and `tools/init_overlay_scaffold.py`
   - Option C: Update imports if functionality exists elsewhere

3. **Create or remove `engine/out/` references**:
   - Create directory if jobs are needed
   - Remove references if jobs are deprecated

### **Priority 2: Clean Up Repository** (Should do soon)

1. **Remove `venv/`** from repository
2. **Remove root `package-lock.json`**
3. **Choose one package manager** for frontend (npm or pnpm)
4. **Remove `uvicorn.log`** and ensure `.gitignore` includes log files
5. **Remove committed log files** from `logs/` directory

### **Priority 3: Review and Decide** (Nice to have)

1. **Review `docs/breadth_metrics_reference.py`** - Keep as reference or remove
2. **Review `SECURITY_FIX.md`** - Archive if resolved, keep if still relevant
3. **Consider renaming `server/`** to `jobs/` or `workers/` for clarity

---

## ✅ **FILES THAT ARE GOOD TO KEEP**

All files in:
- `app/` - All essential
- `frontend/` - All essential (except one lock file)
- `server/` - Essential
- `tests/` - All essential
- `data/` - Essential
- `snapshots/` - Essential
- `config/` - Essential
- `deploy/` - Essential
- `var/` - Essential

Core configuration files:
- `config.example.yaml`, `config.yaml`, `requirements.txt`, `requirements-dev.txt`
- `Makefile` (needs fixing), `docker-compose.yml`, `Dockerfile`
- `README.md`, `LICENSE`, `ENV_SETUP.md`, `AGENTS.md`

---

## ❌ **FILES TO REMOVE**

1. `venv/` - Entire directory (should not be in repo)
2. `package-lock.json` (root level) - No Node.js at root
3. `uvicorn.log` - Log file (should not be committed)
4. One of `frontend/package-lock.json` or `frontend/pnpm-lock.yaml` - Choose one package manager

---

## ⚠️ **FILES NEEDING DECISION**

1. `docs/breadth_metrics_reference.py` - Not used, but may be valuable reference
2. `SECURITY_FIX.md` - Historical document, may be outdated
3. `tools/view_ohlcv.py` - Broken, fix or remove
4. `tools/init_overlay_scaffold.py` - Broken, fix or remove

---

## 📝 **NOTES**

- The repository structure is generally good with clear separation of concerns
- Main issues are missing modules/directories referenced in code
- Some duplication is intentional (providers) and good architecture
- Most cleanup is removing files that shouldn't be committed (logs, venv, lock files)
- Critical fixes needed before broken code causes issues

