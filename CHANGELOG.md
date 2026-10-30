# Outreach Desk changelog

Current candidate: **2.2.0-rc.7**. Previous stable package: **2.1.0**.

The repository records package versions 1.0.0 and 2.0.0 before this release. Later updates often kept the same package version; they appear as dated milestones below. The historical Git label V1.1.0 did not change the recorded package version from 2.0.0.

## 2.2.0-rc.7 — 2026-10-30 (release candidate)

- Select dashboard attention from the entire carrier backlog before pagination; preserve stable ordering for incoming/outgoing messages sharing a header second.
- Preserve unsaved carrier status edits by carrier and bind saves to the original edited version. Refreshes cannot overwrite concurrent changes; an explicit reload action recovers the saved status.
- Closed/Signed workflow labels clear reply tasks until new incoming evidence arrives. Correct the read/unread action label after an update.
- Include recent exact-participant native outgoing history in follow-up waiting periods, even without thread references. Reserve internal capture IDs to protect scan progress.
- Keep approval, native mailbox Send, signatures, duplicate/uncertainty/opt-out protections and the existing shared design.

## 2.2.0-rc.6 — 2026-10-30 (release candidate)

- Grouped carriers by mailbox and confirmed tool-contacted email. Captured older Inbox/Sent chains remain readable as contact context, even with different or missing thread references; unlinked latest messages require review before drafting.
- Added Active / In review queues, carrier workflow statuses, dated follow-up notes, consistent carrier/thread read markers and retained status-change history. The individual-thread view remains available in Filters.
- Added reuse of existing delivery-monitor credential references for the matching saved mailbox profile, with explicit read-only capture authorization. Monitoring credentials and browser sign-in alone do not silently enable capture.
- Alternated historical folder pages so a large Sent folder does not starve Inbox, batched bounded metadata reads with safe per-UID fallback, and recovered missing original Sent bodies without duplicating tool sends.
- Bound draft approval to new carrier evidence across threads; retained independent opt-out, uncertainty and native mailbox Send safeguards. Carrier statuses never send email or release protections.

## 2.2.0-rc.5 — 2026-10-30 (release candidate)

- Restored the shared application header, labeled navigation, mailbox profile footer and developer details on Carrier conversations.
- Removed the separate Mailroom shell styling, including hidden status/version information and alternate notification/banner treatment. The shared mobile navigation rules apply across routes.
- Used the existing page heading, spacing, surface and border tokens around the conversation workspace. Queues, free writing, optional saved lines and exact approval retain their existing behavior.

## 2.2.0-rc.4 — 2026-10-30 (release candidate)

- Built the selected Mailroom layout in the normal Carrier conversations flow: list, latest carrier message and free reply editor together, with mobile list/detail navigation.
- Added direct search and Needs reply / All / Waiting tabs; preserved broader filters, mailbox setup, full thread evidence and review controls in dialogs.
- Review reply saves current wording and shows the exact text, account and recipient before approval. Optional saved lines support preview, insertion and reuse without replacing free writing.
- Preserved unsaved draft text while filtering/navigating; reject changed conversation evidence during approval and keep errors visible in the review dialog.
- Historical messages sort by their effective message time, rather than the order in which a scan imported them. Display names remain unverified email/header evidence.
- Kept current sender, signature, import, opt-out, uncertainty and shared protection workflows. Final Send stays in the user's existing mailbox.

## 2.2.0-rc.3 — 2026-10-30 (release candidate)

- Restricted conversation capture to threads anchored by confirmed tool sends, including older nonlatest tracking history. Imported contacts alone cannot start a conversation.
- Added a resumable full-history scan across available response folders, Sent reconciliation, cross-folder ancestry revisits, explicit partial states and stable incremental cursors.
- Added replied-contact filtering, first/latest reply dates and human-reply counts; replies elsewhere and recent contact activity prevent stale follow-ups.
- Replaced forced template use with free writing, searchable saved wording, previews, deliberate insertion/replacement, field buttons and retained wording versions.
- Shorter untouched starters ask one relevant missing question. Custom/archived wording and exact-text approvals remain preserved. Final Send stays manual in the existing mailbox.

## 2.2.0-rc.2 — 2026-10-29 (release candidate)

- Added the integrated reply desk with local intent suggestions, editable/versioned reply templates and evidence-backed carrier detail confirmations.
- Both unanswered human responses and no-captured-response follow-ups have work queues; dashboard highlights link to the exact conversation with explicit local read/unread tracking.
- Drafts require exact-text/account/recipient approval before copy. Edits/new evidence invalidate approval; cancel and retained versions support recovery. Final Send stays in the existing mailbox using native Reply and signatures.
- Keep operator-reported mailbox actions separate from captured matching Sent copies and delivery; never fabricate submission from approval alone.
- Expanded read-only capture to full history and archive folders, bounded resumable pages, stop/resume, partial folder failures, References-only changed senders and known carrier inbound-first reviews.
- Retained opt-out/uncertainty guards and added current coordinator checks before drafting, approval and copy when team mode is enabled. The deferred Team work/ownership experiment is still excluded.

## 2.2.0-rc.1 — 2026-10-29 (release candidate)

- Integrated import review, guided mappings, source provenance and stable carrier/contact identities into the normal campaign/lead flow.
- New browser uploads stay paused until a reviewed copy is activated. Immutable revisions, prior working files and Undo last activation support recovery; raw campaign settings cannot bypass mapping review.
- Added the normal Carrier conversations view, EML imports, read-only capture configuration, guarded reviews and links from leads/Send History.
- Captured opt-outs protect normal sending/Do Not Contact, with durable coordinator retries and a final pre-click check. Evidence faults fail closed.
- Serialized campaign publication with other state writes; redacted reservation tokens from lead responses and recovered partial queue defaults.
- Team work remains on the experiment branch. Live provider and team-PC rollout checks remain pending; see IMPORTS-AND-CONVERSATIONS.md.

## 2026-10-29 — 2.1.0 — Send insights and version catalog

Previous stable package release.

- Send-history filters for seen status, mailbox, campaign, template, UTC send dates and manual reply review.
- Confirmed sent/seen counts, seen rates, average/median/fastest first-seen intervals with explicit sample counts.
- Filtered CSV/JSON and statistics exports, hourly open evidence, and saved manual reply status and notes.
- Version catalog with recorded releases, dated update milestones, upgrade instructions and editable local release notes.
- Package, title bar and distribution filename consistently report 2.1.0.

## 2026-10-29 — 2.0.0 — Recover multi-PC Firebase opens

Update under the existing package version. Source: Git b8fb26c; VALIDATION.md.

- Paginated, resumable scans replace the blocked last-100 query.
- Token ownership recovers mismatched-PC and previously acknowledged events; local saves precede cloud acknowledgements.
- PC/Firebase Settings diagnostics, setup warnings, database selection and read-only audit command.

## 2026-10-26 — 2.0.0 — Queue wait and quota recovery

Update under the existing package version. Source: Git 3bafecd / eae8d1e; VALIDATION.md.

- Clear long scheduled waits and show the reason for required intervals.
- Confirmed hard reset starts fresh mailbox pacing counters while keeping history, suppression and uncertain-send protections.
- Shared coordinator pacing reset and desktop/mobile controls.

## 2026-10-21 — 2.0.0 — Cloud telemetry and launcher recovery

Update under the existing package version. Source: Git b3cdaff; VALIDATION.md.

- Realtime Database and Firestore open-event sync, credential discovery, manual/automatic sync controls.
- Single-instance launcher, stop/restart handling and modular UI build.

## 2026-10-20 — 2.0.0 — Compose fixes and configurable template checks

Update under the existing package version. Source: Git 69a8473 / 8ed2071 / 154a25c; VALIDATION.md.

- Mailboxes without signatures can prepare messages while existing signature validation remains active.
- Promotional and length checks support advisory, blocking and off settings.
- Git merge 154a25c was named V1.1.0; its package.json still recorded 2.0.0. This label is retained as a historical note, not a separate verified package release.

## 2026-10-19 — 2.0.0 — Persistent browser sessions

Update under the existing package version. Source: Git e502825 / 643f415; VALIDATION.md.

- Saved browser profiles and attachment to an existing local Chrome/Edge debugging session.
- Manual sign-in/challenge recovery, account validation and session-expiry handling.

## 2026-10-14 — 2.0.0 — Delivery evidence and open tracking

Update under the existing package version. Source: Git 73762ee / e19cf15; VALIDATION.md.

- IMAP bounce monitoring, opaque tracking pixels, seed inbox checks and DNS health reporting.
- Independent send, delivery, bounce and open evidence with searchable tracking records.

## 2026-10-10 — 2.0.0 — Outreach Desk 2

Numbered package release. Source: Git a5d6e03 package.json; README.md.

- Mailbox profiles, campaigns, editable templates and continuous outreach.
- Durable send reservations, workbook repair, shared recipient protection and saved history.
- Later improvements shipped under the same package version and are listed separately above.

## 2026-10-10 — 1.0.0 — Initial outreach tool

Numbered package release. Source: Git 74e03f3 package.json.

- Initial local Playwright sending application with workbook integration and tests.

## Updating a PC

1. Stop Outreach Desk on the PC being updated. Back up its entire data folder and .env file.
2. Extract the new versioned ZIP over the application files. Preserve that PC's data and .env; keep team-data if this PC hosts the shared coordinator.
3. Run Setup when dependencies changed, then Start and reload the browser. Verify the installed version in the title bar and this catalog.
4. Check Settings for the correct PC ID, public tracking URL, database selection and sync mode. Run Sync opens now and review diagnostics.
5. Update each PC separately. This catalog describes the installed build; it does not check an online update server or prove another PC was updated.

For future releases, update package.json/package-lock.json and add a release entry in src/release-catalog.mjs, rebuild the UI, validate, and build the versioned ZIP. The in-app catalog reads the bundled release entries and keeps operator notes in the original state file.
