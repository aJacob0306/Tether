# Tether Desktop Companion

Electron companion for desktop app support on **macOS and Windows**. It signs into Supabase, registers this computer in `devices`, scans installed apps, uploads them to `detected_tools`, and tracks the frontmost app when it matches a tether allowlist rule.

## Setup

1. Apply Supabase migrations through `018_tether_peer_detected_tools.sql`.
2. Copy `config.example.js` to `config.js` and add your Supabase URL and publishable anon key.
3. Install and start:

```bash
npm install
npm start
```

After sign-in, the app registers the desktop device, uploads detected apps, and starts watching for allowlisted foreground apps.

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
