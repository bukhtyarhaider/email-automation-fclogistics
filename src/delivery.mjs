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
}) {
  state.history[lead.email] = {
    ...metadata,
    status: "Sending",
    at: new Date().toISOString(),
    leadId: lead.id,
    subject: message.subject,
    body: message.body,
    workbook: state.workbook.file,
  };
  await persist(); // If this fails, Send is never invoked.
  try {
    await beforeSend?.();
    const evidence = await send();
    state.history[lead.email].status = "Sent";
    state.history[lead.email].evidence = evidence;
    state.history[lead.email].confirmedAt = new Date().toISOString();
    state.history[lead.email].syncNeeded = true;
    onConfirmed?.();
    await persist();
    await afterOutcome?.(state.history[lead.email]);
    await syncStatus(lead, sentStatus);
    state.history[lead.email].syncNeeded = false;
    event(`Sent to ${lead.company}. Workbook status updated.`, {
      kind: "sent",
      company: lead.company,
      email: lead.email,
    });
    await persist();
  } catch (error) {
    const item = state.history[lead.email];
    if (item.status === "Sent") {
      item.syncNeeded = true;
      event(
        `Email sent to ${lead.company}, but workbook update failed. Use Repair workbook status.`,
        { kind: "error", company: lead.company, email: lead.email },
      );
    } else {
      item.status = "Uncertain";
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
