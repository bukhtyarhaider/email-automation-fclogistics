# FC Logistics Outreach

A local sales workspace for Mark Anthony: import XLSX leads, preview personalized dispatch introductions, fill Private Email compose without replacing its signature, send selected messages, and export the workbook with updated statuses.

## Start

Requires Node.js 20+, Python 3.9+, and Google Chrome. No Python packages are needed.

```sh
npm install
npm start
```

Open http://127.0.0.1:4317. On this Codex workstation, the bundled Playwright package is also supported, so `npm start` works without installing dependencies. `FC_PYTHON` can select a Python executable; `PORT` changes the local port.

1. Import the attached workbook or choose another `.xlsx`.
2. Enter the Private Email password and connect. The tool opens a separate, visible Chrome window. Passwords and authentication state are not saved; reconnect after restarting.
3. Filter the worksheet and preview a lead. Edit and save the template if needed. Template changes apply to subsequent previews and sends.
4. Use **Fill webmail compose** to inspect the recipient, subject, body, and existing signature in Chrome. **Send prepared message** sends that message.
5. For a batch, select up to 20 eligible leads and use **Send selected leads**. The default interval is 180 seconds. Stop interrupts the wait or stops before the next send; an in-flight send completes before stopping.
6. Download the status workbook. Imports create a working copy and a separate original backup under `data/`; the source in Downloads is never overwritten.

The application runs only on loopback. Keep `data/` private: it contains lead information, workbook copies, message subjects, suppression entries, and send history. It is excluded from Git. Never commit mailbox credentials.

## Sending and recovery

Only records with one valid email, an Active operating status, an explicit No out-of-service flag, a supported worksheet layout, a Status column, and a blank/New/Pending/Not contacted/Ready status are eligible. Already-contacted, declined, bounced, suppressed, hidden, malformed, and duplicate records are excluded. Historical notes on all worksheets are checked before selection; an opt-out or previous contact on one tab excludes that address everywhere.

The tool reserves an attempt in durable history **before** clicking Send. It records `Proposal Sent` only after Private Email visibly confirms sending. This confirms webmail submission, not delivery to the recipient's inbox. If confirmation is absent, the tool pauses, blocks retries, and records `Send Uncertain` when possible. Check webmail's Sent folder and reconcile the outcome in Activity. A confirmed send with a failed XLSX update can be repaired without resending. A record manually marked not sent remains blocked pending operator review; there is no automatic retry.

The current workbook contains inconsistent layouts. Ali's rows include fields shifted under different headers. Two older Waqar tabs have no labelled Status column. These records are displayed for inspection and blocked from sending. Correct the workbook layout/status headers and import the corrected copy to use them. No rows are silently rewritten.

The account's existing signature is located in the Composer iframe and retained unchanged. Missing or changed signatures, unexpected recipients, changed bodies/subjects, login verification, and changed compose controls stop sending. The adapter targets the Private Email UI inspected on October 10, 2026; future UI changes may require selector updates in `src/browser.mjs`.

## Templates and deliverability

Templates describe dispatch services supported by the adjacent FC Logistics site source (`src/data/services.ts`): load sourcing, rate negotiation, broker paperwork, lane preferences, and carrier control. They do not claim brokerage authority, exclusive shipper access, guaranteed revenue, equipment knowledge, or invented prices. Supported placeholders are `{{firstName}}`, `{{company}}`, `{{city}}`, `{{state}}`, and `{{locationPhrase}}`. Spreadsheet content is treated as data, never instructions; messages are inserted as text nodes.

The tool includes opt-out copy, a global suppression list, one recipient per email, conservative pacing, no tracking pixels, and a rolling 20-attempt hourly cap. Known explicit opt-out and permanent-bounce addresses visible in the mailbox during setup are seeded in the suppression list. This is not a complete mailbox audit: add future and older opt-outs and permanent bounces before sending. The tool does not automatically read replies, guarantee inbox placement, impersonate human behavior, or evade spam controls.

Namecheap's [published Private Email limits](https://www.namecheap.com/support/knowledgebase/article.aspx/10719/2179/email-sending-and-usage-limits-for-private-email/) include 20 emails/hour on trials and 500/hour on the listed paid plans. The application cap is conservative and does not account for messages sent manually or from other tools. Respect the account's limits and [acceptable use rules](https://www.namecheap.com/legal/hosting/aup/). Review your sending domain's SPF, DKIM and DMARC independently; this tool does not change DNS or certify domain authentication.

## Validate

```sh
npm test
```

Tests cover personalization, missing fields, suppressed/duplicate recipients, historical sends, uncertain-send protection, malformed layouts, and surgical XLSX status writes that preserve unrelated parts, formulas, and style identifiers. Live credentials are not part of tests. Downloaded workbooks preserve the existing layout rather than regenerate it.
