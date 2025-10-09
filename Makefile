PY := python
ROOT ?= data/daily
CONFIG ?= config.yaml
MAX ?= 25

## Historical data processing targets

# Materialize breadth facts (incremental)
materialize-breadth:
	$(PY) -m engine.jobs.breadth_run --since auto --materialize --write-individual --write-events --config $(CONFIG)

# Full refresh: materialize breadth from configured window
refresh-breadth:
	make materialize-breadth

# Generate comprehensive individual stock dataset
individual-stocks:
	$(PY) -m engine.jobs.individual_stocks --config $(CONFIG) --output engine/out/individual_stocks.parquet --verbose

# Generate individual stocks for specific date range
individual-stocks-range:
	$(PY) -m engine.jobs.individual_stocks --config $(CONFIG) --output engine/out/individual_stocks.parquet --start-date 2024-01-01 --end-date 2024-12-31 --verbose

# Generate individual stocks for limited symbols (faster testing)
individual-stocks-test:
	$(PY) -m engine.jobs.individual_stocks --config $(CONFIG) --output engine/out/individual_stocks.parquet --max-symbols 100 --verbose

prune-market-data:
	$(PY) -m engine.jobs.prune_stooq --root $(ROOT) --out engine/out/ohlcv_pruned --max-years 20

prune-market-data-apply:
	$(PY) -m engine.jobs.prune_stooq --root $(ROOT) --apply --max-years 20

prune-market-data-apply-trim:
	$(PY) -m engine.jobs.prune_stooq --root $(ROOT) --apply --trim-artifacts --max-years 20 --config $(CONFIG)

prune-market-data-date-apply:
	$(PY) -m engine.jobs.prune_stooq --root $(ROOT) --apply --max-years 20 --date-only

.PHONY: list-eligible-90
list-eligible-90:
	$(PY) -m engine.jobs.list_eligible --root $(ROOT) --days 90 --out engine/out/eligible_90d.csv


.PHONY: materialize-breadth refresh-breadth individual-stocks individual-stocks-range individual-stocks-test prune-market-data prune-market-data-apply prune-market-data-apply-trim prune-market-data-date-apply

relayout-daily:
	$(PY) -m engine.jobs.relayout_stooq --src data/stooq/us_daily --dst data

.PHONY: relayout-daily
