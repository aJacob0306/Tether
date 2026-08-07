"""Fallback Tkinter window.

`webview_window.py` is the interface people should see. This one exists for machines with
no usable webview runtime — an old Windows install without WebView2, mainly. It is plain
on purpose: Tkinter cannot round a corner or draw a pill badge without canvas hacks, so
it aims to be usable rather than to match the mobile design.

Tkinter ships with Python, so this fallback adds no dependency.

This module is a shell. Everything it does goes through `TetherService`, which is what
makes it replaceable with the webview window or a future menu bar interface.

Tk widgets may only be touched from the thread that owns the event loop, so all Supabase
and filesystem work runs on a worker thread and results are marshalled back with
`root.after`.
"""

from __future__ import annotations

import queue
import threading
import tkinter as tk
from tkinter import ttk
from typing import Any, Callable

from ..auth import SessionUnavailableError
from ..config import ConfigError
from ..platforms.base import UnsupportedPlatformError
from ..service import TetherService
from ..tracker import TrackerStatus

WINDOW_TITLE = "Tether Desktop"
WINDOW_SIZE = "520x680"
MIN_SIZE = (460, 560)
PADDING = 16


class TetherWindow:
    def __init__(self) -> None:
        self._root = tk.Tk()
        self._root.title(WINDOW_TITLE)
        self._root.geometry(WINDOW_SIZE)
        self._root.minsize(*MIN_SIZE)

        self._results: queue.Queue[Callable[[], None]] = queue.Queue()
        self._service: TetherService | None = None
        self._startup_error: str | None = None

        self._build_widgets()

        try:
            self._service = TetherService(on_status=self._tracker_status)
        except (UnsupportedPlatformError, ConfigError) as error:
            self._startup_error = str(error)

    # -- layout ---------------------------------------------------------

    def _build_widgets(self) -> None:
        container = ttk.Frame(self._root, padding=PADDING)
        container.pack(fill="both", expand=True)

        ttk.Label(container, text="TETHER DESKTOP", foreground="#6b7280").pack(anchor="w")
        ttk.Label(
            container, text="Discover installed apps", font=("", 20, "bold")
        ).pack(anchor="w", pady=(4, 4))
        ttk.Label(
            container,
            text=(
                "Sign in with your Tether account to register this computer and upload "
                "installed apps for mobile tether setup."
            ),
            wraplength=460,
            foreground="#4b5563",
            justify="left",
        ).pack(anchor="w", pady=(0, PADDING))

        self._sign_in_frame = self._build_sign_in(container)
        self._signed_in_frame = self._build_signed_in(container)

        self._status_var = tk.StringVar(value="Checking session...")
        self._tracking_var = tk.StringVar(value="Sign in to start tracking allowlisted apps.")
        self._build_status_card(container, "Discovery status", self._status_var)
        self._build_status_card(container, "Active app tracking", self._tracking_var)

    def _build_sign_in(self, parent: ttk.Frame) -> ttk.Frame:
        frame = ttk.LabelFrame(parent, text="Sign in", padding=PADDING)

        ttk.Label(frame, text="Email").pack(anchor="w")
        self._email_var = tk.StringVar()
        email_entry = ttk.Entry(frame, textvariable=self._email_var)
        email_entry.pack(fill="x", pady=(2, 10))

        ttk.Label(frame, text="Password").pack(anchor="w")
        self._password_var = tk.StringVar()
        password_entry = ttk.Entry(frame, textvariable=self._password_var, show="\u2022")
        password_entry.pack(fill="x", pady=(2, 12))

        self._sign_in_button = ttk.Button(
            frame, text="Sign in and sync apps", command=self._on_sign_in
        )
        self._sign_in_button.pack(fill="x")

        for widget in (email_entry, password_entry):
            widget.bind("<Return>", lambda _event: self._on_sign_in())

        return frame

    def _build_signed_in(self, parent: ttk.Frame) -> ttk.Frame:
        frame = ttk.LabelFrame(parent, text="Signed in", padding=PADDING)

        self._email_label_var = tk.StringVar()
        self._device_label_var = tk.StringVar()
        ttk.Label(frame, textvariable=self._email_label_var, font=("", 13, "bold")).pack(anchor="w")
        ttk.Label(frame, textvariable=self._device_label_var, foreground="#6b7280").pack(
            anchor="w", pady=(2, 12)
        )

        self._sync_button = ttk.Button(frame, text="Refresh detected apps", command=self._on_sync)
        self._sync_button.pack(fill="x", pady=(0, 6))
        self._sign_out_button = ttk.Button(frame, text="Sign out", command=self._on_sign_out)
        self._sign_out_button.pack(fill="x")

        return frame

    def _build_status_card(self, parent: ttk.Frame, title: str, variable: tk.StringVar) -> None:
        frame = ttk.LabelFrame(parent, text=title, padding=PADDING)
        frame.pack(fill="x", pady=(PADDING, 0))
        ttk.Label(frame, textvariable=variable, wraplength=440, justify="left").pack(anchor="w")

    # -- rendering ------------------------------------------------------

    def _render_signed_out(self) -> None:
        self._signed_in_frame.pack_forget()
        self._sign_in_frame.pack(fill="x")
        self._tracking_var.set("Sign in to start tracking allowlisted apps.")

    def _render_signed_in(self, session: dict[str, Any] | None, device: dict[str, Any] | None) -> None:
        self._sign_in_frame.pack_forget()
        self._signed_in_frame.pack(fill="x")
        self._email_label_var.set((session or {}).get("email") or "Signed in")
        self._device_label_var.set(
            f"Registered device: {device['display_name']}"
            if device and device.get("display_name")
            else "Device will register on next sync."
        )

    def _set_busy(self, busy: bool, label: str | None = None) -> None:
        state = "disabled" if busy else "normal"
        for button in (self._sign_in_button, self._sync_button, self._sign_out_button):
            button.configure(state=state)
        if busy and label:
            self._status_var.set(label)

    # -- threading ------------------------------------------------------

    def _tracker_status(self, status: TrackerStatus) -> None:
        """Called from the tracker thread; hand the update to the Tk thread."""
        self._results.put(lambda: self._tracking_var.set(status.message))

    def _drain_results(self) -> None:
        while True:
            try:
                self._results.get_nowait()()
            except queue.Empty:
                break
            except Exception:  # noqa: BLE001 - a bad callback must not kill the loop
                pass
        self._root.after(100, self._drain_results)

    def _run_in_background(
        self, work: Callable[[], Any], on_success: Callable[[Any], None], busy_label: str
    ) -> None:
        self._set_busy(True, busy_label)

        def worker() -> None:
            try:
                result = work()
            except Exception as error:  # noqa: BLE001 - surfaced in the status line
                message = str(error) or error.__class__.__name__
                self._results.put(lambda: self._finish(lambda: self._status_var.set(message)))
                return
            self._results.put(lambda: self._finish(lambda: on_success(result)))

        threading.Thread(target=worker, daemon=True).start()

    def _finish(self, action: Callable[[], None]) -> None:
        try:
            action()
        finally:
            self._set_busy(False)

    # -- actions --------------------------------------------------------

    def _on_sign_in(self) -> None:
        if not self._service:
            return

        email = self._email_var.get().strip()
        password = self._password_var.get()
        if not email or not password:
            self._status_var.set("Enter your email and password.")
            return

        service = self._service

        def on_success(result: dict[str, Any]) -> None:
            self._password_var.set("")
            self._render_signed_in(result["session"], result["device"])
            self._status_var.set(_describe_sync(result["sync"]))

        self._run_in_background(
            lambda: service.sign_in(email, password),
            on_success,
            "Signing in, registering this computer, and scanning apps...",
        )

    def _on_sync(self) -> None:
        if not self._service:
            return
        service = self._service
        self._run_in_background(
            service.sync_detected_apps,
            lambda sync: self._status_var.set(_describe_sync(sync)),
            "Scanning installed apps...",
        )

    def _on_sign_out(self) -> None:
        if not self._service:
            return
        service = self._service

        def on_success(_result: Any) -> None:
            self._render_signed_out()
            self._status_var.set("Signed out.")

        self._run_in_background(service.sign_out, on_success, "Signing out...")

    def _load_initial_state(self) -> None:
        if self._startup_error:
            self._render_signed_out()
            self._status_var.set(self._startup_error)
            self._set_busy(True)
            return

        service = self._service
        assert service is not None

        def work() -> dict[str, Any]:
            try:
                service.bootstrap()
            except SessionUnavailableError as error:
                return {"offline": str(error), **service.get_status()}
            return service.get_status()

        def on_success(status: dict[str, Any]) -> None:
            if status.get("offline"):
                self._render_signed_out()
                self._status_var.set(status["offline"])
                return

            if status["session"]:
                self._render_signed_in(status["session"], status["device"])
                self._status_var.set("Ready to refresh detected apps.")
                self._tracking_var.set(
                    f"Tracking {status['tracking']['target_label']}."
                    if status["tracking"]["target_label"]
                    else "Watching for allowlisted desktop apps."
                )
                return

            self._render_signed_out()
            self._status_var.set("Sign in to register this computer and upload installed apps.")

        self._run_in_background(work, on_success, "Checking session...")

    def _on_close(self) -> None:
        if self._service:
            self._service.shutdown("Desktop companion is quitting")
        self._root.destroy()

    def run(self) -> int:
        self._render_signed_out()
        self._root.protocol("WM_DELETE_WINDOW", self._on_close)
        self._root.after(100, self._drain_results)
        self._root.after(50, self._load_initial_state)
        self._root.mainloop()
        return 0


def _describe_sync(sync) -> str:
    plural = "" if sync.uploaded_count == 1 else "s"
    return f"Synced {sync.uploaded_count} app{plural} ({sync.detected_count} detected)."


def main() -> int:
    return TetherWindow().run()


if __name__ == "__main__":
    raise SystemExit(main())
