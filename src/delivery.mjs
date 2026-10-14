import { randomUUID } from "node:crypto";
// Reservation, confirmation and workbook writes form separate durable steps.
// A mail server and an XLSX file cannot share a transaction.
export async function deliver({
  state,
  lead,
  message,
  persist,
  send,
  syncStatus,
  event,
  onConfirmed,
  metadata = {},
  beforeSend,
  afterOutcome,
  sentStatus = "Proposal Sent",
  tracking,
  historyKey = lead.email,
}) {
  state.history[historyKey] = {
    ...metadata,
    trackingId: metadata.trackingId || randomUUID(),
    recipient: lead.email,
    sendStatus: "send_attempted",
    status: "Sending",
    at: new Date().toISOString(),
    leadId: lead.id,
    subject: message.subject,
    body: message.body,
    workbook: state.workbook.file,
  };
  const track = () => {
    try { tracking?.(state.history[historyKey]); if (tracking) state.history[historyKey].trackingSyncNeeded = false; }
    catch { state.history[historyKey].trackingSyncNeeded = true; }
  };
  track();
  await persist(); // If this fails, Send is never invoked.
  let sendInvoked = false;
  try {
    await beforeSend?.();
    sendInvoked = true;
    const evidence = await send();
    if (typeof evidence !== "string" || !/^(message|email)( was)? sent( successfully)?[.!]?$/i.test(evidence.trim()))
      throw new Error("No credible webmail send confirmation.");
    state.history[historyKey].status = "Sent";
    state.history[historyKey].sendStatus = "webmail_sent";
    state.history[historyKey].evidence = evidence;
    state.history[historyKey].confirmedAt = new Date().toISOString();
    state.history[historyKey].syncNeeded = true;
    track();
    onConfirmed?.();
    await persist();
    await afterOutcome?.(state.history[historyKey]);
    await syncStatus(lead, sentStatus);
    state.history[historyKey].syncNeeded = false;
    event(`Sent to ${lead.company}. Workbook status updated.`, {
      kind: "sent",
      company: lead.company,
      email: lead.email,
    });
    await persist();
  } catch (error) {
    const item = state.history[historyKey];
    if (item.status === "Sent") {
      item.syncNeeded = true;
      event(
        `Email sent to ${lead.company}, but workbook update failed. Use Repair workbook status.`,
        { kind: "error", company: lead.company, email: lead.email },
      );
    } else {
      item.status = "Uncertain";
      item.sendStatus = !sendInvoked || error.sendNotAttempted ? "send_failed" : "delivery_unknown";
      // Store a bounded generic reason: Playwright errors can include private DOM content.
      item.sendError = item.sendStatus === "send_failed" ? "Send failed before submission" : "Webmail confirmation unavailable; inspect Sent before any retry";
      track();
      event(
        `Send result uncertain for ${lead.company}. Check Sent in webmail before recording the outcome.`,
        { kind: "error", company: lead.company, email: lead.email },
      );
      await syncStatus(lead, "Send Uncertain").catch(() => {});
    }
    await afterOutcome?.(item).catch(() => {
      item.teamSyncNeeded = true;
    });
    await persist();
    throw error;
  }
}
