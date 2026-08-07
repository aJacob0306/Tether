"""Command line interface.

Everything the companion does is reachable from here, which makes the app debuggable
without a GUI: `track` is the same loop the window runs, just in the foreground.
"""

from __future__ import annotations

import argparse
import getpass
import logging
import sys
import threading

import httpx
from postgrest.exceptions import APIError

from . import sessions
from .auth import AuthError, SessionUnavailableError
from .config import ConfigError
from .matching import resolve_allowed_app
from .platforms.base import UnsupportedPlatformError
from .service import TetherService


def _configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s  %(message)s",
        datefmt="%H:%M:%S",
    )
    # The HTTP client logs a line per Supabase request, which drowns out the tracker.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("hpack").setLevel(logging.WARNING)


def _describe_sync(sync) -> str:
    plural = "" if sync.uploaded_count == 1 else "s"
    return f"Synced {sync.uploaded_count} app{plural} ({sync.detected_count} detected)."


def cmd_sign_in(service: TetherService, args: argparse.Namespace) -> int:
    email = args.email or input("Email: ").strip()
    password = args.password or getpass.getpass("Password: ")

    print("Signing in, registering this computer, and scanning apps...")
    result = service.sign_in(email, password)

    print(f"Signed in as {result['session']['email']}.")
    device = result["device"] or {}
    print(f"Registered device: {device.get('display_name', 'unknown')}")
    print(_describe_sync(result["sync"]))
    print("\nRun `tether-desktop track` to start tracking.")
    service.tracker.stop(close_session=False)
    return 0


def cmd_sign_out(service: TetherService, _args: argparse.Namespace) -> int:
    service.sign_out()
    print("Signed out.")
    return 0


def cmd_sync(service: TetherService, _args: argparse.Namespace) -> int:
    sync = service.sync_detected_apps()
    print(_describe_sync(sync))
    return 0


def cmd_detect(service: TetherService, args: argparse.Namespace) -> int:
    """Scan for installed apps without uploading anything."""
    apps = service.adapter.detect_installed_apps()
    print(f"{len(apps)} apps detected on {service.adapter.platform_label}:\n")
    for app in apps:
        icon = "icon" if (app["metadata"] or {}).get("iconDataUrl") else "    "
        print(f"  {icon}  {app['display_name']:<40} {app['tool_key']}")
    return 0


def cmd_status(service: TetherService, _args: argparse.Namespace) -> int:
    status = service.get_status()
    session = status["session"]

    if status["offline_reason"]:
        print(f"Offline:     {status['offline_reason']}")
        print("             Your saved sign-in has been kept.")
    elif not session:
        print("Not signed in. Run `tether-desktop sign-in`.")
        return 0

    print(f"Signed in:   {session['email'] if session else 'unknown (offline)'}")
    print(f"Platform:    {service.adapter.platform_label} ({service.adapter.platform_id})")
    print(f"Device:      {service.adapter.device_display_name()}")
    print(f"Idle:        {service.adapter.system_idle_seconds():.0f}s")

    try:
        print(f"Foreground:  {service.adapter.get_frontmost_app().display_name}")
    except Exception as error:
        print(f"Foreground:  unavailable ({error})")

    tracking = status["tracking"]
    print(f"Tracking:    {'running' if tracking['active'] else 'not running'}")
    if tracking["target_label"]:
        print(f"Last target: {tracking['target_label']}")
    return 0


def cmd_gui(_service: TetherService, args: argparse.Namespace) -> int:
    from .ui import run_window

    return run_window(prefer="basic" if getattr(args, "basic", False) else "auto")


def cmd_check(service: TetherService, _args: argparse.Namespace) -> int:
    """Read-only preflight: everything the tracker reads, without writing anything."""
    failures = 0

    def report(label: str, ok: bool, detail: str = "") -> None:
        nonlocal failures
        if not ok:
            failures += 1
        print(f"  [{'ok' if ok else 'FAIL'}] {label}{f': {detail}' if detail else ''}")

    print("Configuration")
    report("credentials present", service.config.is_configured, service.config.supabase_url)
    if not service.config.is_configured:
        print("\nAdd SUPABASE_URL and SUPABASE_ANON_KEY to tether-desktop-py/.env.")
        return 1

    print("\nAccount")
    try:
        session = service.auth.load_saved_session()
        report("saved session restored", bool(session),
               session["user"]["email"] if session else "run `tether-desktop sign-in`")
        if not session:
            return 1
    except SessionUnavailableError as error:
        report("saved session restored", False, str(error))
        return 1

    user_id = service.auth.user_id()

    print("\nThis computer")
    report("platform adapter", True, f"{service.adapter.platform_label} ({service.adapter.platform_id})")
    report("device name", True, service.adapter.device_display_name())
    try:
        report("idle detection", True, f"{service.adapter.system_idle_seconds():.0f}s since input")
    except Exception as error:
        report("idle detection", False, str(error))

    try:
        active_app = service.adapter.get_frontmost_app()
        report("foreground app", True, active_app.display_name)
    except Exception as error:
        active_app = None
        report("foreground app", False, str(error))

    try:
        apps = service.adapter.detect_installed_apps()
        with_icons = sum(1 for app in apps if (app["metadata"] or {}).get("iconDataUrl"))
        report("app discovery", bool(apps), f"{len(apps)} apps, {with_icons} with icons")
    except Exception as error:
        report("app discovery", False, str(error))

    print("\nSupabase")
    try:
        registered = service.supabase.table("devices").select(
            "id,display_name,platform,last_seen_at"
        ).eq("user_id", user_id).execute().data
        report("devices readable", True, f"{len(registered)} registered")
    except Exception as error:
        report("devices readable", False, str(error))

    try:
        count = service.supabase.table("detected_tools").select(
            "id", count="exact"
        ).eq("user_id", user_id).eq("tool_type", "app").execute().count
        report("detected_tools readable", True, f"{count} uploaded")
    except Exception as error:
        report("detected_tools readable", False, str(error))

    targets = []
    try:
        targets = sessions.fetch_allowed_app_targets(service.supabase)
        report("allowlist readable", True, f"{len(targets)} allowed apps")
    except Exception as error:
        report("allowlist readable", False, str(error))

    active_tether_id = None
    try:
        active_tether_id = sessions.fetch_active_tether_id(service.supabase)
        report("ensure_my_active_tether RPC", True, active_tether_id or "no active tether set")
    except Exception as error:
        report("ensure_my_active_tether RPC", False, str(error))

    print("\nMatching")
    if active_app and targets:
        resolved = resolve_allowed_app(active_app, targets, active_tether_id)
        if resolved:
            print(f"  [ok] '{active_app.display_name}' matches '{resolved['display_name']}' "
                  f"in tether {resolved['resolved_tether_id']}")
        else:
            print(f"  [--] '{active_app.display_name}' is not on the allowlist "
                  f"(focus an allowlisted app to test a match)")
        for entry in targets:
            print(f"       allowed: {entry['display_name']} ({entry.get('bundle_identifier') or 'no bundle id'})")
    else:
        print("  [--] skipped: need a readable foreground app and at least one allowed app")

    print(f"\n{'All checks passed.' if not failures else f'{failures} check(s) failed.'}")
    return 1 if failures else 0


def cmd_track(service: TetherService, _args: argparse.Namespace) -> int:
    try:
        signed_in = service.auth.load_saved_session()
    except SessionUnavailableError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    if not signed_in:
        print("Not signed in. Run `tether-desktop sign-in` first.")
        return 1

    service.install_shutdown_handlers()
    service.bootstrap()

    if not service.tracker.is_running:
        service.tracker.start()

    print("Tracking. Press Ctrl-C to stop.\n")
    try:
        # Keep the main thread alive and interruptible while the tracker thread polls.
        while service.tracker.is_running:
            threading.Event().wait(0.5)
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        service.shutdown("Desktop companion is quitting")

    return 0


COMMANDS = {
    "sign-in": cmd_sign_in,
    "sign-out": cmd_sign_out,
    "sync": cmd_sync,
    "detect": cmd_detect,
    "status": cmd_status,
    "check": cmd_check,
    "track": cmd_track,
    "gui": cmd_gui,
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="tether-desktop", description=__doc__.splitlines()[0])
    parser.add_argument("-v", "--verbose", action="store_true", help="show debug logging")
    subparsers = parser.add_subparsers(dest="command", required=True)

    sign_in = subparsers.add_parser("sign-in", help="sign in, register this computer, upload apps")
    sign_in.add_argument("--email")
    sign_in.add_argument("--password", help="prompted for if omitted")

    subparsers.add_parser("sign-out", help="sign out and stop tracking")
    subparsers.add_parser("sync", help="rescan installed apps and upload them")
    subparsers.add_parser("detect", help="list installed apps without uploading")
    subparsers.add_parser("status", help="show sign-in, device, and tracking state")
    subparsers.add_parser("check", help="read-only preflight of config, OS access, and Supabase")
    subparsers.add_parser("track", help="run the foreground-app tracking loop")
    gui = subparsers.add_parser("gui", help="open the desktop window")
    gui.add_argument(
        "--basic",
        action="store_true",
        help="use the plain Tkinter window instead of the webview one",
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    _configure_logging(args.verbose)

    try:
        service = TetherService()
    except UnsupportedPlatformError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    try:
        return COMMANDS[args.command](service, args)
    except (AuthError, ConfigError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    except httpx.HTTPError as error:
        print(f"Error: could not reach Supabase ({error}).", file=sys.stderr)
        return 1
    except APIError as error:
        print(f"Error: Supabase rejected the request ({error.message}).", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
