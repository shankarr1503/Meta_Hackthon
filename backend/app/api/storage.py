"""Replay storage: one JSON file per investigation under backend/replays/.

Ids are checked against INVESTIGATION_ID_PATTERN before any path is built, so a request
can never reach outside the replay folders. Curated demo replays live in replays/demo/.
Writes go to a temporary file first and are renamed into place, so a reader never sees a
half-written replay.
"""

import json
import os
import re
import tempfile
import time
from pathlib import Path
from typing import Any

from app.schemas.investigation import INVESTIGATION_ID_PATTERN

DEMO_FOLDER = "demo"
_ID = re.compile(INVESTIGATION_ID_PATTERN)


class InvalidIdError(ValueError):
    pass


def check_id(investigation_id: str) -> str:
    if not _ID.fullmatch(investigation_id):
        raise InvalidIdError(f"invalid investigation id {investigation_id!r}")
    return investigation_id


def _replay_files(folder: Path) -> list[Path]:
    """Replay files in a folder, newest first."""
    if not folder.is_dir():
        return []
    dated = []
    for path in folder.glob("*.json"):
        if not _ID.fullmatch(path.stem):
            continue
        try:
            dated.append((path.stat().st_mtime, path))
        except OSError:  # released or replaced since the glob
            continue
    return [path for _, path in sorted(dated, key=lambda item: item[0], reverse=True)]


def _read(path: Path) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return value if isinstance(value, dict) else None


class ReplayStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.demo = root / DEMO_FOLDER

    def path_for(self, investigation_id: str) -> Path:
        return self.root / f"{check_id(investigation_id)}.json"

    def exists(self, investigation_id: str) -> bool:
        return self.path_for(investigation_id).is_file()

    def reserve(self, investigation_id: str) -> bool:
        """Claim an id by creating its file exclusively; False if it is already taken."""
        self.root.mkdir(parents=True, exist_ok=True)
        try:
            self.path_for(investigation_id).open("x", encoding="utf-8").close()
        except FileExistsError:
            return False
        return True

    def release(self, investigation_id: str) -> None:
        """Drop an empty reservation left by a run that failed."""
        path = self.path_for(investigation_id)
        if path.is_file() and path.stat().st_size == 0:
            path.unlink()

    def save(self, trace: dict[str, Any]) -> Path:
        path = self.path_for(trace["investigation_id"])
        self.root.mkdir(parents=True, exist_ok=True)
        # Rule runs can share an id. Each writer needs its own temporary file so
        # concurrent saves cannot overwrite or rename another writer's work.
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=self.root,
            prefix=f".{path.stem}-",
            suffix=".tmp",
            delete=False,
        ) as stream:
            temporary = Path(stream.name)
            try:
                json.dump(trace, stream, ensure_ascii=False)
            except Exception:
                stream.close()
                temporary.unlink(missing_ok=True)
                raise
        try:
            for attempt in range(5):
                try:
                    os.replace(temporary, path)
                    break
                except PermissionError:
                    # Windows can briefly deny replacement while another writer
                    # is replacing the same destination.
                    if os.name != "nt" or attempt == 4:
                        raise
                    time.sleep(0.01 * (attempt + 1))
        finally:
            temporary.unlink(missing_ok=True)
        return path

    def load(self, investigation_id: str) -> dict[str, Any] | None:
        name = f"{check_id(investigation_id)}.json"
        for folder in (self.root, self.demo):
            path = folder / name
            if path.is_file():
                return _read(path)
        return None

    def list(self) -> list[tuple[dict[str, Any], bool]]:
        """(trace, is_demo) for every readable replay, demo replays first, newest first.

        Each id appears once: a saved run shadows a demo replay with the same id, exactly as
        `load` does. Unreadable files are skipped.
        """
        saved = _replay_files(self.root)
        saved_ids = {path.stem for path in saved}
        demos = [path for path in _replay_files(self.demo) if path.stem not in saved_ids]
        found = []
        for paths, is_demo in ((demos, True), (saved, False)):
            for path in paths:
                trace = _read(path)
                if trace is not None:
                    found.append((trace, is_demo))
        return found
