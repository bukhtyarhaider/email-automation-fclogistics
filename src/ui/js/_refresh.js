async function refresh() {
  state = await api("/api/state");
  for (const key of ["total", "ready", "excluded", "sent"]) {
    const el = $(key);
    if (el) el.textContent = state.counts[key].toLocaleString();
  }

  const conn = $("connection");
  if ($("browserSessionStatus")) $("browserSessionStatus").textContent = state.browserSession?.message || "Connect your mailbox.";
  if (conn) {
    conn.textContent = state.connected
      ? "Mailbox connected"
      : "Mailbox disconnected";
    conn.className = `connection-pill ${state.connected ? "good" : ""}`;
  }

  const wbName = $("workbookName");
  if (wbName) {
    wbName.textContent = state.workbook?.name || "No workbook imported.";
  }

  const options = JSON.stringify(state.sheets);
  const sheetSelect = $("sheet");
  if (sheetSelect && sheetSelect.dataset.options !== options) {
    const v = sheetSelect.value;
    sheetSelect.innerHTML =
      '<option value="">All worksheets</option>' +
      state.sheets
        .map(
          (s) =>
            `<option value="${escape(s.name)}">${escape(s.name)}${s.hidden ? " (hidden)" : ""}</option>`,
        )
        .join("");
    sheetSelect.value = v;
    sheetSelect.dataset.options = options;
  }

  const templateOptions = JSON.stringify(
    Object.entries(state.templates).map(([k, t]) => [k, t.name]),
  );
  const tempSelect = $("template");
  if (tempSelect && tempSelect.dataset.options !== templateOptions) {
    const v = tempSelect.value;
    tempSelect.innerHTML = Object.entries(state.templates)
      .map(
        ([key, t]) =>
          `<option value="${escape(key)}">${escape(t.name)}</option>`,
      )
      .join("");
    if (state.templates[v]) tempSelect.value = v;
    tempSelect.dataset.options = templateOptions;
    fillTemplate();
  }

  const quotaEl = $("quota");
  if (quotaEl) {
    quotaEl.textContent = `${state.remaining} attempts remaining this rolling hour; ${state.dayRemaining} in the next rolling 24-hour allowance. One recipient per message.`;
  }

  syncOptions("profileSelect", state.profiles, state.activeProfile);
  syncOptions("campaignSelect", state.campaigns, state.activeCampaign);

  const p = state.profiles.find((p) => p.id === state.activeProfile);
  if ($("profileName")) $("profileName").textContent = p?.name || "My Mailbox";
  if ($("brandName"))
    $("brandName").textContent = p?.business?.company || "OUTREACH DESK";
  if ($("brandMark")) {
    $("brandMark").textContent = (p?.business?.company || "Outreach Desk")
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }

  if (!configLoaded) {
    fillSettings();
    fillProfile();
    fillCampaign();
    configLoaded = true;
    if (!p?.email && $("settingsDetails")) $("settingsDetails").open = true;
  }

  const teamSt = $("teamStatus");
  if (teamSt) {
    teamSt.textContent = state.settings.team.enabled
      ? state.teamConnected
        ? "Team token connected. The shared server is checked before each send."
        : "Shared team server needs its access token."
      : "Independent PC mode. Other PCs’ sends are not tracked here.";
  }

  const nextSendEl = $("nextSend");
  if (nextSendEl) {
    nextSendEl.textContent = state.job.nextAt
      ? `Next check: ${new Date(state.job.nextAt).toLocaleTimeString()} (${Math.max(0, Math.ceil((Date.parse(state.job.nextAt) - Date.now()) / 1000))}s remaining)`
      : "";
  }

  const jobSt = $("jobStatus");
  if (jobSt) {
    jobSt.textContent = state.job.status;
    jobSt.className = `status-badge ${state.job.enabled ? "active" : ""}`;
  }

  const jobMsg = $("jobMessage");
  if (jobMsg) jobMsg.textContent = state.job.message;

  const prog = $("progress");
  if (prog) {
    prog.max = state.job.total || 1;
    prog.value = state.job.current;
  }

  const eventsEl = $("events");
  if (eventsEl) {
    eventsEl.innerHTML = state.events
      .slice()
      .reverse()
      .slice(0, 15)
      .map(
        (e) =>
          `<li><time>${escape(new Date(e.at).toLocaleTimeString())}</time><span>${escape(e.message)}</span></li>`,
      )
      .join("");
  }

  renderLiveActivityView();

  renderProfilesTable();
  renderTemplatesTable();
  renderSuppressionList();

  const rec = $("recovery");
  if (rec) {
    rec.innerHTML = Object.entries(state.attempts)
      .filter(
        ([, i]) => i.status === "Uncertain" || i.syncNeeded || i.teamSyncNeeded,
      )
      .map(
        ([email, i]) =>
          `<div class="recovery-item"><strong>${escape(email)}</strong><p>${i.status === "Uncertain" ? "Send result uncertain. Check the Sent folder in your browser. This address remains blocked from automatic retries." : "Send confirmed. Workbook update needs repair."}</p>${i.status === "Uncertain" ? `<button class="secondary" data-reconcile="${escape(email)}" data-outcome="sent">I verified it was sent</button><button class="secondary" data-reconcile="${escape(email)}" data-outcome="not-sent">I verified it was not sent</button>` : `<button class="secondary" data-reconcile="${escape(email)}" data-outcome="sent">Repair workbook status</button>`}</div>`,
      )
      .join("");
  }

  if (state.prepared && $("signatureText")) {
    $("signatureText").textContent = state.prepared.signature;
  }

  updateControls();
}
