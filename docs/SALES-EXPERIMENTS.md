# Sales experiments

Branch: `feat/sales-experiments`. Base: `main`, Outreach Desk 2.1.0.

The user authorized an experimental branch on 29 October 2026. Work proceeds one feature at a time. Each completed feature is handed to the user for testing. Do not start the next feature, merge into main, deploy to team PCs, or label a feature production-approved until the user gives the relevant direction. Approval to experiment is not production approval.

The team has five salespeople and uses this tool for signing U.S. carriers by email. Keep the early experiments focused on email conversations and signing. Calls, appointments and invoicing are optional later workflows.

## Experiment order and decisions

| ID | Experiment | Status | User decision |
|---|---|---|---|
| 01 | Read-only import review and temporary mapping previews | Implemented; automated checks passed | Awaiting user test |
| 02 | Explicit import repairs, source provenance and durable carrier identity | Planned | Pending |
| 03 | Human reply capture and shared conversations | Planned | Pending |
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

## Experiment 01 — read-only import review

This experiment is deliberately separate from the normal app. It reuses the workbook parser in an optional review mode and the existing brand styles. The preview server has no sender, mailbox connection, background monitoring, Firebase sync, workbook patch, campaign save, or automatic state migration.

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
6. Report whether the counts, examples and mapping preview are useful and what should change. Actual saving/repair is experiment 02 and has not been implemented here.

Email-column candidates use syntax counts only. They are evidence for review, not automatic correction recommendations. A mixed-layout sheet can require splitting the source rather than remapping every row. Invalid/missing email, duplicate and layout categories can overlap. This is not a full sending eligibility report or a mailbox verification service.

A clean Git branch separates code, not private runtime data. Continue using the dedicated read-only preview for this experiment; do not launch changed sender builds against production data just because a separate branch exists.

## Validation record

Record automated checks and the user's test decision here after each experiment. Future experiments should document any state migration, rollback method, external credentials, actual sends and production decision explicitly.

### Experiment 01 — 29 October 2026

- Full regression: 111 JavaScript tests and 9 Python tests passed, including synthetic Chrome checks. No real email was sent.
- Focused HTTP/browser checks passed after the mobile layout fix. Desktop (1440px) and mobile (390px) screenshots were visually inspected.
- Byte-for-byte checks verify state/workbook immutability after saved/proposed mapping reviews. Host/origin/request-header checks, invalid mappings, missing/outside workbook paths, oversized requests and unavailable sending/save routes are covered.
- The available local workbook was reviewed without modification: 9,208 parsed rows, 1,820 flagged layout rows and 2 sheets without a Status column. These figures describe this local copy only.
- User acceptance: pending. Production approval: not requested or granted. Stop here until user feedback.
