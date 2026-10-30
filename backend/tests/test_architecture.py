"""Dependency rules from CLAUDE.md, checked by parsing every module's imports."""

import ast
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"

# Names that expose hidden ground truth.
HIDDEN_NAMES = {"Scenario", "SEALED_CASES", "get_scenario", "random_scenarios", "truth_label"}


def _imports(path: Path) -> list[tuple[str, set[str]]]:
    """(module, imported names) for every import statement in a file."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found += [(alias.name, set()) for alias in node.names]
        elif isinstance(node, ast.ImportFrom) and node.module:
            found.append((node.module, {alias.name for alias in node.names}))
    return found


def _app_modules(package: str = "") -> list[Path]:
    return sorted((APP / package).rglob("*.py"))


def _rel(path: Path) -> str:
    return path.relative_to(APP).as_posix()


def test_physics_imports_nothing_from_the_app() -> None:
    for path in _app_modules("physics"):
        for module, _ in _imports(path):
            assert not module.startswith("app.") or module.startswith("app.physics"), (
                f"{_rel(path)} imports {module}"
            )


def test_inference_imports_only_physics() -> None:
    allowed = ("app.physics", "app.inference")
    for path in _app_modules("inference"):
        for module, _ in _imports(path):
            assert not module.startswith("app.") or module.startswith(allowed), (
                f"{_rel(path)} imports {module}"
            )


def test_agent_sees_only_the_case_view_and_run_type() -> None:
    allowed_names = {"app.cases": {"CaseView"}, "app.runner": {"Run"}}
    for path in _app_modules("agent"):
        for module, names in _imports(path):
            assert not module.startswith("app.api"), f"{_rel(path)} imports {module}"
            if module in allowed_names:
                assert names and names <= allowed_names[module], (
                    f"{_rel(path)} imports {names or module} from {module}"
                )


def test_only_runner_and_api_read_hidden_scenarios() -> None:
    allowed = {"cases.py", "runner.py"}
    for path in _app_modules():
        rel = _rel(path)
        if rel in allowed or rel.startswith("api/"):
            continue
        for module, names in _imports(path):
            leaked = names & HIDDEN_NAMES
            assert not leaked, f"{rel} imports {leaked} from {module}"
            assert module != "app.cases" or names, f"{rel} imports the whole cases module"


def test_app_never_imports_scripts() -> None:
    for path in _app_modules():
        for module, _ in _imports(path):
            message = f"{_rel(path)} imports {module}"
            assert not module.startswith(("scripts", "benchmark")), message
