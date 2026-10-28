# Email tracking integration

## Architecture and sending workflow

This is the existing Node.js ES-module HTTP application and vanilla JavaScript dashboard. Playwright operates Namecheap Private Email in an ephemeral Chrome/Edge session. Python's standard library reads and surgically patches imported XLSX workbooks. There is no SQL database, frontend framework, SMTP transport, or job broker.

The existing flow remains: import workbook → apply eligibility/history/suppression → render an edited template using the active profile → open the HTML Composer iframe → prepend escaped text while preserving the signature → validate recipient/sender/subject/body → reserve durably → click Send → require a fresh visible webmail success notice → persist confirmation → update the workbook. Continuous queues retain their pacing, shared coordinator, and uncertain-send protection.

Tracking joins this flow at composition and at the durable reservation/confirmation boundaries. Monitoring uses a separate asynchronous loop and mutex within the existing server process. No mailbox network request is added to the send transaction. MailParser is used only to parse incoming MIME; all outgoing mail still uses Playwright.

## Components and files

| File | Change / responsibility |
|---|---|
| `src/tracking.mjs` | Additive migration, UUIDs, status dimensions, bounded events, hashed open tokens, DSN correlation/idempotency, manual-review records, filtered reporting, seed configuration/results |
| `src/firebase-sync.mjs` (new) | Dual Firebase Realtime Database & Cloud Firestore sync worker for 24/7 open telemetry without reverse proxies or 24/7 PC uptime |
| `src/mailbox-monitor.mjs` | TLS IMAP reader, structured MIME DSNs, Sent Message-ID reconciliation, UIDVALIDITY cursors, reconnect/backoff, authorized seed-folder inspection |
| `src/pixel-server.mjs` | Separate GIF-only HTTP listener; no dashboard/admin routes |
| `src/domain-health.mjs` | Read-only SPF/DKIM/DMARC TXT checks, actionable warnings, explicit lookup failures |
| `src/browser.mjs` | Insert a per-message HTML marker and optional pixel; retain text/signature validation and fresh-confirmation requirement |
| `src/delivery.mjs` | Tracking UUID/status and bounded error reason on every reservation; safe hooks that cannot cause a second send |
| `src/server.mjs` | Tracking hooks, reporting/seed/manual-result APIs, background mailbox loop, Firebase sync trigger, listener lifecycle, existing-history reconciliation |
| `src/ui/`, `src/ui/build.mjs` (new) | Modular UI architecture: scoped CSS, view partials, and domain JS modules compiled into `public/` assets |
| `public/index.html`, `public/app.js`, `public/style.css` | Compiled Email Tracking dashboard, filters, message events, review queue, monitor state, seed controls, DNS checks, slide-over drawer |
| `package.json`, `package-lock.json` | Locked `firebase-admin`, `imapflow`, and `mailparser` dependencies; no new mail-sending transport |
| `scripts/test.mjs` | Serialize tests that use fixed local ports; disable live mailbox monitoring by default in tests |
| `scripts/bundle.py` | Include tracking documentation and safe environment example in the existing source bundle |
| `.env.example`, `.gitignore` | Safe placeholders; ignore private environment files and service account secrets |
| `tests/firebase-sync.test.mjs` (new) | Auto-discovery, RTDB sync, Firestore sync, manual sync mode, and error handling unit tests |
| `tests/tracking.test.mjs` | Parser, correlation, bounce/open/placement/error/security/reporting checks with mocks |
| `tests/tracking-integration.test.mjs` | Local HTTP + fake sender, pixel isolation, seed deduplication, manual results and restart persistence |
| `tests/browser-tracking.test.mjs`, `tests/browser-tracking-ui.test.mjs` | Opt-in headless browser verification of synthetic composer HTML and responsive dashboard filters |
| `README.md`, `VALIDATION.md`, `TRACKING.md` | Entry points, setup, limits and validation evidence |

## Storage and migration

All application data stays in the existing private `data/state.json` (or `FC_DATA_DIR/state.json`). On the first updated startup, `tracking.version = 1` and tracking records are added. Existing history gets stable tracking IDs; suppression, templates, profiles, campaign IDs, original workbook copies, and history remain intact. No SQL migration is required. Historical `Sent` outcomes are imported from saved history; no historical opens, Message-IDs, or inbox placement are invented. Back up the data folder while the app is stopped before upgrading.

`tracking.records` is keyed by tracking UUID and survives campaign/lead deletion. History still blocks duplicate contact. `seedHistory` holds dedicated test attempts and contributes to mailbox quotas/pacing without changing real leads' workbook statuses. `tracking.seedTests` reserves an immutable test plan by test key. `tracking.dsn` stores processed DSNs; `tracking.review` holds unmatched/ambiguous/unparseable notices; `tracking.cursors` holds mailbox UIDVALIDITY + UID checkpoints. The existing single-instance data lock and serialized atomic/fsynced writes cover both tracking and sends. Multiple local requests cannot send concurrently; independent PCs must continue to use the existing coordinator.

A record has independent dimensions:

- `sendStatus`: `pending`, `send_attempted`, `webmail_sent`, `send_failed`, or `delivery_unknown`.
- `deliveryStatus`: `delivery_unknown`, `hard_bounced`, or `soft_bounced`.
- `bounceStatus`/`bounceReason`: observed DSN failure and diagnostic, without replacing submission evidence.
- `firstOpenAt`/`lastOpenAt`/`opens` and `open_detected` events: remote-image requests only.
- `placement`: seed result, folder evidence, source (`imap`, `manual`, or `open_signal`), timestamp.
- Sender/recipient/subject/campaign, attempt/confirmation timestamps, Message-IDs, and last event timestamp.

There is deliberately no automatic `delivered` status. A sent/opened/bounced message can show all of those dimensions together. `delivery_unknown` is not a failure classification. A pre-submit error is `send_failed`; an error after a possible click without confirmation is `delivery_unknown` and remains `Uncertain` in legacy history. Neither becomes retryable automatically. Existing manual reconciliation records the operator's Sent-folder evidence separately.

A tracking-hook failure marks `trackingSyncNeeded` on durable send history and is retried on the background timer or reconstructed after restart. It cannot invoke Send again. Failed pixel-event writes remain queued in memory and the background timer retries persistence while the process stays alive. Failure of the core durable reservation still blocks sending, as before. Confirmed submission survives subsequent workbook/tracking failures. New tracking errors are generic and bounded to avoid storing private DOM content or credentials.

## Environment and startup

Install the locked dependencies with `npm ci`. Copy `.env.example` to `.env` and protect that file (on macOS/Linux: `chmod 600 .env`). Values are optional unless the feature is enabled. Both `Start-Mac.command` and `Start-Windows.cmd` automatically detect `.env` and launch Node with `--env-file=.env`. Node's environment-file loader is also available in Node 20.6+:

```sh
node --env-file=.env src/server.mjs
# Or use the launcher directly:
node --env-file=.env scripts/launch.mjs
```

`npm start` inherits already-set shell environment variables. You can set environment variables through your shell, service environment, or `.env`. Do not commit credentials or service account files.

| Variable | Default / meaning |
|---|---|
| `FC_MONITOR_ENABLED` | `0`; set `1` to poll authorized mailbox accounts |
| `FC_IMAP_USER` / `FC_IMAP_PASSWORD` | Full sending mailbox address and master/application password for the single-account shortcut |
| `FC_IMAP_HOST` | `mail.privateemail.com` |
| `FC_IMAP_INBOX_FOLDER` | `INBOX`; choose the folder receiving failure notifications |
| `FC_IMAP_SENT_FOLDER` | Blank discovers IMAP `\\Sent`; set the actual folder name if discovery fails |
| `FC_IMAP_MAILBOXES` | `[]`; multiple sender configs with unique `id`, `user`, `host`, `passwordEnv` or `accessTokenEnv`, optional `sentFolder`/`inboxFolder` |
| `FC_OPEN_TRACKING_ENABLED` | `0`; enables pixel insertion/listening only with consent flag |
| `FC_OPEN_TRACKING_CONSENT` | `0`; explicitly authorize telemetry before setting `1` |
| `FC_TRACKING_PUBLIC_URL` | Public HTTPS base, e.g. `https://tracking.example.com` or Cloud Function URL |
| `FC_PIXEL_HOST` / `FC_PIXEL_PORT` | `127.0.0.1` / `4319`; separate listener, reverse proxy required for public access |
| `FC_TRACKING_PC_ID` | `1` legacy fallback with a warning; set a unique ID per PC, or override it in Settings. Token ownership is required before cloud acknowledgement |
| `FC_FIREBASE_CREDENTIALS_PATH` | Path to Firebase service account JSON (auto-detects `data/firebase-service-account.json` if omitted) |
| `FC_FIREBASE_SERVICE_ACCOUNT_KEY` | Inlined JSON or base64-encoded Firebase service account credentials |
| `FC_FIREBASE_PROJECT_ID` | Project ID for discrete Firebase credential configuration |
| `FC_FIREBASE_CLIENT_EMAIL` | Service account email for discrete Firebase credential configuration |
| `FC_FIREBASE_PRIVATE_KEY` | Private key string for discrete Firebase credential configuration |
| `FC_FIREBASE_DATABASE_URL` | Firebase Realtime Database URL (defaults to Asia-Southeast1 instance) |
| `FC_FIREBASE_DISABLE` | `0`; set to `1` to completely bypass Firebase open telemetry sync |
| `FC_SEEDS` | `[]`; array of dedicated authorized test mailboxes; manual configuration needs only unique `id`, unique `email`, optional `provider` |
| Named password/token variables | Secrets referenced by `passwordEnv` or `accessTokenEnv`; never inline them in mailbox JSON |
| `FC_BROWSER_TESTS` | Test-only `1` enables synthetic headless browser checks |
| `FC_TEST_BROWSER_CHANNEL` | Test-only `chrome` or another installed supported Chromium channel |

## Namecheap IMAP setup and worker operation

Namecheap documents `mail.privateemail.com`, full-address username, master/application password, and IMAP SSL port 993 in its [official client settings](https://www.namecheap.com/support/knowledgebase/article.aspx/1179/2175/general-private-email-configuration-for-mail-clients-and-mobile-devices/). Set the single-mailbox variables above, enable the monitor, restart the app, and inspect **Email Tracking → Monitor**. IMAP login is independent of the existing browser login; browser passwords are still not saved or reused for monitoring.

The worker discovers Sent using the IMAP special-use flag, then reads Sent and Inbox with read-only IMAP `EXAMINE` and non-mutating source fetches. It never moves, marks read, flags, expunges, or deletes messages. ImapFlow handles the protocol; MIME is parsed with MailParser's `keepDeliveryStatus` option. See the [ImapFlow API](https://imapflow.com/docs/api/imapflow-client/) and [MailParser options](https://nodemailer.com/extras/mailparser).

The initial scan covers the last 30 days, at most 100 messages per folder per cycle, then advances by UID. UIDVALIDITY changes reset that folder cursor with the same initial lookback. Full messages are limited to 2 MB; larger or unparseable messages are recorded for manual inspection with folder/UID information. State/cursor writes occur together. A crash can replay a notification; sender + source hash + DSN recipient-block index deduplicates application. Identical notifications copied between folders do not create a second bounce event. Processing checkpoints are never IMAP flags.

A 15-second scheduler wakes the loop; each successful mailbox check waits at least 60 seconds. Failures use exponential backoff with jitter, capped at one hour. Connections use validated TLS, explicit timeouts, no protocol/auth logging, and close after each cycle. The monitor has its own mutex and can wait on network independently of sending. Keep the app running on an available PC or use an existing service manager to supervise the same app process with the same private data directory; do not start a second writer against that directory. Browser-based sending still requires interactive sign-in after restart. No separate worker deployment or OS service is installed by this change.

Failure correlation requires the monitored sender, exact failed recipient and an exact original Message-ID already linked to a send. Structured `message/delivery-status` parts are parsed per recipient following [RFC 3464](https://www.rfc-editor.org/rfc/rfc3464). Permanent `failed` + `5.x.x` becomes hard bounce; delayed/failed `4.x.x` becomes soft bounce. Inconsistent fields go to review. Success DSNs do not establish placement. Hard bounces add local suppression; the existing coordinator receives suppression on its next synchronization. Soft bounces do not schedule a resend.

The adapter adds `data-fc-tracking` to the existing HTML wrapper. A Sent copy with the same marker (or opaque pixel token), exact sender/recipient/subject can supply its Message-ID. Seed copies also have a unique subject suffix. No subject/time/recipient-only fuzzy matching is used. If Namecheap strips the marker, its Sent copy is unavailable, original headers are omitted from the DSN, or multiple records match, the notification remains in review. Unmatched structured notices are retried after later Sent scans. The real mailbox's marker preservation and Sent headers require a designated live test; they have not been verified here. Old unmarked historical mail may need manual inspection.

## Optional image requests / open signals

Set both open flags to `1` only for authorized tracking and configure an HTTPS base URL. Each new ordinary email gets 256 bits of random token entropy; only its SHA-256 hash is stored in application data. The URL contains no recipient address. A 1×1 remote image is appended inside the existing HTML text wrapper. Text nodes and signature are unchanged. If the public URL is invalid, the message is prepared without the pixel and a configuration warning is shown; core sending remains available. Pixels on seed tests are omitted so placement testing does not require an open-tracking service.

### Local pixel server (Option 1)

When using the self-hosted pixel listener (`src/pixel-server.mjs`), reverse-proxy the **pixel listener only**, for example:

```nginx
# Within an HTTPS server configured with your own valid certificate:
location ~ ^/o/[A-Za-z0-9_-]{43}\.gif$ {
    access_log off;
    proxy_pass http://127.0.0.1:4319;
}
# Do not proxy the dashboard/admin port 4317 publicly.
```

For a base path such as `/tracking`, strip that prefix at the proxy so the upstream sees `/o/<token>.gif`. On a different host, provide a private authenticated network path to this instance's pixel listener; there is no cloud deployment included. Public requests must reach the same state-owning instance. Disable request-URL logging in proxies/CDNs because URLs carry bearer-like tracking tokens. The GIF listener serves only matching GET/HEAD requests and never exposes application APIs. Unknown tokens return the same GIF without storage. HEAD requests do not record opens.

Requests before the durable attempt are ignored to reduce composer-preview noise. Repeated requests within one UTC hour coalesce, with at most 96 recent hourly open buckets and 100 recent event entries per message. No recipient IP, user agent, cookies, or request headers are stored. This is intentionally not an exact request/human-open counter. Stop collecting existing links by clearing an enable/consent flag and restarting.

Remote-image blocking creates false negatives. Apple privacy proxies and security scanners create false positives. The composer itself, forwarding, image caching and later re-fetches can affect signals. No request proves a human read or visually saw the message. The public endpoint, proxy and provider behavior need end-to-end deployment verification. The application does not bypass client privacy protections.

## 24/7 Firebase cloud open telemetry sync (Option 2)

Running a self-hosted pixel server on a local desktop PC has a fundamental limitation: if the PC is shut down, asleep, or disconnected, any emails opened by prospects are missed.

Outreach Desk integrates with Google Firebase via `src/firebase-sync.mjs`:
- The cloud endpoint serves a 1×1 GIF and records `{ token, tokenHash, pcId, openedAt, synced: false }` under `email_opens` in Realtime Database or Firestore.
- The desktop scans by key/document ID in pages of 250, up to 20 pages per database/run. It saves continuation cursors and resumes on the next sync, then starts another sweep so newly inserted keys cannot be permanently missed. Query APIs follow the [Realtime Database documentation](https://firebase.google.com/docs/database/admin/retrieve-data) and [Firestore cursor documentation](https://firebase.google.com/docs/firestore/query-data/query-cursors).
- A valid original local tracking token or token hash is required. PC ID alone never acknowledges a cloud event. Mismatched PC IDs can be recovered through token ownership and are reported.
- Local records and durable receipts are saved **before** cloud acknowledgement. Acknowledgement failures retry safely. Acknowledged events are also scanned for recovery from older versions; receipts prevent replay when local timelines have trimmed older hourly buckets.
- Selected database failures, malformed/unknown local events and incomplete scans are visible; no failed request is labelled up to date. Reads and writes have timeouts. A timed-out acknowledgement may still complete remotely; local evidence is already saved before it is issued.
- Large databases require repeated sweeps and incur database reads. Per-run limits are visible in Settings. A completed sweep is a point-in-time scan; newly arriving events can be picked up on a later sweep.

### Credentials and Settings

Credential discovery honors an explicit `FC_FIREBASE_CREDENTIALS_PATH` or `GOOGLE_APPLICATION_CREDENTIALS` first, then the active data folder's `firebase-service-account.json`, then raw/base64 environment credentials, then individual project/email/key variables. Invalid explicit paths are reported without silently selecting another key. Paths relative to the app root work on Windows and macOS; `FC_DATA_DIR` is respected. Environment or file changes require restarting the app.

Settings provides editable PC ID, public tracking URL, database selection (`rtdb`, `firestore`, `both`), and sync mode. Saved PC ID/URL override their environment values; blank fields use the environment. Existing installations retain `both` until the operator selects the database their endpoint uses. Automatic mode checks at startup and every 15 seconds while the app runs; Manual mode requires **Sync opens now**.

The live diagnostics panel shows hostname/platform, effective PC ID and source, team worker UUID, data folder, project/database URL and source, credential location (no keys), telemetry/consent flags, local record/token counts, last attempt/completed scan, errors and per-database scan results. Warnings identify missing IDs/credentials/URLs/tokens, disabled tracking, manual mode, and `/t/PC` route mismatches. Editing a URL affects future messages only.

See [SYNC-REPAIR.md](SYNC-REPAIR.md) for the four-PC incident, safe update instructions, and read-only aggregate audit command. Keep each PC's original data folder; cloud events alone cannot reconstruct a lost local token-to-message mapping.

## Seed inbox setup and manual workflow

Configure `FC_SEEDS` with only mailboxes you own or have permission to inspect. A minimal manual configuration:

```dotenv
FC_SEEDS='[{"id":"gmail-test","email":"your-dedicated-test@gmail.com","provider":"gmail"},{"id":"outlook-test","email":"your-dedicated-test@outlook.com","provider":"outlook"}]'
```

In the dashboard select the active campaign and template, open **Email Tracking → Seed Testing Studio**, choose a content sample from the currently loaded lead page, and enter a unique test key. **Create seed plan** reserves records but sends nothing. **Send seed** submits each dedicated test message through the existing Playwright composer after checking signature, mailbox interval and quota. The sample lead is never contacted by this action; only the configured seed recipient is addressed. Seed sending requires the continuous queue stopped, no existing compose window, and a dedicated sending profile without shared-team mode. Existing normal team sending is unchanged.

Repeated requests with the same key and identical content reuse the plan; changed inputs with an existing key are rejected. Each seed is durably reserved before composition, so a crash/timeout cannot automatically resend it. If a test is interrupted even before its Send attempt, inspect webmail first; an intentional replacement test needs a new key. Already attempted records remain blocked after restart. Tests deliberately append `[FC seed <UUID>]` to subjects for exact folder correlation; this suffix can affect placement and should be considered when interpreting results.

Without inbox access configured, open each dedicated mailbox yourself and inspect Inbox/Spam/Junk/other folders. Click the record in Email Tracking to open the **Timeline Drawer**, select **Manual seed placement**, add folder/time evidence, and save. No automated placement is claimed. Manual evidence is retained as an operator assertion, separate from IMAP evidence; the worker does not override manual results.

For automatic inspection add `host`, optional `user` (defaults to seed email), `accessTokenEnv` or supported `passwordEnv`, and optional `folders: {inbox, spam, other: []}`. The worker reads configured folders (Inbox and discovered special-use Junk by default). Override localized folder paths explicitly, including Gmail's Spam path where necessary. Messages must match the unique subject plus sender and seed recipient. Multiple copies become an explicit review result. Until one hour after confirmation, absence is `awaiting`; afterward it is `not_found` in configured folders, not a delivery failure. Checks continue for seven days, permitting delayed arrival or later moves.

Gmail supports [OAuth IMAP authentication](https://developers.google.com/workspace/gmail/imap/xoauth2-protocol); where permitted, a provider-issued app password can be used only with explicit `authMode: "app_password"`. Outlook uses [Microsoft's OAuth IMAP flow](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth) and the implementation requires an access token for `provider: "outlook"`. Yahoo can use an authorized app password with the same explicit mode and actual account IMAP/folder settings. Never use ordinary Gmail/Outlook credentials as an assumed shortcut or bypass security controls.

Obtain tokens through your organization's/provider's approved OAuth flow and permissions. OAuth enrollment, consent and refresh-token storage/refresh are not implemented: supply a valid access token through your managed environment and restart the app when rotating it. Expired tokens back off and show Needs attention; they never become invented placement results. No credentials, token enrollment or test inboxes were available for live verification.

## Reporting and domain health

Email Tracking filters by campaign, recipient/subject, UTC date range and status; campaign summary metrics reflect those filters. Recipient details expose IDs, send timestamps, confirmation, bounce diagnostics, open-signal timestamps, placement and recent events. Review notifications are shown separately. Seed and ordinary sends are both included, with seed IDs in record details. Total recipients means unique addresses in the filtered tracking records, not all unsent workbook rows; the existing dashboard continues to show imported lead totals.

Observed bounce rate is defined as unique tracked messages with a current hard/soft DSN failure divided by attempted tracked messages in the filtered view. It is an observed sample and can undercount missing DSNs. Open signals count unique messages with an image request, not human readership. Delivery unknown counts attempted messages without a correlated DSN failure; neither silence nor image requests become inbox-delivery evidence. Seed Inbox/Spam/other/not-found/awaiting metrics are based only on explicit placement evidence.

Enter the sending domain and the actual DKIM selector(s) under Domain authentication checks. Checks identify missing/multiple SPF or DMARC records, dangerous SPF `+all`, missing/revoked DKIM keys, and DNS lookup errors. The result is a limited TXT-record check, not full DNS syntax/SPF ten-lookup evaluation, real-message DKIM-signature verification, or DMARC alignment testing. No DNS records are written and no universal deliverability score is calculated. Use the provider's actual instructions and headers from a controlled received seed message to investigate alignment and signing.

Local APIs:

- `GET /api/tracking?q=&campaign=&status=&from=YYYY-MM-DD&until=YYYY-MM-DD&offset=0`: paginated records (50/page), aggregate dimensions, monitor status, latest 50 unmatched notices, safe seed configuration.
- `GET /api/tracking/domain?domain=example.com&selectors=selector1,selector2`: read-only public TXT lookups.
- `POST /api/tracking/seed-plan`: `{testKey, leadId, key}` (active campaign/profile/template).
- `POST /api/tracking/seed-send`: `{trackingId}`; sends exactly one reserved seed test.
- `POST /api/tracking/manual-placement`: `{trackingId, status, evidence}`.
- `POST /api/tracking/sync-firebase` (or `/tracking/sync-firebase`): force immediate Firebase open telemetry synchronization.

POSTs retain the existing loopback Host/Origin and `X-FC-Request: 1` checks. The existing full-history JSON export now includes safe tracking records, seed plan metadata and unmatched DSNs; it omits open-token hashes. Treat exports as private: history still includes recipient metadata and rendered email bodies. Back up/retain/delete the private data folder according to your operational policy. There is no new automatic data-retention scheduler. Events and open buckets are bounded per message, while legitimate message records, cursors and DSN/review audit entries persist; very large installations should plan storage/archival and a future database migration.

## Verification and end-to-end test

```sh
npm test
# Includes real local HTTP listeners; fake send adapter, mocked IMAP/DNS, no real mail.
FC_BROWSER_TESTS=1 npm test
# Also runs headless Chrome against synthetic HTML, with fake pixel URLs intercepted.
# Windows PowerShell: $env:FC_BROWSER_TESTS='1'; npm test
```

Tests cover fresh confirmation, failed/pre-submit and uncertain sends, durable reservation failures, permanent/temporary/multipart DSNs, duplicate processing, wrong-recipient/sender/ambiguous correlation, Sent reconciliation, open endpoint/deduplication/bounds/outage, Firebase RTDB/Firestore syncing and credential auto-discovery, Inbox/Spam seed evidence, worker backoff/TLS/auth rules, reporting, migration and restart deduplication. Existing continuous-queue/coordinator/XLSX regression tests still run. This JavaScript project has no TypeScript or configured lint tool; syntax checks and `git diff --check` supplement the suite.

For a real, explicitly authorized end-to-end test:

1. Use a designated test sending mailbox and dedicated seed recipients; stop the normal queue. Configure IMAP and seeds, then restart and connect Playwright normally.
2. Create a seed plan and send one seed per configured interval. Check webmail confirmation, monitor state, Sent Message-ID, and Inbox/Spam evidence. Confirm a second send of the same record is blocked.
3. For optional open signals, first deploy the HTTPS proxy or configure Firebase credentials, then prepare a normal message addressed only to a designated test recipient, with both flags enabled. Verify the preserved signature/body and raw received HTML, fetch its image, and inspect `open_detected`. Repeated fetches in the same hour should add no bucket.
4. Use a mailbox-controlled DSN fixture or an approved provider test address to test a genuine failure. Check its original Message-ID and failed recipient before expecting an automatic match. Do not create unsolicited invalid-recipient traffic. Missing identifiers must stay in manual review.
5. Restart the app and verify records, failures, seed plan and suppression survive. Stop IMAP access and verify backoff without new sends or invented placement results.

Live Namecheap HTML/Message-ID retention, real bounce notifications, seed-provider OAuth access, remote pixel reachability and actual domain records were not exercised with credentials. Synthetic tests validate the implementation paths, not production deliverability or every recipient's spam placement. Windows launchers remain unexecuted on Windows in this environment.
