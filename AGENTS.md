# Repository Guidelines

## Project Structure & Module Organization
- Backend FastAPI: `app/` (entry `app/main.py`, routes in `app/routes/`, shared utils in `app/`).
- Engine: `engine/`
  - Providers & caching under `engine/providers/`
  - Outputs under `engine/out/`
    - `ohlcv_daily/` → canonical normalized OHLCV (date-partitioned Parquet)
    - `features_daily/` → per-symbol derived features
    - `breadth_daily/` → per-date breadth aggregates
    - `_watermarks/` → JSONs with last ingested date per dataset
- Frontend: `frontend/` (Vite/React; components in `frontend/src/components/`).
- Config & Ops: `config.yaml`, `deploy/nginx.conf`, `Dockerfile`, `docker-compose.yml`, `dev.sh`, `start.sh`.
- Tests: `tests/` (pytest). Data fixtures under `data/daily/stocks/**`.

## Build, Test, and Development Commands
- Lint: `uv run ruff check .` | Types: `uv run mypy app engine`
- Format: `uv run black . && uv run isort . && uv run flake8`
- Backend tests: `uv run pytest -q`
- Run API: `uv run uvicorn app.main:app --reload`
- Frontend: `pnpm i --silent && pnpm lint && pnpm typecheck && pnpm dev`
- Docker: `docker-compose up --build`
- Makefile targets (planned):
  - `make ingest` → ingestion (historical + incremental)
  - `make features` → feature computation
  - `make breadth` → breadth aggregation

## Coding Style & Naming Conventions
- Python: 4-space indent, type hints, `snake_case.py`, functions/vars snake_case, classes PascalCase
- JS/TS: ESLint + Prettier, strict TS, React functional + hooks
- Performance:
  - Incremental O(symbol) updates
  - Partition Parquet by `date=YYYY-MM-DD`
  - Reuse logger, no PII
- Symbol normalization:
  - Strip `.US`
  - Uppercase
  - `BRK-B → BRK.B`
  - Exclude warrants/units/rights/preferreds via regex
- Determinism: pin versions, avoid timestamp noise, dedupe on `(symbol, date)`

## Testing Guidelines
- Framework: pytest in `tests/`, mirror module paths
- Fast checks: ruff, mypy, pytest
- Add smoke tests for new providers, feature, and breadth jobs
- Breadth: aggregates must equal sum of flags in features
- Features: forward-safety (no look-ahead in windows)

## Commit & Pull Request Guidelines
- Conventional Commits (`feat:`, `fix:`, etc.)
- Small, focused diffs; include description, issues, verification
- Backward compatible; additive changes only
- Update docs/CHANGELOG on user-visible changes

## Security & Configuration Tips
- Never commit secrets; use `config.yaml`
- Watermarks track last processed date; only touched partitions are rewritten
- Feature flag: `BREADTH_ENABLED=false` to disable breadth
- Forward-safe metrics only (windows exclude current row)

## Stockbee Metric Definitions

### Per-Symbol Features (features_daily)
- **ret_1d**: `(close_t / close_{t-1}) - 1`
- **gap_pct**: `(open_t / close_{t-1}) - 1`
- **atr20**: 20-day ATR
- **atr20_pct**: `atr20 / close_t`
- **rvol20**: `volume_t / mean(volume_{t-20..t-1})`
- **rvol50**: `volume_t / mean(volume_{t-50..t-1})`
- **ma10, ma20, ma50, ma200**: rolling SMAs
- **dist_maX**: `(close_t / maX_t) - 1`
- **nr4, nr7**: narrowest range of last 4 or 7 days
- **hi_52w, lo_52w**: 252-day high/low of close
- **near_hi_52w**: `close_t ≥ hi_52w * 0.98`

### Breadth Aggregates (breadth_daily)
- **Core counts**:
  - `up4_count`: ret_1d ≥ +4%
  - `down4_count`: ret_1d ≤ -4%
  - `nr7_count`: nr7 = true
  - `new_highs_52w`: close_t == hi_52w and prev close < hi_52w
  - `new_lows_52w`: close_t == lo_52w and prev close > lo_52w
  - `rvol20_gt2_count`: rvol20 ≥ 2
  - `universe_count`: total eligible symbols

### Extended Breadth Metrics (existing system, must be preserved)
- **n_up4 / n_dn4**: 4% up/down with volume confirmation
- **n_up25m / n_dn25m**: 25%+ moves over ~20 days
- **n_up50m / n_dn50m**: 50%+ moves over ~20 days
- **n_up25q / n_dn25q**: 25%+ moves from 65-day low/high
- **n_up13x34 / n_dn13x34**: 13%+ moves from 34-day low/high
- **Derived**:
  - up10, dn10 (10-day rolling sums of up4/dn4)
  - r5, r10 (5- and 10-day up4:dn4 ratios, Laplace smoothed)
  - d34_13 (net diff between up13x34 and dn13x34)

**Codex must extend this system for new metrics, not duplicate it.**
