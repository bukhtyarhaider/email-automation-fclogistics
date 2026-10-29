# Outreach Desk 2.2.0-rc.1 — reviewed imports and carrier conversations

Feature branch: `feat/import-repairs-carrier-conversations`.
Previous stable build: 2.1.0. This is a release candidate for review, not an automatically approved production deployment. Experiments 01–03 are integrated into the normal app; Team work remains on `feat/sales-experiments` and is excluded from this candidate.

## What is integrated

Run the normal launcher or `npm start`; use the normal sidebar. There is no separate experiment server or login system in this workflow.

- **Leads Workspace → upload XLSX → Import review & repairs.** New browser uploads are paused and require a reviewed revision before outreach. Existing campaigns keep their previous state and sending behavior. The advanced local-path `/api/import` endpoint retains its established import behavior; its mappings can subsequently be reviewed through the same sidebar.
- **Import review & repairs.** Inspect headers and bounded source samples, select company/email/Status columns with dropdowns, or use advanced JSON. Add a Status header only in an entirely unused column. Preview the exact proposal, record source provenance, then save it. Status may not point to company, operating status, USDOT or another mapped field. Custom outreach columns must have an explicit Status/outreach-status label.
- **Activate a selected revision.** Stop outreach and close the prepared composer first. Activation validates workbook/identity hashes, retains old contact protections, creates a separate campaign working workbook and durably switches the campaign pointer. The campaign stays paused. Inspect its leads and explicitly enable it in Campaigns when ready. Original uploaded workbooks and immutable revision copies are retained.
- **Undo last activation.** Restores the previous workbook pointer, mapping and review metadata while keeping outreach paused. It checks that the retained previous workbook is unchanged. Send history, suppression and saved revisions are not rolled back. An earlier reviewed revision may also be activated as a new working copy; retained history/protection guards prevent it from making previously contacted addresses new again.
- **Carrier identity & source.** Activated imports attach stable carrier/contact IDs and row-level provenance to normal lead details. Consistent source USDOT identities group across campaigns within this PC’s workspace. Missing/conflicting/layout identities remain provisional or unresolved. IDs are source evidence, not FMCSA verification.
- **Carrier conversations.** Shares the existing app shell. Exact message references and participant checks match replies to confirmed local sends; uncertain or subject-only evidence requires explicit review. Original sends and captured messages are shown as escaped plain text. Links from lead details and Send History search this inbox for the contact. No reply is sent by this screen: use the existing mailbox for responses.
- **Protection in the real sender.** Captured definite opt-outs immediately guard normal outreach, appear in the regular Do Not Contact state and survive restart. The sender checks the guard again immediately before clicking webmail Send. There is no automatic resend after uncertainty. A capture-storage fault blocks outreach until a successful durable recovery. Category edits, ignoring a message and revision restoration never erase captured opt-outs.

## First-use walkthrough

1. Back up this PC as described below, then start the candidate against the intended workspace after review approval. Existing campaigns need no automatic conversion.
2. Upload a workbook from Leads Workspace, or open Import review and select an existing campaign.
3. Choose **Review saved mapping**. Inspect raw headers/samples and any layout/missing-status issues. Choose columns, optionally add a new Status header, then **Preview changes**.
4. Enter where the leads came from; keep acquisition/permission unknown if not established. Check the save acknowledgement and **Save reviewed revision**. This saves a copy only.
5. Select that revision and **Use selected revision for campaign**. The confirmation explains the paused state and retained copies. A changed campaign/workbook requires refresh/review rather than overwriting newer work.
6. Inspect normal lead details for identity, source evidence and exclusion reasons. The existing Active/out-of-service/hidden/status/duplicate/history checks still apply; a repaired mapping alone does not make a prospect eligible.
7. Enable the campaign in Campaigns only when its scope and eligible records are correct. Resume sending through the existing prepare/review/send or continuous workflow.
8. Open Carrier conversations. Without a live connection, **Load local sent history**, then import an authorized `.eml` export under its actual mailbox. The mailbox must have confirmed local sent history. Inspect the match/category, enter review notes and explicitly link uncertain messages only with evidence.
9. Test Undo last activation in a stopped workspace. It must restore the prior workbook and keep outreach paused without clearing history or opt-outs.

## Live mailbox setup

Conversations → **Read-only mailbox capture settings** stores only nonsecret metadata on this PC: account email, login user, IMAP host, Inbox/Sent folders, backfill date, batch size and credential environment-variable names. Add up to 20 authorized mailboxes. TLS port 993 is required. Blank Sent folder uses the provider’s special-use Sent folder when available.

Put credential values in this PC’s private `.env` file and restart through the normal launcher. For example, a mailbox can reference `REP1_IMAP_PASSWORD`; the secret itself is never entered in mailbox JSON. OAuth uses `accessTokenEnv`. Gmail/Yahoo password access requires a provider-approved app password mode; Outlook requires OAuth. This build does not enroll or refresh provider tokens. Use the provider’s legitimate authorization process.

Enable capture only after checking the explicit read-only authorization box. **Check configured mailboxes** starts a bounded check; monitor progress, errors and next eligible times in the screen. Enable automatic checks only if wanted. Saved UI configuration takes precedence over the environment defaults `FC_REPLY_CAPTURE_ENABLED`, `FC_REPLY_AUTO`, `FC_REPLY_MAILBOXES`, `FC_REPLY_SINCE` and `FC_REPLY_BATCH`. `FC_EXPERIMENT_REPLY_*` flags never enable production capture. Live capture defaults off. Delivery/bounce monitoring keeps its independent settings and cursors.

Capture/setup tools open for an empty inbox and collapse on later visits when conversations exist. Protection delivery status remains visible above the inbox. The worker opens Inbox/Sent read-only, does not mark/move/delete messages, and processes 1–100 messages per folder/check (default 50). Its scheduler checks due accounts every 15 seconds; successful accounts wait at least 60 seconds, failures back off. Search-page completion is not complete historical coverage. Restart backfill preserves messages/reviews/protections and is rejected while a capture lock is active. UIDVALIDITY/lookback changes re-scan with deduplication. Failed fetch/storage does not advance a failed message’s cursor. Imported EML and capture share the same parsing/matching rules; unrelated/oversized/malformed evidence is skipped or retained for review as documented in the diagnostics.

Coverage is local: only confirmed send histories present on this PC can anchor replies. Other PCs’ histories and private mail are not automatically synchronized. Missing outbound Message-IDs, unsupported provider/quote formats, alternate participants and reused IDs may require original-mailbox inspection. Header dates and capture times are distinct. Counts measure captured messages, not conversion, delivery, inbox placement or proof of human reading. Manual Send History reply reviews remain separate assertions and do not fabricate captured messages.

## Coordinator protection and recovery

When team mode is enabled, captured opt-outs are queued durably for the existing coordinator’s suppression API. Local protection does not wait for network success. Retry runs immediately and on the regular scheduler; acknowledgements are saved, and an interrupted acknowledgement is safe to replay. The inbox shows pending delivery. Keep the coordinator connected and inspect pending items before assuming another PC is protected. Independent-PC mode cannot protect another machine remotely. Firebase open-event sync does not share reply bodies or replace coordinator suppression.

An opt-out must remain held unless its underlying permission/evidence has been deliberately resolved. This candidate does not offer a captured-opt-out override: the generic Do Not Contact removal action explains the hold instead of silently clearing it. Correcting a category or ignoring review evidence is reversible, but does not withdraw a recorded opt-out. Full original context remains in the mailbox.

## Storage, backups and rollback

All new production state lives under the existing PC’s data folder. `data/carrier-workspace/` contains immutable workbook revisions, mapping/source records, identity registry, captured plain-text messages, read-only cursors and review events. Normal `data/state.json` retains campaign pointers, capture settings, suppression and coordinator retry acknowledgements. Secret values remain in `.env`; browser sessions stay in their existing PC-specific folder. The old `experiment-data/` workspace is preserved separately and is not silently imported into production. Re-review an experiment proposal or import an authorized EML through the normal UI when needed.

Before updating, click **Stop outreach**, wait for the current operation to finish and close any prepared message. Then stop this PC’s app and back up **the entire data folder and its own .env**. Retain `team-data` if it hosts the coordinator. Extract the versioned ZIP over application sources, preserve private data/configuration, run Setup when dependencies changed, start and verify the candidate version in Version Catalog. Never copy another PC’s state, browser profile or credentials. No other PC is installed or verified by this package.

To undo a workbook activation, use the in-app action while stopped. To roll back the application version, stop it, restore the matching pre-upgrade data backup and previous application package together. Keep a separate copy of any newer send/reply evidence for reconciliation; never discard post-backup attempts and then restart sending. Immutable revision downloads help recover mappings/source copies; a missing/corrupt current workbook or altered archive needs backup recovery before activation. A failed publication leaves the previous campaign pointer in place; retained files may include an unreferenced interrupted copy, which is never auto-sent.

One process owns a data folder through the existing `app.lock`. The revision/reply archive also uses a flushed atomic writer and `write.lock`; reply scanning has `reply-capture.lock`. After a crash, verify/stop the recorded process before removing only a stale lock. Never delete history/protection files to clear a wait or lock. Interrupted archive writes keep the last published JSON/revision. Malformed saved reply/protection state fails closed rather than treating missing knowledge as permission to send.

No shared filesystem service, public/LAN listener, account/ownership workflow, automatic retention/archival, production sequence sender or cross-PC inbox is added. The existing local host/origin/CSRF protections remain. Back up the full workspace; larger inboxes need storage/retention planning before long-running team deployment.

## Release checks

Automated results and package inspection are recorded in VALIDATION.md after the final run. Synthetic/local checks do not verify provider authorization, folder retention, native Windows behavior or another PC’s installation. Before approving a rollout, use one designated authorized mailbox to check its Inbox/Sent mapping, real reference headers, quoted opt-outs and recovery behavior. No real customer email is sent or fetched automatically during release preparation.
