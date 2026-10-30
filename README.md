# FailureLab AI

FailureLab AI is a Meta-model investigator that finds why a simulated rotating machine
vibrates by designing and running experiments on a physics-based digital twin. A
simulator produces every measurement, a Bayesian engine produces every probability, and a
Meta model chooses experiments, states its predictions before each result and explains the
diagnosis, without ever seeing the true fault. **All data is simulated**; nothing here
claims validated real-world accuracy. Built for the Meta Global AI Developer Hackathon 2026
(track: Indie Developer).

Plans: [Product features](docs/PRODUCT_FEATURES.md) ·
[Technical design](docs/TECHNICAL_DESIGN.md) · [Decisions](docs/DECISIONS.md) ·
[Assumptions](docs/ASSUMPTIONS.md) · [API](docs/API.md)

## Setup

Requires Python 3.11+ (3.12 recommended; CI uses 3.12) and Node 22 LTS with npm.

With make (Linux, macOS, CI):

```sh
make setup PYTHON=python3.12   # backend venv + frontend packages
make backend                   # API on http://127.0.0.1:8000 (docs at /docs)
make frontend                  # dashboard on http://localhost:5173, proxies /api
make check                     # lint + tests + build
```

Without make (e.g. Windows), the same commands via Python:

```sh
python3.12 scripts/tasks.py setup
python scripts/tasks.py backend
python scripts/tasks.py frontend
python scripts/tasks.py check
```

On Windows, Python 3.12 can be installed with the Python install manager
(`pymanager install 3.12`), which provides `python3.12`.

Model access is optional for development. To enable the Meta model investigator, copy
`backend/.env.example` to `backend/.env` (git-ignored) and fill in the `FAILURELAB_LLM_*`
values. Never commit keys.

## Built during the hackathon (26 Oct – 4 Nov 2026)

All code in this repository was written from scratch during the event. Work started on
28 Oct 2026; the first commit was made on 30 Oct 2026 (see D-34 in `docs/DECISIONS.md`).

### 28 Oct 2026

- Plan review; specs converted to Markdown (`docs/`) with resolutions recorded in
  `docs/DECISIONS.md`.
- Workspace skeleton: backend and frontend folders, Makefile, `scripts/tasks.py`, CI.
- Backend: FastAPI app factory, settings from `backend/.env` (`FAILURELAB_` prefix),
  `GET /api/health`, health tests.
- Frontend: Vite + React + TypeScript + Tailwind page that calls `/api/health` through the
  Vite proxy and shows a visible "Simulated" label, with tests.

### Dependencies

Direct dependencies, pinned to exact versions:

| Package | Version | Use | License |
|---|---|---|---|
| FastAPI | 0.143.1 | Backend API | MIT |
| Uvicorn | 0.54.0 | ASGI server | BSD-3-Clause |
| Pydantic | 2.14.1 | Schemas and validation | MIT |
| pydantic-settings | 2.16.0 | Settings from `.env` | MIT |
| NumPy | 2.5.4 | Physics and inference | BSD-3-Clause (bundled parts: 0BSD, MIT, Zlib, CC0-1.0) |
| httpx | 0.28.1 | Meta model adapter; test client | BSD-3-Clause |
| setuptools | 84.0.0 | Backend build backend | MIT |
| pytest | 9.1.1 | Backend tests | MIT |
| Ruff | 0.17.0 | Backend lint and format | MIT |
| React, React DOM | 19.3.1 | Frontend UI | MIT |
| Vite | 8.3.4 | Frontend dev server and build | MIT |
| @vitejs/plugin-react | 6.1.2 | React support for Vite | MIT |
| TypeScript | 6.0.3 | Frontend language | Apache-2.0 |
| Tailwind CSS | 3.4.19 | Styling | MIT |
| PostCSS | 8.5.30 | CSS processing | MIT |
| Autoprefixer | 10.6.1 | CSS vendor prefixes | MIT |
| Vitest | 5.0.4 | Frontend tests | MIT |
| jsdom | 30.1.2 | DOM for tests | MIT |
| @testing-library/react | 16.3.3 | Component tests | MIT |
| @testing-library/dom | 10.4.2 | Component tests | MIT |
| @testing-library/jest-dom | 7.0.1 | DOM matchers | MIT |
| ESLint | 10.12.0 | Frontend lint | MIT |
| @eslint/js | 10.0.1 | ESLint rules | MIT |
| typescript-eslint | 8.71.2 | TypeScript lint | MIT |
| eslint-plugin-react-hooks | 7.1.1 | React hooks lint | MIT |
| eslint-plugin-react-refresh | 0.5.7 | Vite fast-refresh lint | MIT |
| globals | 17.13.0 | ESLint globals | MIT |
| @types/react, @types/react-dom | 19.3.0 | React type definitions | MIT |
| GitHub Actions (checkout, setup-python, setup-node) | v5 / v6 / v5 | CI | MIT |

Transitive dependencies are under compatible licenses: permissive (MIT, BSD, Apache-2.0,
ISC), MPL-2.0 used 