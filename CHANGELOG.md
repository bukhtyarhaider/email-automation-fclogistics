# Outreach Desk changelog

Current candidate: **2.2.0-rc.2**. Previous stable package: **2.1.0**.

The repository records package versions 1.0.0 and 2.0.0 before this release. Later updates often kept the same package version; they appear as dated milestones below. The historical Git label V1.1.0 did not change the recorded package version from 2.0.0.

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
