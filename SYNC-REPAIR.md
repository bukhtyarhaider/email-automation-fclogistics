# Firebase sync repair — four-PC rollout

## Verified diagnosis (29 October 2026, Asia/Karachi)

A read-only audit of the configured Realtime Database found 716 events:

| PC ID | Cloud events | Pending acknowledgement |
| --- | ---: | ---: |
| 1 | 186 | 162 |
| 2 | 376 | 252 |
| 3 | 153 | 16 |
| 4 | 1 | 1 |

These are event counts, not unique recipients or proof of human reading. The counts change as the endpoint records requests and PCs sync.

The old `.limitToLast(100)` query returned **99 already-synced PC 3 events and one pending PC 4 event**. Pending PC 1 and PC 2 events could never enter that window. The old Firestore query could also stall behind 100 events for other PCs. Both database error handlers hid failures and then reported “Up to date.” The worker could acknowledge events based on PC ID even when the local token was missing, and acknowledged cloud events before saving local records.

The local checkout inspected during the audit uses PC ID **1**, URL `https://www.fclogistics.us/t/1`, and **Manual** mode. It has 21 local tracking records and 12 tokens; only six cloud events matched its tokens. The other PCs' local data and configurations were not inspected. The Firestore read failed, while Realtime Database was readable.

## Install on each PC

1. Stop Outreach Desk on that PC. Back up its `.env` and entire `data` folder before updating.
2. Extract the new `Outreach-Desk-2.0.0.zip` into the application folder, replacing application files. **Keep that PC's existing `.env` and `data` folder.** The archive contains no customer data or Firebase credentials. Do not copy another PC's `data/state.json` over it: tracking tokens belong to that PC's original emails.
3. Run the normal Setup launcher if needed, then Start. Reload the browser page so the new JavaScript is loaded.
4. Open **Settings → Firebase Open Telemetry Sync**. Save the appropriate PC ID and its public endpoint URL:

   | Installation | PC ID | Public URL, if using the existing /t/PC routing |
   | --- | --- | --- |
   | PC 1 | `1` | `https://www.fclogistics.us/t/1` |
   | PC 2 | `2` | `https://www.fclogistics.us/t/2` |
   | PC 3 | `3` | `https://www.fclogistics.us/t/3` |
   | PC 4 | `4` | `https://www.fclogistics.us/t/4` |

   Confirm the cloud endpoint supports those routes. Changing settings affects future emails; it cannot replace a URL embedded in an already-sent email. Existing cloud events can still match by their original local token even when their PC ID is wrong.
5. Select **Realtime Database only** for this deployment's verified database. Select Firestore or both only if the cloud endpoint writes there and the credentials can read and update it. Save **Automatic** to enable startup and 15-second background polling, or keep Manual and click **Sync opens now**.
6. Inspect **PC & Firebase diagnostics**: effective PC ID and source, computer, data folder, project, database URL, credential source, tracking URL, telemetry/consent flags, mode, local token count, last attempt, last completed scan, errors, and per-database counters.
7. Click **Sync opens now**. A completed sweep reports checked/matched/new/already-applied/acknowledged events. If it says **Catching up**, leave Automatic mode running or click Sync again. Each database scans at most 5,000 records per run and persists its cursor. At the audited size, one successful sweep covers the database.

Settings override `FC_TRACKING_PC_ID` and `FC_TRACKING_PUBLIC_URL` when those Settings fields are filled. Blank fields use the environment. Missing PC ID still uses legacy ID 1 for compatibility, with a visible warning. Environment and credential-file changes require restarting the app.

## If events remain unresolved

- **Missing local match:** the cloud event has no corresponding token on this PC, or its email has not reached an eligible send state. Restore this PC's original `data/state.json` from its own backup if it was replaced or reset. A PC ID alone cannot reconstruct the email/token association. Such events remain unacknowledged.
- **PC ID mismatch:** a token matched locally, but the cloud event carries another PC's ID. Its open can be recovered safely by token; correct the public URL and ID for future emails.
- **Invalid event:** inspect the cloud endpoint's event format: `{ token, tokenHash, pcId, openedAt, synced: false }`. Use a valid ISO timestamp. A hash-only event is supported if its SHA-256 token hash matches the original local token index.
- **Credentials missing or invalid:** place `firebase-service-account.json` in the displayed data folder or set `FC_FIREBASE_CREDENTIALS_PATH`, then restart. An explicit invalid path no longer silently falls back to another credential file. Never paste private keys into screenshots or support messages.
- **Database failure:** the actual error is shown. Confirm internet access, project/database URL, enabled database and service-account permissions. Credentials being loaded does not prove the connection is healthy.
- **Already acknowledged by the old worker:** the new worker scans acknowledged events too and recovers them when the original token exists locally. No global cloud reset is needed. Durable receipts prevent repeated recovery or replay of older hourly buckets.

A full completed scan does not mean every cloud event belongs to this PC. Other-PC events are counted separately, and missing/invalid matches trigger **Needs attention**. Shared team coordination and its worker UUID are separate from Firebase open-event sync.

## Read-only audit command

From an installation's application folder, run:

```sh
node --env-file=.env scripts/sync-audit.mjs
```

It prints only aggregate counts by PC, the old 100-record window, payload shapes, and Firestore accessibility. It does not save local state, send mail, or acknowledge cloud events. The Realtime Database audit is capped at 50,000 records and reports whether it completed.

## What was validated

Regression tests cover pagination past unrelated events, restart/continuation, recovery of acknowledged events, wrong-PC token matching, hash-only events, malformed data, save-before-acknowledgement, disk and cloud-write failures, timeouts, partial database failure, manual/concurrent requests, and durable replay deduplication. Browser tests exercise settings warnings, save/reload, failed-sync feedback, preserved unsaved inputs and responsive layout. See `VALIDATION.md` for this build's final test result.

This package was built and checked locally. Installation, end-to-end syncing and native Windows operation on the other PCs require applying the update there and checking their diagnostics.
