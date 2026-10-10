# Outreach Desk 2

A configurable local email sales tool for teams using Private Email. Each PC has its own mailbox profiles and browser session. An optional shared coordinator prevents duplicate recipient claims across PCs and enforces team mailbox allowances.

## Install on Windows and macOS

1. Extract `Outreach-Desk-2.0.0.zip` to a permanent folder on each PC. Give every OS user their own installation/data folder.
2. Install [Node.js 20+](https://nodejs.org/), [Python 3.9+](https://www.python.org/downloads/), and Google Chrome or Microsoft Edge. On Windows select **Add Python to PATH** during installation.
3. Windows: open `Setup-Windows.cmd` once, then `Start-Windows.cmd`. macOS: open `Setup-Mac.command` once, then `Start-Mac.command`. If macOS strips execute permission from the archive, run `chmod +x *.command` in that folder. Setup installs the locked npm dependencies from the npm registry.
4. The launcher opens http://127.0.0.1:4317. Keep its terminal open while using the tool. Closing it stops the local server. Linux also works with `npm ci` then `npm run launch`.

The distribution contains code and templates only. It excludes workbook data, mailbox sessions, customer-specific state, screenshots, history, and team access tokens.

## Configure a mailbox and campaign

Open **Mailbox & settings** and enter the email, profile name, sender name, business name, legal name, postal address, and services your team actually offers. Save the profile. Use **New profile** to create another account. Enter its password in **Connect Private Email** to sign in. Passwords and authentication sessions are not saved; after an application/PC restart, reconnect the mailbox. Manual verification and expired sessions require an operator.

Select Chrome or Edge and, if necessary, change the webmail URL. The current transport adapter supports the inspected Private Email webmail interface, including its Composer iframe and existing signature. Other webmail providers need an adapter implementation; changing the URL alone does not make their UI compatible.

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

24/7 operation requires the PC, local server, browser, network, and mailbox session to remain available, and sleep to be configured by the operator. This version does not install an OS background service or silently log in after reboot. A saved enabled queue resumes after you restart the app and reconnect.

## Templates and history

There are 16 editable introduction variants. Random selection uses only enabled templates whose required lead fields are present, honors selection weights, and avoids the immediately previous variant when alternatives exist. You can add or delete variants and select one fixed template instead. This is deterministic field personalization, not an AI that infers services or invents information about a lead.

Supported tokens: `{{firstName}}`, `{{company}}`, `{{city}}`, `{{state}}`, `{{locationPhrase}}`, `{{senderName}}`, `{{businessName}}`, `{{services}}`, `{{legalName}}`, `{{address}}`. Business values come from the active mailbox profile. Existing version-1 standard sender/address text is migrated to editable profile tokens; edited templates and send history remain available.

Each message uses one recipient and keeps the existing webmail signature unchanged. Missing signatures, unexpected recipients, changed message content, and changed compose controls block sending. The tool records its durable reservation before clicking Send, requires a fresh visible webmail success notice, and then patches only the relevant XLSX status cell. This confirms submission to webmail, not delivery to an inbox.

History stores the recipient, account, campaign, template, subject, rendered body, signature text, timestamps, confirmation evidence, uncertainty, and workbook repair state. Activity includes a searchable, paginated send history with full-message details and recent events; **Export full history** includes all saved attempts and events. Old attempts from version 1 contain only the information recorded by that version. Downloads export the selected campaign’s updated workbook. Original files remain unchanged.

Uncertain sends never retry automatically. Check the Sent folder and record the outcome in Activity. Workbook updates can be repaired without another send. Add opt-outs and permanent bounces to **Do not contact**; automatic inbox reply/bounce reading is not implemented. These rules and conservative pacing do not guarantee inbox placement or bypass provider controls.

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
