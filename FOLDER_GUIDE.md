# Complete Folder Guide: Market Insights Repository

This guide explains every folder in the Market Insights repository, what it does, how it relates to other parts of the system, and how they all work together.

---

## 🏗️ **High-Level Architecture**

Market Insights is a **full-stack financial market analysis application** with three main layers:

1. **Frontend** (`frontend/`) - React TypeScript web application for visualizing market data
2. **Backend API** (`app/`) - FastAPI server that handles HTTP requests and business logic
3. **Data Processing Engine** (`engine/`) - Standalone Python modules for processing financial data

The system analyzes market conditions using multiple "lenses" (trend, volatility, breadth, volume, momentum) to determine if the market is in a "risk-on" (bullish), "risk-off" (bearish), or "neutral" state.

---

## 📁 **Folder-by-Folder Breakdown**

### **`app/` - Backend API Application**

**Purpose**: The FastAPI web server that powers the REST API. This is the "brain" of the application that handles all HTTP requests, processes market data, and serves it to the frontend.

**Key Components**:
- **`main.py`** - The entry point that starts the FastAPI server, configures middleware (CORS, rate limiting), and wires everything together
- **`config.py`** - Loads and manages application configuration from `config.yaml`
- **`middleware.py`** - Rate limiting middleware to prevent API abuse
- **`security.py`** - Security manager for IP allowlisting and API token authentication
- **`logging_config.py`** - Sets up Python logging

**Subdirectories**:
- **`routes/`** - API endpoint handlers
  - `api.py` - Core endpoints like `/screen`, `/compass`, `/price`
  - `metrics.py` - Market strength metrics endpoints (`/market_strength/trend`, `/market_strength/volatility`, etc.)
  
- **`providers/`** - Data provider abstraction layer
  - `factory.py` - Factory pattern to create the appropriate data provider (currently Massive)
  - `massive.py` - Integration with Massive API for market data
  
- **`schemas/`** - Pydantic data models for request/response validation
  - `sector_volume.py` - Data structures for sector volume snapshots
  
- **`services/`** - Business logic services
  - `sector_snapshot.py` - Handles sector volume snapshot creation and retrieval
  - `candles_duckdb.py` - Queries DuckDB for candlestick/OHLCV data
  - `jobs.py` - Job manager for background tasks (like EOD snapshots)

**How It Relates**:
- Uses `engine/` modules for metrics calculations and data providers
- Serves data to `frontend/` via HTTP endpoints
- Reads configuration from `config.yaml`
- Writes snapshots to `snapshots/` directory
- Uses `data/market.duckdb` for persistent storage

---

### **`engine/` - Data Processing Engine**

**Purpose**: Standalone Python modules for financial data processing and analysis. This is the "computation engine" that performs heavy lifting like calculating technical indicators, processing historical data, and running batch jobs.

**Key Files**:
- **`metrics.py`** - Technical analysis functions (moving averages, slopes, momentum calculations)
- **`cache.py`** - Multi-tier caching system with different TTLs for different data types
- **`schemas.py`** - Data structures used in the engine

**Subdirectories**:
- **`providers/`** - Data source abstraction layer (used by both `app/` and `engine/`)
  - `base.py` - Abstract interface that all data providers must implement
  - `massive_provider.py` - Massive API implementation
  - `synthetic.py` - Synthetic/test data provider for development

- **`jobs/`** - Batch processing scripts (currently not implemented)
  - **NOTE**: The `engine/jobs/` directory does not exist yet
  - Makefile targets that reference these modules are currently disabled
  - Future scripts would include: `breadth_run.py`, `individual_stocks.py`, `prune_stooq.py`, `relayout_stooq.py`
  - These jobs would process historical data and generate Parquet files in `engine/out/`
  - See `Makefile` for details on disabled targets

**How It Relates**:
- Imported by `app/` for metrics calculations and data providers
- Makefile commands for batch processing are currently disabled (see `Makefile` for details)
- Would read from `data/daily/` for historical stock data when implemented
- Would write processed outputs to `engine/out/` as Parquet files when implemented

---

### **`frontend/` - React Frontend Application**

**Purpose**: The user-facing web interface built with React, TypeScript, Vite, and Tailwind CSS. This is what users interact with in their browser.

**Key Files**:
- **`src/App.tsx`** - Root React component
- **`src/AppRouter.tsx`** - Routing configuration
- **`src/index.tsx`** - Application entry point
- **`package.json`** - Node.js dependencies (React, Vite, Tailwind, etc.)
- **`vite.config.ts`** - Vite build configuration
- **`tailwind.config.js`** - Tailwind CSS styling configuration

**Subdirectories**:
- **`src/components/`** - React UI components (13 components)
  - Components like `TradingDashboard`, market strength tiles, charts, etc.
  
- **`src/lib/`** - Utility libraries and API clients
  - `api.ts` - HTTP client for calling backend API
  - `ws.ts` - WebSocket client for real-time data
  - `format.ts` - Data formatting utilities
  - `sectorLeaderboard.ts` - Sector leaderboard logic
  - `features.ts` - Feature flags and configuration
  
- **`dist/`** - Built/compiled frontend files (generated by `pnpm run build` or `npm run build`)
  - Contains the production-ready HTML, CSS, and JavaScript that gets served
  - **Note**: This project uses `pnpm` as the package manager (see `pnpm-lock.yaml`)

- **`tests/`** - Frontend unit tests
  - Currently has `sectorLeaderboard.test.ts`

**How It Relates**:
- Makes HTTP requests to `app/` backend API
- May use WebSocket connections for real-time updates
- Built output in `dist/` is served by Nginx in production (see `deploy/nginx.conf`)

---

### **`server/` - Background Job Server**

**Purpose**: Contains background jobs that run independently of the main API server. These are scheduled tasks that process data at specific times (like end-of-day snapshots).

**Key Files**:
- **`jobs/eod_snapshot.py`** - End-of-day snapshot job that:
  - Runs after market close
  - Fetches sector volume data for all stocks
  - Aggregates data by sector
  - Saves snapshots to `snapshots/` directory
  - Stores data in DuckDB (`data/market.duckdb`)
  - Generates checksums for data integrity

**How It Relates**:
- Uses `app/services/sector_snapshot.py` for snapshot logic
- Uses `app/providers/` to fetch market data
- Writes to `snapshots/` and `data/market.duckdb`
- Can be run manually: `python -m server.jobs.eod_snapshot`
- Logs to `logs/eod_snapshot.log`

---

### **`tests/` - Backend Test Suite**

**Purpose**: Python unit and integration tests for the backend code.

**Key Files**:
- **`conftest.py`** - Pytest configuration and shared fixtures
- **`test_endpoints.py`** - Tests for API endpoints
- **`test_jobs_api.py`** - Tests for job management endpoints
- **`test_massive_provider.py`** - Tests for Massive data provider
- **`test_sector_*.py`** - Tests for sector snapshot functionality
- **`test_snapshot_persistence.py`** - Tests for snapshot storage

**How It Relates**:
- Tests code in `app/` and `engine/`
- Run with `pytest` or `pytest --cov=app --cov=engine`
- Uses test fixtures and mocks to avoid external API calls

---

### **`tools/` - Utility Scripts**

**Purpose**: Standalone CLI tools for data inspection, debugging, and maintenance.

**Key Files**:
- **`ds_query.py`** - Query DuckDB database directly
- **`show_ticker_snapshot.py`** - Display ticker snapshot data
- **`run_eod_snapshot.sh`** - Shell script wrapper to run EOD snapshot job

**Removed Files** (were broken):
- ~~`view_ohlcv.py`~~ - Removed (imported non-existent `engine.providers.current_view`)
- ~~`init_overlay_scaffold.py`~~ - Removed (imported non-existent `engine.providers.current_view`)

**How It Relates**:
- Used for debugging and manual data inspection
- Can query `data/market.duckdb` directly
- Helpful for development and maintenance tasks

---

### **`data/` - Data Storage**

**Purpose**: Storage location for databases and raw/processed market data files.

**Key Files**:
- **`market.duckdb`** - DuckDB database containing:
  - Sector membership definitions
  - Sector volume snapshots
  - Historical ticker metrics
  - Processed market data

**Subdirectories** (may exist):
- **`daily/`** - Historical daily stock data files (from Stooq or other sources)
  - Format: `data/daily/stocks/<SYMBOL>.us.txt`
  - Used by breadth analysis and historical processing

**How It Relates**:
- Read by `engine/` for historical data processing
- Written to by `server/jobs/eod_snapshot.py` for snapshots
- Queried by `app/services/candles_duckdb.py` for chart data
- Referenced in `config.yaml` via `breadth.data_root` setting

---

### **`snapshots/` - Sector Volume Snapshots**

**Purpose**: Stores dated JSON snapshots of sector volume data created by the EOD snapshot job.

**Structure**:
- **`sectors_volume_YYYY-MM-DD.json`** - Dated snapshots (one per day)
- **`sectors_volume_latest.json`** - Symlink or copy of the most recent snapshot
- **`checksums/`** - SHA256 checksums for data integrity verification
  - `sectors_volume_YYYY-MM-DD.json.sha256`
  - `sectors_volume_latest.json.sha256`

**How It Relates**:
- Written by `server/jobs/eod_snapshot.py`
- Read by `app/services/sector_snapshot.py` via `/metrics/sectors/volume` endpoint
- Served to frontend for sector leaderboard visualization
- Used for historical comparison and data integrity checks

---

### **`config/` - Configuration Templates**

**Purpose**: Contains base configuration files and templates.

**Key Files**:
- **`sectors_snapshot_base.json`** - Base sector membership definitions
  - Defines which stocks belong to which sectors
  - Used to seed DuckDB tables on first EOD snapshot run
  - After initial seed, sector data is read from DuckDB, not this file

**How It Relates**:
- Referenced by `server/jobs/eod_snapshot.py` for initial sector data
- Used to populate `sector_definitions` and `sectors_map` tables in DuckDB
- Can be updated manually, but changes must be reflected in DuckDB for production use

---

### **`deploy/` - Deployment Configuration**

**Purpose**: Production deployment configurations.

**Key Files**:
- **`nginx.conf`** - Nginx reverse proxy configuration
  - Serves the frontend static files from `frontend/dist/`
  - Proxies `/api/*` requests to the FastAPI backend
  - Handles CORS and routing

**How It Relates**:
- Used by `docker-compose.yml` for production deployment
- Enables serving both frontend and backend from a single domain
- Handles SSL termination and reverse proxying in production

---

### **`docs/` - Documentation**

**Purpose**: Reference documentation and examples.

**Key Files**:
- **`breadth_metrics_reference.py`** - Reference implementation or examples for breadth metrics calculations

**How It Relates**:
- Provides reference material for developers
- May contain examples or documentation code

---

### **`logs/` - Application Logs**

**Purpose**: Directory for application log files.

**Key Files**:
- **`eod_snapshot.log`** - Log file for EOD snapshot job runs
- **`eod_snapshot_alerts.log`** - Alert log for snapshot job failures or stale data

**How It Relates**:
- Written by `server/jobs/eod_snapshot.py`
- Used for debugging and monitoring
- May contain errors, warnings, and execution traces

---

### **`var/` - Variable/Temporary Files**

**Purpose**: Runtime temporary files and variable data.

**Subdirectories**:
- **`tmp/`** - Temporary directory for intermediate files
  - Used by EOD snapshot job for temporary processing files
  - Configurable via `SNAPSHOT_TMP_DIR` environment variable or `snapshot.tmp_dir` in config

**How It Relates**:
- Used by `server/jobs/eod_snapshot.py` for temporary file storage
- Cleared automatically or manually maintained
- Should be writable by the application

---

### **`venv/` - Python Virtual Environment**

**Purpose**: Python virtual environment containing all installed Python packages.

**Note**: This directory is **NOT committed to git** (excluded via `.gitignore`). It contains:
- Python interpreter
- All packages from `requirements.txt` and `requirements-dev.txt`
- Package binaries and scripts

**How It Relates**:
- Created locally with `python -m venv venv`
- Activated with `source venv/bin/activate` (or `venv\Scripts\activate` on Windows)
- Required to run the backend application
- Separate from Node.js dependencies in `frontend/node_modules/`
- **Each developer creates their own local `venv/` directory**

---

## 🔄 **Data Flow: How Everything Works Together**

### **1. User Opens Frontend**
```
User Browser → frontend/dist/ (served by Nginx) → React App loads
```

### **2. Frontend Requests Market Data**
```
frontend/src/lib/api.ts → HTTP Request → app/ routes → app/services/ → engine/providers/ → Massive API
                                                                                        ↓
                                                                    Response flows back through layers
```

### **3. Backend Processes Request**
```
HTTP Request → app/main.py → app/routes/api.py → app/services/ → engine/metrics.py (calculations)
                                                                  ↓
                                                    engine/providers/ → Fetch data
                                                                  ↓
                                                    engine/cache.py → Cache result
                                                                  ↓
                                                    Return JSON response
```

### **4. EOD Snapshot Job (Daily)**
```
Cron/Manual Trigger → server/jobs/eod_snapshot.py → app/providers/ → Fetch all ticker data
                                                                  ↓
                                                    app/services/sector_snapshot.py → Aggregate by sector
                                                                  ↓
                                                    Write to data/market.duckdb (DuckDB)
                                                                  ↓
                                                    Write to snapshots/sectors_volume_YYYY-MM-DD.json
                                                                  ↓
                                                    Generate checksums in snapshots/checksums/
```

### **5. Historical Data Processing** (Currently Disabled)
```
NOTE: This flow is currently disabled because engine/jobs/ modules don't exist yet

Makefile command → engine/jobs/breadth_run.py → Read from data/daily/ → Process breadth metrics
                                                                      ↓
                                                    Write to engine/out/*.parquet (Parquet files)

When implemented, this would process historical data and generate Parquet files.
See Makefile for details on disabled targets.
```

---

## 🗂️ **Configuration Files**

### **Root Level Configuration**

- **`config.yaml`** - Main application configuration (copy from `config.example.yaml`)
  - Cache settings, rate limits, security, provider configs
  - Market strength thresholds, breadth analysis settings
  
- **`.env`** - Environment variables (not in repo, create from `.env.example`)
  - `MASSIVE_API_KEY` - API key for Massive data provider
  - `SNAPSHOT_TMP_DIR` - Override temporary directory
  
- **`Makefile`** - Build and batch processing commands
  - **NOTE**: Most Makefile targets are currently **disabled** because `engine/jobs/` modules don't exist yet
  - Targets like `make materialize-breadth`, `make individual-stocks`, etc. are commented out
  - See `Makefile` for details on disabled targets
  - These targets will be enabled once `engine/jobs/` modules are implemented

- **`docker-compose.yml`** - Docker orchestration for full stack
- **`Dockerfile`** - Backend container image definition
- **`requirements.txt`** - Python production dependencies
- **`requirements-dev.txt`** - Python development dependencies (testing, linting)

---

## 🎯 **Key Relationships Summary**

| Folder | Depends On | Used By | Stores |
|--------|-----------|---------|--------|
| `app/` | `engine/`, `config.yaml` | `frontend/`, `server/` | API logic, routes |
| `engine/` | None (standalone) | `app/` | Metrics, providers (Makefile targets disabled) |
| `frontend/` | `app/` (API) | User browser | UI components |
| `server/` | `app/` | Cron/manual | Background jobs |
| `data/` | None | `engine/`, `app/` | Databases, raw data |
| `snapshots/` | `server/` | `app/` | Sector snapshots |
| `config/` | None | `server/` | Sector definitions |
| `tools/` | `data/` | Developers | CLI utilities |

---

## 🚀 **Getting Started Path**

1. **Setup**: Configure `config.yaml` and `.env` files
2. **Backend**: Create and activate `venv/` (via `python -m venv venv`), install `requirements.txt`, run `uvicorn app.main:app`
3. **Frontend**: `cd frontend`, `pnpm install` (or `npm install`), `pnpm run dev` (or `npm run dev`)
4. **Data**: Run EOD snapshot job to populate `data/market.duckdb` (via `python -m server.jobs.eod_snapshot`)
5. **Processing**: Makefile commands for historical data processing are currently disabled (see `Makefile` for details)

---

This architecture allows for:
- **Separation of concerns**: Frontend, API, and data processing are separate
- **Scalability**: Each layer can be scaled independently
- **Testability**: Each component can be tested in isolation
- **Maintainability**: Clear boundaries and responsibilities

