# Outreach Desk 2 validation

## Confirmed hard reset of wait and quota counters — October 26, 2026

Settings now offers **Hard reset wait & quotas** with a warning and explicit confirmation. Confirmation clears the countdown/rest counter and starts fresh minimum-interval and hourly/24-hour accounting for the selected mailbox. A durable accounting ID separates future attempts from preserved historical attempts, including seed history, without relying on clocks or deleting records. New sends again enforce the configured limits. An active queue can proceed immediately; a stopped queue remains stopped. The shared coordinator supports an authenticated `reset-pacing` action and persists its accounting ID; claims use that ID and continue to enforce recipient reservations, uncertain outcomes, and suppression. An older coordinator must be updated before a shared hard reset can succeed. The existing unflagged API reset remains available as a soft reset for compatibility.

`FC_BROWSER_TESTS=1 npm test`: **96 passed** (89 Node, 7 Python), with no failures or skips. New coverage confirms override despite exhausted hourly/daily quotas and a six-hour minimum interval, unchanged historical/seed/suppression data, persistence across restart, resumed limits after a new send, selected-mailbox scope, stopped-state preservation, and shared coordinator claims after reset. Browser tests verify the warning, cancel without mutation, confirmed override, and desktop/mobile controls. Coordinator tests verify persisted resets, same-clock-tick attempt accounting, and retained uncertain/duplicate/suppression blocks. UI build, changed JavaScript syntax checks, and `git diff --check` passed. All sends used fake mail and temporary fixtures; the affected other PC and native Windows execution were not accessed or verified.

## Firebase 24/7 open telemetry sync and UI modular architecture — October 21, 2026

Integrated dual Firebase Realtime Database and Google Cloud Firestore open telemetry synchronization (`src/firebase-sync.mjs`) to capture email opens 24/7 without requiring ngrok, public inbound ports, or 24/7 workstation uptime. Added automatic service account auto-discovery (`data/firebase-service-account.json`), configurable Automatic vs Manual sync modes, dashboard "Sync Firebase" trigger button, and live worker status telemetry. Reorganized dashboard frontend into a modular source structure under `src/ui/` with automated compilation (`npm run build:ui`).

`FC_BROWSER_TESTS=1 npm test`: **86 passed** (79 Node tests, 7 Python tests), with 0 failures and 0 skipped.
- **Firebase open telemetry**: Unit tests verify graceful startup when unconfigured, Realtime Database syncing with local `openIndex` reconciliation, Cloud Firestore batch commits, multi-PC filtering via `FC_TRACKING_PC_ID`, manual mode pause enforcement, and error resilience.
- **Process lifecycle & single-instance locking**: Unit coverage validates `scripts/launch.mjs` handling active instances, graceful process termination (`--close`, `--stop`), restart (`--restart`), and stale lock recovery (`data/app.lock`).
- **Management & compliance features**: Tests verify mailbox profile management, suppression list additions and unsuppression removal with team coordinator synchronization, template JSON export/import, surgical Excel lead deletion (`/api/delete-leads`), lead preview drawers, sending pace anti-spam presets, live activity event filtering/export/clear, and reset wait.
- **Full browser checks**: Headless Chrome tests verify saved persistent browser profiles, session restoration, challenge states, CDP discovery and attach/detach, composer signature snapshotting and tamper detection, marker/pixel insertion, seed testing workflow, and tracking dashboard responsive UI.
- **Build & packaging**: `npm run build:ui` successfully compiles modular CSS, HTML partials, and JS modules into `public/`. `npm run doctor` and `python3 scripts/bundle.py` pass cleanly.

All automated verification used synthetic local fixtures and mock adapters; no real outreach emails were sent. Native Windows execution remains unverified locally.

## Optional template checks — October 20, 2026

Promotional-claim and over-180-word checks now default to advisory notes that allow outreach to continue. Mailbox & Settings provides independent Warn only / Stop before sending / Off choices and an Enable template checks switch that retains the individual choices. Settings apply consistently to template-save feedback, lead previews, manual preparation, selected batches, and continuous outreach. Existing workspaces receive advisory defaults; stopped queues require an explicit restart.

`FC_BROWSER_TESTS=1 npm test`: **82 passed** (75 Node, 7 Python), no failures or skips. New regression coverage verifies default/migrated settings, mixed modes, invalid setting rejection, manual and continuous sends with advisories, strict selected-batch blocking before an attempt, disabled preview/save feedback, restart persistence, and desktop Chrome settings save/reload with no JavaScript errors. Existing signature, suppression, uncertain-send, shared-coordinator, quota, and workbook tests pass. UI build, changed JavaScript syntax checks, and `git diff --check` passed. All sending used fake mail in temporary workspaces; no real emails were sent. Native Windows execution remains unverified.

## Queue reset feedback and long timers — October 26, 2026

Reset and the queue runner now share the calculation of required waits from mailbox/seed history and shared team history. Optional Waiting/Resting timers clear; required minimum intervals are labelled **Minimum interval**, and exhausted allowances identify the hourly or rolling 24-hour cap. The reset response includes `waitCleared` and the resulting job, so it no longer promises a cleared timer when a required wait remains. Settings shows the reason and full next check date/time. Long timers render hours explicitly, and resetting also resets the live countdown progress baseline. The runner rechecks its operation lock after asynchronous connection validation to avoid overlapping a reset/settings operation.

`FC_BROWSER_TESTS=1 npm test`: **84 Node tests and 7 Python tests passed**, without failures or skips. Additional required-wait unit coverage subsequently passed in the 13-test automation unit suite. New integration tests clear six-hour Waiting and Resting timers and confirm that the queue progresses using fake mail. They also verify a six-hour daily allowance across restart, a required minimum interval, preserved uncertainty/suppression, and desktop/mobile settings feedback. UI build, changed JavaScript syntax checks, and `git diff --check` passed. All sending used synthetic workspaces and fake mail. The affected other PC and native Windows execution were not accessed or verified.

## Reset current wait — October 20, 2026

Settings → Sending Pace & Quotas now shows the current queue countdown and a Reset current wait button. The action clears the scheduled check and rest counter, rechecks an active queue, and keeps a stopped queue stopped. Minimum send intervals, rolling allowances, shared coordinator checks, send history and blocked recipients remain in effect. The action is disabled during another operation or with a prepared message open.

`FC_BROWSER_TESTS=1 npm test`: **79 passed** (72 Node, 7 Python), with no failures or skips. New API checks verify persistence across restart, preserved uncertain-send history and suppression, no automatic sends, and reapplication of an exhausted hourly allowance. Chrome UI checks exercise the Settings action at 1440px and 390px, visible countdown status, post-reset disabled state, no page overflow, and no JavaScript errors. UI build, JavaScript syntax checks and `git diff --check` passed. All new checks use temporary synthetic workspaces; no live mailbox or production workspace was used. Native Windows execution remains unverified.

## Compose without a signature — October 20, 2026

Owen's live mailbox had a working Composer iframe but no configured signature. Preparation previously waited for a nonexistent `.spm-signature-block` before inserting the body. The adapter now snapshots all signature blocks, including an empty list, and verifies that the snapshot remains unchanged during insertion and before Send. The preview explicitly identifies mailboxes without a signature.

Verified body insertion and pre-send validation in the affected live mailbox using an unsent diagnostic message addressed to the same mailbox. The diagnostic was discarded; no email was sent and no mailbox settings were changed. `FC_BROWSER_TESTS=1 npm test`: **77 passed** (70 Node, 7 Python), no failures or skips. Regression coverage includes no signature, preserving existing signatures, and blocking added, edited, removed, or duplicate signature blocks. JavaScript syntax checks and `git diff --check` passed. Browser verification ran on macOS; native Windows execution remains unverified.

## Browser sessions — October 19, 2026

Follow-up sandbox correction: explicitly enable `chromiumSandbox: true` for app-launched persistent browsers. The previous launch inherited Playwright's sandbox-disabled default, causing Chrome's `--no-sandbox` warning. All 8 focused session tests passed on macOS after this correction, including a read of the running Chrome command line through `chrome://version` confirming no `--no-sandbox` or `--disable-setuid-sandbox`, persistent session reuse and CDP detach. Windows execution remains pending. Existing browser processes must be relaunched for the setting to take effect.

Validated on macOS with Node 20.20.2, Python 3.11.4 and the locked Playwright 1.64.0 package. `FC_BROWSER_TESTS=1 npm test`: **75 passed** (68 Node tests, 7 Python tests), no failures or skips. All browser and mail fixtures used temporary data and synthetic local inboxes. No real emails were sent or production mailbox settings changed.

Confirmed implementation faults in the previous code: each connection launched an ephemeral context; login/inbox selectors had a 45-second timeout before a challenge was explicitly handled; connection health relied on a cached authenticated flag. These are plausible contributors to the reported Windows incident. The exact Windows exception and original live Cloudflare challenge were not available, so that incident's complete cause is not confirmed.

- Real Chrome persistent profile: initial manual login, persistent cookie/localStorage recovery after browser restart without a password, optional password login, profile lock conflict without terminating the original browser, challenge state with the same tab kept open, operator continuation, wrong-account blocking, session expiration and closed-tab detection.
- Real Chrome CDP: attach to an authenticated mailbox, retain login storage, refuse ambiguous mailbox tabs, disconnect without closing the external browser or unrelated tabs, reconnect, and detect external browser shutdown.
- Local endpoint tests: discovery on entered/default ports, loopback-only validation, remote/credential/path rejection, HTTP redirects and unsafe WebSocket addresses rejected. Navigation timeout keeps the browser available; launch errors preserve profile data and omit raw browser logs.
- Settings API and startup: defaults migrate, password is optional, connection settings persist, existing saved profiles restore on startup, missing profiles wait for connection, and disabling startup restoration is respected.
- Actual UI interaction at 1440 and 390 pixels: switch methods, show/hide CDP fields, change Chrome/Edge guide, discover/select a synthetic endpoint, save/reload preferences, connect with optional password, display session status, and avoid page-width overflow or script errors.
- Existing composer, signature, fresh-confirmation, uncertainty, queue, coordinator, tracking and workbook regression tests all pass. UI build, syntax checks, dependency/lockfile consistency and `git diff --check` pass.

Windows paths/PowerShell commands (including spaces and apostrophes) have portable unit coverage. `.github/workflows/test.yml` schedules native macOS/Windows Chrome tests and a Windows Edge session run when pushed or manually dispatched; these jobs have not been executed in this local session. Native Windows/Edge operation and the original live Cloudflare/Namecheap flow remain unverified. Persistent sessions cannot guarantee challenge clearance or provider login lifetime.

The sections below are historical validation records for earlier versions.

Validated on October 10, 2026 on macOS with Node 20.20.2 and Python 3. No additional real emails were sent during the version 2 upgrade.

## Automated checks

`npm test`: **34 passed** (28 Node tests, 6 Python tests).

- New installations have no fixed customer, mailbox, lead workbook, or suppression addresses.
- Sixteen template variants personalize the active profile, opt-out copy, and business details; selection respects enabled status, required lead fields, weights, and the previous selection.
- Random send gaps and longer rests obey configurable bounds.
- Mailbox-specific hourly and rolling 24-hour allowances pause processing rather than discard the queue.
- Continuous processing sends a synthetic workbook, waits after exhaustion, accepts another campaign, retains send history, and preserves both enabled and stopped states across restarts. Reconnection is required before a saved enabled queue resumes.
- Deleted templates stay deleted after restarting.
- Lost send confirmation stops the runner, records uncertainty, and blocks automatic retries after restart. Workbook repair never resends a confirmed message.
- Two independent worker servers using one local coordinator send three synthetic recipients exactly once each. Mailbox passwords never appear in the shared ledger.
- Concurrent coordinator claims permit only one owner; suppression, quotas, and minimum mailbox intervals are shared. Sending reservations never expire into eligibility. Restart converts unfinished Sending records into Uncertain.
- XLSX header aliases and explicit mappings work for import and status patching; unrelated ZIP parts, formulas, cell styles, and source files remain intact.

## Live local UI

- Migrated existing workspace shows 9,208 leads, 2,881 ready, 6,327 excluded, and both previously recorded sends. Existing suppression entries remain available.
- Confirmed 16 template options, token migration, unchanged saved settings, personalized lead preview, custom template creation and deletion, and the searchable send-history view.
- Browser console showed no application errors during these checks.
- Older version-1 attempts explicitly report that full body/template/signature details were not recorded then; no retrospective details were invented.
- Existing signature-preserving Private Email compose/send behavior was verified in version 1. Version 2 replaces fixed sender selectors with the saved active account. No additional real sends were used to exercise continuous mode.

## Distribution and limits

The archive contains only explicit source/documentation/launcher/test files. It excludes local data, originals, working workbooks, screenshots, customer history, mail sessions, node_modules, and team ledger/token files. macOS launcher execute permissions are included in the ZIP.

Windows setup/start scripts are supplied and reviewed but have not been executed on a Windows PC. macOS is the tested platform. Installation needs Node, Python, Chrome or Edge, and an npm dependency installation; this is not a standalone executable.

The tool can run continuously while the PC, server, browser, network, and mailbox session remain available. It does not install an OS background service or store mailbox passwords for reboot login. Team duplicate protection requires every PC to connect to one shared coordinator; no externally accessible coordinator was deployed. At that validation date, automatic reply/bounce reading and other providers' webmail adapters were not implemented. The October 14 update below adds optional DSN bounce monitoring; reply interpretation remains manual.


## Email tracking integration — October 14, 2026

Validated on macOS with Node 20.20.2 and Python 3 using isolated temporary workspaces. No real emails were sent and no production workspace, mailbox, or DNS records were changed during this integration.

- `FC_BROWSER_TESTS=1 npm test`: **62 passed** — 55 Node tests (including both real headless Chrome checks) and 7 Python tests. No skipped tests in this run.
- Syntax checks passed for 27 JavaScript source/test/script files; `git diff --check` passed.
- Dependency installation audit reported zero vulnerabilities.
- Actual Playwright composer adapter against synthetic local HTML: original signature and message text retained, marker/pixel inserted, edited body blocked, fresh success notice required, stale notice rejected before Send. External pixel requests were intercepted locally.
- Dashboard at 1440×1100 and 390×844: evidence rows, hard-bounce filter, message details, monitor configuration, and scrolling to the DNS form worked; no application JavaScript errors or page-width overflow. Screenshots are in ignored `outputs/tracking-desktop.png` and `outputs/tracking-mobile.png`.
- Local HTTP workflow with fake sending: pending → webmail-confirmed, independent unknown delivery/open signals, pixel-only listener rejects admin routes, repeated requests deduplicate, seed plan key reuses the same records, repeated seed sends are blocked, manual spam evidence persists, and restart preserves all evidence and duplicate protection.
- Mocked mailbox checks cover hard/soft/multipart/encoded-header DSNs, duplicate processing, unrelated senders/recipients, ambiguous identifiers, delayed Sent reconciliation, read-only UID cursors, authorized Inbox/Spam placement, credential rules, TLS and retry backoff. Mocked DNS checks distinguish missing records from lookup failures.
- Existing queue, coordinator, template, profile, suppression and surgical workbook regression tests pass.

The first restricted run could not bind local test ports. The complete successful run used local-server/browser execution permission. An initial synthetic composer fixture lacked visible recipient-chip text; the fixture was corrected before the final all-green run.

Live Namecheap Sent-header/marker retention, real DSN behavior, seed-provider credentials/OAuth, public HTTPS tracking reachability, real domain authentication/alignment, and Windows execution remain unverified. Monitoring/open tracking default to disabled. OAuth token provisioning/refresh and external hosting require operator infrastructure. See `TRACKING.md` and `.env.example` for setup, the full changed-file manifest, and the designated-recipient end-to-end checklist.
