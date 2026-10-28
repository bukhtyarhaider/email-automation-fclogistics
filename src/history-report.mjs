// Send-history reporting stays read-only; these metrics never change send eligibility.
const time = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const pick = (value, allowed, label) => { if (value && !allowed.includes(value)) throw new Error(`Invalid ${label}.`); return value; };
export function historyReport(state, params = new URLSearchParams()) {
  const get = (key) => (params.get(key) || "").trim();
  const filters = Object.fromEntries(["q", "status", "seen", "mailbox", "campaign", "template", "reply", "from", "until", "sort"].map((key) => [key, get(key)]));
  pick(filters.seen, ["seen", "no_signal", "untracked"], "seen filter");
  pick(filters.reply, ["unreviewed", "replied", "no_reply"], "reply filter");
  pick(filters.sort, ["newest", "oldest", "first_seen", "last_seen", "fastest", "slowest"], "history sort");
  for (const key of ["from", "until"]) {
    const value = filters[key];
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)) throw new Error("Use valid YYYY-MM-DD send dates.");
  }
  if (filters.from && filters.until && filters.from > filters.until) throw new Error("The start date must be on or before the end date.");
  const all = Object.entries(state.history || {}).map(([key, entry]) => {
    const { teamToken, openTokenHash, pixelUrl, ...h } = entry;
    const t = state.tracking?.records?.[h.trackingId];
    const confirmedAt = h.confirmedAt || t?.confirmedAt || null;
    const sentMs = time(confirmedAt), firstMs = time(t?.firstOpenAt);
    const confirmedSent = h.status === "Sent" || h.sendStatus === "webmail_sent";
    const delay = confirmedSent && sentMs !== null && firstMs !== null && firstMs >= sentMs ? firstMs - sentMs : null;
    const reply = ["replied", "no_reply"].includes(h.followUp?.status) ? h.followUp.status : "unreviewed";
    return {
      ...h, to: h.recipient || key, confirmedAt, sentAt: confirmedAt || h.at || null, confirmedSent,
      campaignName: h.campaignName || state.campaigns?.find((c) => c.id === h.campaignId)?.name || "Legacy campaign",
      templateName: state.templates?.[h.templateKey]?.name || h.templateKey || "Not recorded",
      trackingEnabled: Boolean(t?.openTokenHash),
      firstOpenAt: t?.firstOpenAt || null, lastOpenAt: t?.lastOpenAt || null,
      opensCount: t?.opens?.length || 0, opens: (t?.opens || []).map(({ at, bucket }) => ({ at, bucket })),
      bounceStatus: t?.bounceStatus || null, bounceReason: t?.bounceReason || null,
      firstSeenDelayMs: delay, timingExcluded: Boolean(t?.firstOpenAt && confirmedSent && delay === null),
      replyStatus: reply, followUp: h.followUp || { status: "unreviewed", note: "" },
    };
  });
  const options = {
    mailboxes: [...new Set(all.map((r) => r.accountEmail).filter(Boolean))].sort(),
    campaigns: [...new Map(all.filter((r) => r.campaignId).map((r) => [r.campaignId, { id: r.campaignId, name: r.campaignName }])).values()],
    templates: [...new Map(all.filter((r) => r.templateKey).map((r) => [r.templateKey, { id: r.templateKey, name: r.templateName }])).values()],
  };
  let records = all.filter((r) => {
    if (filters.q && ![r.to, r.accountEmail, r.campaignName, r.subject, r.templateName, r.followUp.note].join(" ").toLowerCase().includes(filters.q.toLowerCase())) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (filters.mailbox && r.accountEmail !== filters.mailbox) return false;
    if (filters.campaign && (filters.campaign === "legacy" ? !!r.campaignId : r.campaignId !== filters.campaign)) return false;
    if (filters.template && r.templateKey !== filters.template) return false;
    if (filters.reply && r.replyStatus !== filters.reply) return false;
    if (filters.seen === "seen" && !r.firstOpenAt) return false;
    if (filters.seen === "no_signal" && (!r.trackingEnabled || r.firstOpenAt)) return false;
    if (filters.seen === "untracked" && r.trackingEnabled) return false;
    // Send-date range is UTC, independent of the browser's display timezone.
    const date = time(r.sentAt) === null ? "" : new Date(r.sentAt).toISOString().slice(0, 10);
    return !((filters.from && date < filters.from) || (filters.until && (!date || date > filters.until)));
  });
  const summary = { attempts: records.length, sent: 0, seen: 0, sentSeen: 0, trackedSent: 0, noSignal: 0, untrackedSent: 0, bounced: 0, uncertain: 0, replied: 0, noReply: 0, unreviewed: 0, timingSamples: 0, timingExcluded: 0, averageFirstSeenMs: null, medianFirstSeenMs: null, fastestFirstSeenMs: null, slowestFirstSeenMs: null, fastestRecipient: null, seenRate: null, trackedSeenRate: null };
  const samples = [];
  for (const r of records) {
    if (r.confirmedSent) {
      summary.sent++;
      if (r.trackingEnabled) summary.trackedSent++; else summary.untrackedSent++;
      if (r.firstOpenAt) summary.sentSeen++; else if (r.trackingEnabled) summary.noSignal++;
    }
    if (r.firstOpenAt) summary.seen++;
    if (r.bounceStatus) summary.bounced++;
    if (["Uncertain", "Sending"].includes(r.status)) summary.uncertain++;
    summary[r.replyStatus === "replied" ? "replied" : r.replyStatus === "no_reply" ? "noReply" : "unreviewed"]++;
    if (r.timingExcluded) summary.timingExcluded++;
    if (r.firstSeenDelayMs !== null) samples.push({ delay: r.firstSeenDelayMs, to: r.to });
  }
  samples.sort((a, b) => a.delay - b.delay);
  summary.timingSamples = samples.length;
  if (samples.length) {
    summary.averageFirstSeenMs = samples.reduce((sum, sample) => sum + sample.delay, 0) / samples.length;
    const mid = Math.floor(samples.length / 2);
    summary.medianFirstSeenMs = samples.length % 2 ? samples[mid].delay : (samples[mid - 1].delay + samples[mid].delay) / 2;
    summary.fastestFirstSeenMs = samples[0].delay;
    summary.slowestFirstSeenMs = samples.at(-1).delay;
    summary.fastestRecipient = samples[0].to;
  }
  summary.seenRate = summary.sent ? 100 * summary.sentSeen / summary.sent : null;
  const trackedSeen = records.filter((r) => r.confirmedSent && r.trackingEnabled && r.firstOpenAt).length;
  summary.trackedSeenRate = summary.trackedSent ? 100 * trackedSeen / summary.trackedSent : null;
  const descendingTime = (field) => (a, b) => (time(b[field]) ?? -Infinity) - (time(a[field]) ?? -Infinity);
  const durationSort = (direction) => (a, b) => a.firstSeenDelayMs === null ? b.firstSeenDelayMs === null ? 0 : 1 : b.firstSeenDelayMs === null ? -1 : direction * (a.firstSeenDelayMs - b.firstSeenDelayMs);
  const sorts = { newest: descendingTime("sentAt"), oldest: (a, b) => (time(a.sentAt) ?? Infinity) - (time(b.sentAt) ?? Infinity), first_seen: descendingTime("firstOpenAt"), last_seen: descendingTime("lastOpenAt"), fastest: durationSort(1), slowest: durationSort(-1) };
  records.sort(sorts[filters.sort || "newest"]);
  const pageSize = 25;
  const requestedOffset = Math.max(0, Math.floor(Number(get("offset")) || 0));
  const offset = Math.min(requestedOffset, Math.max(0, Math.floor((records.length - 1) / pageSize) * pageSize));
  return { total: records.length, records, offset, pageSize, summary, filters, options, dateBasis: "UTC confirmation date; attempt date when unconfirmed", timingBasis: "Confirmed send to first recorded image request; missing or negative intervals excluded" };
}

export function csv(rows) {
  const cell = (value) => {
    let text = String(value ?? "");
    // Prevent spreadsheet formula execution, including whitespace-prefixed payloads.
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
export function historyCsv(report) {
  return csv([
    ["Recipient", "Mailbox", "Campaign", "Template", "Subject", "Outcome", "Attempted at (UTC)", "Confirmed sent at (UTC)", "Tracking enabled", "First seen (image request UTC)", "Last seen (UTC)", "Retained hourly signals", "Send to first seen seconds", "Bounce status", "Bounce reason", "Reply review (manual)", "Review note", "Reviewed at (UTC)", "Tracking ID"],
    ...report.records.map((r) => [r.to, r.accountEmail, r.campaignName, r.templateName, r.subject, r.status, r.at, r.confirmedAt, r.trackingEnabled, r.firstOpenAt, r.lastOpenAt, r.opensCount, r.firstSeenDelayMs === null ? "" : r.firstSeenDelayMs / 1000, r.bounceStatus, r.bounceReason, r.replyStatus, r.followUp.note, r.followUp.reviewedAt, r.trackingId]),
  ]);
}
export function saveFollowUp(state, input) {
  const entry = Object.values(state.history || {}).find((r) => r.trackingId === input.trackingId);
  if (!entry) throw new Error("Send record not found. Refresh history before reviewing it.");
  if (!["unreviewed", "replied", "no_reply"].includes(input.status)) throw new Error("Choose a valid manual reply review status.");
  if (typeof input.note !== "string" || input.note.length > 2000) throw new Error("Use a review note up to 2,000 characters.");
  entry.followUp = { status: input.status, note: input.note.trim(), reviewedAt: new Date().toISOString(), source: "manual" };
  return entry.followUp;
}
