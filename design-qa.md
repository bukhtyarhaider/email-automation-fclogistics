# Shared Conversations design QA — 2.2.0-rc.5

final result: passed

The user's current direction is to reuse the existing app header, sidebar, footer and overall design on Conversations. This supersedes the separate shell in the original Mailroom image. The list/thread/free-reply workspace remains inside the shared app shell.

Source visual truth: `outputs/shared-shell-qa/reference-templates-final.jpg`, the existing Templates page at `http://127.0.0.1:4327/#templates`. Initial pre-change reference: `reference-templates.jpg` in the same folder.
Implementation: `outputs/shared-shell-qa/conversations-desktop.jpg`, `http://127.0.0.1:4327/#conversations`. Both use the same isolated synthetic preview with live capture and sending disabled.

## Comparison and findings

- Full-view combined input: `outputs/shared-shell-qa/desktop-comparison.jpg`. Source and implementation are **1089 × 910 screenshot pixels** at the same **1089 × 910 CSS viewport**. Native browser devicePixelRatio was 2; its screenshot API returned images already normalized to CSS pixels. Both sides use the same screenshot density; no additional density correction or stretching was needed.
- Focused combined inputs: `header-comparison.jpg` and `sidebar-footer-comparison.jpg` in the same folder. Header height **46px**, desktop sidebar width **242px**, sidebar footer position and dimensions match the existing page. Header campaign/mailbox status, desktop version, labeled navigation, mailbox profile card and developer details remain visible. Only the expected active navigation item differs.
- Mobile combined input: `mobile-comparison.jpg`, using `reference-templates-mobile.jpg` and `conversations-mobile.jpg`. Both are **390 × 844 pixels**, CSS **390 × 844**, DPR **1**. Header remains **46px** and sidebar **68px**, using the same shared responsive rules as Templates. No horizontal overflow was measured on Conversations. The existing compact footer and native list/detail navigation remain available.
- State: dark theme, existing mailbox disconnected, preview banner visible, John Smith's synthetic conversation open, saved reply unapproved. Page-specific main content differs intentionally between the source and implementation. The comparison judges the shared shell and consistent content treatment, rather than copying the Templates form into the conversation view.
- Earlier finding resolved: rc.4's route-specific titlebar/sidebar/footer rules hid shared information and changed geometry. Removed those overrides, restored normal banner and notification presentation, reused `page-header`, `page-eyebrow`, `page-title`, standard page insets, and surface/border/radius tokens. `conversations-first.jpg` records the initial integrated result; final captures confirm the same shared shell.

No actionable P0/P1/P2 difference remains for this requested integration.

## Required fidelity surfaces

- **Typography:** the common titlebar/nav/footer rules supply the exact same fonts, sizes and weights across routes. Conversations uses the shared 26px page title and standard eyebrow. Message/editor typography remains designed for readable correspondence.
- **Spacing/layout:** desktop titlebar, sidebar and footer geometry matches the reference; the conversation heading aligns to normal page padding. The bounded conversation surface uses existing panel radius and border tokens. On narrower widths the conversation workspace switches to list/detail without replacing shared navigation.
- **Colors/tokens:** titlebar/sidebar gradients, footer card, common viewport background, notification/banner appearance and status colors are inherited unchanged. Conversation surfaces use `--bg-surface`, `--border-medium` and `--radius-md`.
- **Asset fidelity:** the original common OD brand, FC mailbox profile, navigation icons and status marks are reused directly from the existing shared markup. No replacement shell, logo or footer was drawn or generated.
- **Copy/content:** all shared labels, version, account status and developer information remain identical across routes. Conversation-specific wording, explicit draft review and evidence limitations remain intact.

## Interaction and verification

The full regression suite passed **186/186 JavaScript tests and 12/12 Python tests**, no failures/skips. The existing Mailroom browser scenario now compares shared shell geometry/styles on Conversations and Templates at desktop/mobile sizes and verifies that unsaved reply text survives route changes. Existing coverage retains search, queues, saved wording, exact approval, stale-evidence rejection, capture protections, imports and sender safety checks.

Native in-app browser verification navigated Templates → Conversations, compared desktop captures, checked both routes at 390px and returned to the normal viewport. The selected thread and saved draft remained intact. No provider connection or email send was used for verification.

## Implementation checklist

- [x] Use shared header, status/version and labeled navigation.
- [x] Use shared mailbox footer and developer information.
- [x] Restore normal banner and notification styling.
- [x] Align page typography, insets and conversation surface tokens.
- [x] Compare desktop/mobile source and implementation together.
- [x] Verify route changes retain draft text and the shared shell.

No new share/deployment or real mailbox acceptance is implied by this visual check. The rc.4 record below is retained as design history; its separate-shell choices are superseded by this user's current request.

---

# Previous Mailroom design QA — 2.2.0-rc.4

Result at rc.4: passed

Selected target: **Option 1 — Mailroom**, from the displayed conversation design set recorded in `outputs/conversation-ux-review/CONCEPTS.md`.

Source visual truth: `/Users/bukhtyarhaider/.codex/generated_images/01a184e3-c3c5-7550-baa9-8eb6b8900430/exec-d96cefca-571e-4eb9-a695-6e3cf5bb39d3.png`.
Implementation: `http://127.0.0.1:4327/#conversations`, isolated synthetic carrier data, preview sending and provider capture disabled. Latest screenshot: `outputs/mailroom-qa/desktop-final.jpg`.

Source and desktop implementation: **1487 × 1058 pixels**, CSS viewport **1487 × 1058**, devicePixelRatio **1**. The full comparison is uniformly reduced to 1000 × 712 per side for inspection; focused comparisons retain source pixel scale. No density stretching was used for judgment. Native in-app browser viewport measurements were checked before capture.

State: dark theme; Needs reply selected; John Smith's incoming message open; saved natural reply remains unapproved; optional wording and review dialogs closed. The synthetic email body and reply match the chosen reference. Counts, local date format and queue membership reflect actual fixture evidence. The preview-only safety banner adds 34px; the real scan/configuration note adds a compact status line absent from the mock. These intentional additions account for the vertical offset. The implementation does not claim the mock's fictional counts or mark a human response “Waiting” to imitate its sample rows.

## Findings and comparison history

1. **First comparison — blocked.** `outputs/mailroom-qa/comparison-first.jpg`, source plus `desktop-first.jpg` in the same image. P1: existing app secondary-button specificity overrode the queue tabs and primary review treatment. P2: larger evidence/setup blocks and a tall editor pushed the primary action out of view. Fix: route-scoped selectors, explicit primary class, flatter shell, compact status, and details dialogs retaining the complete underlying controls/evidence.
2. **Second comparison — blocked.** `comparison-second.jpg`, source plus `desktop-second.jpg`. P2: collapsed earlier-message evidence and extra addressing rows still changed the reader hierarchy and put Review below the reference viewport. Fix: full thread, original send, message addressing/reference details and matching review remain in Details; main reader focuses on the latest message. The editor is 174px initially and remains resizable; the subject and message typography were corrected. `desktop-third.jpg` records this intermediate refinement.
3. **Responsive check — blocked.** `mobile-thread.jpg` at 390 × 844 showed the date competing with the sender's width and breaking the email address into narrow fragments. Fix: date gets its own row, avatar does not shrink, sender retains available width, and the header uses two columns with a full-width search. Final `mobile-thread-final.jpg` is **390 × 844**, CSS **390 × 844**, DPR **1**, reader scrollTop **0**, sender width **246px**, no horizontal overflow. `mobile-list-final.jpg` verifies the back-to-inbox state. Earlier transient resized captures were replaced after checking exact viewport dimensions.
4. **Final comparison — passed.** `comparison-final.jpg` puts the latest source and implementation together. `focused-reader-comparison.jpg` checks the message, composer and primary action at native scale; `focused-list-comparison.jpg` checks navigation, typography, selection and density. The Review control is visible within the 1058px desktop capture. All earlier P1/P2 findings are resolved. No actionable P0/P1/P2 remains.

## Required fidelity surfaces

- **Fonts/typography:** existing system/SF/Segoe UI/Roboto stack matches the app and reference's sans-serif treatment. Heading 34px, thread title 26px, sender 17px, message 17px/1.55, editor 16px/1.6. Secondary date 14px, ordinary controls 13–14px. Weight, wrapping, truncation and hierarchy were inspected in full and focused comparisons. Desktop labels and visible focus rings are readable; mobile message text uses 14px with free vertical scrolling. Slight font-rasterization differences and smaller version/status metadata are acceptable.
- **Spacing/layout:** 82px icon rail; 33% list and flexible reader; flat dividers; modest radii; compact tools. Source-like list selection, aligned reader/composer and right-hand Review action. Responsive one-pane list/detail retains Back to inbox. Preview banner and scan status are intentional product additions. Long threads scroll within the reader, and full captured history is reachable in Details.
- **Colors/tokens:** retained app tokens: background `#090a0f`, sidebar `#0e1017`, input `#0f1219`, primary `#f8fafc`, secondary `#94a3b8`, red `#ef4444` with translucent selected/intent surfaces. Active queue underline and review button use red, matching the reference hierarchy. Suggested intent remains visibly qualified.
- **Image quality/assets:** target has no photographs or illustration assets. Existing OD brand monogram, FC operator badge, native initial avatars and the app's established standard navigation icon assets are reused. No new raster placeholders or decorative image approximations were introduced. Shape, alignment and sharpness were reviewed in focused captures. Some decorative reference-only action icons are represented by explicit labeled controls for the implemented functions.
- **Copy/content:** Conversations, Needs reply, All, Waiting, Your reply, Help with wording, Saved lines and Review reply preserve the target's plain language. Recipient/account, exact approval, capture limitations and unresolved evidence remain explicit where decisions need them. User-request phrases and development notes do not appear as product instructions. Dynamic sample counts/statuses differ deliberately because they use real fixture state.

## Interaction and accessibility evidence

Manual verification used the in-app browser: select carrier, read message and free draft, open Saved lines, search and preview wording without replacing the draft, dismiss preview, open exact account/recipient/body review with approval disabled until acknowledged, close review, switch mobile list/detail, and return to desktop. `saved-lines.jpg`, `wording-preview.jpg` and `review-dialog.jpg` record these states. Browser warning/error logs were empty.

The focused automated integration suite passed 9/9 using isolated fixtures. It covers import activation/recovery, opt-outs, detail confirmation, saved wording, edited exact approvals/copy/cancellation, changed-evidence rejection within the dialog, dashboard tracking, unsaved text across queues/search, Escape, mobile Back, desktop/mobile bounds and no unexpected external requests. Existing source controls retain labels; icon rail links keep accessible names/tooltips; dialogs have names and native focus/Escape behavior; row/tab focus remains visible and list refresh preserves a focused result when it still exists.

## Open questions and acceptance limits

No visual-selection question remains. Source did not specify mobile screens, setup, empty/error states or approval dialogs; these adapt the established app behavior to the selected layout. Live provider retention/permissions, native Windows and team-PC rollout remain separate acceptance checks. Screenshot proof does not establish provider coverage or message delivery.

## Implementation checklist

- [x] Match selected Mailroom composition and core wording.
- [x] Preserve full captured evidence and original-send access.
- [x] Keep exact approval and final Send in the existing mailbox.
- [x] Fix tab specificity, action visibility and mobile sender wrapping.
- [x] Capture source and implementation in combined full/focused comparisons.
- [x] Verify native browser interactions, mobile layouts and console.

## Follow-up polish

P3 only: optional standard action icons for wording controls and a user-selected date format could bring the visual closer. Current labeled controls and local date formatting are functional and accessible.
