"""Dependency rules from CLAUDE.md, checked by parsing every module's imports."""

import ast
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"

# Names that expose hidden ground truth.
HIDDEN_NAMES = {"Scenario", "SEALED_CASES", "get_scenario", "random_scenarios", "truth_label"}


def _package_of(path: Path) -> list[str]:
    """Package parts a relative import in `path` starts from, e.g. ['app', 'agent']."""
    parts = ["app", *path.relative_to(APP).with_suffix("").parts]
    return parts if parts[-1] == "__init__" and parts.pop() else parts[:-1]


def _parse_imports(source: str, package: list[str]) -> list[tuple[str, set[str]]]:
    """(absolute module, imported names) for every import statement in `source`.

    Relative imports are resolved against `package`, and `from app import cases` counts as
    importing the whole module `app.cases`, so neither form can slip past the rules.
    """
    found = []
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            found += [(alias.name, set()) for alias in node.names]
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                base = package[: len(package) - (node.level - 1)]
                module = ".".join(base + ([node.module] if node.module else []))
            else:
                module = node.module or ""
            names = {alias.name for alias in node.names}
            if module in {"app", *(".".join(package[:i]) for i in range(1, len(package) + 1))}:
                # `from app import cases` / `from . import engine`: whole submodules.
                found += [(f"{module}.{name}", set()) for name in names]
            else:
                found.append((module, names))
    return found


def _imports(path: Path) -> list[tuple[str, set[str]]]:
    return _parse_imports(path.read_text(encoding="utf-8"), _package_of(path))


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


def test_app_uses_no_dynamic_imports() -> None:
    for path in _app_modules():
        source = path.read_text(encoding="utf-8")
        assert "importlib" not in source and "__import__" not in source, _rel(path)


def test_import_parser_sees_through_aliases_and_relative_imports() -> None:
    agent = ["app", "agent"]
    assert _parse_imports("from app import cases", agent) == [("app.cases", set())]
    assert _parse_imports("from ..cases import Scenario", agent) == [("app.cases", {"Scenario"})]
    assert _parse_imports("from . import planners", agent) == [("app.agent.planners", set())]
    assert _parse_imports("from ..inference import engine", ["app", "physics"]) == [
        ("app.inference", {"engine"})
    ]
