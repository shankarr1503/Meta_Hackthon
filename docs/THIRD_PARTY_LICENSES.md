# Third-party license audit (backend, transitive)

Audited 3 Nov 2026 against the `backend/.venv` used by CI (`pip install -e .[dev]`
plus the audit tool itself). Method: `python -m piplicenses --format=json`
(pip-licenses 5.5.5, MIT, local venv only, not a project dependency), with
`pip`, `pip-licenses`, `prettytable` and `wcwidth` resolved separately through
`importlib.metadata` because the tool omits them from its listing.

Verdict: all 32 installed distributions are under permissive or explicitly
allowed licences. No GPL, AGPL or unlicensed package. One judgement call is
flagged below (`typing_extensions`, PSF-2.0).

## Runtime (shipped in the Docker image via `pip install -e .`)

| Package | Version | Licence |
|---|---|---|
| failurelab-backend (own code) | 0.1.0 | MIT |
| fastapi | 0.143.1 | MIT |
| uvicorn | 0.54.0 | BSD-3-Clause |
| pydantic | 2.14.1 | MIT |
| pydantic-settings | 2.16.0 | MIT |
| numpy | 2.5.4 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 (see note) |
| httpx | 0.28.1 | BSD License (upstream BSD-3-Clause) |
| annotated-doc | 0.0.5 | MIT |
| annotated-types | 0.8.0 | MIT |
| anyio | 4.15.1 | MIT |
| certifi | 2026.10.23 | MPL-2.0, used unmodified from PyPI (see note) |
| click | 8.5.0 | BSD-3-Clause |
| h11 | 0.16.0 | MIT License |
| httpcore | 1.0.9 | BSD-3-Clause |
| idna | 3.20 | BSD-3-Clause |
| opentelemetry-api | 1.45.2 | Apache-2.0 |
| pydantic_core | 2.50.1 | MIT |
| python-dotenv | 1.2.4 | BSD-3-Clause |
| starlette | 1.10.0 | BSD-3-Clause |
| typing-inspection | 0.4.4 | MIT |
| typing_extensions | 4.16.0 | PSF-2.0 (see judgement call) |

## Development only (not in the image)

| Package | Version | Licence |
|---|---|---|
| pytest | 9.1.1 | MIT |
| ruff | 0.17.0 | MIT |
| colorama | 0.4.6 | BSD License |
| iniconfig | 2.3.1 | MIT |
| packaging | 26.3 | Apache-2.0 OR BSD-2-Clause |
| pluggy | 1.7.0 | MIT License |
| Pygments | 2.21.0 | BSD-2-Clause |

## Local audit tooling (venv only, not in `pyproject.toml`)

| Package | Version | Licence |
|---|---|---|
| pip | 25.0.1 | MIT |
| pip-licenses | 5.5.5 | MIT |
| prettytable | 3.18.0 | BSD-3-Clause |
| wcwidth | 0.9.4 | MIT (classifier; metadata licence field empty) |

## Notes

- `numpy` reports a composite expression: the library is BSD-3-Clause with
  bundled data and compatibility files under more-permissive terms
  (0BSD, MIT, Zlib, CC0-1.0). No copyleft component.
- `certifi` (MPL-2.0) is the CA bundle used unmodified from PyPI, the case the
  project rules explicitly allow.
- Judgement call: `typing_extensions` is PSF-2.0, which is not literally in the
  project's listed set (MIT, BSD, Apache-2.0, ISC) but is an OSI-approved
  permissive licence with no copyleft, governing Python-ecosystem type hints.
  Recommended as acceptable; the owner confirms before submission.
- `pip-licenses` lists `failurelab-backend` twice (the editable install exposes
  two metadata entries); it is one package.
- Licence names above are the tool's reported strings; `-` vs ` ` variants
  (`MIT` / `MIT License`, `BSD License` / `BSD-3-Clause`) are the same licences.

To re-run after a dependency change:

```sh
cd backend
.venv/Scripts/python -m piplicenses --format=json
```
