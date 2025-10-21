# Repository Guidelines

## Project Structure & Module Organization
- `app/` FastAPI app (`main.py`, routes, config, middleware, providers).
- `engine/` analysis core (metrics, cache, providers, batch jobs in `engine/jobs` via `Makefile`).
- `frontend/` Vite + React + TS UI (`src/`, Tailwind, ESLint).
- `docs/` reference and examples; `deploy/` runtime configs (e.g., Nginx); `tools/` CLI utilities.
- Configuration: copy `config.example.yaml` to `config.yaml` and adjust.

## Build, Test, and Development Commands
- Backend (dev): `uvicorn app.main:app --reload --port 8000`.
- Frontend (dev): `cd frontend && npm i && npm run dev`.
- Docker (prod-like): `docker compose up -d --build`.
- Engine jobs: see `Makefile` (e.g., `make materialize-breadth`, `make individual-stocks`).
- Pre-commit: `pip install -r requirements-dev.txt && pre-commit install && pre-commit run -a`.

## Coding Style & Naming Conventions
- Python: Black (88 cols), isort (profile=black), flake8 (`E203` ignored), mypy (types preferred). Indent 4 spaces. Use `snake_case` for functions/vars, `PascalCase` for classes, module names lower_snake.
- TypeScript/React: ESLint configured; components `PascalCase` in `frontend/src/components/`. Hooks start with `use`. Prefer functional components and explicit props typing.
- Files/paths: keep API routes in `app/routes/`, shared analysis in `engine/`. Avoid cross-layer imports from `frontend` into backend.

## Testing Guidelines
- Python: `pytest` (optionally `pytest --cov=app --cov=engine`). Place tests under `tests/` and name `test_*.py`. Unit tests for metrics/providers; integration tests for route handlers.
- Frontend: `npm run lint` to enforce style; `npm test` currently no tests—add Vitest/Jest if introducing testable UI logic.
- Aim for meaningful coverage on new/changed code; mock network/IO.

## Commit & Pull Request Guidelines
- Commits: concise, imperative subject (<=72 chars). Scope prefix encouraged: `app:`, `engine:`, `frontend:`, `docs:`, `devops:`.
- Include rationale and notable changes in body; reference issues like `Closes #123`.
- PRs: clear description, steps to validate, linked issues. Backend changes: include example curl. Frontend changes: add screenshots/GIFs. Keep PRs focused and small.

## Security & Configuration Tips
- Do not commit secrets. Use `.env` (frontend), environment vars, or container secrets. Keep `config.yaml` generic; template changes in `config.example.yaml`.
- Validate inputs in routes; avoid leaking stack traces. Respect CORS via FastAPI middleware.

