if ($("recovery"))
  $("recovery").onclick = (e) => {
    if (e.target.dataset.reconcile)
      action(e.target, () =>
        api("/api/reconcile", {
          email: e.target.dataset.reconcile,
          outcome: e.target.dataset.outcome,
        }),
      );
  };

async function loadHistory() {
  const qEl = $("historySearch");
  const statEl = $("historyStatus");
  if (!qEl || !statEl) return;

  const result = await api(
    "/api/history?" +
      new URLSearchParams({
        q: qEl.value,
        status: statEl.value,
        offset: String(historyOffset),
      }),
  );
  historyRecords = result.records;

  const hRows = $("historyRows");
  if (hRows) {
    hRows.innerHTML = historyRecords.length
      ? historyRecords
          .map(
            (r, index) =>
              `<tr><td><strong>${escape(r.to)}</strong><small>${escape(new Date(r.at).toLocaleString())}</small></td><td>${escape(r.accountEmail || "Legacy")}<small>${escape(state.templates[r.templateKey]?.name || r.templateKey || "Variant")}</small></td><td>${escape(r.subject)}</td><td><span class="status-pill ${r.status === "Sent" ? "good" : "blocked"}">${r.status === "Sent" ? "✓ Sent" : escape(r.status)}</span>${r.firstOpenAt ? `<span class="status-pill good" style="margin-left:4px;background:#ecfdf5;color:#047857;border:1px solid #10b981;font-weight:700;">👁️ Seen${r.opensCount > 1 ? ` (${r.opensCount}x)` : ''}</span>` : `<span class="status-pill" style="margin-left:4px;background:#f8fafc;color:#64748b;border:1px solid #e2e8f0;font-weight:500;">✉️ Unopened</span>`}${r.bounceStatus ? `<span class="status-pill blocked" style="margin-left:4px;">⛔ ${escape(r.bounceStatus)}</span>` : ''}</td><td style="text-align: right;"><button class="secondary" style="font-size: 11px; padding: 4px 8px;" data-history="${index}">View</button></td></tr>`,
          )
          .join("")
      : '<tr><td colspan="5" style="text-align: center; padding: 30px; color: var(--text-muted);">No attempts match your filters.</td></tr>';
  }

  const hInfo = $("historyPageInfo");
  if (hInfo) {
    hInfo.textContent = result.total
      ? `Showing ${historyOffset + 1}–${Math.min(historyOffset + 25, result.total)} of ${result.total} recorded attempts`
      : "No attempts recorded";
  }

  if ($("historyPrev")) $("historyPrev").disabled = historyOffset === 0;
  if ($("historyNext")) $("historyNext").disabled = historyOffset + 25 >= result.total;
}

if ($("historyRows"))
  $("historyRows").onclick = (e) => {
    if (e.target.dataset.history === undefined) return;
    const r = historyRecords[Number(e.target.dataset.history)];
    const msgEl = $("historyMessage");
    if (!msgEl) return;
    msgEl.hidden = false;
    msgEl.textContent = `To: ${r.to}\nFrom: ${r.accountEmail || "Not recorded"}\nCampaign: ${r.campaignName || "Legacy campaign"}\nTemplate: ${r.templateKey || "Not recorded"}\nOutcome: ${r.status}\nTracking ID: ${r.trackingId || "Legacy"}\nSend status: ${r.sendStatus || "Legacy"}\nConfirmation Evidence: ${r.evidence || "Not confirmed"}\nSubject: ${r.subject}\n\n${r.body || "Message body was not recorded by previous version."}\n\n${r.signature || ""}`;
    msgEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

let historyTimer;
if ($("historySearch"))
  $("historySearch").oninput = () => {
    clearTimeout(historyTimer);
    historyTimer = setTimeout(() => {
      historyOffset = 0;
      loadHistory().catch((e) => notice(e.message));
    }, 250);
  };

if ($("historyStatus"))
  $("historyStatus").onchange = () => {
    historyOffset = 0;
    loadHistory().catch((e) => notice(e.message));
  };

if ($("historyPrev"))
  $("historyPrev").onclick = () => {
    historyOffset = Math.max(0, historyOffset - 25);
    loadHistory().catch((e) => notice(e.message));
  };

if ($("historyNext"))
  $("historyNext").onclick = () => {
    historyOffset += 25;
    loadHistory().catch((e) => notice(e.message));
  };
