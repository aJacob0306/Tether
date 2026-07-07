# Tether Readiness Checklist

Use this before a closed beta and again before any public marketing push. The goal is to prove that the core loop is trustworthy: members join a tether, configure rules, track real work, and receive accurate board updates and alerts.

## Supabase

- Apply every SQL migration in `supabase/migrations/` in order, currently `001` through `020`.
- Confirm `tether_members.can_manage_allowlist` exists after `020_tether_member_permissions.sql`.
- Confirm `work_session_effective_end` exists after `019_work_session_effective_end.sql`; this prevents stale sessions from overstating focus time.
- Confirm Realtime is enabled for `active_tabs` and `work_sessions`.
- Confirm RLS is enabled on public tables that clients can access.
- Deploy `send-work-started-push` and set `SUPABASE_SERVICE_ROLE_KEY` as a Supabase function secret.

## Mobile App

- Configure the Supabase URL and publishable anon key for `tether-mobile`.
- Build with EAS for push testing; Expo Go is not enough for reliable push validation.
- Verify sign-up, sign-in, sign-out, create tether, join tether, rules, board, settings, and companion status screens.
- Register a push token on at least two real devices.
- Verify notifications are allowed at the OS level and visible while the app is backgrounded.

## Chrome Extension

- Copy `tether-extension/config.example.js` to `tether-extension/config.js` and set the Supabase URL and publishable anon key.
- Load the extension unpacked in Chrome for beta testing.
- Sign in with the same account used in the mobile app.
- Visit an allowlisted domain and confirm a row updates in `active_tabs`.
- Visit a non-allowlisted domain and confirm it does not appear on the board.
- Confirm the extension refreshes sessions after leaving Chrome idle and returning.

## Desktop Companion

- Copy `tether-desktop/config.example.js` to `tether-desktop/config.js` and set the Supabase URL and publishable anon key.
- Install dependencies on each target OS instead of copying `node_modules` across machines.
- On macOS, grant any required System Events or Accessibility permission.
- On Windows, verify the app can scan Start Menu shortcuts and read the foreground process.
- Confirm each signed-in device appears in `devices` and uploads detected apps to `detected_tools`.
- Add one detected app to a tether allowlist and confirm foreground usage creates a work session.

## Core Accuracy Tests

- Two users join the same tether and can see each other on the board.
- Creator adds an allowed website and an allowed desktop app.
- Member opens the allowed website; board changes to working within the expected refresh window.
- Member switches to a non-allowed website; board stops showing work after the stale threshold.
- Member opens an allowed desktop app; board and daily total update.
- Member closes browser/desktop companion abruptly; stale session cleanup prevents inflated totals.
- Push alert fires when a peer starts allowed work and does not spam repeated alerts.

## Distribution Readiness

- Prepare a short install guide for mobile, Chrome extension, and desktop companion.
- Decide whether beta users will use internal EAS builds, TestFlight, or another distribution path.
- Decide whether the Chrome extension stays unpacked for beta or moves to an unlisted Chrome Web Store item.
- Decide whether the desktop companion remains developer-run for beta or is packaged for macOS and Windows.

## Known Gaps To Resolve Before Marketing

- Add error tracking so production issues do not rely on screenshots or console logs.
- Add product analytics for the activation funnel.
- Clean up onboarding copy around why three clients exist.
- Run a one-week closed beta and fix only trust-breaking accuracy issues before widening the audience.
