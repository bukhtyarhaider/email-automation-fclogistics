> Release preparation: experiments 01–03 are now integrated on `feat/import-repairs-carrier-conversations` as **2.2.0-rc.1**. See [the release guide](../IMPORTS-AND-CONVERSATIONS.md). The user declined shipping Team work and requested this release work on 29 October 2026. `feat/sales-experiments` remains at its separate Team work checkpoint (`5628fc0`) for later research. No further experiment or production rollout is authorized by this release candidate.

# Sales experiments

Branch: `feat/sales-experiments`. Base: `main`, Outreach Desk 2.1.0.

The user authorized an experimental branch on 29 October 2026. Work proceeds one feature at a time. Each completed feature is handed to the user for testing. Do not start the next feature, merge into main, deploy to team PCs, or label a feature production-approved until the user gives the relevant direction. Approval to experiment is not production approval.

The team has five salespeople and uses this tool for signing U.S. carriers by email. Keep the early experiments focused on email conversations and signing. Calls, appointments and invoicing are optional later workflows.

## Experiment order and decisions

| ID | Experiment | Status | User decision |
|---|---|---|---|
| 01 | Read-only import review and temporary mapping previews | Implemented; automated checks passed | Accepted for experiments on 29 Oct 2026; production pending |
| 02 | Explicit import repairs, source provenance and durable carrier identity | Implemented; automated checks passed | Authorized next experiment on 29 Oct 2026; production pending |
| 03 | Human reply capture and consolidated conversations | Implemented; automated checks passed | Awaiting user test |
| 04 | Carrier ownership and daily next-action queue | Planned | Pending |
| 05 | Qualification and email signing pipeline | Planned | Pending |
| 06 | Manual follow-up tasks; guarded sequences after reply reliability is proven | Planned | Pending |
| 07 | Approved offer, objection and proof library | Planned | Pending |
| 08 | Shared outcome dashboard and controlled template experiments | Planned | Pending |
| 09 | Selective FMCSA and contact enrichment with freshness/spend controls | Planned | Pending |
| 10 | Agreement evidence and dispatch handoff | Planned | Pending |
| 11 | Optional reviewed AI reply drafts and summaries | Planned | Pending |
| 12 | CRM/calendar/calling/messaging/billing/TMS integrations when an observed need justifies them | Deferred | Pending |

Future sales metrics include qualified accepted signings, signings per 1,000 distinct contacted carriers, human/positive reply rates, qualification rate, terms-to-sign rate, response time, overdue tasks, stage age, loss reasons and cost per accepted signing. Keep carrier/message denominators distinct, show cohort maturity and monitoring coverage, and retain unknowns rather than treating missing outcomes as zero. Image requests are secondary signals, not human reading or buying intent.

Provider permission and outreach provenance must be addressed before expanding automated acquisition or follow-ups. Preserve existing sender/signature/reservation/suppression/uncertainty controls. Do not spend on external integrations or send test messages without the required task authorization.

## Experiment 01 — read-only import review (initial checkpoint 780cb9f)

Experiment 01 was accepted by the user with “its good continue with the next”. The historical behavior below describes checkpoint 780cb9f; the current experiment-two server adds isolated saves described afterward. Both are deliberately separate from the normal app. It reuses the workbook parser in an optional review mode and the existing brand styles. The preview server has no sender, mailbox connection, background monitoring, Firebase sync, workbook patch, campaign save, or automatic state migration.

Run from this branch:

```sh
npm run build:ui
npm run experiment
```

Open `http://127.0.0.1:4327`. The normal app uses its existing port and launch process. Stop this preview with Ctrl+C.

By default the preview reads this checkout's `data/state.json` and configured workbook files. It never writes them. To review a different data folder, set `FC_EXPERIMENT_SOURCE`; set `FC_EXPERIMENT_PORT` if 4327 is occupied. There is no reason to copy mailbox sessions or credentials into the experiment. Python 3.9+ and Node 20+ are required, as in the normal app.

### User test

1. Choose an available campaign, then **Review saved mapping**. Missing workbook files appear unavailable.
2. Inspect the summary, original headers and sample source rows. Issue counts cover all parsed rows; samples are limited to three ordinary plus three flagged rows per sheet.
3. Edit **Proposed mapping (JSON)** using exact sheet names and Excel column letters. Click **Preview changes** and inspect the result and flagged-row delta.
4. Try malformed JSON or an invalid column. An error should appear and your draft should remain editable.
5. Click **Restore saved mapping** to discard the temporary proposal. Reloading also discards proposals.
6. Report whether the counts, examples and mapping preview are useful and what should change. Actual saving/repair is provided by experiment 02 below.

Email-column candidates use syntax counts only. They are evidence for review, not automatic correction recommendations. A mixed-layout sheet can require splitting the source rather than remapping every row. Invalid/missing email, duplicate and layout categories can overlap. This is not a full sending eligibility report or a mailbox verification service.

A clean Git branch separates code, not private runtime data. Continue using the dedicated read-only preview for this experiment; do not launch changed sender builds against production data just because a separate branch exists.

## Validation record

Record automated checks and the user's test decision here after each experiment. Future experiments should document any state migration, rollback method, external credentials, actual sends and production decision explicitly.

### Experiment 01 — 29 October 2026

- Full regression: 111 JavaScript tests and 9 Python tests passed, including synthetic Chrome checks. No real email was sent.
- Focused HTTP/browser checks passed after the mobile layout fix. Desktop (1440px) and mobile (390px) screenshots were visually inspected.
- Byte-for-byte checks verify state/workbook immutability after saved/proposed mapping reviews. Host/origin/request-header checks, invalid mappings, missing/outside workbook paths, oversized requests and unavailable sending/save routes are covered.
- The available local workbook was reviewed without modification: 9,208 parsed rows, 1,820 flagged layout rows and 2 sheets without a Status column. These figures describe this local copy only.
- User acceptance: accepted for continued experiments on 29 October 2026. Production approval remains pending. The user authorized experiment 02 next.


## Experiment 02 — repair revisions, provenance and carrier identity

Current preview: `http://127.0.0.1:4327`, using the same `npm run experiment` command. The normal app remains unchanged. Restart the experiment process after updating its code and reload the page.

### Storage and recovery

- Source: `FC_EXPERIMENT_SOURCE` (default `data/`). State, workbook files, source mappings, history, suppression, credentials and browser profiles are never modified by these experiment routes.
- Destination: `FC_EXPERIMENT_DATA_DIR` (default `experiment-data/`, excluded from Git). It must be separate from the source folder, including symlink targets.
- Every explicit save creates an immutable revision containing `original.xlsx`, `working.xlsx` and `records.json`. The atomically published `imports.json` stores mappings, provenance, carrier registry, contact-protection markers, revision history and active-revision pointers.
- Mapping repairs change the interpretation of fields in a snapshot. They do not shift source rows or rewrite existing cells. The only supported workbook mutation is an explicitly requested new Status header in a completely unused column of an experiment copy. Existing columns, styled cells, formulas and unrelated ZIP parts are preserved. Merged sheets require manual source review.
- **Restore selected revision** moves the experiment's active pointer to an older immutable revision. Newer revisions, identity registry and contact protections are retained. Restoring does not edit the original campaign or delete history.
- The source workbook hash, source state hash and workspace generation bind a save to its preview. A changed source/workspace or a preview older than 15 minutes requires a new preview. Repeated submissions of the same applied preview return the same revision, including after restart.
- Source and working snapshots are hashed. Downloads and restores reject altered copies. Records have a separate integrity hash. Files are flushed before the active manifest is published.
- An interrupted save can leave an unpublished revision directory; it is retained for inspection and never treated as an active revision. Failures before manifest publication leave the previous active revision intact. If the response is lost after publication, retrying the same preview returns its existing revision. Back up the entire experiment-data directory to retain identity and revision history.
- A concurrent writer is rejected using `write.lock`. After a crash, inspect its recorded PID and confirm that writer has stopped before manually removing the stale lock. Never delete the manifest as a way to recover a lock.
- Saved revisions remain viewable/restorable/downloadable if the original workbook later becomes unavailable. Creating another repair requires an available source.

### Identity boundaries

Consistent source-reported USDOT values, with compatible company/MC evidence, reuse a durable carrier UUID across campaigns, row reordering and process restarts. Email contacts get a separate stable ID within that carrier. These identifiers are not verified against FMCSA in this experiment. The registry is local to this experiment workspace; cross-PC identity synchronization is a later integration.

Conflicting company/MC evidence for the same USDOT, malformed-layout rows, and absent/invalid USDOT values remain explicitly unresolved or provisional. Provisional IDs are scoped to the source import and row evidence; they are not cross-import company matching. Similar company names and matching email addresses alone do not merge carriers. Mapping corrections can be previewed to resolve source issues; there is no automatic fuzzy merge or manual authority-verification feature here.

Each saved row retains its source workbook name/hash, campaign/import/revision IDs, worksheet/row, import time, user-entered source label, optional acquisition date, and operator-stated contact-permission status. Unknown stays unknown. A permission selection is an operator assertion, not a legal or provider authorization check.

Prior attempted recipients, suppression and source prior-contact/opt-out markers accumulate in the experiment protection ledger. Repairs and revision restores cannot erase them. The normal app's sending ledger is untouched. Checkpoint ea65034 had no sender, mailbox connection, Firebase/IMAP worker, or production-save route. Experiment 03 below adds separately opted-in read-only IMAP capture; production sending remains disconnected.

### User test

1. Select a campaign and **Review saved mapping**. Inspect headers, sample rows and the identity preview.
2. Edit **Proposed mapping (JSON)**. If needed, explicitly request new Status headers with e.g. `{"Leads":"F"}` in **Add missing Status headers**. The worksheet evidence suggests an unused column, but does not apply it automatically.
3. Click **Preview changes**. Check the counts and resulting mapped Status column. An occupied column or conflicting proposal must show an error and retain your draft.
4. Enter where the leads came from, optionally the acquisition date, and the contact-permission status. Check **Save to the experiment workspace only**, then **Save experiment revision**.
5. Inspect the saved carrier/contact IDs, source evidence and preserved protections. Search and page through records. Download the workbook copy, original snapshot, or mapping/provenance from the revision selector.
6. Save a second reviewed revision. Select the first, click **Restore selected revision** and confirm the experiment action. Both revisions should remain available.
7. Reload the page, select the campaign and confirm the active revision and identities persist. Use **Use revision as draft** to start another proposal; preview again before saving.
8. Give feedback before experiment 03. This does not authorize a production merge or team-PC deployment.

### Validation record for experiment 02

- Full JavaScript regression: 120/120 tests passed, including synthetic Chrome and the isolated repair HTTP/UI workflows. No real email was sent.
- Python regression: 12/12 tests passed after the final worksheet-dimension edge-case fix, covering Status-header insertion, occupied-column rejection, formulas/styles/ZIP-part preservation and normal workbook behavior.
- Identity/store checks were rerun after that fix: normalization, conflicting identifiers, restart and cross-import IDs, source/protection preservation, stale/expired previews, duplicate submission, concurrent writers, failed publication, snapshot integrity, revision restore, missing-source recovery and symlink overlap rejection passed.
- Desktop (1440px) and mobile (390px) repair screenshots were visually checked. Browser tests cover saving two revisions, restoring an older one, reload, source/identity/protection display, filtering, draft reuse and page bounds. A confirmation/preview timing issue found during testing was fixed and rechecked.
- The actual local workbook was previewed without applying a repair; parsed-row counts remain 9,208 with 1,820 flagged layout rows and 2 sheets missing Status. No actual-source repair was auto-applied.
- The user authorized experiment 03 next on 29 October 2026. Production approval remains pending.


## Experiment 03 — reply capture and consolidated conversations

Page: `http://127.0.0.1:4327/conversations`. Import review/repairs remain available at `/`. This is one consolidated local workspace for the configured mailboxes. Authenticated access from multiple PCs, salesperson ownership, next-action tasks and outbound reply composition are later experiments; they are not implemented or deployed here.

### Try it without mailbox credentials

1. Open **Conversations**, then **Load sample inbox**. Eight synthetic items cover pricing, interest, quoted opt-out text, an actual opt-out, out-of-office, an automated response, a structured bounce and an unmatched message. No message is sent or fetched.
2. Open a thread. Check the original-send snapshot, newly written reply text, headers/references, capture timestamps and suggested categories. Samples are a separate mode and never contribute to real/imported message counts.
3. Edit a category/note and **Save reply review**. Unmatched items require a selected conversation from the same mailbox, explicit link confirmation and an evidence note of at least five characters. Subject similarity is insufficient.
4. Use **Ignore review item** with a reason to remove an irrelevant unmatched item from the active queue. The **Ignored review items** filter provides **Return to review**. Both actions retain message history, audit events and protections.
5. Type an unsaved note, refresh the inbox, switch threads and come back. Drafts stay while navigating this page; reloading discards unsaved drafts. Saved notes persist after restart.
6. For your own evidence, use **Load local sent history**, then import an authorized exported `.eml` file (up to 2 MB) under the correct mailbox. That mailbox must have confirmed source send history. Inspect the exact match or pending review. Reimporting the same message must not duplicate it.
7. Give feedback before experiment 04. No production merge, provider connection or team-PC deployment has been performed automatically.

### Live read-only capture setup

Copy `.env.experiment.example` to the ignored `.env.experiment` file. Configure only mailboxes you are authorized to inspect, using `passwordEnv` or `accessTokenEnv` references rather than secrets embedded in JSON. Set `FC_EXPERIMENT_REPLY_CAPTURE_ENABLED=1`. Start with:

```sh
node --env-file=.env.experiment scripts/experiment.mjs
```

Select **Check configured mailboxes** for manual capture. Set `FC_EXPERIMENT_REPLY_AUTO=1` only if you want periodic background capture. A 15-second scheduler checks due accounts; successful accounts wait at least 60 seconds, failures back off up to an hour. No production monitor flags are inherited as authorization for this worker. No SMTP/webmail send action is available.

`FC_EXPERIMENT_REPLY_MAILBOXES` supports up to 20 uniquely identified mailboxes. `email` is the sender identity represented in source history; `user` defaults to it but can be the provider-authorized login identity. `host`, optional `sentFolder` and `inboxFolder` define the account. Sent can be discovered by its special-use flag. TLS certificate validation is required. Outlook requires OAuth; Gmail/Yahoo app passwords require an explicit supported app-password mode. Token enrollment/refresh is not implemented: use the provider's legitimate authorization flow and rotate/restart as needed.

The default backfill starts 30 days ago; set `FC_EXPERIMENT_REPLY_SINCE=YYYY-MM-DD` for a different initial date. Each folder processes at most `FC_EXPERIMENT_REPLY_BATCH` messages (default 50; maximum 100) in UID order per check. More pages are visibly labeled incomplete. These are independent reply cursors in `replies.json`, not the production DSN monitor's cursors. UIDVALIDITY or lookback changes restart the bounded search, with message deduplication. **Restart reply backfill** clears only reply cursors/monitor checkpoints and is rejected during an active capture lock; messages, reviews and protections remain.

Mailbox history coverage matters: this experiment can correlate only source sends available in the selected source data folder, plus Sent evidence reconciled to those sends. It does not automatically read other PCs' private data or invent histories for their accounts. Load the correct source data before checking another mailbox. Different-address replies or reference-only messages without recognizable metadata can require a manual EML import/review or a renewed backfill after missing Sent evidence is available. A completed page/check is not proof that all historical replies were captured.

### Matching, classification and privacy boundaries

- Confirmed local source sends seed conversation anchors. Seed-test sends and uncertain/unconfirmed attempts are excluded. Exact outbound Message-IDs come from tracking or read-only Sent marker reconciliation using the existing tested reconciliation helper. Subject-only matching never establishes a thread.
- References can point to the original send or a previously captured inbound/outbound response. Automatic linkage requires a single candidate and matching sender/recipient context. Changed participants, reused Message-IDs, multiple candidates and missing identifiers remain in review. Missing-body records and ID collisions never become automatic matches during later source refresh.
- Source carrier IDs are attached only when an exact email has one consistent source-USDOT identity in the active import records. This is a source-data link, not authority verification or proof of a person's identity.
- Human replies are candidates inferred from headers and relevant message text. Out-of-office, automated messages and DSN notices remain separate; rules and categories are editable operator assertions. No classification proves buying intent, qualification or a human reader.
- Recognized quoted text and HTML quote blocks are stripped before suggestions. Definite newly written opt-outs from known contacts receive an experiment protection even when a conversation match is pending. Human replies pause relevant experiment follow-up markers; there is no sequence sender in this step.
- **Production suppression is unchanged.** The inbox displays a callout when a real opt-out is captured: apply it to the normal app's Do not contact list before further production outreach. Experiment import previews, saves and views project real reply protections, and a saved import accumulates them in its protection ledger. Category edits, ignored items, backfill resets and revision restores never clear them.
- Bodies are displayed as escaped plain text. Images/scripts are never rendered; attachments and raw MIME are not retained. Newly written text and original source-body snapshots are bounded to 24,000 characters with visible truncation flags. Source hashes, message references, capture provenance and operator review events support audit; complete context remains in the original mailbox.
- Envelope checks avoid fetching unrelated message bodies when relevance can be ruled out. Oversized/unparseable relevant messages become explicit review stubs with folder/UID evidence; failed fetches or storage do not advance a failed message's cursor. Unknown contacts without known references are not retained. Classification can be incomplete for unsupported quote formats or malformed provider data.
- Metrics describe captured messages in the selected data mode/mailbox, not carrier conversion. Search/category filters affect rows; the metric scope is explicitly labeled. Missing coverage never becomes a zero reply rate. Header dates are sender-reported; absent/invalid dates remain unknown and capture times are shown separately.

### Storage and recovery

`experiment-data/replies.json` contains conversation anchors, captured messages, independent cursors, mailbox diagnostics, opt-out protections and review events. It uses the experiment workspace's existing write lock plus an in-process write queue, owner-only files and atomic flushed replacement. Events and cursors commit together for inbound processing; Sent-ID enrichment is durable before its checkpoint advances. Replayed messages deduplicate by account, Message-ID and semantic fingerprint. Conflicting reuse enters review instead of overwriting earlier content.

One `reply-capture.lock` prevents competing scanners from advancing the same workspace. It contains the process PID. If a crash leaves it behind, stop/verify that process before removing only the stale lock; do not delete reply data to recover a scanner. Incomplete saves do not mutate source state or send anything. The test harness forces live experiment capture off, even when the operator's normal environment has it enabled; simulated clients exercise the IMAP path.

Back up the entire experiment workspace. Captured message/review history is retained; there is no automatic deletion/retention scheduler or cloud sync in this step. Larger deployments will need database/archival planning before production use. Local filesystem access controls apply; sharing this directory directly between PCs is not a substitute for an authenticated service.

### Validation record for experiment 03

- Full regression: 138/138 JavaScript tests and 12/12 Python tests passed, including synthetic Chrome and simulated IMAP. No real email was sent and no real mailbox was connected.
- Focused coverage includes exact/subject-only/ambiguous/participant-mismatch threading, nested replies, Sent marker recovery, conflicting Message-ID reuse, HTML/plain-text quote handling, opt-out negation, autoresponders, structured DSNs, manual linking, reversible ignored items, deduplication/restart, separate sample data, credential redaction and source-state immutability.
- Capture checks cover EXAMINE/read-only access, bounded independent UID cursors, UIDVALIDITY replay, failed fetch/storage handling, backoff, unrelated-envelope body skipping, review stubs, capture-lock conflicts, and preserving data/protections through backfill reset. The installed ImapFlow implementation was checked for EXAMINE and BODY.PEEK behavior.
- Browser checks cover samples, filters, unsaved draft retention, manual review/matching, EML import, inert script-like text, no external resource requests, reload persistence and desktop/mobile page bounds. A stale-thread display during conversation changes was corrected and rechecked.
- Desktop (1440px) and mobile (390px) screenshots were visually inspected. The live preview was restarted with capture/automatic flags explicitly off.
- Real provider authorization, folder retention, received-thread headers and live reply correlation were not exercised. Those remain designated-mailbox validation steps when the user enables read-only capture.
- User acceptance: pending. Production approval: pending. Stop after experiment 03 until user feedback.
