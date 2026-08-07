# Tether Desktop Companion (Electron — being replaced)

> **This version is being retired.** The companion has been rewritten in Python at
> [`../tether-desktop-py/`](../tether-desktop-py/), which reads and writes the same
> tables and RPCs. Use the Python version for new work; this one stays only until the
> rewrite has been verified on real Windows hardware.
>
> Do not run both at once on the same machine. They share `device.json`,
> `session.json`, and `tracking-state.json`, and would each try to own the tracking
> session.

Electron companion for desktop app support on **macOS and Windows**. It signs into Supabase, registers this computer in `devices`, scans installed apps, uploads them to `detected_tools`, and tracks the frontmost app when it matches a tether allowlist rule.

## Setup

1. Apply Supabase migrations through `018_tether_peer_detected_tools.sql`.
2. Copy `.env.example` to `.env` and add your Supabase URL and publishable anon key.
3. Install and start **on the same machine** where you will run the app (do not copy `node_modules` from another OS):

```bash
npm install
npm start
```

On Windows, use **PowerShell** or **Command Prompt** in the `tether-desktop` folder. The first `npm install` downloads the Electron binary (~100MB) for your platform.

After sign-in, the app registers the desktop device, uploads detected apps, and starts watching for allowlisted foreground apps.

### Windows troubleshooting

**`Electron failed to install correctly`**

This means the Windows Electron binary was never downloaded. Common causes:

1. **`node_modules` copied from a Mac** — delete it and reinstall on Windows
2. **`npm install` interrupted** — network drop, antivirus, or closed terminal mid-install
3. **Blocked download** — corporate firewall/proxy

Fix (PowerShell, from `tether-desktop`):

```powershell
Remove-Item -Recurse -Force node_modules
npm install
npm start
```

If it still fails, retry the Electron download only:

```powershell
npm run fix-electron
npm start
```

If you're behind a strict proxy, set `HTTPS_PROXY` before `npm install`, or ask IT to allow `https://github.com/electron/electron/releases`.

Use **Node.js 20 or 22 LTS** if Node 24 causes install issues (`node -v` to check).

### macOS

- Scans `/Applications` and `~/Applications`
- macOS may ask for Accessibility/System Events permission so Tether can read the frontmost app

### Windows

- Scans Start Menu shortcuts for installed apps
- Uses PowerShell to read the foreground app process
- No extra permissions required for basic tracking

## Chrome extension (all platforms)

Browser activity is tracked separately via the [Chrome extension](../tether-extension/). Install it on any OS for allowlisted website sync.

## Cross-platform tethers

Each member runs the desktop companion on their machine and syncs apps. In the mobile app **Rules** tab, the tether creator can add detected apps from any member (Mac or Windows). Add your friend's Cursor/VS Code entry from their Windows inventory so their desktop work appears on the board.
