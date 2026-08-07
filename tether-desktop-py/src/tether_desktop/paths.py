"""Local state storage.

Resolves to the same directory Electron used for `app.getPath("userData")`, so the
Python and Electron companions read and write the same state files during migration.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from platformdirs import user_data_dir

APP_NAME = "tether-desktop"


def data_dir() -> Path:
    return Path(user_data_dir(APP_NAME, appauthor=False, roaming=True))


def store_path(file_name: str) -> Path:
    return data_dir() / file_name


def read_json(file_name: str) -> dict[str, Any] | None:
    try:
        return json.loads(store_path(file_name).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def write_json(file_name: str, value: Any) -> None:
    path = store_path(file_name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{json.dumps(value, indent=2)}\n", encoding="utf-8")


def remove_json(file_name: str) -> None:
    try:
        store_path(file_name).unlink(missing_ok=True)
    except OSError:
        # Best-effort cleanup; a state file we cannot remove is not worth failing over.
        pass
