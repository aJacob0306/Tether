"""Allowlist matching.

A direct port of the matching helpers in the Electron `src/main.js`. Every function
here is pure, so the behaviour that decides whether work gets tracked is testable
without a Supabase connection or a desktop session.

The `metadata` keys read below are camelCase on purpose: `tether-mobile/lib/allowlist.ts`
writes `installPath` and `toolKey` in that form when a target is added to a tether.
"""

from __future__ import annotations

import re
from typing import Any, Iterable

from .models import ActiveApp, AllowedTarget

_PATH_SEPARATORS = re.compile(r"[\\/]")
_EXE_SUFFIX = re.compile(r"\.exe$")


def normalize_match_value(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def executable_base_name(value: Any) -> str:
    """Reduce a name or path to a bare executable name for comparison."""
    normalized = normalize_match_value(value)
    base = _PATH_SEPARATORS.split(normalized)[-1]
    return _EXE_SUFFIX.sub("", base)


def normalize_path_value(value: Any) -> str:
    return normalize_match_value(value).replace("/", "\\")


def _first_truthy(*values: Any) -> Any:
    for value in values:
        if value:
            return value
    return None


def app_match_key(target: AllowedTarget) -> Any:
    metadata = target.get("metadata") or {}
    return _first_truthy(
        target.get("bundle_identifier"),
        metadata.get("installPath"),
        metadata.get("executable"),
        target.get("display_name"),
        target.get("value"),
        target.get("id"),
    )


def _compact(values: Iterable[Any], transform) -> list[str]:
    return [result for result in (transform(value) for value in values) if result]


def matches_allowed_app(active_app: ActiveApp, target: AllowedTarget) -> bool:
    metadata = target.get("metadata") or {}

    target_bundle = target.get("bundle_identifier")
    if active_app.bundle_identifier and target_bundle and active_app.bundle_identifier == target_bundle:
        return True

    active_names = _compact(
        (active_app.display_name, active_app.executable_name),
        executable_base_name,
    )
    active_paths = _compact((active_app.executable_path,), normalize_path_value)
    target_names = _compact(
        (
            target.get("display_name"),
            target.get("value"),
            metadata.get("bundleName"),
            metadata.get("executable"),
            metadata.get("installPath"),
        ),
        executable_base_name,
    )
    target_paths = _compact((metadata.get("installPath"),), normalize_path_value)

    return any(name in target_names for name in active_names) or any(
        path in target_paths for path in active_paths
    )


def resolve_allowed_app(
    active_app: ActiveApp,
    targets: Iterable[AllowedTarget],
    active_tether_id: str | None,
) -> AllowedTarget | None:
    """Pick the allowlist entry to attribute the active app to.

    Returns `None` when nothing matches, or when matches span several tethers and the
    user's active tether does not disambiguate them.
    """
    matches = [target for target in targets if matches_allowed_app(active_app, target)]
    if not matches:
        return None

    unique_tether_ids: list[str] = []
    for match in matches:
        tether_id = match.get("tether_id")
        if tether_id and tether_id not in unique_tether_ids:
            unique_tether_ids.append(tether_id)

    if len(unique_tether_ids) == 1:
        resolved_tether_id = unique_tether_ids[0]
    elif active_tether_id and active_tether_id in unique_tether_ids:
        resolved_tether_id = active_tether_id
    else:
        return None

    preferred = next(
        (match for match in matches if match.get("tether_id") == resolved_tether_id),
        matches[0],
    )
    return {**preferred, "resolved_tether_id": resolved_tether_id}
