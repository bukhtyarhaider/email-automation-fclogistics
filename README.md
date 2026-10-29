# Outreach Desk 2.1.0

A configurable local email sales tool for teams using Private Email. Each PC has its own mailbox profiles and browser session. An optional shared coordinator prevents duplicate recipient claims across PCs and enforces team mailbox allowances.

### Experimental sales branch

On `feat/sales-experiments`, `npm run experiment` opens a separate import-repair experiment at `http://127.0.0.1:4327`. Run `npm run build:ui` first after editing UI sources. It previews mappings and saves explicit repair revisions to `experiment-data/`, including source provenance and carrier IDs. Original campaign files remain unchanged. `/conversations` adds a consolidated reply inbox with sample data, EML import, and separately opted-in read-only IMAP capture; it cannot send mail. See `.env.experiment.example` for the disabled-by-default live configuration. See [the experiment checklist and test instructions](docs/SALES-EXPERIMENTS.md). Each feature awaits user testing before the next begins; experimental work is not production approval.

## Install on Windows and macOS

1. Extract `Outreach-Desk-2.1.0.zip` to a permanent folder on each PC. Give every OS user their own installation/data folder.
2. Install [Node.js 20+](https://nodejs.org/), [Python 3.9+](https://www.python.org/downloads/), and Google Chrome or Microsoft Edge. On Windows select **Add Python to PATH** during installation.
3. Windows: open `Setup-Windows.cmd` once, then `Start-Windows.cmd`. macOS: open `Setup-Mac.command` once, then `Start-Mac.command`. If macOS strips execute permission from the archive, run `chmod +x *.command` in that folder. Setup installs the locked npm dependencies from the npm registry.
4. The launcher opens http://127.0.0.1:4317. Keep its terminal open while using the tool. Closing it stops the local server. Linux also works with `npm ci` then `npm run launch`.

Both `Start-Windows.cmd` and `Start-Mac.command` automatically detect `.env` in the project root and launch Node with `--env-file=.env`.

The distribution contains code and templates only. It excludes workbook data, mailbox sessions, customer-specific state, screenshots, history, and team access tokens.

### Launcher lifecycle and single-instance management

The launcher (`scripts/launch.mjs`) manages process lifecycles and enforces single-instance locking using `data/app.lock`:

- **Automatic instance detection**: If Outreach Desk is already running, launching again will not create port conflicts; it brings the active dashboard to the front in your default browser.
- **Interactive options**: In an active terminal, running the launcher prompts:
  - `[Enter]`: Keep active instance running (default).
  - `[R]`: Terminate the existing process gracefully and restart a fresh server.
  - `[C]`: Close the running instance and exit.
- **Command-line flags**:
  - `npm run launch -- --restart` (or `-r`): Stop existing instance and restart.
  - `npm run launch -- --close` (or `--stop`): Stop the running instance cleanly.
  - `npm run launch -- --open` (or `-o`): Open active instance in browser without prompting.
- **Stale lock recovery**: If an abnormal OS shutdown leaves `data/app.lock`, the launcher checks process health, removes orphaned lock files, and terminates unresponsive background PIDs before starting fresh.

## Configure a mailbox and campaign

Open **Mailbox & settings** and enter the email, profile name, sender name, business name, legal name, postal address, and services your team actually offers. Choose a **Browser Connection Method** and save the profile. Use **New profile** to create another account. On the dashboard, choose **Connect mailbox**. The password field is optional: you can sign in directly in the browser. Passwords entered in the dashboard are passed to the local application and the mailbox's login form, and are not saved by the application. Browser login sessions are now saved locally.

Select Chrome or Edge and, if necessary, change the webmail URL. The current transport adapter supports the inspected Private Email webmail interface, including its Composer iframe and existing signature. Other webmail providers need an adapter implementation; changing the URL alone does not make their UI compatible.

### Saved Browser Profile

This is the default. Playwright launches a dedicated persistent Chrome or Edge profile under `data/browser-profiles/` (or the directory selected by `FC_DATA_DIR`). Cookies, local storage and browser session data remain on this device across application restarts. The directory name derives from the mailbox profile ID, email, mailbox origin and browser channel; changing those selects a separate browser profile rather than silently using another account's login. Business/template changes retain the same login profile. The application never copies or opens your regular Chrome/Edge user-data directory.

**Restore this connection when the application starts** is enabled by default. A saved profile is reopened without entering a password. A new installation waits for the first connection. Uncheck this option to require an explicit connection on startup. Disconnect closes the app-owned browser and keeps its saved session. It does not sign out at the provider or erase cookies. Chrome profile locks are respected: close another browser using this app profile before reconnecting; never delete its lock files while it is running.

### Connect to Existing Browser (CDP)

Choose this mode, select Chrome or Edge, and use the startup command shown in settings. Run it in **Terminal on macOS** or **PowerShell on Windows**. The command includes the absolute platform-specific path, `--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=9222`, and a dedicated `--user-data-dir` under `data/debug-browser/`. If the browser is installed in another location, replace the executable path. Sign in in that separate browser once, then reuse that same debug profile on later starts.

Use **Find local debugging browsers**, select a result, and save the mailbox profile. Discovery checks the entered address plus ports 9222 and 9223; enter another local port explicitly if needed. Only loopback HTTP debugging origins are accepted. No remote hosts, credentials, redirects, or remote WebSocket destinations are accepted. Keep this port local because debugging access grants control of the browser session.

An ordinary already-running browser without debugging enabled cannot be attached. Modern Chrome requires a non-default user-data directory for remote debugging; starting a second command against your everyday profile is unsupported. See [Chrome's remote debugging changes](https://developer.chrome.com/blog/remote-debugging-port) and [Playwright's persistent context and CDP APIs](https://playwright.dev/docs/api/class-browsertype). CDP is Chromium-only and has lower fidelity than Playwright's native connection.

The app reuses a mailbox tab from the configured origin, or opens a mailbox tab when none exists. Multiple candidate tabs require an unambiguous account match; otherwise close extra mailbox tabs and reconnect. Connection verifies the configured sender using a blank compose window, which it closes without entering a recipient or body. Existing drafts are inspected without editing them. The sending adapter also verifies sender, recipient, body and signature before submission. Disconnect detaches Playwright and leaves the externally started browser and its tabs open. A failed attachment preserves that browser; retry the debugging setup or switch to Saved Browser Profile.

### Verification, expiry and recovery

The dashboard displays connecting, verification required, sign-in required, loading, account mismatch, connection failure, and connected states. Complete Cloudflare, MFA or other checks manually in the open browser, then choose **Continue sign-in**. The browser remains open while attention is needed; there is no 45-second deadline for a human to solve a challenge. A loading/navigation timeout produces a recoverable status. If a partial compose window remains, review and close it in the browser before resuming the queue. Closing the mailbox tab/browser requires another connection.

The queue waits when authentication expires before preparation/submission. It resumes after the operator restores and verifies the inbox. A failure after clicking Send remains uncertain under the existing durable recovery rules and never automatically retries that recipient. Reconnecting cannot turn an uncertain result into a confirmed send.

Persistent profiles reduce repeated logins; the provider controls session lifetime and Cloudflare policy. The app does not solve or bypass challenges. Cloudflare states that automation frameworks are unsupported for solving production challenges. For repeated manual verification loops, update the browser, allow cookies/JavaScript, inspect blocking extensions and network changes, and use the mail provider's support route. See [Cloudflare supported browsers](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/) and [challenge troubleshooting](https://developers.cloudflare.com/cloudflare-challenges/troubleshooting/challenge-solve-issues/).

Profiles contain sensitive login material. Keep them on the same device/OS user, use OS account protections and restricted Windows folder ACLs, and exclude them from shared archives and source control. Do not copy browser sessions between macOS and Windows. Each installation signs in independently. Saved mailbox login data is retained when a mailbox configuration is deleted; remove obsolete browser-profile directories only after stopping the app and their browser.

### Campaigns, lead inspection and surgical management

Add `.xlsx` files as campaigns. Imports make a working copy and preserve an original backup. Use the campaign selector to inspect each one, name it, enable/disable it, limit it to exact worksheet names, or delete obsolete campaign workspaces. The continuous queue rotates through enabled campaigns; **Send selected leads** only processes the selected recipients, respecting the same pacing and allowances.

- **Lead Preview Drawer & Modal**: Click any lead in the Leads table to slide open the Lead Inspector drawer, displaying all imported spreadsheet fields, carrier operating status, eligibility reasons, and rendered template previews.
- **Surgical Lead Deletion**: Select individual or multiple leads in the Leads table and click **Delete selected leads** to permanently and surgically purge them from the underlying campaign `.xlsx` workbook using Python openpyxl routines without affecting surrounding formatting or formula caches.
- **Campaign Workspace Deletion**: In **Campaigns**, delete unused campaigns to remove their working copies and clean up workspace memory.

Column headers supported by default include `Carrier Legal Name`/`Company`/`Company name`, `Email`/`Email address`, `Status`, and `Owner / Principal`/`Contact`/`Contact name`. Optional per-worksheet mappings are editable under **Campaign settings**:

```json
{"Leads":{"email":"H","carrier legal name":"A","status":"G","owner / principal":"I"}}
```

Mappings determine the cells updated, so choose the actual tracking column. Add a labelled Status column to your spreadsheet if it has none. Shifted row layouts are blocked until you correct the sheet or explicitly map the correct columns. Formula cells are read using their cached values; the tool does not execute workbook code or document instructions.

Carrier eligibility defaults require Active operating status and No out-of-service flag. For other lead schemas, turn off these two requirements deliberately. Ready statuses, hidden-sheet eligibility, and the status written after sending are editable. Prior sends, duplicate emails, opt-outs, and uncertain results remain blocked regardless of these preferences.

## Continuous operation

Configure minimum/maximum gap seconds, hourly and rolling 24-hour allowances, minimum/maximum sends before a rest, minimum/maximum rest seconds, and the empty-queue polling interval. The bounds are editable. Intervals use independent random samples, and longer rests never shorten the normal minimum gap. Limits apply to the selected mailbox; attempts with an ambiguous outcome count against them. Manually sent messages and sends from other software are outside this tool’s counters.

### Anti-spam pacing presets & wait reset

Under **Settings → Sending Pace & Quotas**:
- **Pacing Presets**: Quickly apply recommended anti-spam sending cadences:
  - **Safe (Recommended)**: 180–360s gaps, 20/hour cap, 100/day cap, pause every 8–15 sends for 10–30 minutes.
  - **Moderate**: 120–240s gaps, 30/hour cap, 150/day cap, pause every 12–20 sends for 8–20 minutes.
  - **Aggressive**: 60–120s gaps, 45/hour cap, 250/day cap, pause every 20–30 sends for 5–15 minutes.
  - **Custom**: Full manual control over every bound and interval.
- **Hard reset wait & quotas**: Shows a warning, then clears the current countdown and rest counter and restarts the selected mailbox's app-tracked minimum interval and hourly/24-hour quota counters. An active queue can send immediately; a stopped queue stays stopped. New sends count toward the configured pacing limits again. The reset is saved across app restarts. Sent/uncertain history, duplicate protection, Do Not Contact records, queue progress, and other mailbox counters are retained. Provider-enforced restrictions still apply. With team coordination enabled, the shared mailbox counters also reset on the coordinator; it must confirm the override before the local reset succeeds.

To install an update on another PC, stop outreach and close the running Outreach Desk server. Extract the new package and replace the application's files in the existing installation, keeping its `data` folder and `.env` file. Start the app again and reload its browser page before using **Hard reset wait & quotas**. Replacing files or refreshing the page alone does not update an already-running server. If using the shared coordinator, update and restart it too, keeping its `team-data` folder and existing settings. Update all participating PCs so they use the same reset accounting.

Use **Start continuous outreach** to run until stopped. The queue waits for allowance renewal, for new eligible leads, or for a disconnected mailbox. Add new campaigns while it waits. It saves the next scheduled check, progress, and enabled state. A restart retains the queue and waits for reconnection before resuming; stopping saves a disabled state. Errors pause the runner for attention. **Stop outreach** interrupts waiting promptly and prevents the next send; an already submitted send must finish its confirmation/recovery step.

24/7 operation requires the PC, local server, browser, network, and mailbox session to remain available, and sleep to be configured by the operator. This version does not install an OS background service. When the app starts, a saved enabled queue can resume after automatic browser-session restoration if the login is still valid and startup restoration is enabled. Expired sessions require operator sign-in.

## Templates, compliance and history

There are 16 editable introduction variants. Random selection uses only enabled templates whose required lead fields are present, honors selection weights, and avoids the immediately previous variant when alternatives exist. You can add or delete variants and select one fixed template instead. This is deterministic field personalization, not an AI that infers services or invents information about a lead.

### Compliance authoring tools and checks

- **Opt-out Instruction Helper**: One-click insertion of compliant unsubscribe wording into template bodies.
- **Live Compliance Word Count**: Real-time word counter with color-coded advisory warning if template length exceeds the 180-word deliverability recommendation.
- **Template Export & Import**: Export custom template suites as JSON (`/api/export-templates`) or import templates (`/api/import-templates`) to share proven variants across team workstations.
- **Template checks**: **Mailbox & Settings → Template checks** controls promotional-claims and over-180-word checks independently:
  - **Warn only** (default): Shows an advisory review note while permitting outreach to proceed.
  - **Stop before sending**: Blocks message preparation until wording is adjusted.
  - **Off**: Disables the check completely.
  The master **Enable template checks** switch toggles both checks simultaneously while preserving individual preferences.

Supported tokens: `{{firstName}}`, `{{company}}`, `{{city}}`, `{{state}}`, `{{locationPhrase}}`, `{{senderName}}`, `{{businessName}}`, `{{services}}`, `{{legalName}}`, `{{address}}`. Business values come from the active mailbox profile. Existing version-1 standard sender/address text is migrated to editable profile tokens; edited templates and send history remain available.

Each message uses one recipient and keeps any existing webmail signature unchanged. Mailboxes with no configured signature can prepare messages normally. Adding, removing, or editing a signature after preparation, unexpected recipients, changed message content, and changed compose controls block sending. The tool records its durable reservation before clicking Send, requires a fresh visible webmail success notice, and then patches only the relevant XLSX status cell. This confirms submission to webmail, not delivery to an inbox.

### Telemetry, suppression and audit

- **Live System Activity**: A dedicated real-time telemetry console with visual status feeds, raw terminal logs, pacing countdowns, event category filters (`all`, `send`, `pacing`, `error`, `system`), freeze/pause stream controls, log clear (`/api/clear-events`), and export as `.json` or `.log`/`.txt`.
- **Suppression List Management**: Add opt-outs to **Suppression list**. Operators can also remove/unsuppress addresses (`/api/unsuppress`); removals automatically synchronize with the shared team coordinator.
- **Send History & Audit**: Searchable, paginated send history with full message details, inspector drawer, open telemetry badges, bounce diagnostics, and recovery action center. **Export full history** exports all saved attempts, tracking metadata, and events as JSON.

Uncertain sends never retry automatically. Check the Sent folder and record the outcome in Activity. Workbook updates can be repaired without another send. Add opt-outs to **Do not contact**. Optional IMAP monitoring records confidently correlated DSN bounces and suppresses permanent failures; automatic opt-out reply interpretation is not implemented. These rules and conservative pacing do not guarantee inbox placement or bypass provider controls.

## Shared team server

Use this when multiple PCs work from overlapping leads or share a mailbox. **Every PC must use the same coordinator**; independent installations cannot see each other’s sends. Each PC still owns its workbook copies and browser session. The coordinator shares reservations, suppression, historical contact blocks, and mailbox allowances; it does not distribute templates, passwords, workbook files, or complete message bodies.

On one always-on computer or a server, install dependencies and start the coordinator. Generate a random secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep it private.

macOS/Linux:

```sh
export TEAM_TOKEN='your-generated-secret'
export TEAM_HOST='127.0.0.1'
npm run team
```

Windows PowerShell:

```powershell
$env:TEAM_TOKEN='your-generated-secret'
$env:TEAM_HOST='127.0.0.1'
npm run team
```

The server listens on port 4318. Default binding is loopback. To allow trusted LAN PCs, set `TEAM_HOST` to the server’s LAN address and configure your firewall deliberately, or use an HTTPS reverse proxy for remote access. Use HTTPS outside a trusted private network; tokens and lead metadata are otherwise transmitted as plain HTTP. Do not expose this service directly to the public Internet. No external server is deployed by setup.

In every PC’s settings, enable shared coordination, enter the same server URL, give the PC a name, and enter the token. Tokens are kept in memory; reconnect after restarting or supply `TEAM_TOKEN` through your managed environment. A coordinator outage stops new sends. Existing local send history and suppression are seeded when connecting. Mailbox passwords never go to the coordinator.

Server environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `TEAM_PORT` | 4318 | Coordinator port |
| `TEAM_HOST` | 127.0.0.1 | Network bind address |
| `TEAM_DATA_DIR` | team-data | Shared ledger directory |
| `TEAM_HOURLY_CAP` | 20 | Shared per-mailbox rolling hourly allowance |
| `TEAM_DAILY_CAP` | 100 | Shared per-mailbox rolling 24-hour allowance |
| `TEAM_MIN_SECONDS` | 180 | Shared minimum interval per mailbox |

These administrator limits apply in addition to each PC’s settings. Never run multiple coordinator processes against one ledger or copy ledger files over a running server. The coordinator serializes claims and durably saves them before responding. An unattempted reservation can expire after 30 minutes; Sending, Sent, and Uncertain records never expire into eligibility. After a coordinator restart, unfinished Sending records become Uncertain. Keep the ledger and token backed up; all PCs depend on that history for duplicate protection.

## Email tracking, 24/7 Firebase sync and deliverability

Open **Email Tracking** for independent submission/bounce/open-signal dimensions, campaign/date/status filters, unmatched notifications, controlled seed inbox testing studio, and read-only domain authentication checks. The existing Playwright sender and durable JSON store remain in place. IMAP monitoring and open tracking default to disabled; no real test emails or DNS changes are made automatically.

### Open signals: Local pixel server vs 24/7 Firebase sync

Outreach Desk provides two methods for open tracking:

1. **Local GIF Pixel Listener** (`src/pixel-server.mjs`): Runs an isolated HTTP listener on port 4319 serving 1×1 transparent GIFs for opaque 256-bit hashed tokens. Requires an external HTTPS reverse proxy (nginx/caddy) mapped to `FC_TRACKING_PUBLIC_URL` and requires the local workstation to remain online.
2. **24/7 Firebase Cloud Telemetry Sync** (`src/firebase-sync.mjs`): Eliminates the need for local port forwarding, ngrok tunnels, or keeping the PC on 24/7. When emails are opened while your PC is asleep or off, a cloud worker logs open events into Firebase Realtime Database or Cloud Firestore. When Outreach Desk runs, `FirebaseSync` pages through cloud opens, matches original local tokens, saves hourly-coalesced open signals locally, and only then acknowledges them. Bounded scans resume across runs and revisit acknowledged events to recover older sync failures.
   - **Credentials auto-discovery**: Automatically detects `data/firebase-service-account.json`, or environment variables (`FC_FIREBASE_CREDENTIALS_PATH`, `FC_FIREBASE_SERVICE_ACCOUNT_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`).
   - **Sync modes**: Configurable in **Settings → Email Tracking Telemetry** as **Automatic** (periodic background sync) or **Manual** (operator triggers on demand via the **Sync Firebase** button in Email Tracking).
   - **PC identity and diagnostics**: Settings shows the effective PC ID/source, tracking URL, project/database, credential source (keys hidden), data folder, mode, last checks, errors and scan counters. Save a unique PC ID and matching tracking URL on each workstation; Settings values override the environment. Events require an original local token match before cloud acknowledgement.
   - **Truthful sync results**: Select RTDB, Firestore or both in Settings. Failures, incomplete scans, missing local tokens and PC-ID mismatches are shown explicitly. See [the four-PC repair guide](SYNC-REPAIR.md) for the verified October 2026 diagnosis and rollout steps.

### Controlled Seed Inbox Testing Studio & Domain Health

- **Seed Studio**: Reserve and test dedicated mailboxes (`FC_SEEDS`) with synthetic leads before launching major campaigns. Appends `[FC seed <UUID>]` to track folder placement across Gmail, Outlook, Yahoo, and Private Email. Inspect results via the slide-over Timeline Drawer.
- **Domain Authentication Checks**: Read-only TXT queries verify SPF, DKIM selector, and DMARC record syntax with actionable deliverability guidance.

See [TRACKING.md](TRACKING.md) for full architecture, environment configurations, and end-to-end verification workflows.

## Data and development

Local UI binds only to loopback and checks host/origin/request headers. `data/` contains private leads, saved profiles, campaign working copies, original backups, rendered email content, suppression, and history. Back it up and restrict OS access. Directory/file modes restrict access on Unix; on Windows access depends on the installation folder’s ACLs. Do not share your data folder with other users or package it for team distribution. Never commit passwords or team tokens.

`FC_DATA_DIR` chooses the local data folder; `FC_PYTHON` chooses Python; `PORT` changes the local UI port. Standard team installations use npm dependencies.

```sh
npm test              # Run unit and integration tests (synthetic mail)
npm run doctor        # Check Node, Python, and system prerequisites
npm run build:ui      # Compile modular HTML, CSS, and JS from src/ui/ into public/
npm run bundle        # Create clean production zip under dist/
```

### UI Modular Architecture

The frontend is maintained as modular source components under `src/ui/`:
- `src/ui/html/`: View partials (`_view-dashboard.html`, `_view-tracking.html`, `_view-settings.html`, `_drawer-lead.html`, etc.)
- `src/ui/styles/`: Scoped CSS (`_tokens.css`, `_base.css`, `_tracking.css`, `_drawer.css`, etc.)
- `src/ui/js/`: Domain modules (`_controls.js`, `_leads.js`, `_tracking.js`, `_settings.js`, etc.)

Run `npm run build:ui` to concatenate and build `public/index.html`, `public/style.css`, and `public/app.js`.

### Headless browser tests

Run `FC_BROWSER_TESTS=1 npm test` on macOS (PowerShell: `$env:FC_BROWSER_TESTS='1'; npm test`) to run the complete suite including real Chrome tests against synthetic local inboxes and temporary profiles: persistent cookies, restart reuse, profile locks, manual challenge recovery, wrong-account detection, expiry, CDP attach/detach, discovery, tracking dashboard filters, and desktop/mobile responsiveness. Set `FC_TEST_BROWSER_CHANNEL=msedge` to exercise Edge instead. No live Cloudflare/Namecheap outcome is claimed by synthetic tests.


## Send insights and version catalog (2.1.0)

**Send History & Audit** now filters by recipient/subject/note search, outcome, seen signal, mailbox, campaign, template, UTC send-date range (confirmation time, or attempt date when unconfirmed) and manual reply-review status. Sort by send dates, first/last seen activity, or fastest/slowest first-seen interval. Counts and filtered exports cover every matching row across pages, using only this PC's history. Refresh is explicit and the open history view also refreshes every 15 seconds while preserving unsaved review notes.

Metrics include confirmed sends, first-seen signals, seen/confirmed-send percentage, tracking coverage, average/median/fastest confirmed-send-to-first-image-request intervals, sample/exclusion counts and manually reviewed replies. Missing tracking is shown separately from a tracked message with no signal. Timing requires a valid confirmed-send timestamp and a first signal at or after it. Remote image requests can come from previews or scanners; they do not prove human reading. Reply state and reasons are entered manually after inspecting the mailbox; the app does not infer replies or why someone has not replied.

Use **Filtered CSV**, **Filtered JSON**, **Stats CSV** or the existing **Full history backup**. CSV includes recipients, mailbox/campaign/template, send timestamps, first/last seen, retained hourly signal count, delay in seconds, bounce evidence and manual reply notes. Stats CSV uses `Ms` suffixes for duration metrics and percentages for rate metrics. CSV cells protect spreadsheet formulas. Full JSON keeps the prior backup sections; filtered JSON includes only matching send/tracking records.

**Version Catalog** shows the installed package version, verified numbered releases, historical updates, upgrade steps and your own editable local release notes. Catalog notes live in `data/state.json` on this PC and survive application-file replacement. Export the catalog as JSON. Earlier updates often retained package 2.0.0; the historical Git label V1.1.0 is explained rather than assigned an invented package version. See [CHANGELOG.md](CHANGELOG.md).

To publish a future version: update `package.json` and the root package entries in `package-lock.json`, add the new release to `src/release-catalog.mjs`, record validation, rebuild the UI, run the regression suite, then run `npm run bundle`. The ZIP filename reads the package version automatically. The title bar reads the same version from the running server. On each PC, stop the app, back up and retain `.env`/`data` (and `team-data` for a coordinator), replace application files, run Setup if dependencies changed, restart/reload, and check the catalog and sync diagnostics. This is a manual distribution workflow, not an online update service.
