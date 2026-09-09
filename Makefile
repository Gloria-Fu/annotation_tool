SHELL := /bin/sh

BACKEND_DIR := backend
FRONTEND_DIR := frontend

.PHONY: format format-check lint typecheck test generate-api build check e2e

format:
	cd $(BACKEND_DIR) && ruff format app tests
	cd $(FRONTEND_DIR) && npm run format

format-check:
	cd $(BACKEND_DIR) && ruff format --check app tests
	cd $(FRONTEND_DIR) && npm run format:check

lint:
	cd $(BACKEND_DIR) && ruff check app tests
	cd $(FRONTEND_DIR) && npm run lint

typecheck:
	cd $(BACKEND_DIR) && mypy app
	cd $(FRONTEND_DIR) && npm run typecheck

test:
	cd $(BACKEND_DIR) && pytest -q
	cd $(FRONTEND_DIR) && npm run test:unit -- --run

generate-api:
	cd $(BACKEND_DIR) && python scripts/export_openapi.py ../frontend/src/shared/api/openapi.json
	cd $(FRONTEND_DIR) && npm run generate:api
	git diff --exit-code -- frontend/src/shared/api/openapi.json frontend/src/shared/api/generated.ts

build:
	cd $(FRONTEND_DIR) && npm run build

check: format-check lint typecheck test generate-api build

e2e:
	cd $(FRONTEND_DIR) && npm run test:e2e
