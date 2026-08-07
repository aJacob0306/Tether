"""Window tests.

The Tk tests are skipped wherever no display is available (CI, a locked Mac, a
headless build machine), so the suite stays runnable everywhere.
"""

import pytest

from tether_desktop.models import SyncResult
from tether_desktop.tracker import TrackerStatus
from tether_desktop.ui.window import _describe_sync


def tk_available() -> bool:
    """Probe for a usable display in a subprocess.

    Creating a root window without a window server does not raise on macOS, it aborts
    the process, which would take the whole test run down instead of skipping.
    """
    import subprocess
    import sys

    probe = subprocess.run(
        [sys.executable, "-c", "import tkinter; tkinter.Tk().destroy()"],
        capture_output=True,
        timeout=30,
    )
    return probe.returncode == 0


needs_display = pytest.mark.skipif(not tk_available(), reason="no display available")


class TestDescribeSync:
    def test_pluralises_correctly(self):
        assert _describe_sync(SyncResult(1, 1, "now")) == "Synced 1 app (1 detected)."
        assert _describe_sync(SyncResult(9, 5, "now")) == "Synced 5 apps (9 detected)."

    def test_zero_apps_reads_naturally(self):
        assert _describe_sync(SyncResult(0, 0, "now")) == "Synced 0 apps (0 detected)."


@needs_display
class TestWindow:
    @pytest.fixture
    def window(self):
        from tether_desktop.ui.window import TetherWindow

        instance = TetherWindow()
        yield instance
        instance._root.destroy()

    def test_starts_on_the_sign_in_form(self, window):
        window._render_signed_out()
        window._root.update()

        assert window._sign_in_frame.winfo_ismapped()
        assert not window._signed_in_frame.winfo_ismapped()

    def test_signing_in_swaps_the_panels(self, window):
        window._render_signed_in({"email": "a@b.c"}, {"display_name": "Machine"})
        window._root.update()

        assert window._signed_in_frame.winfo_ismapped()
        assert not window._sign_in_frame.winfo_ismapped()
        assert window._email_label_var.get() == "a@b.c"
        assert window._device_label_var.get() == "Registered device: Machine"

    def test_falls_back_when_no_device_is_registered(self, window):
        window._render_signed_in({"email": "a@b.c"}, None)

        assert window._device_label_var.get() == "Device will register on next sync."

    def test_tracker_updates_cross_the_thread_boundary(self, window):
        window._tracker_status(TrackerStatus("Tracking Cursor.", "working", "Cursor"))
        window._drain_results()

        assert window._tracking_var.get() == "Tracking Cursor."

    def test_busy_state_disables_the_buttons(self, window):
        window._set_busy(True, "Working...")
        assert str(window._sign_in_button["state"]) == "disabled"
        assert window._status_var.get() == "Working..."

        window._set_busy(False)
        assert str(window._sign_in_button["state"]) == "normal"

    def test_sign_in_requires_both_fields(self, window):
        window._email_var.set("")
        window._password_var.set("")
        window._on_sign_in()

        assert window._status_var.get() == "Enter your email and password."
