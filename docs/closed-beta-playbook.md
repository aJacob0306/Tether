# Closed Beta Playbook

Run this before marketing. Tether depends on user trust, so the beta should measure whether the app accurately reflects focused work instead of whether the idea sounds interesting.

## Beta Scope

- Recruit 3 to 5 people who will actually use the same tether for one week.
- Prefer one mixed group with different machines: at least one macOS user, one Windows user if available, and multiple Chrome users.
- Keep the beta private. Do not optimize landing pages, pricing, or growth loops yet.
- Use one project or study goal so the allowlist is easy to reason about.

## Setup Script

1. Install the mobile app on each user's phone.
2. Create one tether and invite every beta user.
3. Have each user sign into the Chrome extension.
4. Have each desktop user sign into the desktop companion.
5. Add 3 to 6 allowed websites and apps that the group expects to use.
6. Ask each user to do one short tracked session while everyone watches the board.

## What To Measure

- Activation: user signs up, joins a tether, installs at least one companion, and completes a first tracked session.
- Accuracy: board status matches what the user is actually doing.
- Timeliness: board updates quickly enough to feel live.
- Notifications: peers receive one useful alert when someone starts working, without repeated noise.
- Comprehension: users understand why mobile, extension, and desktop companion all exist.
- Trust: users believe the app is tracking only allowlisted work.

## Daily Test Prompts

Ask each beta user these questions once per day:

- Did Tether show you as working when you were not?
- Did Tether miss a session when you were working on an allowed target?
- Did the timer or daily total feel obviously wrong?
- Did you receive too many, too few, or confusing notifications?
- Was there any setup step you could not complete without help?

## Accuracy Test Cases

- Open an allowed website in Chrome and confirm the board changes to working.
- Switch from the allowed website to a non-allowed website and confirm the board stops showing active work after the expected stale window.
- Leave Chrome idle and return to an allowed website.
- Close Chrome while a work session is open.
- Open an allowed desktop app and confirm it appears on the board.
- Switch from an allowed desktop app to a non-allowed app.
- Sleep and wake the laptop while the desktop companion is running.
- Use two members at the same time and confirm the board does not mix up users.

## Bug Severity

- P0: privacy or security issue, such as exposing non-allowlisted activity or another user's private data.
- P1: trust-breaking accuracy issue, such as inflated focus time, missed allowed sessions, stale status that persists too long, or notification spam.
- P2: onboarding or comprehension issue that blocks a normal user from setup.
- P3: polish issue, confusing copy, visual glitch, or nice-to-have improvement.

During beta, fix P0 and P1 immediately. Fix P2 if it blocks multiple users. Defer P3 until after the one-week test so the product direction is not driven by cosmetic noise.

## Exit Criteria

Tether is ready for a wider private beta when:

- Every beta user can complete setup without direct developer intervention.
- At least 80 percent of expected work sessions are captured correctly.
- No P0 issues remain.
- No unresolved P1 issue affects the main tracking loop.
- Push alerts are useful and not perceived as spam.
- Users can explain what a tether, allowed target, board status, extension, and desktop companion are.

## Feedback Log Template

Use one issue per tracker item with these fields:

- Date
- User
- Platform
- Scenario
- Expected behavior
- Actual behavior
- Severity
- Status
