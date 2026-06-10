# Tether Desktop Companion

Electron companion for desktop app support. It signs into Supabase, registers this Mac in `devices`, scans `/Applications` and `~/Applications`, uploads installed apps to `detected_tools`, and tracks the frontmost macOS app when it matches a tether allowlist rule.

## Setup

1. Apply Supabase migrations through `016_app_work_sessions.sql`.
2. Copy `config.example.js` to `config.js` and add your Supabase URL and publishable anon key.
3. Install and start:

```bash
npm install
npm start
```

After sign-in, the app registers the desktop device, uploads detected apps, and starts watching for allowlisted foreground apps. macOS may ask for Accessibility/System Events permission so Tether can read the frontmost app.
