# Observability Plan

Tether should add observability before marketing, but the first version should stay small. The goal is to see crashes, setup failures, and activation drop-off without turning the product into an analytics project.

## Recommendation

Use this minimal stack:

- Sentry for error tracking across mobile, extension, and desktop.
- PostHog for product analytics and funnel events.
- Supabase logs for database, auth, realtime, and edge function debugging.

Do not add Datadog, a custom logging backend, or a complex warehouse pipeline yet.

## Why This Stack

Sentry answers: "What broke, where, and for which release?"

PostHog answers: "Where do users drop out of setup, and are they reaching first tracked work?"

Supabase answers: "Did auth, RLS, RPCs, Realtime, or the push edge function fail?"

Together, those cover the main pre-marketing risks without replacing the existing Supabase architecture.

## Events To Track

Track only activation and trust-critical events at first:

- `signed_up`
- `signed_in`
- `tether_created`
- `tether_joined`
- `allowed_target_added`
- `extension_signed_in`
- `desktop_signed_in`
- `desktop_apps_synced`
- `first_work_session_started`
- `work_session_closed`
- `push_token_registered`
- `push_notification_sent`
- `push_notification_failed`

Avoid tracking raw URLs, page titles, app names, or anything outside the user's allowlist unless there is explicit consent and a clear product need.

## Properties To Include

Safe event properties:

- Platform: `ios`, `android`, `chrome_extension`, `macos`, `windows`.
- App version or extension version.
- Tether count, member count, and allowed-target count.
- Session source: `browser` or `desktop`.
- Error code or failure category.

Avoid:

- Full URLs.
- Browser tab titles.
- Foreground app window titles.
- Email addresses.
- Invite codes.
- Access tokens or Supabase keys.

## Sentry Rollout

Add Sentry in this order:

1. Mobile app: catch Expo/React Native crashes and route-level errors.
2. Desktop companion: catch tracking-loop errors, platform detection failures, and sync failures.
3. Chrome extension: catch service worker errors, auth refresh failures, and sync failures.
4. Edge function: log push delivery failures with request IDs and user-safe metadata.

For beta, route alerts to the developer only. After the app has more users, add issue ownership and release health dashboards.

## PostHog Rollout

Add PostHog after Sentry or at the same time if setup is quick.

Create one activation funnel:

1. Sign up.
2. Create or join tether.
3. Add or receive allowed target.
4. Sign into Chrome extension or desktop companion.
5. Start first tracked work session.
6. Return to board the next day.

This funnel is more useful than page-view tracking because Tether's risk is setup complexity, not content discovery.

## Beta Dashboard

Watch these numbers during the closed beta:

- Number of users who complete setup.
- Number of users with at least one tracked work session.
- Work sessions per user per day.
- Push success and failure count.
- Extension and desktop sync failures.
- Crash-free sessions by client.

## Privacy Guardrails

Tether is about accountability, so observability must not weaken trust.

- Track product events, not surveillance data.
- Keep raw activity data in Supabase under the existing RLS model.
- Redact or hash user identifiers before sending to analytics if full identity is not needed.
- Document analytics in onboarding or privacy copy before inviting non-test users.
