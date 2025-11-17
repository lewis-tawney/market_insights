PY := python
ROOT ?= data/daily
CONFIG ?= config.yaml
MAX ?= 25
EOD_ARGS ?=

.PHONY: eod-snapshot
eod-snapshot:
	$(PY) -m server.jobs.eod_snapshot $(EOD_ARGS)

.PHONY: massive-backfill
massive-backfill:
	$(PY) -m tools.import_massive_daily
