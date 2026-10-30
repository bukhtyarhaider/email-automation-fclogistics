# UI rendering and visual QA — 2026-10-30

The follow-up review reproduced the reported `[object Object]` activity messages and the large blank column beside the sidebar. Both were migration regressions. The previous checks verified IDs, script execution and outer-page overflow; they did not assert event text, sidebar/content geometry or overflow inside the scrollable content pane.

## Repairs

- Removed the extra layout container emitted by the sidebar. Main content now starts at the sidebar's right edge and uses the remaining width.
- Rendered each activity record's `message` in the live cards, terminal, search and dashboard event list. Record identity now includes timestamp, category, message and relevant metadata, preserving distinct simultaneous events while avoiding duplicate polling entries.
- Used the server's `job.enabled` for engine activity. Explicit event kinds take priority, so an import that leaves a campaign paused is a system event and a restored session is not mistaken for a rest delay.
- Made local screen clearing survive polling without changing server history when the operator cancels server clearing. New events still appear. Pause/resume preserves the displayed feed snapshot.
- Let panel headings, form actions and drawer footer buttons wrap. Native checkboxes retain their own width; the reconnect checkbox has an aligned label.
- Allowed the activity search field to shrink; placed mobile message text below its badge/time; wrapped long metadata within the event card.
- Removed the tracking grid's override of responsive column counts. Fixed seed-studio grid minimum widths and section-heading minimum widths. Table scrolling stays inside table containers rather than moving the whole content pane.
- Routed Seed Studio and Domain Health anchors to Tracking, including direct section URLs and tracking polling, instead of falling back to Dashboard.

## Visual review

Screens were inspected in the in-app browser using synthetic workbooks, sent history, replies, long metadata and simultaneous log events. The original running app was also checked for the two reported defects; its final live feed contains readable messages and the content/side edges align. No real sending, capture configuration, customer record edits or production-log clearing was performed.

| Step | Screen / flow | Observed result |
| --- | --- | --- |
| 1 | Dashboard | Aligned beside sidebar; summary cards and action rows fit mobile. |
| 2 | Leads workspace | Aligned filters and table; horizontal table scrolling remains local. |
| 3 | Campaigns and mapping | Form columns collapse; labels and buttons fit. |
| 4 | Import review and revisions | Mapping/revision controls fit; source evidence remains readable. |
| 5 | Carrier conversations | Inbox/list and reader inspected; unsaved reply retained through details and back-to-inbox. |
| 6 | Templates | Editor, preview and native checkbox inspected at desktop/mobile. |
| 7 | Live system activity | Message text, time/category alignment, long metadata, filtered state and tablet cards inspected. |
| 8 | Send history | Summary cards and filters fit; exports remain available. |
| 9 | Tracking | Responsive cards and seed configuration inspected; section links stay in Tracking. |
| 10 | Do Not Contact | Form and list heading/search wrap inside their panels. |
| 11 | Version catalog | Metrics, notes and release entries fit their columns. |
| 12 | Mailbox/settings | Panels, profile table and form controls inspected; native checkbox alignment repaired. |
| 13 | Lead drawer | All four footer actions remain within the drawer, including at 390px. |
| 14 | Conversation details dialog | Status controls, evidence and close action fit; reply text is retained. |

All twelve main screens were visually inspected at desktop and mobile sizes; tablet activity and additional drawer/dialog states were inspected too. The automated all-route checks cover 1440, 1024, 768 and 390px, populated workbook data, content-pane geometry, internal overflow, tracking anchors and drawer actions. Intentional horizontal scrolling in data tables and native option lists is retained.

Accepted sample screenshots are local artifacts in `outputs/ui-qa-react-followup/` (excluded from Git and portable packages):

- `final-desktop-live.png` / `final-mobile-live.png`
- `tablet-live-activity.png`
- `mobile-seed-studio-fixed.png`
- `mobile-lead-drawer-fixed.png`
- `mobile-conversation-details.png` / `mobile-conversations-list.png`

## Validation and limits

`FC_BROWSER_TESTS=1 npm test` passed **215 Node tests and 12 Python tests**, with no failures or skips. Strict TypeScript, formatting and production builds passed. New tests cover actual event strings, same-timestamp records, explicit classification, visual/terminal filters, paused-feed behavior, clearing versus saved history, responsive content bounds, section URLs and drawer controls.

This verifies the exercised states, not every possible provider or customer-data combination. Screenshots alone do not establish accessibility compliance. Windows/Edge and live multi-PC rollout remain unverified; backend delivery, persistence and coordination code were not changed.
