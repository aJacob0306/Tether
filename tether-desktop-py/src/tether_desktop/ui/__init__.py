"""Desktop user interface.

Two shells exist. The webview one is what people should see: it renders with the OS
webview so it can match the mobile app's design exactly. The Tkinter one is a plain
stdlib fallback for machines with no usable webview runtime — an old Windows install
without WebView2, mainly.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def run_window(prefer: str = "auto") -> int:
    """Open the desktop window.

    `prefer` is "auto", "web", or "basic". "auto" tries the webview and falls back to
    Tkinter, so a missing WebView2 runtime degrades instead of failing outright.
    """
    if prefer == "basic":
        from .window import main as run_basic

        return run_basic()

    from .webview_window import UnavailableError, main as run_web

    try:
        return run_web()
    except UnavailableError as error:
        if prefer == "web":
            raise

        logger.warning("Falling back to the basic window: %s", error)
        from .window import main as run_basic

        return run_basic()
