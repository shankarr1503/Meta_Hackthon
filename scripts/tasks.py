"""Cross-platform task runner mirroring the Makefile, for machines without make.

Usage: python scripts/tasks.py <setup|backend|frontend|serve|test|lint|build|check|benchmark|benchmark-meta|proof|real-data>
Run `setup` with the interpreter you want in the venv (Python 3.11+, e.g. python3.12).
"""

import os
import shutil
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
VENV = BACKEND / ".venv"


def venv_python() -> Path:
    for candidate in (VENV / "Scripts" / "python.exe", VENV / "bin" / "python"):
        if candidate.exists():
            return candidate
    sys.exit("backend/.venv not found; run: python3.12 scripts/tasks.py setup")


def npm() -> str:
    path = shutil.which("npm")
    if path is None:
        sys.exit("npm not found; install Node 22 LTS")
    return path


def run(args: list[str | Path], cwd: Path) -> None:
    print(f"$ {' '.join(str(a) for a in args)}  (in {cwd.relative_to(ROOT)})", flush=True)
    result = subprocess.run([str(a) for a in args], cwd=cwd, check=False)
    if result.returncode != 0:
        sys.exit(result.returncode)


def setup() -> None:
    if sys.version_info < (3, 11):
        sys.exit(f"Python 3.11+ required, got {sys.version.split()[0]}")
    run([sys.executable, "-m", "venv", ".venv"], BACKEND)
    py = venv_python()
    run([py, "-m", "pip", "install", "--upgrade", "pip"], BACKEND)
    run([py, "-m", "pip", "install", "-e", ".[dev]"], BACKEND)
    run([npm(), "ci"], FRONTEND)


def backend() -> None:
    run([venv_python(), "-m", "uvicorn", "app.main:app", "--reload", "--port", "8000"], BACKEND)


def frontend() -> None:
    run([npm(), "run", "dev"], FRONTEND)


def serve() -> None:
    """Serve the production dashboard and API together, without a Node runtime."""
    if not (FRONTEND / "dist" / "index.html").is_file():
        sys.exit("Frontend build missing; run: python scripts/tasks.py build")
    os.environ["FAILURELAB_FRONTEND_DIR"] = str(FRONTEND / "dist")
    run([venv_python(), "-m", "uvicorn", "app.main:app", "--port", "8000"], BACKEND)


def test() -> None:
    run([venv_python(), "-m", "pytest"], BACKEND)
    run([npm(), "test"], FRONTEND)


def lint() -> None:
    py = venv_python()
    run([py, "-m", "ruff", "check", "."], BACKEND)
    run([py, "-m", "ruff", "format", "--check", "."], BACKEND)
    run([npm(), "run", "lint"], FRONTEND)


def build() -> None:
    run([npm(), "run", "build"], FRONTEND)


def benchmark() -> None:
    run([venv_python(), "scripts/benchmark.py"], BACKEND)


def benchmark_meta() -> None:
    run([venv_python(), "scripts/benchmark.py", "--planner", "meta"], BACKEND)


def proof() -> None:
    run([venv_python(), "scripts/proof.py", "--max-calls", "500"], BACKEND)


def real_data() -> None:
    run([venv_python(), "scripts/fetch_real.py"], BACKEND)
    run([venv_python(), "scripts/real_examples.py", "--live"], BACKEND)


def check() -> None:
    lint()
    test()
    build()


TASKS: dict[str, Callable[[], None]] = {
    "setup": setup,
    "backend": backend,
    "frontend": frontend,
    "serve": serve,
    "test": test,
    "lint": lint,
    "build": build,
    "check": check,
    "benchmark": benchmark,
    "benchmark-meta": benchmark_meta,
    "proof": proof,
    "real-data": real_data,
}


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in TASKS:
        sys.exit(f"usage: python scripts/tasks.py <{'|'.join(TASKS)}>")
    TASKS[sys.argv[1]]()


if __name__ == "__main__":
    main()
