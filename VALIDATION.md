# Outreach Desk 2 validation

## Shared Conversations shell — 2.2.0-rc.5 — October 30, 2026

`FC_BROWSER_TESTS=1 FC_UI_SCREENSHOT_DIR=outputs/carrier-rc5-regression npm test` passed **186/186 JavaScript tests and 12/12 Python tests**, with no failures/skips. The existing Mailroom browser case now compares titlebar/sidebar/footer styles and dimensions with Templates on desktop and mobile, and checks unsaved text through cross-page navigation. All existing reply approval, stale evidence, import, capture and sender safeguards passed.

Removed route-specific header, navigation, footer, banner and notification styling. Conversations uses the actual common markup and responsive rules, plus the shared heading classes and page spacing. Only its content workspace has dedicated layout rules. Native in-app browser comparisons at **1089 × 910** and **390 × 844** confirmed matching shell geometry and no Conversations horizontal overflow. `design-qa.md` records the current shared-shell target and passed comparisons; the older Mailroom reference remains as history.

The candidate stays on `feat/import-repairs-carrier-conversations`. The sample preview uses isolated synthetic state, with sending and live capture disabled. No production-state or mailbox-setting migration, remote push, merge or deployment was performed. rc.4 remains available as the prior local checkpoint/package.

## Mailroom conversation workspace — 2.2.0-rc.4 — October 30, 2026

On `feat/import-repairs-carrier-conversations`, the final `FC_BROWSER_TESTS=1 FC_UI_SCREENSHOT_DIR=outputs/carrier-rc4-regression npm test` passed **186/186 JavaScript tests and 12/12 Python tests**, no failures/skips. JavaScript syntax checks passed for **92 files**, Python compilation for **2 files**, and `git diff --check` passed. An earlier regression run exposed an outdated release-count assertion (six entries); it now expects the seventh recorded package entry. No production code was changed to satisfy that count.

The focused integrated API/browser suite passed **9/9**. Added coverage verifies unsaved reply text through queues/search, exact Review saving, rejection of new carrier evidence inside the approval dialog, retained drafts, cleared acknowledgement on fresh review, Escape and mobile Back navigation. Existing checks cover reviewed import activation/recovery, opt-outs, source-backed detail confirmation, optional saved wording, exact approval/copy/cancellation, dashboard tracking and desktop/mobile bounds. Search covers header display names and text beyond the row excerpt; historical ordering uses effective message time rather than backfill capture order. Header names never become confirmed carrier details. The assistant suite passed **15/15**.

Manual native in-app browser verification used an isolated sample preview on port 4327, including desktop at **1487 × 1058** and mobile at **390 × 844**, DPR 1. Full-view and focused source/implementation comparisons were inspected together. The visual QA loop corrected queue button overrides, displaced review controls and narrow mobile sender wrapping; `design-qa.md` reports **passed**. Optional wording preview left the original free draft unchanged. Review displayed exact text, account and recipient and remained disabled without explicit acknowledgement/note. Browser warning/error logs were empty. Preview sending and live provider capture stayed disabled.

Package creation uses the explicit source allowlist, including the QA report but excluding screenshots, runtime state, real mail and secrets. A fresh extraction is checked against repository sources, version consistency, empty-workspace startup, built-in library, disabled capture and blocked preview sending. Native Windows, live provider history/retention and other-PC rollout remain unverified. Production `data/state.json` (October 29, 16:33:02) and `.env` (October 21, 00:33:44) remained unchanged. No remote push, main merge, deployment or real message sending was performed; Team work remains on its deferred experiment branch.

## Tool-started historical conversations and saved wording — 2.2.0-rc.3 — October 30, 2026

On `feat/import-repairs-carrier-conversations`, `FC_BROWSER_TESTS=1 FC_UI_SCREENSHOT_DIR=outputs/carrier-rc3-regression npm test` passed **184/184 JavaScript tests and 12/12 Python tests**, no failures/skips. The focused historical suite passed **13/13** checks; the integrated browser/API suite passed **8/8**. Sending, signatures, pacing, reservations, uncertainty, workbook recovery, coordinator and Firebase regression checks passed with synthetic fixtures.

New evidence covers full manual backfill beyond automatic page limits; old responses and duplicate archived copies; imported-only exclusions; deep Sent reconciliation; changed-address review; child-before-parent and cross-folder references; newer source anchors reopening old cursor ranges; older tracking sends; stop/resume; verified UID disappearance; failed-fetch cursor retention; mid-scan UIDVALIDITY/high-water reset; Drafts misconfiguration; stable incremental progress; reply elsewhere/recent-contact follow-up guards; preview without draft creation; one missing question; stale saved wording; and migration preserving custom/archived wording and approved bodies. Browser checks cover search, preview, intentional insertion, free editing, approval/copy/cancellation, dashboard routing and desktop/mobile bounds.

The UI and APIs report 2.2.0-rc.3. Packaging uses an explicit source allowlist; clean-extraction smoke checks run with a new empty synthetic data directory and already-installed dependencies. No installer download, native Windows acceptance, live provider authorization/retention, real carrier email or other-PC installation is claimed. Real `data/state.json` and `.env` are not used for testing. Stored earlier inbound-only evidence/protection remains retained even when excluded from the tool-send-scoped inbox.

Known limits: provider-retained folders/source evidence bound historical coverage; ambiguous bodies/headers need mailbox review; long/failed work remains visibly incomplete and resumable; counts are local contact/message evidence rather than signings. Final sending stays in the original mailbox and requires the human’s action. The separate Team work/ownership experiment remains excluded. Option 1’s full Mailroom layout is the next UI checkpoint.

## Carrier reply desk and complete capture — 2.2.0-rc.2 — October 29, 2026

Branch: `feat/import-repairs-carrier-conversations`. This candidate extends the reviewed import/conversation release without the deferred Team work experiment. No production deployment, main merge, remote push or other-PC installation was performed.

`FC_BROWSER_TESTS=1 FC_UI_SCREENSHOT_DIR=outputs/carrier-rc2-final npm test`: **170/170 JavaScript tests and 12/12 Python tests passed**, no failures or skips. The initial run found old catalog version/count expectations, which were updated for the new release entry. JavaScript syntax checks passed for **89 files**, Python compilation for **2 files**, and whitespace checks passed. Final assistant unit checks passed **14/14**, including a later IMAP Sent observation deduplicated against an EML copy. A separately added synthetic-coordinator test checks that draft approval/copy refresh shared protections and refuse a newly captured opt-out or unavailable coordinator. The final integrated API/browser suite passed **8/8** checks. Logs and desktop/mobile screenshots are under `outputs/carrier-rc2-*` in the development checkout (not shipped).

Coverage includes both no-response and unanswered-response queues; manual approval/copy without any reply-send endpoint; exact draft text/account/recipient/context binding; source/message changes and edited drafts invalidating approval; retained earlier draft/approval versions; cancellation; idempotent draft requests; template version conflicts and invalid/missing placeholders; opt-outs, uncertain local/shared sends and pending/changed-address matches; carrier-stated phone/equipment/ZIP and other details with source quotes, reviewed corrections and renewed conflicts; read/unread races; dashboard routing; known imported carriers starting reviewed inbound-only conversations; approval/report/Sent-copy evidence separation; new replies reopening attention; full-history bounded pages, references-only relevance, archives, Drafts exclusion, partial folder failures, stop/resume and cursor durability.

Chrome verification covers the existing import activation/recovery flow and the integrated reply desk at 1440px and 390px, with no page errors or external requests in the fixtures. The in-app browser was also used to review a known-carrier inbound message, create a reviewed conversation and generate an unapproved response asking for actual carrier-stated phone/equipment/ZIP confirmation. The screenshot `outputs/carrier-rc2-reply-preview.jpg` shows the sample reply desk. Preview uses isolated synthetic data with `FC_RELEASE_PREVIEW=1`; sending and live mailbox capture are blocked by the server. Actual `data/state.json` and `.env` were not changed.

Package/lockfile/catalog/UI report 2.2.0-rc.2. The versioned package and SHA-256 file are generated under `dist/`. The clean extraction smoke check verifies package-source consistency, empty-workspace startup, integrated views and blocked preview sending. Sources/tests/docs are included; runtime data, secrets, browser sessions and Team work files are excluded. Smoke uses the existing dependency runtime, so an installer download or Windows installation is not claimed.

Intent and detail extraction are transparent local rules with explicit human review, not a validated AI sales classifier or independent phone/authority verification. Final Send remains in the existing mailbox; approval alone is never submission or delivery. Mailbox coverage depends on configured identities, provider retention/folders and source references. Live provider authorization/headers, native Windows behavior, other-PC installation and cross-PC inbox/ownership remain unverified or excluded. No real carrier email was sent or fetched during these checks. See IMPORTS-AND-CONVERSATIONS.md for operation and coverage limits.

## Reviewed imports and carrier conversations — 2.2.0-rc.1 — October 29, 2026

Feature branch: `feat/import-repairs-carrier-conversations`, based on experiment 03 (`b4a0389`). Team work is excluded and retained on `feat/sales-experiments` (`5628fc0`). The release candidate is integrated into the normal app; no production deployment, main merge or team-PC installation has been performed.

`FC_BROWSER_TESTS=1 FC_UI_SCREENSHOT_DIR=outputs/release-ui npm test`: **150/150 JavaScript tests and 12/12 Python tests passed**, with no failures or skips. Final focused API/browser verification passed **11/11** checks after the protection display wording change. UI build, JavaScript syntax and `git diff --check` passed. A final inbox/layout verification passed **10/10** focused production API/unit/browser checks after exposing coordinator-pending status outside setup and collapsing capture tools for populated inboxes. A final **20/20** guard/store/parser/capture check passed after removing dormant override handling and retaining first opt-out evidence. JavaScript syntax checks passed for **85** files; Python compilation and whitespace checks passed.

New validation covers paused browser uploads; guided review and strict outreach-Status columns; immutable save, source hashes and activation tokens; real campaign activation and exact prior-workbook undo; same-carrier contact IDs and source provenance; stale/corrupt revision rejection; failed state publication; serialized telemetry/campaign writes retaining concurrent evidence; normal suppression and immediate pre-click opt-out protection; durable coordinator retry/acknowledgement; held opt-outs after classification edits, activation, undo and restart; reply evidence storage failure/recovery; stale review conflicts; nonsecret capture settings, explicit authorization, provider/TLS rules and isolated experiment flags; CSRF/source-file boundaries; private-token redaction; sample-preview send/connection blocks; original source/history protection and restart persistence.

Chrome checks exercise the normal sidebar flow, guided mapping, activation, lead provenance, navigation into captured replies, EML import, inert script-like text, retained review/settings drafts, normal history/catalog screens, and desktop/mobile bounds. Desktop (1440px) and mobile (390px) screenshots were visually inspected. The actual in-app preview uses a generated sample data folder with `FC_RELEASE_PREVIEW=1`; sending and live mailbox capture are blocked. Production data/configuration is not loaded into this preview.

The versioned ZIP includes application sources, tests, normal launch/setup scripts and IMPORTS-AND-CONVERSATIONS.md. Package/lockfile/catalog/UI consistently report 2.2.0-rc.1. Archive verification checks source consistency and absence of customer data, .env secrets, browser profiles, credentials, experiment runtime data and Team work files. A clean extraction smoke check uses a new temporary data folder and the already-installed dependency runtime; no installer download or native Windows run is claimed.

All verification used synthetic local data and simulated mailbox/browser sending fixtures. No real email was sent/fetched. Live provider authorization, folder retention/reference headers, native Windows behavior and other-PC rollout remain designated acceptance checks before production approval. Captured opt-out override, cross-PC inbox sync, automatic retention, reply composition and ownership workflows are not part of this release. See IMPORTS-AND-CONVERSATIONS.md for coverage limits and backup/rollback requirements.

## Send insights and version catalog — 2.1.0 — October 29, 2026

Version 2.1.0 adds full-filter send-history metrics, mailbox/campaign/template/date/seen/reply-review filters, timing sorts, filtered CSV/JSON and statistics exports, detailed first/last/hourly open evidence, and durable manual reply reviews/notes. Timing averages/median/fastest values use valid confirmed-send-to-first-signal intervals and expose sample/exclusion counts. Send-date filters follow UTC confirmation time (attempt time when unconfirmed). No-signal and tracking-disabled records remain distinct. Reply reasons are not inferred.

The Version Catalog contains three verified package versions (1.0.0, 2.0.0, 2.1.0), six historical milestones with Git/validation evidence, safe upgrade steps, and editable/exportable per-PC release notes saved in the original state file. The historical V1.1.0 Git label is explained because its package still recorded 2.0.0. The title bar/server, package/lockfile and versioned ZIP now agree. State-schema version 2 stays unchanged.

`FC_BROWSER_TESTS=1 FC_UI_SCREENSHOT_DIR=outputs/v2.1.0 npm test`: **115 passed** (108 Node, 7 Python), no failures or skips. After a final UTC midnight-boundary correction, all **6 reporting/catalog unit tests and 2 focused API/browser tests passed** again. New checks cover arithmetic and denominators, invalid/missing timing, distinct tracking states, combined filters, all-pages exports, spreadsheet formula escaping, metadata redaction, manual reviews retaining send protections, restart persistence, local-note edits, and desktop/mobile navigation/layout. Existing sender/signature/uncertainty/pacing/coordinator/workbook/Firebase checks passed. Sixty JavaScript syntax checks, package/lockfile consistency, UI build and `git diff --check` passed. Desktop and narrow-screen screenshots were visually inspected.

No real emails were sent or customer state modified by verification. Tests used synthetic temporary data. Native Windows execution and installation on the other PCs remain unverified. Operator notes and send statistics are local to the current PC; the catalog does not implement remote update checks or distribution.

## Firebase multi-PC backlog repair and Settings diagnostics — October 29, 2026

A read-only live Realtime Database audit found 716 events, with 162 pending for PC 1, 252 for PC 2, 16 for PC 3 and 1 for PC 4. The old last-100 query returned 99 acknowledged PC 3 events and one pending PC 4 event, proving starvation of the PC 1/2 backlog. Firestore's read check failed. The local installation was PC 1 in Manual mode; the other PCs' local configuration/data was not accessed.

Sync now pages through both pending and acknowledged events by key/document ID, persists bounded continuation cursors, requires local token ownership, saves locally before cloud acknowledgement, and keeps durable replay receipts. Database selection is explicit and backend errors/timeouts/partial scans are visible. Settings exposes editable PC ID/URL/backend/mode plus live non-secret PC, credential, database, telemetry, local-data and progress diagnostics. Missing setup and route mismatches show warnings. Mobile responsive overrides now follow desktop CSS so the sidebar and Settings panels fit narrow screens.

`FC_BROWSER_TESTS=1 FC_UI_SCREENSHOT_DIR=outputs/sync-repair npm test`: **108 passed** (101 Node, 7 Python), no failures or skips. Coverage includes pagination beyond 100 unrelated records, recovery of previously acknowledged events, resumable scans across restart, save-before-acknowledgement and safe retries, hash-only payloads, malformed/unmatched/wrong-PC events, manual mode, concurrency, timeouts, partial failures and replay beyond the 96-hour timeline. Chrome checks verify effective configuration, warnings, save/reload, truthful disabled-sync feedback, retained unsaved inputs, and actual diagnostic bounds on desktop/mobile. JavaScript syntax checks, UI build and `git diff --check` passed.

`SYNC-REPAIR.md` contains the audit, four-PC rollout and troubleshooting steps. The distribution includes sources/docs/tests and excludes `.env`, credential files, local state, browser profiles and customer data. Live cloud access in this task was read-only; no real emails were sent. Actual recovery on the other PCs and native Windows execution remain unverified until the update is installed there.

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
