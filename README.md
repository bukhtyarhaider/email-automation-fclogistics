# Outreach Desk 2

A configurable local email sales tool for teams using Private Email. Each PC has its own mailbox profiles and browser session. An optional shared coordinator prevents duplicate recipient claims across PCs and enforces team mailbox allowances.

## Install on Windows and macOS

1. Extract `Outreach-Desk-2.0.0.zip` to a permanent folder on each PC. Give every OS user their own installation/data folder.
2. Install [Node.js 20+](https://nodejs.org/), [Python 3.9+](https://www.python.org/downloads/), and Google Chrome or Microsoft Edge. On Windows select **Add Python to PATH** during installation.
3. Windows: open `Setup-Windows.cmd` once, then `Start-Windows.cmd`. macOS: open `Setup-Mac.command` once, then `Start-Mac.command`. If macOS strips execute permission from the archive, run `chmod +x *.command` in that folder. Setup installs the locked npm dependencies from the npm registry.
4. The launcher opens http://127.0.0.1:4317. Keep its terminal open while using the tool. Closing it stops the local server. Linux also works with `npm ci` then `npm run launch`.

The distribution contains code and templates only. It excludes workbook data, mailbox sessions, customer-specific state, screenshots, history, and team access tokens.

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

Add `.xlsx` files as campaigns. Imports make a working copy and preserve an original backup. Use the campaign selector to inspect each one, name it, enable/disable it, or limit it to exact worksheet names. The continuous queue rotates through enabled campaigns; **Send selected leads** only processes the selected recipients, respecting the same pacing and allowances.

Column headers supported by default include `Carrier Legal Name`/`Company`/`Company name`, `Email`/`Email address`, `Status`, and `Owner / Principal`/`Contact`/`Contact name`. Optional per-worksheet mappings are editable under **Campaign settings**:

```json
{"Leads":{"email":"H","carrier legal name":"A","status":"G","owner / principal":"I"}}
```

Mappings determine the cells updated, so choose the actual tracking column. Add a labelled Status column to your spreadsheet if it has none. Shifted row layouts are blocked until you correct the sheet or explicitly map the correct columns. Formula cells are read using their cached values; the tool does not execute workbook code or document instructions.

Carrier eligibility defaults require Active operating status and No out-of-service flag. For other lead schemas, turn off these two requirements deliberately. Ready statuses, hidden-sheet eligibility, and the status written after sending are editable. Prior sends, duplicate emails, opt-outs, and uncertain results remain blocked regardless of these preferences.

## Continuous operation

Configure minimum/maximum gap seconds, hourly and rolling 24-hour allowances, minimum/maximum sends before a rest, minimum/maximum rest seconds, and the empty-queue polling interval. The bounds are editable. Intervals use independent random samples, and longer rests never shorten the normal minimum gap. Limits apply to the selected mailbox; attempts with an ambiguous outcome count against them. Manually sent messages and sends from other software are outside this tool’s counters.

Use **Start continuous outreach** to run until stopped. The queue waits for allowance renewal, for new eligible leads, or for a disconnected mailbox. Add new campaigns while it waits. It saves the next scheduled check, progress, and enabled state. A restart retains the queue and waits for reconnection before resuming; stopping saves a disabled state. Errors pause the runner for attention. **Stop outreach** interrupts waiting promptly and prevents the next send; an already submitted send must finish its confirmation/recovery step.

24/7 operation requires the PC, local server, browser, network, and mailbox session to remain available, and sleep to be configured by the operator. This version does not install an OS background service. When the app starts, a saved enabled queue can resume after automatic browser-session restoration if the login is still valid and startup restoration is enabled. Expired sessions require operator sign-in.

## Templates and history

There are 16 editable introduction variants. Random selection uses only enabled templates whose required lead fields are present, honors selection weights, and avoids the immediately previous variant when alternatives exist. You can add or delete variants and select one fixed template instead. This is deterministic field personalization, not an AI that infers services or invents information about a lead.

Supported tokens: `{{firstName}}`, `{{company}}`, `{{city}}`, `{{state}}`, `{{locationPhrase}}`, `{{senderName}}`, `{{businessName}}`, `{{services}}`, `{{legalName}}`, `{{address}}`. Business values come from the active mailbox profile. Existing version-1 standard sender/address text is migrated to editable profile tokens; edited templates and send history remain available.

Each message uses one recipient and keeps the existing webmail signature unchanged. Missing signatures, unexpected recipients, changed message content, and changed compose controls block sending. The tool records its durable reservation before clicking Send, requires a fresh visible webmail success notice, and then patches only the relevant XLSX status cell. This confirms submission to webmail, not delivery to an inbox.

History stores the recipient, account, campaign, template, subject, rendered body, signature text, timestamps, confirmation evidence, uncertainty, and workbook repair state. **Live System Activity** provides a dedicated real-time telemetry console with visual and raw terminal feeds, pacing countdowns, event category filters, freeze/pause stream controls, and log export (.json / .log). **Send History & Audit** includes a searchable, paginated send history with full-message details, inspector drawer, and recovery action center; **Export full history** includes all saved attempts and events. Old attempts from version 1 contain only the information recorded by that version. Downloads export the selected campaign’s updated workbook. Original files remain unchanged.

Uncertain sends never retry automatically. Check the Sent folder and record the outcome in Activity. Workbook updates can be repaired without another send. Add opt-outs to **Do not contact**. Optional IMAP monitoring now records confidently correlated DSN bounces and suppresses permanent failures; automatic opt-out reply interpretation is not implemented. These rules and conservative pacing do not guarantee inbox placement or bypass provider controls.

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

## Data and development

Local UI binds only to loopback and checks host/origin/request headers. `data/` contains private leads, saved profiles, campaign working copies, original backups, rendered email content, suppression, and history. Back it up and restrict OS access. Directory/file modes restrict access on Unix; on Windows access depends on the installation folder’s ACLs. Do not share your data folder with other users or package it for team distribution. Never commit passwords or team tokens.

`FC_DATA_DIR` chooses the local data folder; `FC_PYTHON` chooses Python; `PORT` changes the local UI port. For developers on this Codex workstation, the bundled Playwright runtime remains an optional fallback. Standard team installations use npm dependencies.

```sh
npm test
npm run doctor
npm run bundle
```

Tests use synthetic workbook records and a fake mail adapter, with no real sending. They cover continuous queue exhaustion, adding a campaign, stop/restart persistence, uncertain outcomes, team reservations and quotas, random pacing, template matching, legacy migration, and surgical workbook writes. Windows launcher files are provided but need a real Windows installation check; functional tests were run on macOS.

Run `FC_BROWSER_TESTS=1 npm test` on macOS (PowerShell: `$env:FC_BROWSER_TESTS='1'; npm test`) to also run actual Chrome tests against synthetic local inboxes and temporary profiles, including persistent cookies, restart reuse, profile locks, manual challenge recovery, wrong-account detection, expiry, CDP attach/detach, discovery and desktop/mobile browser settings. Set `FC_TEST_BROWSER_CHANNEL=msedge` to exercise Edge instead. `.github/workflows/test.yml` adds macOS/Windows regression runs and Windows Edge coverage; those CI jobs must run before native Windows compatibility can be confirmed. No live Cloudflare/Namecheap outcome is claimed by synthetic tests.

## Email tracking and mailbox monitoring

Open **Email Tracking** for independent submission/bounce/open-signal dimensions, campaign/date/status filters, unmatched notifications, seed Inbox/Spam results, and read-only domain authentication checks. The existing Playwright sender and durable JSON store remain in place. IMAP monitoring and open tracking default to disabled; no real test emails or DNS changes are made automatically.

See [TRACKING.md](TRACKING.md) for the architecture, exact file manifest, additive migration, `.env.example`, Namecheap IMAP setup, authorized seed/OAuth configuration, HTTPS pixel deployment, worker operation, test commands, and live verification limits. Restart the app after installing the updated locked dependencies.
