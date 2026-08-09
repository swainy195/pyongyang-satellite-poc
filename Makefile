.PHONY: install api web test lint format supabase-start supabase-reset inspect

install:
	uv sync --dev
	cd apps/api && uv sync --dev
	cd apps/web && pnpm install

api:
	cd apps/api && uv run uvicorn app.main:app --reload --port 8000

web:
	cd apps/web && pnpm dev

test:
	uv run pytest
	cd apps/api && uv run pytest
	cd apps/web && pnpm test -- --run

lint:
	uv run ruff check pipelines tests
	cd apps/api && uv run ruff check app tests
	cd apps/web && pnpm lint

format:
	uv run ruff format pipelines tests
	cd apps/api && uv run ruff format app tests
	cd apps/web && pnpm format

supabase-start:
	supabase start

supabase-reset:
	supabase db reset

inspect:
	uv run python -m pipelines.etl.inspect_inputs --input-dir data/import
