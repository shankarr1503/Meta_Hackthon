"""Replay storage: one JSON file per investigation under backend/replays/.

Ids are checked against INVESTIGATION_ID_PATTERN before any path is built, so a request
can never reach outside the replay folders. Curated demo replays live in replays/demo/.
"""

import json
import re
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


class ReplayStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.demo = root / DEMO_FOLDER

    def save(self, trace: dict[str, Any]) -> Path:
        path = self.root / f"{check_id(trace['investigation_id'])}.json"
        self.root.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(trace, ensure_ascii=False), encoding="utf-8")
        return path

    def load(self, investigation_id: str) -> dict[str, Any] | None:
        name = f"{check_id(investigation_id)}.json"
        for folder in (self.root, self.demo):
            path = folder / name
            if path.is_file():
                return json.loads(path.read_text(encoding="utf-8"))
        return None

    def list(self) -> list[tuple[dict[str, Any], bool]]:
        """(trace, is_demo) for every stored replay, demo replays first, newest first."""
        found = []
        for folder, is_demo in ((self.demo, True), (self.root, False)):
            if not folder.is_dir():
                continue
            files = sorted(folder.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
            for path in files:
                if _ID.fullmatch(path.stem):
                    found.append((json.loads(path.read_text(encoding="utf-8")), is_demo))
        return found
