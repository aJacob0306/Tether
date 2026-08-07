# Tether Desktop Companion (Python)

Desktop companion for **macOS and Windows**. It signs into Supabase, registers this
computer in `devices`, scans installed apps into `detected_tools`, and tracks the
frontmost app whenever it matches a tether allowlist rule.

This is a Python rewrite of the previous Electron companion. It talks to exactly the
same tables and RPCs, so the mobile app, the Chrome extension, and the database are
unchanged.

## Setup

You need [uv](https://docs.astral.sh/uv/). Install it with `curl -LsSf https://astral.sh/uv/install.sh | sh`.

```bash
cd tether-desktop-py
cp .env.example .env      # add your Supabase URL and publishable anon key
uv sync
```

`uv sync` creates a virtual environment and installs everything, including the right
Python version. There is no 100MB runtime download and nothing to rebuild per platform.

## Usage

```bash
uv run tether-desktop gui        # the desktop window
uv run tether-desktop sign-in    # sign in from the terminal
uv run tether-desktop track      # run the tracking loop in the foreground
uv run tether-desktop check      # read-only preflight, changes nothing
```

| Command | What it does |
|---|---|
| `gui` | Opens the window: sign in, refresh apps, sign out, live status |
| `gui --basic` | Forces the plain Tkinter fallback window |
| `sign-in` | Signs in, registers this computer, uploads detected apps |
| `sign-out` | Closes any open session and forgets the saved login |
| `sync` | Rescans installed apps and uploads them |
| `detect` | Lists installed apps **without** uploading |
| `status` | Shows sign-in, device, idle time, and foreground app |
| `check` | Read-only preflight of config, OS access, and Supabase |
| `track` | Runs the foreground-app tracking loop until Ctrl-C |

Add `-v` to any command for debug logging.

### Start here if something is wrong

`uv run tether-desktop check` walks the whole chain and writes nothing:

```
Configuration
  [ok] credentials present: https://xxxxx.supabase.co
Account
  [ok] saved session restored: you@example.com
This computer
  [ok] platform adapter: Mac (macos)
  [ok] foreground app: Cursor
  [ok] app discovery: 56 apps, 55 with icons
Supabase
  [ok] devices readable: 1 registered
  [ok] allowlist readable: 3 allowed apps
Matching
  [ok] 'Cursor' matches 'Cursor' in tether 1f2e...
```

## How it fits together

The OS-specific code and the user interface are both thin shells around logic that has
no idea which platform it is on, which is why the same tracker runs behind the CLI and
the window.

```
src/tether_desktop/
  config.py         env vars and the tracking intervals
  paths.py          local state files
  auth.py           sign in, sign out, session persistence
  devices.py        device registration and heartbeat
  detected_tools.py chunked upload of discovered apps
  matching.py       allowlist matching (pure functions)
  sessions.py       work_sessions and active_tabs writes
  notify.py         work-start push, with cooldown
  tracker.py        the polling state machine
  service.py        ties it together for both shells
  platforms/        darwin.py and win32.py behind one Protocol
  cli.py            terminal interface
  ui/webview_window.py  the desktop window
  ui/web/               its HTML, CSS, and JS
  ui/window.py          plain Tkinter fallback
```

## The window

The interface renders in the OS webview — WKWebView on macOS, WebView2 on Windows — so it
can match the mobile app exactly. `ui/web/styles.css` copies the tokens from
`tether-mobile/constants/theme.ts`: the `#0d0e0f` background, `#1b1c1d` cards with 1px
`#2d2f31` borders and 16px corners, the `#945cb4` purple accent, and pill badges that turn
green while you are working. Keep that file in sync if the mobile palette changes.

All state lives in Python. Each bridge method returns the complete view state and the
front end just paints it, so there is no second copy of the truth to drift.

`ui/window.py` is a Tkinter fallback for machines with no webview runtime. `gui` picks the
webview and silently falls back; `gui --basic` forces the fallback. It is deliberately
plain — Tkinter cannot draw rounded corners or pill badges without canvas hacks.

State lives in the same place the Electron app used, so both versions can read each
other's `device.json`, `session.json`, and `tracking-state.json`:

- macOS: `~/Library/Application Support/tether-desktop/`
- Windows: `%APPDATA%\tether-desktop\`

## Platform notes

### macOS

Scans `/Applications` and `~/Applications`. The frontmost app comes from `NSWorkspace`,
which — unlike the AppleScript the Electron version used — does **not** trigger an
Accessibility permission prompt.

Two things this version finds that the Electron one missed: apps reached through a
symlink (Safari lives behind one), and apps whose `Info.plist` contains binary data
(the `plutil` call the old version used failed on those and lost the bundle identifier).

### Windows

Discovers apps from Start Menu and desktop shortcuts, the uninstall and App Paths
registry keys, a depth-limited scan of Program Files and LocalAppData, Steam libraries,
and running processes.

The PowerShell version built its "skip bundled helper binaries" pattern as
`\(bin|...)\`, which .NET rejects as an invalid regular expression. Because every use of
it sat inside a `try/catch`, the recursive executable scan, the Steam scan, and the
process scan all silently found nothing. That pattern is correct here, so **expect a
noticeably larger app inventory on Windows** than the Electron companion produced.

> The Windows adapter's pure helpers are unit tested, but the adapter itself has not yet
> been run on real Windows hardware. Verify with `tether-desktop check` and
> `tether-desktop detect` before handing it to beta testers.

## Known gap: sleep and lock

Electron's `powerMonitor` provided free `suspend`, `lock-screen`, and `shutdown` events.
Python has no cross-platform equivalent, so this version relies on the idle check
(2 minutes, with a 30 second grace period) plus a signal handler that closes the open
session on quit. In practice a session can stay open slightly longer after a lid close
than it used to, until the idle threshold catches it. Native sleep and lock events are
a worthwhile follow-up: `NSWorkspace` notifications on macOS, `WM_POWERBROADCAST` on
Windows.

## Development

```bash
uv run pytest          # 172 tests
uv run pytest -q -rs   # show why anything skipped
```

The Tkinter tests skip automatically when no display is available. Everything else runs
anywhere: the webview window is tested through its state dict with a stub service, so it
needs no display or webview runtime, and `platforms/win32.py` defers its Windows-only
imports so its helper tests run on macOS.

Worth reading first: `matching.py` and `tests/test_matching.py`, which cover the logic
that decides whether work counts, then `tracker.py` for the session state machine.

## Packaging

```bash
uv sync --group package
cd packaging
uv run pyinstaller tether_desktop.spec --noconfirm --distpath ../dist --workpath ../build
```

On macOS this produces `dist/Tether Desktop.app` at about **70 MB**, roughly a third of
the Electron build. PyInstaller does not cross compile, so the Windows `.exe` has to be
built on Windows with the same command.

The checked-in `packaging/tether_desktop.spec` lists the supabase submodules explicitly,
because they are resolved at runtime and PyInstaller's static analysis cannot see them.
If you upgrade `supabase`, launch the built app once and watch for `ModuleNotFoundError`.
It also copies `ui/web/` in as data, since the window loads those files off disk.

A packaged app has no source tree beside it, so it reads `.env` from the user data
directory instead — `~/Library/Application Support/tether-desktop/.env` on macOS,
`%APPDATA%\tether-desktop\.env` on Windows. `TETHER_ENV_FILE` overrides both.

### Shipping it to other people

Neither platform will run an unsigned build smoothly, and neither step is done yet:

- **macOS** needs codesigning and notarization through an Apple Developer account
  ($99/year). Without it, Gatekeeper blocks the app on any Mac but the one that built
  it. Roughly: `codesign --deep --options runtime --sign "Developer ID Application: ..."`,
  then `xcrun notarytool submit`, then `xcrun stapler staple`.
- **Windows** shows a SmartScreen warning until the `.exe` is signed with an
  Authenticode certificate and accumulates download reputation. An EV certificate skips
  the reputation wait.

Until then, running from source with `uv run tether-desktop gui` avoids both problems
entirely, which is the recommended path for now.
