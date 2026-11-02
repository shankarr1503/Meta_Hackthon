# Build and run

All machine data is simulated. A model key is optional: the information-gain baseline,
manual lab, benchmark and saved baseline replays work without it.

## Local production demo

After the normal setup in the README, run from the repository root:

```sh
python scripts/tasks.py build
python scripts/tasks.py serve
```

Open http://127.0.0.1:8000. This serves the Vite production build and API from one process
and origin, with no Vite server or reload watcher. Stop it with Ctrl+C. Rebuild and restart
after frontend changes. The command fails with a clear message when the build is missing.
Do not run the development backend on port 8000 at the same time.

## Hosting the same build

Build on a machine with Node 22.12+ and Python 3.11+ (3.12 recommended). Keep the repository
layout, including `frontend/dist`, `backend/replays/demo` and `backend/results/benchmark.json`.
Install the backend with `pip install .` from `backend` in the hosting virtual environment.
Development packages and Node are not needed at runtime after the build.

Set these environment variables through the host configuration:

| Variable | Value |
|---|---|
| `FAILURELAB_FRONTEND_DIR` | Absolute path to `frontend/dist` |
| `FAILURELAB_REPLAYS_DIR` | Writable `backend/replays` directory containing the curated `demo` folder |
| `FAILURELAB_RESULTS_DIR` | Absolute path to `backend/results` |

From `backend`, start the installed environment's Python:

```sh
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

If the host assigns a port, substitute that port in the command. Configure its health
probe to `GET /api/health`, and use its HTTPS endpoint or reverse proxy. Since the dashboard
uses relative `/api` requests, no frontend URL or CORS change is needed for this setup.

Use persistent storage for replays if they must survive restarts; copy the curated `demo`
folder into a newly mounted replay directory. The benchmark file is read-only at runtime.
The app has no user authentication or per-user storage and is intended as a controlled
hackathon demo. Keep a deployment private or access-controlled when enabling a paid model.

When the owner supplies Meta access, set the existing `FAILURELAB_LLM_*` variables in the
host's secret configuration and restart. Never put them in a `VITE_*` variable or frontend
build. `GET /api/ready` reports configuration only; it does not verify live model access.

## Verify before recording

```sh
python scripts/tasks.py check
```

With the single-process server running, in PowerShell:

```powershell
$env:FAILURELAB_BROWSER_URL = 'http://127.0.0.1:8000'
node scripts/browser-smoke.cjs
```

See [VERIFICATION.md](VERIFICATION.md) for installing the optional browser tool. The
browser check always selects the baseline and does not make model calls.

No external deployment or public URL is created by these commands.
