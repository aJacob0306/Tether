# PyInstaller spec. Build with: uv run pyinstaller packaging/tether_desktop.spec
#
# Run this on the operating system you are targeting; PyInstaller does not cross compile.

import sys

APP_NAME = "Tether Desktop"

# supabase and its dependencies resolve several submodules at runtime, so PyInstaller's
# static analysis does not find them on its own.
hidden_imports = [
    "webview",
    "supabase",
    "supabase_auth",
    "supabase_functions",
    "postgrest",
    "storage3",
    "realtime",
    "httpx",
    "h2",
    "websockets",
]

if sys.platform == "darwin":
    hidden_imports += ["AppKit", "Foundation", "Quartz", "objc"]
elif sys.platform == "win32":
    hidden_imports += ["win32api", "win32gui", "win32process", "win32com.client", "pythoncom", "psutil"]

analysis = Analysis(
    ["launcher.py"],
    pathex=["../src"],
    # The window loads these off disk, so they have to travel with the binary.
    datas=[("../src/tether_desktop/ui/web", "tether_desktop/ui/web")],
    hiddenimports=hidden_imports,
    excludes=["pytest", "matplotlib", "numpy", "tkinter.test"],
    noarchive=False,
)

pyz = PYZ(analysis.pure)

executable = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name=APP_NAME,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
)

collection = COLLECT(
    executable,
    analysis.binaries,
    analysis.datas,
    name=APP_NAME,
)

if sys.platform == "darwin":
    app = BUNDLE(
        collection,
        name=f"{APP_NAME}.app",
        bundle_identifier="com.tether.desktop",
        info_plist={
            "LSUIElement": False,
            "NSHighResolutionCapable": True,
            # Reading the frontmost app through NSWorkspace does not require this, but
            # macOS shows the string if anything ever escalates to Accessibility.
            "NSAppleEventsUsageDescription": "Tether reads which app is in the foreground "
            "so your tether peers can see when you are working.",
        },
    )
