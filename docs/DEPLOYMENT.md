# Build and run

Machine data is simulated, except the attributed measured-laboratory recordings path
(REAL_DATA.md). A model key is optional: the information-gain baseline,
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

## One-command container (recommended for hosting)

The repository ships a two-stage `Dockerfile` (D-76): Node 22 builds the dashboard, then
Python 3.12-slim serves it together with the API on one origin, as a non-root user, with
a health check on `/api/health`. From the repository root:

```sh
docker build -t failurelab .
docker run --rm -p 8000:8000 --env-file backend/.env failurelab
```

Open http://127.0.0.1:8000. Omit `--env-file` to run without a model key: the baseline
planners, saved replays, lab, benchmark and real recordings still work and the dashboard
says so. The container reads `PORT` when a host sets one. `.dockerignore` keeps `.env`,
caches, raw downloads and runtime replays out of the image, and the image contains no
tests, scripts or Node runtime.

**Render.** `render.yaml` is a Blueprint for one Docker web service with the health
probe and the `FAILURELAB_*` variables declared; the API key is marked `sync: false`, so
Render asks for it in the dashboard and never reads it from the repository. Create a
Blueprint from the public repository (https://github.com/shankarr1503/Meta_Hackthon),
paste the key, deploy. Any other container host
(Fly.io, Railway, Cloud Run, a VM with Docker) works the same way: build the Dockerfile,
set the same variables, point the health probe at `/api/health`.

Keep the hourly caps (`FAILURELAB_META_RUNS_PER_HOUR`, `FAILURELAB_META_QUESTIONS_PER_HOUR`)
when the key is set: a public demo can be scripted, and these bound what one server process
will spend per hour. Runtime replays written inside a container are lost on redeploy unless
the replay directory is a mounted volume; the curated demo replays are in the image.

## Hosting the same build without a container

Build on a machine with Node 22.12+ and Python 3.11+ (3.12 recommended). Keep the repository
layout, including `frontend/dist`, `backend/replays/demo`, the whole `backend/results/`
directory and `backend/data/real/` (manifest, studies and `test-bench.jpg`).
Install the backend with `pip install -e .` from `backend` in the hosting virtual environment,
and run it from that source checkout. `backend/app/config.py` locates `.env`, replays, results
and `data/real/test-bench.jpg` relative to the source tree, so a non-editable `pip install .`
breaks them. Development packages and Node are not needed at runtime after the build.

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

Guards that matter when hosting (see [DECISIONS.md](DECISIONS.md), D-63 to D-65):

- The live stream `GET /api/investigations/stream` saves the trace before its final frame (D-63).
- Investigation requests a browser marks as cross-site get 403 (D-64).
- Meta runs are capped at `FAILURELAB_META_RUNS_PER_HOUR` (default 30) per server process per
  rolling hour; beyond that the API returns 429. With several worker processes, each has its
  own cap (D-64).
- An invalid `FAILURELAB_LLM_REASONING_EFFORT` stops startup with a validation error (D-65).

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
