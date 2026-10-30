if ($("recovery")) $("recovery").onclick = (e) => {
  if (e.target.dataset.reconcile) action(e.target, () => api("/api/reconcile", { email: e.target.dataset.reconcile, outcome: e.target.dataset.outcome }));
};
const historyFilterIds = { q: "historySearch", status: "historyStatus", seen: "historySeen", mailbox: "historyMailbox", campaign: "historyCampaign", template: "historyTemplate", reply: "historyReply", from: "historyFrom", until: "historyUntil", sort: "historySort" };
let historyRequest = 0, historySelected = null, historyReviewDirty = false, lastHistoryRefresh = 0;
function historyParams() { return new URLSearchParams(Object.entries(historyFilterIds).map(([key, id]) => [key, $(id)?.value || ""])); }
function historyDate(value) { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "Not recorded"; }
function historyDuration(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const seconds = Math.max(0, Math.round(value / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h`;
}
function historySelectOptions(id, options, title, extra = "") {
  const el = $(id), previous = el.value;
  const markup = `<option value="">${title}</option>` + extra + options.map((o) => `<option value="${escape(typeof o === "string" ? o : o.id)}">${escape(typeof o === "string" ? o : o.name)}</option>`).join("");
  if (el.dataset.options !== markup) { el.innerHTML = markup; el.value = previous; el.dataset.options = markup; }
}
function renderHistorySummary(s) {
  const percent = (v) => v === null ? "—" : `${v.toFixed(1)}%`;
  const metrics = [
    ["Confirmed sent", s.sent, `${s.attempts} total attempts · ${s.uncertain} unresolved`],
    ["Seen signals", s.sentSeen, `Among confirmed sends · ${s.noSignal} tracked with no signal`],
    ["Sent → seen rate", percent(s.seenRate), `${s.sentSeen} seen / ${s.sent} confirmed sends`],
    ["Average first seen", historyDuration(s.averageFirstSeenMs), `${s.timingSamples} valid timing sample(s)`],
    ["Median first seen", historyDuration(s.medianFirstSeenMs), "Middle confirmed-send → first-signal interval"],
    ["Fastest first seen", historyDuration(s.fastestFirstSeenMs), s.fastestRecipient || "No eligible timing sample"],
    ["Tracking coverage", `${s.trackedSent} / ${s.sent}`, `${s.untrackedSent} sent without tracking · ${percent(s.trackedSeenRate)} seen among tracked sends`],
    ["Reply review", `${s.replied} replied`, `${s.noReply} checked, no reply · ${s.unreviewed} not reviewed · manual`],
  ];
  $("historyMetrics").innerHTML = metrics.map(([label, value, hint]) => `<div class="history-metric"><span>${escape(label)}</span><strong>${escape(value)}</strong><small>${escape(hint)}</small></div>`).join("");
  $("historyTimingNote").textContent = `Timing uses confirmed sent time to the first recorded image request. ${s.timingExcluded} seen send(s) excluded because a timestamp is missing or precedes confirmation. ${s.bounced} bounce record(s) in this filtered view.`;
}
async function loadHistory() {
  if (!$("historyRows")) return;
  const request = ++historyRequest;
  const params = historyParams(); params.set("offset", String(historyOffset));
  $("historyLoadStatus").textContent = "Updating history…";
  try {
    const result = await api("/api/history?" + params);
    if (request !== historyRequest) return;
    historyRecords = result.records; historyOffset = result.offset; lastHistoryRefresh = Date.now();
    historySelectOptions("historyMailbox", result.options.mailboxes, "All mailboxes");
    historySelectOptions("historyCampaign", result.options.campaigns, "All campaigns", '<option value="legacy">Legacy / unassigned</option>');
    historySelectOptions("historyTemplate", result.options.templates, "All templates");
    renderHistorySummary(result.summary);
    const exportParams = historyParams();
    for (const [id, scope, format] of [["historyExportCsv", "filtered", "csv"], ["historyExportJson", "filtered", "json"], ["historyExportStats", "stats", "csv"]]) {
      const p = new URLSearchParams(exportParams); p.set("scope", scope); p.set("format", format); $(id).href = "/api/export-history?" + p;
    }
    $("historyRows").innerHTML = historyRecords.length ? historyRecords.map((r, index) => `<tr>
      <td><strong>${escape(r.to)}</strong><small>${escape(historyDate(r.confirmedAt || r.at))}</small></td>
      <td>${escape(r.accountEmail || "Legacy")}<small>${escape(r.campaignName)}</small></td>
      <td>${escape(r.subject || "No recorded subject")}<small>${escape(r.templateName)}</small></td>
      <td><span class="status-pill ${r.confirmedSent ? "good" : "blocked"}">${escape(r.status)}</span><small>${r.replyStatus === "unreviewed" ? "Reply not reviewed" : r.replyStatus === "replied" ? "Replied · manual" : "No reply · manual"}</small>${r.bounceStatus ? `<small class="history-warning">${escape(r.bounceStatus)}</small>` : ""}</td>
      <td>${r.firstOpenAt ? `<span class="status-pill good">Seen · image signal</span><small>First: ${escape(historyDate(r.firstOpenAt))}</small><small>Last: ${escape(historyDate(r.lastOpenAt))}</small><small>${r.opensCount} retained hourly signal(s)</small>` : `<span class="status-pill">${r.trackingEnabled ? "No signal recorded" : "Tracking not enabled"}</span>`}</td>
      <td>${escape(historyDuration(r.firstSeenDelayMs))}${r.timingExcluded ? '<small>Timestamp excluded</small>' : ""}</td>
      <td><button class="secondary" data-history="${index}">View</button></td></tr>`).join("") : '<tr><td colspan="7">No records match these filters. Clear filters to see all attempts.</td></tr>';
    $("historyPageInfo").textContent = result.total ? `Showing ${result.offset + 1}–${Math.min(result.offset + result.pageSize, result.total)} of ${result.total} matching attempts` : "No matching attempts";
    $("historyPrev").disabled = result.offset === 0;
    $("historyNext").disabled = result.offset + result.pageSize >= result.total;
    $("historyLoadStatus").textContent = `Updated ${new Date().toLocaleTimeString()}`;
    const selected = historyRecords.find((r) => r.trackingId === historySelected?.trackingId);
    if (selected && !historyReviewDirty) showHistoryDetail(selected, false);
  } catch (error) {
    if (request === historyRequest) $("historyLoadStatus").textContent = `Could not update: ${error.message}`;
    throw error;
  }
}
function showHistoryDetail(r, scroll = true) {
  historySelected = r;
  const opens = r.opens.length ? r.opens.map((event) => `  ${historyDate(event.at)}`).join("\n") : "  No retained open signals";
  $("historyMessage").textContent = `To: ${r.to}\nFrom: ${r.accountEmail || "Not recorded"}\nCampaign: ${r.campaignName}\nTemplate: ${r.templateName}\nOutcome: ${r.status}\nTracking ID: ${r.trackingId || "Legacy"}\nSend status: ${r.sendStatus || "Legacy"}\nConfirmation evidence: ${r.evidence || "Not confirmed"}\nAttempt: ${historyDate(r.at)}\nConfirmed send: ${historyDate(r.confirmedAt)}\nFirst seen (image request): ${historyDate(r.firstOpenAt)}\nLast seen: ${historyDate(r.lastOpenAt)}\nSend → first seen: ${historyDuration(r.firstSeenDelayMs)}\nBounce: ${r.bounceStatus || "None recorded"}${r.bounceReason ? ` — ${r.bounceReason}` : ""}\n\nRetained hourly open signals (up to 96; repeated requests within an hour are coalesced):\n${opens}\n\nSubject: ${r.subject || "Not recorded"}\n\n${r.body || "Message body was not recorded by the previous version."}\n\n${r.signature || ""}`;
  $("historyReviewStatus").value = r.replyStatus;
  $("historyReviewNote").value = r.followUp.note || "";
  $("historyReviewSaved").textContent = r.followUp.reviewedAt ? `Last reviewed ${historyDate(r.followUp.reviewedAt)}` : "Not reviewed yet";
  $("historyInspector").hidden = false;
  if (scroll) { historyReviewDirty = false; $("historyInspector").scrollIntoView({ behavior: "smooth", block: "nearest" }); }
}
$("historyRows").onclick = (e) => { const button = e.target.closest("[data-history]"); if (button) showHistoryDetail(historyRecords[Number(button.dataset.history)]); };
$("historyCloseDetail").onclick = () => { $("historyInspector").hidden = true; historySelected = null; historyReviewDirty = false; };
for (const id of ["historyReviewStatus", "historyReviewNote"]) $(id).oninput = () => { historyReviewDirty = true; $("historyReviewSaved").textContent = "Unsaved review"; };
$("historySaveReview").onclick = () => action($("historySaveReview"), async () => {
  if (!historySelected) return;
  const result = await api("/api/history/review", { trackingId: historySelected.trackingId, status: $("historyReviewStatus").value, note: $("historyReviewNote").value });
  historySelected.followUp = result.review; historySelected.replyStatus = result.review.status;
  historyReviewDirty = false; showHistoryDetail(historySelected, false); await loadHistory(); notice("Manual reply review saved.");
});
let historyTimer;
$("historySearch").oninput = () => { clearTimeout(historyTimer); historyTimer = setTimeout(() => { historyOffset = 0; loadHistory().catch((e) => notice(e.message)); }, 250); };
for (const id of Object.values(historyFilterIds).filter((id) => id !== "historySearch")) $(id).onchange = () => { historyOffset = 0; loadHistory().catch((e) => notice(e.message)); };
$("historyClearFilters").onclick = () => { for (const id of Object.values(historyFilterIds)) $(id).value = id === "historySort" ? "newest" : ""; historyOffset = 0; loadHistory().catch((e) => notice(e.message)); };
$("historyRefresh").onclick = () => action($("historyRefresh"), loadHistory);
$("historyPrev").onclick = () => { historyOffset = Math.max(0, historyOffset - 25); loadHistory().catch((e) => notice(e.message)); };
$("historyNext").onclick = () => { historyOffset += 25; loadHistory().catch((e) => notice(e.message)); };

$("historyConversations").onclick = () => { if (!historySelected) return; location.hash="conversations"; window.dispatchEvent(new CustomEvent("fc-conversation-search", { detail:historySelected.to })); };
