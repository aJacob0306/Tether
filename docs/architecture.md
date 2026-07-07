# Tether Architecture

Tether is a peer accountability app. The product promise is simple: a group agrees on allowed work targets, and members can see when each other is actively working on those targets.

The implementation has three clients and one managed backend:

- Mobile app: main user interface.
- Chrome extension: browser activity sensor.
- Desktop companion: desktop app activity sensor.
- Supabase: auth, database, permissions, realtime updates, RPCs, and the push edge function.

## System Diagram

```mermaid
flowchart TB
  subgraph clients [Clients]
    mobile[Mobile App]
    extension[Chrome Extension]
    desktop[Desktop Companion]
  end

  subgraph backend [Supabase]
    auth[Auth]
    database[(Postgres)]
    rls[RLS Policies]
    rpc[RPC Functions]
    realtime[Realtime]
    edgeFunction[Push Edge Function]
  end

  expoPush[Expo Push API]

  mobile --> auth
  mobile --> database
  mobile --> rpc
  mobile --> realtime
  extension --> auth
  extension --> database
  extension --> rpc
  extension --> edgeFunction
  desktop --> auth
  desktop --> database
  desktop --> rpc
  desktop --> edgeFunction
  database --> rls
  edgeFunction --> expoPush
  expoPush --> mobile
```

## What Each App Does

### Mobile App

Path: `tether-mobile/`

The mobile app is the main product. Users sign up, create or join tethers, manage rules, view the group board, inspect logs, register push tokens, and check companion status.

Important areas:

- `app/`: screens and routes.
- `components/`: board, rules, logs, and settings UI.
- `contexts/AuthContext.tsx`: mobile auth state.
- `hooks/useTetherBoard.ts`: board loading, realtime refresh, and polling fallback.
- `lib/`: Supabase client helpers for tethers, allowlists, members, push, status, and detected tools.

### Chrome Extension

Path: `tether-extension/`

The extension watches Chrome tabs, checks whether the active URL matches the user's allowlist, and syncs allowed browser work to Supabase. It is login-only; sign-up happens in the mobile app.

Important areas:

- `background.js`: extension lifecycle, tab/window/idle listeners, and alarms.
- `lib/api.js`: Supabase auth and REST/RPC calls.
- `lib/allowlist.js`: allowed target cache and URL matching.
- `lib/sync.js`: active tab and session sync.
- `lib/sessions.js`: browser work-session lifecycle.
- `lib/notify.js`: work-start push trigger.

### Desktop Companion

Path: `tether-desktop/`

The desktop companion watches foreground desktop apps. It also scans installed apps so tether creators can allowlist apps from each member's machine.

Important areas:

- `src/main.js`: Electron main process, auth, device registration, detected app upload, foreground tracking, and push trigger.
- `src/platform/darwin.js`: macOS app discovery and frontmost-app detection.
- `src/platform/win32.js`: Windows app discovery and foreground-process detection.
- `src/renderer/`: small desktop UI for sign-in and status.

### Supabase

Path: `supabase/`

Supabase is the backend. There is no separate Node, Express, or Next.js API server.

Important areas:

- `migrations/`: database schema, RLS policies, Realtime setup, and RPC functions.
- `functions/send-work-started-push/index.ts`: edge function that sends Expo push notifications to tether peers.

## Main Data Flow

1. A user signs up in the mobile app through Supabase Auth.
2. The user creates or joins a tether.
3. The tether creator adds allowed websites and desktop apps.
4. The Chrome extension and desktop companion fetch allowed targets through Supabase RPCs.
5. When a user opens an allowed target, the extension or companion writes activity to Supabase.
6. The mobile board reads current activity through RPCs and receives Realtime changes.
7. When work starts, the extension or companion calls the push edge function.
8. The edge function looks up peer push tokens and sends notifications through Expo Push.

## Core Tables

- `profiles`: user display names.
- `tethers`: groups.
- `tether_members`: group membership and delegated allowlist permissions.
- `active_tabs`: current browser activity snapshot.
- `work_sessions`: focus sessions for browser and desktop work.
- `tether_allowed_targets`: allowed domains and apps for a tether.
- `devices`: desktop companion devices.
- `detected_tools`: apps discovered by the desktop companion.
- `push_tokens`: mobile push tokens for Expo notifications.

## Why There Are Three Clients

The mobile app cannot read Chrome tabs or desktop foreground apps. The Chrome extension cannot scan installed desktop apps. The desktop companion cannot run inside Chrome's tab APIs. Each client owns the platform capability that only it can access.

This is why the current architecture is reasonable:

- Mobile owns product UI and push registration.
- Extension owns browser work detection.
- Desktop owns desktop app detection.
- Supabase owns shared state, permissions, and realtime delivery.

## What Should Stay Custom

These are part of Tether's product advantage and should not be replaced casually:

- Allowlist-gated work tracking.
- Peer board status.
- Browser tab detection.
- Desktop foreground-app detection.
- Tether membership and visibility rules.

## What Can Be Improved Later

These are not the core product and can be simplified with managed services if they become painful:

- Error tracking and product analytics.
- Notification orchestration.
- Branded auth emails.
- Desktop packaging and updates.
- More advanced authorization if roles become complex.

## Best Files To Read First

Start here if you are learning the codebase:

1. `README.md`
2. `docs/readiness-checklist.md`
3. `tether-mobile/hooks/useTetherBoard.ts`
4. `tether-mobile/lib/tethers.ts`
5. `tether-extension/background.js`
6. `tether-extension/lib/sync.js`
7. `tether-desktop/src/main.js`
8. `supabase/README.md`
9. `supabase/migrations/002_tethers.sql`
10. `supabase/functions/send-work-started-push/index.ts`
