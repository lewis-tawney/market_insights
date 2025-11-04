# Market Insights API

A FastAPI-based financial market analysis system that provides real-time market strength indicators and stock screening capabilities. The system analyzes market conditions using multiple "lenses" to determine whether the market is in a "risk-on" (bullish), "risk-off" (bearish), or "neutral" state.

## 🎯 Features

### Market Strength Analysis
- **Trend Analysis**: Analyzes SPY, QQQ, IWM using 50/200-day moving averages and slope calculations
- **Volatility Analysis**: Monitors VIX levels and changes to gauge market fear/calm
- **Breadth Analysis**: Measures how many stocks are above their 50-day moving average across major ETFs
- **Volume Analysis**: Tracks volume spikes vs. average to identify unusual activity
- **Momentum Analysis**: Calculates 21-day and 63-day returns across major indices

### Stock Screening
- Ranks stocks based on percentage above 50-day moving average
- 20-day breakout signals
- Volume spikes (capped at 3x average)

### Market Compass
- Simplified 2-factor model combining SPY trend vs. 50-day moving average
- VIX term structure (contango vs. backwardation)

## 🚀 Quick Start

### Prerequisites
- Python 3.9+
- pip

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/lewis-tawney/market_insights.git
   cd market_insights
   ```

2. **Create virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure the application**
   ```bash
   cp config.example.yaml config.yaml
   cp .env.example .env
   # Edit config.yaml as needed and set MASSIVE_API_KEY in .env
   ```

5. **Run the application**
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

The API will be available at `http://localhost:8000`

## 📚 API Documentation

### Core Endpoints

#### Market Strength Analysis
- `GET /market_strength/trend` - Trend analysis across major indices
- `GET /market_strength/volatility` - VIX-based volatility analysis
- `GET /market_strength/breadth` - Market breadth analysis
- `GET /market_strength/volume` - Volume analysis
- `GET /market_strength/momentum` - Momentum analysis
- `GET /market_strength/summary` - Combined market strength summary

#### Stock Analysis
- `GET /price?symbol=AAPL` - Get current price for a symbol
- `GET /compass` - Market compass (simplified risk assessment)
- `GET /screen?symbols=AAPL,MSFT,GOOGL` - Screen and rank stocks

#### Utility
- `GET /healthz` - Health check endpoint
- `GET /debug/cache` - Cache statistics (debug)

### Example Usage

```bash
# Get market strength summary
curl http://localhost:8000/market_strength/summary

# Screen multiple stocks
curl "http://localhost:8000/screen?symbols=AAPL,MSFT,GOOGL,TSLA"

# Get current price
curl "http://localhost:8000/price?symbol=SPY"

# Check market compass
curl http://localhost:8000/compass
```

### Response Format

All endpoints return JSON with a consistent structure:

```json
{
  "state": "risk-on|risk-off|neutral",
  "metrics": { ... },
  "thresholds": { ... },
  "reason": "Human-readable explanation"
}
```

## ⚙️ Configuration

The application uses YAML configuration with environment variable support. Copy `config.example.yaml` to `config.yaml` and customize:

```yaml
market_strength:
  default_index_symbols: ["SPY", "QQQ", "IWM"]
  default_breadth_universe: ["SPY", "QQQ", "IWM", "DIA", "XLK", "XLF", "XLV", "SMH", "XLU", "XLE"]
  thresholds:
    trend:
      slope50_min: 0.0
    volatility:
      vix_risk_on_max: 15
      vix_risk_off_min: 25
      vix_pop_pct: 5.0
    # ... more thresholds
```

### Massive market data provider

- Copy `.env.example` to `.env` and set `MASSIVE_API_KEY=<your key>` before starting the API. Massive is now the only supported data source.
- Optional overrides: `MASSIVE_BASE_URL` (defaults to `https://api.massive.com`) and `MASSIVE_HTTP_TIMEOUT` (seconds, defaults to `10`).
- The `providers` section in `config.yaml` ships with `default: "massive"` and expects `providers.massive.enabled: true`. Update the retry/timeout values as needed for your quota tier.

### Snapshot temp directory

End-of-day snapshot jobs write intermediate files to a temporary directory. The resolver checks `SNAPSHOT_TMP_DIR`, then `TMPDIR`, and finally falls back to `./var/tmp` (created on demand). You can also set `snapshot.tmp_dir` in `config.yaml`. When running in CI or Docker, make sure one of these locations is writable or override `SNAPSHOT_TMP_DIR` to a mounted path.

### Sector membership storage

Sector membership definitions are persisted inside DuckDB. The EOD snapshot job seeds `sector_definitions` and `sectors_map` from `config/sectors_snapshot_base.json` on the first run if the tables are empty. Subsequent runs read solely from DuckDB, so update membership by modifying those tables (for example via DuckDB CLI) rather than editing the JSON seed file.

## 🐳 Docker Deployment

### Build and Run
```bash
# Build the image
docker build -t market-insights .

# Run the container
docker run -p 8000:8000 market-insights
```

### Docker Compose
```bash
docker-compose up -d
```

## 🧪 Testing

Run the test suite:
```bash
# Install development dependencies
pip install -r requirements-dev.txt

# Run tests
pytest

# Run with coverage
pytest --cov=app --cov=engine
```

## 📊 Architecture

## 📈 Candlestick Data

- Backend REST: `GET /chart-data?symbol=AAPL&period=6mo&interval=1d` returns a list of `{ time:'YYYY-MM-DD', open, high, low, close, volume }`. Missing sessions include whitespace bars as `{ time }`.
- Backend WS: `GET /ws/candles?symbol=AAPL&interval=1m` streams a simulated bar every minute with `{ time:'YYYY-MM-DDTHH:mm:00Z', open, high, low, close, volume }`.

Run locally:
```bash
uvicorn app.main:app --reload --port 8000
cd frontend && npm i && npm run dev
```

Docker (prod-like):
```bash
docker compose up -d --build
curl "http://localhost/api/chart-data?symbol=AAPL"
```

```
app/
├── main.py              # FastAPI application entry point
├── config.py            # Configuration management
└── routes/
    ├── api.py           # Core API endpoints
    └── market_strength.py # Market strength analysis endpoints

engine/
├── cache.py             # Multi-tier caching system
├── metrics.py           # Technical analysis functions
└── providers/
    ├── base.py          # Abstract provider interface
    ├── market_data_provider.py # Market data implementation
    └── cached_provider.py # Cached wrapper
```

## 🔧 Development

### Adding New Data Providers
1. Implement the `MarketData` interface in `engine/providers/base.py`
2. Add your provider class in `engine/providers/`
3. Update `app/main.py` to use your provider

### Adding New Market Lenses
1. Add your analysis function to `app/routes/market_strength.py`
2. Update the summary endpoint to include your lens
3. Add configuration options to `config.example.yaml`

## 📈 Performance

- **Caching**: Multi-tier cache with different TTLs for different data types
- **Async**: Fully asynchronous for high concurrency
- **Rate Limiting**: Built-in rate limiting for API protection
- **Monitoring**: Health checks and cache statistics

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For questions or issues:
- Create an issue on GitHub
- Check the API documentation at `http://localhost:8000/docs` when running
- Review the configuration options in `config.example.yaml`

### Sector Volume Snapshot (EOD)
- Run the daily snapshot job after the market close to refresh cached sector volume metrics:
  ```bash
  python -m server.jobs.eod_snapshot
  ```
- Snapshots are persisted in DuckDB (`data/market.duckdb`) and mirrored under `snapshots/` as dated JSON plus `sectors_volume_latest.json`.
- Alerts/logs: `logs/eod_snapshot.log` records each run; `logs/eod_snapshot_alerts.log` is appended when the job fails or the latest snapshot is older than 24 hours.
- The `/metrics/sectors/volume` endpoint now serves the most recent snapshot only; if the job fails, the previous snapshot remains in use until the job succeeds.
- Security config (edit `config.yaml` or set env vars):
  - `security.allowed_ips` – CSV/list of IPs allowed to hit `/metrics/sectors/volume`; if empty, set `security.read_api_token` and send `Authorization: Bearer <TOKEN>`.
  - `security.frontend_origin` – origin allowed by CORS (default `http://localhost:5173`).
- Rate limiting: the snapshot endpoint enforces 60 requests/min per IP (burst ≤10). On exceed you’ll receive HTTP 429 with `Retry-After`; check `logs/eod_snapshot_alerts.log` for entries.

## 🔮 Roadmap

- [ ] WebSocket support for real-time updates
- [ ] Additional technical indicators
- [ ] Portfolio analysis capabilities
- [ ] Historical backtesting
- [ ] More data providers (Massive, Alpha Vantage)
- [ ] Authentication and user management
## Frontend + Nginx quickstart

### Local development
1. Start backend
   ```bash
   ./dev.sh  # or: uvicorn app.main:app --reload --port 8000
   ```
2. Start frontend
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
3. Open http://localhost:5173 – tiles should load without CORS errors.

### Prod-like local
```bash
cd frontend
npm install
npm run build
cd ..
docker compose up -d --build
```
Open http://localhost/ – SPA served via Nginx and proxying /api/* to backend.

### Sanity checks
- http://localhost/api/healthz → `{"status":"ok"}`
- SPA tiles show Compass, Summary, Trend, Volatility, Breadth for symbol input.
