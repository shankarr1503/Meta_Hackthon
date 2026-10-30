# FailureLab AI developer commands. On machines without make, use:
#   python scripts/tasks.py <setup|backend|frontend|test|lint|check|benchmark|benchmark-meta>

PYTHON ?= python3
VENV := backend/.venv
# The venv keeps executables in Scripts/ on Windows and bin/ elsewhere.
VENV_BIN := $(if $(wildcard $(VENV)/Scripts/python.exe),$(VENV)/Scripts,$(VENV)/bin)
PY := $(CURDIR)/$(VENV_BIN)/python

.PHONY: setup backend frontend test lint build check benchmark benchmark-meta

setup:
	cd backend && $(PYTHON) -m venv .venv
	$(MAKE) --no-print-directory install

.PHONY: install
install:
	$(PY) -m pip install --upgrade pip
	cd backend && $(PY) -m pip install -e ".[dev]"
	cd frontend && npm ci

backend:
	cd backend && $(PY) -m uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

test:
	cd backend && $(PY) -m pytest
	cd frontend && npm test

lint:
	cd backend && $(PY) -m ruff check . && $(PY) -m ruff format --check .
	cd frontend && npm run lint

build:
	cd frontend && npm run build

check: lint test build

benchmark:
	cd backend && $(PY) scripts/benchmark.py

benchmark-meta:
	cd backend && $(PY) scripts/benchmark.py --planner meta
