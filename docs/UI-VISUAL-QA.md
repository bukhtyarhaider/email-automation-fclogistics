# UI rendering and visual QA — 2026-10-30

The follow-up review reproduced the reported `[object Object]` activity messages and the large blank column beside the sidebar. Both were migration regressions. The previous checks verified IDs, script execution and outer-page overflow; they did not assert event text, sidebar/content geometry or overflow inside the scrollable content pane.

## Mailbox & Settings alignment follow-up

The later settings review found a layout defect missed by the earlier pass: the profiles table's intrinsic minimum width widened the left dashboard column and compressed Sending Pace & Quotas. At 1350px this produced very narrow preset cards and put all later settings in a narrow right-hand column, leaving unused space beside them. Outer-page overflow checks did not catch the loss of usable card width.

Settings now has its own grid. The mailbox list spans the available width; profile setup and pacing use equal columns on wide screens; later sections share paired rows. At 1280px and below, panels stack. All nine panels and their existing control IDs remain available. Pacing cards use the space in their own panel to choose one or two columns. Provider selection occupies a full form row, paired input baselines align when labels wrap, and sync actions, browser-discovery buttons and system information wrap within narrow screens.

The current screenshots use synthetic data; the actual app was checked read-only and left open on Settings. No real mailbox settings were saved, no profile connection was made and no mail was sent.

| Step | Surface checked | Health / evidence |
| --- | --- | --- |
| 1 | Desktop mailbox list and setup | Pass — full-width list, equal profile/pacing columns and readable presets at 1350px and 1440px. |
| 2 | Sending pace and paired numeric fields | Pass — card contents and actions fit; wrapped labels keep input baselines aligned. |
| 3 | Template checks and eligibility | Pass — panels share a row on desktop, and checkbox labels stay within their panel. |
| 4 | Firebase sync and diagnostics | Pass — paired headings align; long paths and diagnostic values wrap; sync action stays inside the panel. |
| 5 | Team settings and system information | Pass — narrow-screen fields and system values remain within the panel, including at 320px. |
| 6 | Expanded CDP and responsive presets | Pass — browser address, discovery action and guide inspected at 320px/390px; two-column tablet presets inspected at 768px. |

Sample screenshots are in `outputs/ui-qa-settings-followup/`: `desktop-overview.png`, `desktop-mailbox-and-pacing.png`, `desktop-sync-diagnostics.png`, `mobile-presets.png`, `mobile-system-info.png`, `mobile-cdp.png` and `tablet-presets.png`. They are local artifacts excluded from Git and portable packages.

The settings regression now includes long profile names/emails, expanded CDP fields, minimum readable preset width, panel/header/control bounds, paired rows and input baselines at **1440, 1350, 1280, 1200, 1024, 820, 768, 480, 390 and 320px**. Existing settings save/reload, all-route navigation and unsaved-edit checks also passed. The final complete run passed **215 Node tests and 12 Python tests**, with no failures or skips; strict TypeScript, formatting, build and diff checks passed. Windows/Edge and assistive-technology behavior were not separately exercised.

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
