let historyOffset = 0,
  historyRecords = [];
const $ = (id) => document.getElementById(id);
let state,
  rows = [],
  offset = 0,
  total = 0,
  previewId = null,
  selected = new Set(),
  pending = false,
  configLoaded = false,
  profileEditId = null,
  livePaused = false,
  liveViewMode = "visual",
  liveFilterKind = "all",
  liveSearchQuery = "",
  liveAutoScroll = true,
  liveEventsList = [],
  liveCountdownTotal = null;

const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

async function api(url, data) {
  const response = await fetch(
    url,
    data
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-FC-Request": "1" },
          body: JSON.stringify(data),
        }
      : {},
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}

function notice(text) {
  const el = $("notice");
  if (!el) return;
  el.hidden = !text;
  el.textContent = text;
  if (text) {
    clearTimeout(notice.timer);
    notice.timer = setTimeout(() => {
      el.hidden = true;
    }, 7000);
  }
}

async function action(button, fn) {
  if (pending) return;
  pending = true;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Working…";
  notice("");
  try {
    await fn();
    await refresh();
    await loadLeads();
    await loadHistory();
  } catch (e) {
    notice(e.message);
  } finally {
    pending = false;
    button.textContent = original;
    button.disabled = false;
    updateControls();
  }
}

function updateControls() {
  if (!state) return;
  const prep = $("prepare");
  if (prep)
    prep.disabled =
      pending ||
      state.busy ||
      !state.connected ||
      !previewId ||
      !state.templates[$("template").value] ||
      !!state.prepared ||
      state.job.enabled ||
      rows.find((x) => x.id === previewId)?.blocked;

  const sendOneBtn = $("sendOne");
  if (sendOneBtn)
    sendOneBtn.disabled =
      pending ||
      state.busy ||
      !state.prepared ||
      !state.connected ||
      !!state.attempts[state.prepared?.message.to];

  const rel = $("release");
  if (rel) rel.disabled = pending || state.busy || !state.connected;

  const batchBtn = $("batch");
  if (batchBtn)
    batchBtn.disabled =
      pending ||
      state.busy ||
      !state.connected ||
      state.job.enabled ||
      !selected.size ||
      !!state.prepared;

  const stopBtn = $("stop");
  if (stopBtn) stopBtn.hidden = !state.job.enabled;

  const startBtn = $("start");
  if (startBtn)
    startBtn.disabled =
      pending ||
      state.busy ||
      state.job.enabled ||
      !!state.prepared ||
      !state.campaigns.some((c) => c.enabled);

  const saveProf = $("saveProfile");
  if (saveProf) saveProf.disabled = pending || state.busy || state.job.enabled;

  const newProf = $("newProfile");
  if (newProf) newProf.disabled = pending || state.busy || state.job.enabled;

  const relBtn = $("reload");
  if (relBtn) relBtn.disabled = pending || state.busy || !!state.prepared;

  const connBtn = $("connect");
  if (connBtn) connBtn.disabled = pending || state.busy;

  const resBtn = $("resume");
  if (resBtn) {
    resBtn.hidden = state.connected || !state.signInOpen;
    resBtn.disabled = pending || state.busy;
  }

  const disBtn = $("disconnect");
  if (disBtn) {
    disBtn.disabled = pending || state.busy;
    disBtn.hidden = !state.connected;
  }

  const selCount = $("selectedCount");
  if (selCount) selCount.textContent = `${selected.size} selected`;

  const delSelLeads = $("deleteSelectedLeads");
  if (delSelLeads) {
    delSelLeads.disabled =
      pending || state.busy || state.job.enabled || !selected.size;
    delSelLeads.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Delete selected${selected.size ? ` (${selected.size})` : ""}`;
  }

  const delWs = $("deleteWorkspace");
  if (delWs) {
    delWs.disabled =
      pending || state.busy || state.job.enabled || !state.activeCampaign;
  }

  const delCamp = $("deleteCampaignBtn");
  if (delCamp) {
    delCamp.disabled =
      pending || state.busy || state.job.enabled || !state.activeCampaign;
  }

  const delCurProf = $("deleteCurrentProfile");
  if (delCurProf) {
    delCurProf.style.display =
      profileEditId && state.profiles.length > 1 ? "inline-flex" : "none";
    delCurProf.disabled = pending || state.busy || state.job.enabled;
  }

  const delTmpl = $("deleteTemplate");
  if (delTmpl) {
    delTmpl.disabled =
      pending || state.busy || !state.templates[$("template")?.value];
  }
}

async function refresh() {
  state = await api("/api/state");
  for (const key of ["total", "ready", "excluded", "sent"]) {
    const el = $(key);
    if (el) el.textContent = state.counts[key].toLocaleString();
  }

  const conn = $("connection");
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

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderProfilesTable() {
  const tbody = $("profilesTableBody");
  if (!tbody || !state?.profiles) return;
  const countBadge = $("profilesCountBadge");
  if (countBadge) {
    countBadge.textContent = `${state.profiles.length} Profile${state.profiles.length === 1 ? "" : "s"}`;
  }
  tbody.innerHTML = state.profiles.length
    ? state.profiles
        .map((p) => {
          const isActive = p.id === state.activeProfile;
          const channelName = p.browserChannel === "msedge" ? "Edge" : "Chrome";
          return `<tr>
            <td><strong>${escape(p.name || "Untitled")}</strong></td>
            <td>${escape(p.email)}</td>
            <td><span class="tag-badge">${escape(channelName)}</span><small style="color:var(--text-muted);">${escape(p.provider || "webmail")}</small></td>
            <td style="text-align: center;">
              <span class="status-pill ${isActive ? "ready" : "blocked"}">${isActive ? "Active" : "Inactive"}</span>
            </td>
            <td style="text-align: right;">
              <div class="row-actions">
                ${!isActive ? `<button class="secondary" style="font-size: 11px; padding: 4px 8px;" data-select-profile="${escape(p.id)}" title="Switch active mailbox">Activate</button>` : ""}
                <button class="secondary" style="font-size: 11px; padding: 4px 8px;" data-edit-profile="${escape(p.id)}" title="Edit profile in form">Edit</button>
                <button class="secondary danger-hover" style="font-size: 11px; padding: 4px 8px;" data-delete-profile="${escape(p.id)}" ${state.profiles.length <= 1 ? "disabled" : ""} title="Delete this mailbox profile">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            </td>
          </tr>`;
        })
        .join("")
    : '<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-muted);">No profiles configured.</td></tr>';
}

function renderTemplatesTable() {
  const tbody = $("templatesTableBody");
  if (!tbody || !state?.templates) return;
  const q = ($("templateSearch")?.value || "").toLowerCase().trim();
  const countBadge = $("templateCountBadge");
  const entries = Object.entries(state.templates);
  if (countBadge) {
    countBadge.textContent = `${entries.length} Variant${entries.length === 1 ? "" : "s"}`;
  }
  const filtered = entries.filter(([k, t]) => {
    if (!q) return true;
    return `${t.name} ${t.subject} ${(t.requiredFields || []).join(" ")}`.toLowerCase().includes(q);
  });
  tbody.innerHTML = filtered.length
    ? filtered
        .map(([key, t]) => {
          const reqFields = (t.requiredFields || []).map((f) => `<span class="tag-badge">${escape(f)}</span>`).join("");
          const isEnabled = t.enabled !== false;
          return `<tr>
            <td><strong>${escape(t.name)}</strong></td>
            <td style="max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escape(t.subject)}">${escape(t.subject || "—")}</td>
            <td style="text-align: center;"><span class="tag-badge">×${t.weight || 1}</span></td>
            <td style="text-align: center;">
              <span class="status-pill ${isEnabled ? "ready" : "blocked"}">${isEnabled ? "Active" : "Disabled"}</span>
            </td>
            <td>${reqFields || '<small style="color:var(--text-muted);">None required</small>'}</td>
            <td style="text-align: right;">
              <div class="row-actions">
                <button class="secondary" style="font-size: 11px; padding: 4px 8px;" data-edit-template="${escape(key)}" title="Load into editor">Edit</button>
                <button class="secondary" style="font-size: 11px; padding: 4px 8px;" data-export-template="${escape(key)}" title="Export this template JSON">Export</button>
                <button class="secondary danger-hover" style="font-size: 11px; padding: 4px 8px;" data-delete-template="${escape(key)}" title="Delete template variant">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            </td>
          </tr>`;
        })
        .join("")
    : '<tr><td colspan="6" style="text-align: center; padding: 25px; color: var(--text-muted);">No template variants found.</td></tr>';
}

function renderSuppressionList() {
  const supList = $("suppressionList");
  if (!supList || !state?.suppression) return;
  const q = ($("suppressionSearch")?.value || "").toLowerCase().trim();
  const countBadge = $("suppressionCountBadge");
  const entries = Object.entries(state.suppression);
  if (countBadge) {
    countBadge.textContent = `${entries.length} Suppressed`;
  }
  const filtered = entries.filter(([e, r]) => {
    if (!q) return true;
    return `${e} ${r}`.toLowerCase().includes(q);
  });
  supList.innerHTML = filtered.length
    ? filtered
        .map(
          ([e, r]) =>
            `<li>
              <div>
                <strong>${escape(e)}</strong>
                <div class="hint" style="margin: 2px 0 0 0;">${escape(r)}</div>
              </div>
              <button class="secondary danger-hover" style="font-size: 11px; padding: 4px 10px;" data-unsuppress="${escape(e)}" title="Remove from Do Not Contact list">Remove</button>
            </li>`,
        )
        .join("")
    : '<li style="justify-content: center; color: var(--text-muted); padding: 20px;">No suppressed records matching filter.</li>';
}

function fillTemplate() {
  const t = state.templates[$("template")?.value] || {
    name: "New template",
    subject: "",
    body: "",
    weight: 1,
    enabled: true,
    requiredFields: [],
  };
  if ($("subject")) $("subject").value = t.subject;
  if ($("body")) $("body").value = t.body;
  if ($("templateName")) $("templateName").value = t.name;
  if ($("templateEnabled")) $("templateEnabled").checked = t.enabled !== false;
  if ($("templateWeight")) $("templateWeight").value = t.weight || 1;
  if ($("requiredFields"))
    $("requiredFields").value = (t.requiredFields || []).join(", ");
  updateTemplateLivePreview();
}

function updateTemplateLivePreview() {
  const previewBox = $("templateLivePreview");
  if (!previewBox) return;
  const p = state?.profiles?.find((p) => p.id === state.activeProfile);
  const b = p?.business || state?.settings?.business || {};

  const sampleData = {
    firstName: "John",
    company: "Apex Freight Express",
    city: "Dallas",
    state: "TX",
    locationPhrase: " in Dallas, TX",
    senderName: b.senderName || $("senderName")?.value || "Mark",
    businessName: b.company || $("businessName")?.value || "FC Logistics",
    legalName:
      b.legalName || $("legalName")?.value || "Fleet Core Logistics LLC",
    address:
      b.address ||
      $("address")?.value ||
      "132 French Creek Dr, Rochester, NY 14618",
    services:
      b.services ||
      $("services")?.value ||
      "load sourcing, rate negotiation, lane planning, broker paperwork, and pickup/delivery coordination",
  };

  let subject = $("subject")?.value || "";
  let body = $("body")?.value || "";

  for (const [k, v] of Object.entries(sampleData)) {
    subject = subject.replaceAll(`{{${k}}}`, v);
    body = body.replaceAll(`{{${k}}}`, v);
  }

  previewBox.textContent = `Subject: ${subject}\n\n${body}`;
}

async function loadLeads() {
  const sheetEl = $("sheet");
  const filterEl = $("filter");
  const searchEl = $("search");
  if (!sheetEl || !filterEl || !searchEl) return;

  const query = new URLSearchParams({
    sheet: sheetEl.value,
    filter: filterEl.value,
    q: searchEl.value,
    offset: String(offset),
  });
  const result = await api(`/api/leads?${query}`);
  rows = result.leads;
  total = result.total;

  const leadRowsEl = $("leadRows");
  if (leadRowsEl) {
    leadRowsEl.innerHTML = rows.length
      ? rows
          .map(
            (l) =>
              `<tr><td style="text-align: center;"><input type="checkbox" data-select="${l.id}" aria-label="Select ${escape(l.company)}" ${l.blocked ? "disabled" : ""} ${selected.has(l.id) ? "checked" : ""}></td><td><strong>${escape(l.company)}</strong><small>${escape(l.fields["owner / principal"]) || "No contact listed"}</small></td><td>${escape(l.email) || "—"}</td><td>${escape([l.fields.city, l.fields.state].filter(Boolean).join(", ")) || "—"}</td><td><span class="status-pill ${l.blocked ? "blocked" : "ready"}">${escape(l.blocked || "Ready")}</span></td><td style="text-align: right;"><div class="row-actions"><button class="secondary" style="font-size: 11px; padding: 4px 8px;" data-preview="${l.id}" title="View lead details">Details</button><button class="secondary danger-hover" style="font-size: 11px; padding: 4px 8px;" data-delete-lead="${l.id}" title="Delete lead"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></div></td></tr>`,
          )
          .join("")
      : '<tr><td colspan="6" style="text-align: center; padding: 30px; color: var(--text-muted);">No leads match these filters.</td></tr>';
  }

  const pageInfoEl = $("pageInfo");
  if (pageInfoEl) {
    pageInfoEl.textContent = total
      ? `Showing ${offset + 1}–${Math.min(offset + 50, total)} of ${total.toLocaleString()} leads`
      : "No leads found";
  }

  if ($("previous")) $("previous").disabled = offset === 0;
  if ($("next")) $("next").disabled = offset + 50 >= total;
  if ($("selectPage")) $("selectPage").checked = false;
  updateControls();
}

function openPreviewDrawer() {
  const drawer = $("leadPreviewDrawer");
  if (drawer) drawer.classList.add("open");
}

function closePreviewDrawer() {
  const drawer = $("leadPreviewDrawer");
  if (drawer) drawer.classList.remove("open");
}

function switchDrawerTab(tabName) {
  const tabDetails = $("tabLeadDetails");
  const tabEmail = $("tabEmailDraft");
  const sectionDetails = $("leadDetailsSection");
  const sectionEmail = $("emailDraftSection");

  if (tabName === "email") {
    if (tabEmail) tabEmail.classList.add("active");
    if (tabDetails) tabDetails.classList.remove("active");
    if (sectionEmail) sectionEmail.style.display = "block";
    if (sectionDetails) sectionDetails.style.display = "none";
  } else {
    if (tabDetails) tabDetails.classList.add("active");
    if (tabEmail) tabEmail.classList.remove("active");
    if (sectionDetails) sectionDetails.style.display = "block";
    if (sectionEmail) sectionEmail.style.display = "none";
  }
}

function renderLeadDetails(lead, message, warnings) {
  const container = $("leadDetailsContainer");
  if (!container) return;
  if (!lead) {
    container.innerHTML = '<p style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 24px;">No lead details available.</p>';
    return;
  }

  const f = lead.fields || {};
  const contactName = f["owner / principal"] || f["contact"] || f["contact name"] || f["name"] || "";
  const contactTitle = f["owner title"] || f["title"] || "";
  const phone = f["phone"] || f["telephone"] || f["cell"] || f["phone number"] || "";
  const address = f["physical address"] || f["address"] || f["street"] || "";
  const city = f["city"] || "";
  const state = f["state"] || "";
  const zip = f["zip code"] || f["zip"] || f["postal code"] || "";
  const locationStr = [city, state, zip].filter(Boolean).join(", ");
  const usdot = f["usdot #"] || f["usdot"] || f["dot"] || "";
  const mc = f["mc docket #"] || f["mc"] || f["mc/ff/mx number"] || "";
  const authorityAge = f["authority age"] || "";
  const operatingStatus = f["operating status"] || "";
  const vettingTier = f["vetting tier"] || "";
  const drivers = f["drivers"] || "";
  const powerUnits = f["power units"] || "";
  const historicalNotes = f["historical notes"] || "";

  const sortedKeys = Object.keys(f).sort();

  const statusPill = lead.blocked
    ? `<span class="status-pill blocked">Excluded: ${escape(lead.blocked)}</span>`
    : `<span class="status-pill ready">Ready for outreach</span>`;

  const sheetStatusTag = lead.status
    ? `<span class="tag-badge">Workbook status: ${escape(lead.status)}</span>`
    : "";

  let lastAttemptHtml = '<span style="color: var(--text-muted); font-size: 12px;">No past outreach attempts recorded</span>';
  if (lead.lastAttempt) {
    const atStr = lead.lastAttempt.at ? new Date(lead.lastAttempt.at).toLocaleString() : "Recorded";
    lastAttemptHtml = `<div style="font-size: 12px; color: #93c5fd; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 6px; padding: 8px 12px;"><strong>${escape(lead.lastAttempt.status || "Attempted")}</strong> via ${escape(lead.lastAttempt.accountEmail || "mailbox")} on ${atStr}${lead.lastAttempt.subject ? `<div style="color: var(--text-secondary); margin-top: 2px;">Subject: "${escape(lead.lastAttempt.subject)}"</div>` : ""}</div>`;
  }

  let warningsHtml = "";
  if (warnings && warnings.length) {
    warningsHtml = `<div class="warning-callout" style="margin-bottom: 14px;"><strong>Note:</strong> ${warnings.map(escape).join(" ")}</div>`;
  }

  let historicalNotesHtml = "";
  if (historicalNotes && historicalNotes.trim()) {
    historicalNotesHtml = `
      <div class="lead-details-card" style="border-left: 3px solid #f59e0b;">
        <h4 class="lead-details-title" style="color: #fbbf24;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Historical Notes / Remarks
        </h4>
        <div style="font-size: 12.5px; color: #e5e7eb; line-height: 1.5; white-space: pre-wrap;">${escape(historicalNotes)}</div>
      </div>
    `;
  }

  const fieldsTableRows = sortedKeys.length
    ? sortedKeys.map(k => {
        const val = f[k];
        return `<tr><td class="field-key">${escape(k)}</td><td class="field-val">${val ? escape(val) : '<span style="color: var(--text-muted);">—</span>'}</td></tr>`;
      }).join("")
    : '<tr><td colspan="2" style="color: var(--text-muted); text-align: center; padding: 10px;">No attributes found</td></tr>';

  container.innerHTML = `
    <!-- Top Hero Card -->
    <div class="lead-details-hero">
      <h2 class="lead-hero-company">${escape(lead.company || "Unnamed Lead")}</h2>
      <div class="lead-hero-subtitle">
        ${contactName ? `<span><strong>${escape(contactName)}</strong>${contactTitle ? ` (${escape(contactTitle)})` : ""}</span>` : ""}
        ${locationStr ? `<span>• ${escape(locationStr)}</span>` : ""}
      </div>
      <div class="lead-badges-row">
        ${statusPill}
        ${sheetStatusTag}
      </div>
    </div>

    ${warningsHtml}

    <!-- Core Contact Information Card -->
    <div class="lead-details-card">
      <h4 class="lead-details-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
        Contact Information
      </h4>
      <div class="lead-details-grid">
        <div class="lead-detail-item">
          <span class="lead-detail-label">Email Address</span>
          <span class="lead-detail-value">
            ${lead.email ? `<a href="mailto:${escape(lead.email)}">${escape(lead.email)}</a><button type="button" class="copy-mini-btn" data-copy="${escape(lead.email)}" title="Copy email"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>` : "—"}
          </span>
        </div>
        <div class="lead-detail-item">
          <span class="lead-detail-label">Phone</span>
          <span class="lead-detail-value">
            ${phone ? `<a href="tel:${escape(phone)}">${escape(phone)}</a><button type="button" class="copy-mini-btn" data-copy="${escape(phone)}" title="Copy phone"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>` : "—"}
          </span>
        </div>
        <div class="lead-detail-item">
          <span class="lead-detail-label">Contact / Owner</span>
          <span class="lead-detail-value">${escape(contactName || "—")}</span>
        </div>
        <div class="lead-detail-item">
          <span class="lead-detail-label">Title / Role</span>
          <span class="lead-detail-value">${escape(contactTitle || "—")}</span>
        </div>
        <div class="lead-detail-item full-width">
          <span class="lead-detail-label">Physical Address</span>
          <span class="lead-detail-value">${escape(address || locationStr || "—")}</span>
        </div>
      </div>
    </div>

    <!-- Carrier & Regulatory Credentials -->
    ${(usdot || mc || authorityAge || operatingStatus || vettingTier || drivers || powerUnits) ? `
    <div class="lead-details-card">
      <h4 class="lead-details-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
        Carrier & Regulatory Credentials
      </h4>
      <div class="lead-details-grid">
        <div class="lead-detail-item">
          <span class="lead-detail-label">USDOT #</span>
          <span class="lead-detail-value">${escape(usdot || "—")}</span>
        </div>
        <div class="lead-detail-item">
          <span class="lead-detail-label">MC Docket #</span>
          <span class="lead-detail-value">${escape(mc || "—")}</span>
        </div>
        <div class="lead-detail-item">
          <span class="lead-detail-label">Operating Status</span>
          <span class="lead-detail-value">${escape(operatingStatus || "—")}</span>
        </div>
        <div class="lead-detail-item">
          <span class="lead-detail-label">Authority Age</span>
          <span class="lead-detail-value">${escape(authorityAge || "—")}</span>
        </div>
        <div class="lead-detail-item">
          <span class="lead-detail-label">Vetting Tier</span>
          <span class="lead-detail-value">${escape(vettingTier || "—")}</span>
        </div>
        <div class="lead-detail-item">
          <span class="lead-detail-label">Fleet Size / Drivers</span>
          <span class="lead-detail-value">${escape(drivers ? `${drivers} drivers` : (powerUnits ? `${powerUnits} units` : "—"))}</span>
        </div>
      </div>
    </div>
    ` : ""}

    <!-- Source Workbook Origin Card -->
    <div class="lead-details-card">
      <h4 class="lead-details-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        Workbook Origin & Status
      </h4>
      <div class="lead-details-grid">
        <div class="lead-detail-item">
          <span class="lead-detail-label">Worksheet Tab</span>
          <span class="lead-detail-value">${escape(lead.sheet || "Default")}</span>
        </div>
        <div class="lead-detail-item">
          <span class="lead-detail-label">Row & Cell Address</span>
          <span class="lead-detail-value">Row ${lead.row}${lead.emailCell ? ` (Email: ${lead.emailCell})` : ""}${lead.statusCell ? ` (Status: ${lead.statusCell})` : ""}</span>
        </div>
        <div class="lead-detail-item full-width">
          <span class="lead-detail-label">Past Outreach History</span>
          <div style="margin-top: 4px;">${lastAttemptHtml}</div>
        </div>
      </div>
    </div>

    ${historicalNotesHtml}

    <!-- Complete Spreadsheet Columns Inspection Table -->
    <div class="lead-details-card">
      <h4 class="lead-details-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"></polyline><line x1="1" y1="3" x2="23" y2="3"></line><polygon points="10 8 14 8 14 12 10 12"></polygon></svg>
        All Spreadsheet Columns (${sortedKeys.length})
      </h4>
      <div style="max-height: 280px; overflow-y: auto; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: var(--radius-sm); background: #111318;">
        <table class="lead-fields-table">
          <tbody>
            ${fieldsTableRows}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Switch to Email Preview Callout -->
    <div class="lead-action-cta">
      <div>
        <div style="font-size: 12px; font-weight: 600; color: #fff;">Personalized Email Preview</div>
        <div style="font-size: 11px; color: var(--text-secondary);">${message ? escape(message.subject) : "Click to view the drafted message for this lead"}</div>
      </div>
      <button type="button" class="secondary" id="btnSwitchToEmailDraft" style="font-size: 11px; padding: 5px 10px; white-space: nowrap;">
        View Email Draft →
      </button>
    </div>
  `;

  const ctaBtn = $("btnSwitchToEmailDraft");
  if (ctaBtn) {
    ctaBtn.onclick = () => switchDrawerTab("email");
  }

  container.querySelectorAll("[data-copy]").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const text = btn.dataset.copy;
      navigator.clipboard?.writeText(text).then(() => {
        notice(`Copied to clipboard: ${text}`);
      }).catch(() => {});
    };
  });
}

async function preview(id) {
  previewId = id;
  // Always default to Lead Details tab when opening preview
  switchDrawerTab("details");

  const localLead = rows.find((x) => x.id === id);
  if (localLead && $("previewTitle")) {
    $("previewTitle").textContent = localLead.company || "Lead Details";
  }

  const templateKey = $("template")?.value;
  try {
    const res = await api(
      `/api/preview?${new URLSearchParams({ id, key: templateKey })}`,
    );
    const lead = res.lead || localLead;
    const message = res.message;
    const warnings = res.warnings || [];

    if ($("previewTitle")) $("previewTitle").textContent = (lead && lead.company) ? lead.company : "Lead Details";
    if ($("previewTo") && message) $("previewTo").textContent = `To: ${message.to}`;
    if ($("previewBody") && message) $("previewBody").textContent = message.body;

    const warnEl = $("warnings");
    if (warnEl) {
      warnEl.hidden = !warnings.length;
      warnEl.textContent = warnings.join(" ");
    }

    renderLeadDetails(lead, message, warnings);
  } catch (err) {
    if (localLead) {
      renderLeadDetails(localLead, null, [err.message]);
    } else {
      notice(err.message);
    }
  }

  openPreviewDrawer();
  updateControls();
}

// Navigation View Routing
function navigate(viewName) {
  const validViews = [
    "dashboard",
    "leads",
    "campaigns",
    "templates",
    "live-activity",
    "activity",
    "tracking",
    "suppression",
    "settings",
  ];
  const target = validViews.includes(viewName) ? viewName : "dashboard";

  document.querySelectorAll(".view-page").forEach((el) => {
    el.classList.toggle("active", el.id === `view-${target}`);
  });

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.view === target);
  });

  if (target === "tracking" && state) void loadTracking().catch((e) => notice(e.message));
  if (target === "live-activity") {
    renderLiveActivityView();
  }
}

window.addEventListener("hashchange", () => {
  navigate(location.hash.replace("#", ""));
});

// Live System Activity Logic
function classifyEvent(e) {
  const msg = String(e?.message || "");
  const k = String(e?.kind || "").toLowerCase();
  if (k === "error" || /fail|error|uncertain|needs attention|blocked/i.test(msg)) return "error";
  if (k === "pause" || /pause|rest|seconds|waiting for leads|team pacing|interval|allowance pause/i.test(msg)) return "pause";
  if (k === "sent" || k === "start" || /sent to|sending to|started .* outreach|dispatched/i.test(msg)) return "send";
  if (k === "system" || k === "template" || /saved|imported|connected|disconnected|reloaded|deleted|profile|template|settings|workbook|suppress|reviewed|cleared/i.test(msg)) return "system";
  return "system";
}

function renderLiveActivityView() {
  if (!state) return;

  // 1. Accumulate events into liveEventsList without duplicates
  if (Array.isArray(state.events)) {
    const existingKeys = new Set(liveEventsList.map((e) => `${e.at}_${e.message}`));
    for (const e of state.events) {
      const key = `${e.at}_${e.message}`;
      if (!existingKeys.has(key)) {
        liveEventsList.push(e);
        existingKeys.add(key);
      }
    }
  }

  // 2. Telemetry Card 1: Runner Engine
  const runnerBadge = $("liveRunnerBadge");
  const runnerState = $("liveRunnerStateText");
  const runnerMsg = $("liveRunnerMsgText");
  const countdownWrap = $("liveCountdownWrapper");
  const countdownTimer = $("liveCountdownTimer");
  const countdownLabel = $("liveCountdownLabel");

  const job = state.job || {};
  const isRunning = !!(state.automation && state.automation.enabled);
  const runnerStatus = job.status || (isRunning ? "Running" : "Stopped");

  if (runnerBadge) {
    runnerBadge.textContent = runnerStatus;
    runnerBadge.className = `status-badge ${isRunning ? "active" : ""}`;
  }
  if (runnerState) {
    runnerState.textContent = isRunning ? (job.status || "Running") : "Idle / Stopped";
  }
  if (runnerMsg) {
    runnerMsg.textContent = job.message || "Queue is stopped. Start continuous outreach to resume.";
  }

  if (job.nextAt && Date.parse(job.nextAt) > Date.now()) {
    if (countdownWrap) countdownWrap.hidden = false;
    const diffMs = Date.parse(job.nextAt) - Date.now();
    const totalSec = Math.max(0, Math.ceil(diffMs / 1000));
    const mins = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const secs = String(totalSec % 60).padStart(2, "0");
    if (countdownTimer) countdownTimer.textContent = `${mins}:${secs}`;
    if (countdownLabel) countdownLabel.textContent = job.status ? `${job.status}:` : "Next send scheduled in:";
  } else {
    if (countdownWrap) countdownWrap.hidden = true;
  }

  // 3. Telemetry Card 2: Mailbox Session
  const mailboxPill = $("liveMailboxPill");
  const mailboxStatus = $("liveMailboxStatusText");
  const mailboxAccount = $("liveMailboxAccountText");
  const coordStatus = $("liveCoordinatorStatusText");

  const p = state.profiles ? state.profiles.find((p) => p.id === state.activeProfile) : null;
  const currentEmail = p?.email || state.settings?.account?.email || "No account";

  if (mailboxPill) {
    mailboxPill.className = `connection-pill ${state.connected ? "good" : ""}`;
  }
  if (mailboxStatus) {
    mailboxStatus.textContent = state.connected ? "Connected" : "Disconnected";
  }
  if (mailboxAccount) {
    mailboxAccount.textContent = currentEmail;
    mailboxAccount.title = currentEmail;
  }
  if (coordStatus) {
    if (state.settings?.team?.enabled) {
      coordStatus.textContent = state.teamConnected
        ? `Coordinator: Connected (${escape(state.settings.team.workerName || "worker")})`
        : "Coordinator: Connecting / Waiting";
    } else {
      coordStatus.textContent = "Coordinator: Standalone";
    }
  }

  // 4. Telemetry Card 3: Pacing Quotas
  const hourVal = $("liveHourQuotaText");
  const hourFill = $("liveHourQuotaFill");
  const dayVal = $("liveDayQuotaText");
  const dayFill = $("liveDayQuotaFill");
  const pacing = state.settings?.pacing || { hourlyCap: 20, dailyCap: 100 };

  const hourRemaining = state.remaining ?? pacing.hourlyCap;
  const dayRemaining = state.dayRemaining ?? pacing.dailyCap;
  const hourPct = Math.min(100, Math.max(0, (hourRemaining / (pacing.hourlyCap || 1)) * 100));
  const dayPct = Math.min(100, Math.max(0, (dayRemaining / (pacing.dailyCap || 1)) * 100));

  if (hourVal) hourVal.textContent = `${hourRemaining} / ${pacing.hourlyCap} left`;
  if (hourFill) {
    hourFill.style.width = `${hourPct}%`;
    hourFill.style.background = hourPct < 20 ? "#ef4444" : hourPct < 50 ? "#f59e0b" : "#8b5cf6";
  }
  if (dayVal) dayVal.textContent = `${dayRemaining} / ${pacing.dailyCap} left`;
  if (dayFill) {
    dayFill.style.width = `${dayPct}%`;
    dayFill.style.background = dayPct < 20 ? "#ef4444" : dayPct < 50 ? "#f59e0b" : "#3b82f6";
  }

  // 5. Telemetry Card 4: Metrics Breakdown
  let countSent = 0, countPacing = 0, countSystem = 0, countError = 0;
  for (const e of liveEventsList) {
    const cls = classifyEvent(e);
    if (cls === "send") countSent++;
    else if (cls === "pause") countPacing++;
    else if (cls === "system") countSystem++;
    else if (cls === "error") countError++;
  }

  if ($("liveTotalCountBadge")) $("liveTotalCountBadge").textContent = `${liveEventsList.length} events`;
  if ($("liveStreamCounter")) $("liveStreamCounter").textContent = `${liveEventsList.length} total`;
  if ($("liveMetricSent")) $("liveMetricSent").textContent = String(countSent);
  if ($("liveMetricPacing")) $("liveMetricPacing").textContent = String(countPacing);
  if ($("liveMetricSystem")) $("liveMetricSystem").textContent = String(countSystem);
  if ($("liveMetricError")) $("liveMetricError").textContent = String(countError);

  if ($("tabChipAll")) $("tabChipAll").textContent = String(liveEventsList.length);
  if ($("tabChipSend")) $("tabChipSend").textContent = String(countSent);
  if ($("tabChipPause")) $("tabChipPause").textContent = String(countPacing);
  if ($("tabChipSystem")) $("tabChipSystem").textContent = String(countSystem);
  if ($("tabChipError")) $("tabChipError").textContent = String(countError);

  // 6. Live Stream status badge
  const streamBadge = $("liveStreamStatusBadge");
  const streamText = $("liveStreamStatusText");
  if (livePaused) {
    if (streamBadge) streamBadge.className = "live-stream-badge paused";
    if (streamText) streamText.textContent = "FEED PAUSED";
    return;
  } else {
    if (streamBadge) streamBadge.className = "live-stream-badge";
    if (streamText) streamText.textContent = "STREAMING LIVE";
  }

  // 7. Filter & Search
  const query = liveSearchQuery.trim().toLowerCase();
  const filtered = liveEventsList.filter((e) => {
    const cls = classifyEvent(e);
    if (liveFilterKind !== "all" && cls !== liveFilterKind) return false;
    if (query) {
      const text = `${e.message} ${e.kind || ""} ${cls}`.toLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  });

  if ($("liveFilteredCountText")) {
    $("liveFilteredCountText").textContent =
      liveFilterKind === "all" && !query
        ? `Showing all ${filtered.length} events`
        : `Showing ${filtered.length} of ${liveEventsList.length} events (filtered)`;
  }

  // 8. Render Visual Feed
  const visualList = $("liveVisualEventsList");
  const emptyState = $("liveVisualEmptyState");
  if (visualList) {
    if (filtered.length === 0) {
      visualList.innerHTML = "";
      if (emptyState) emptyState.hidden = false;
    } else {
      if (emptyState) emptyState.hidden = true;
      visualList.innerHTML = filtered
        .slice()
        .reverse()
        .map((e) => {
          const cls = classifyEvent(e);
          const time = new Date(e.at).toLocaleTimeString();
          const badgeText = cls.toUpperCase();
          const metaTags = [];
          if (e.seconds) metaTags.push(`${e.seconds}s delay`);
          if (e.company) metaTags.push(escape(e.company));
          if (e.email) metaTags.push(escape(e.email));
          if (e.kind && e.kind !== cls) metaTags.push(escape(e.kind));

          return `
            <li class="live-event-card event-${cls}">
              <span class="event-type-badge">${badgeText}</span>
              <time class="event-time" title="${escape(e.at)}">${escape(time)}</time>
              <div class="event-body">
                <span>${escape(e.message)}</span>
                ${metaTags.map((t) => `<span class="event-meta-tag">${t}</span>`).join("")}
              </div>
            </li>
          `;
        })
        .join("");
    }
  }

  // 9. Render Terminal Feed
  const termOutput = $("liveTerminalOutput");
  if (termOutput && liveViewMode === "terminal") {
    if (filtered.length === 0) {
      termOutput.textContent = "# [fc-telemetry] No events matching current criteria.";
    } else {
      const termLines = filtered
        .map((e) => {
          const cls = classifyEvent(e).toUpperCase().padEnd(6);
          const time = new Date(e.at).toLocaleTimeString();
          return `[${time}] [${cls}] ${e.message}`;
        })
        .join("\n");
      termOutput.textContent = termLines;
    }
  }

  // 10. Auto-scroll
  if (liveAutoScroll) {
    const feedWrap = $("liveVisualFeedContainer");
    if (feedWrap && liveViewMode === "visual") {
      feedWrap.scrollTop = 0;
    }
    const termWrap = $("liveTerminalContainer");
    if (termWrap && liveViewMode === "terminal") {
      const termPre = $("liveTerminalOutput");
      if (termPre) termPre.scrollTop = termPre.scrollHeight;
    }
  }
}

// Live Countdown Ticker Loop (500ms for smooth ticking)
setInterval(() => {
  if (state?.job?.nextAt) {
    const diffMs = Date.parse(state.job.nextAt) - Date.now();
    const wrap = $("liveCountdownWrapper");
    if (diffMs > 0) {
      if (wrap) wrap.hidden = false;
      const totalSec = Math.ceil(diffMs / 1000);
      const mins = String(Math.floor(totalSec / 60)).padStart(2, "0");
      const secs = String(totalSec % 60).padStart(2, "0");
      const timerEl = $("liveCountdownTimer");
      if (timerEl) timerEl.textContent = `${mins}:${secs}`;
      const barEl = $("liveCountdownBar");
      if (barEl) {
        if (!liveCountdownTotal || totalSec > liveCountdownTotal) {
          liveCountdownTotal = totalSec;
        }
        const pct = Math.max(0, Math.min(100, ((liveCountdownTotal - totalSec) / liveCountdownTotal) * 100));
        barEl.style.width = `${pct}%`;
      }
    } else {
      liveCountdownTotal = null;
      if (wrap) wrap.hidden = true;
    }
  } else {
    liveCountdownTotal = null;
    const wrap = $("liveCountdownWrapper");
    if (wrap) wrap.hidden = true;
  }
}, 500);

// Live System Activity setup listeners
if ($("liveCategoryTabs")) {
  $("liveCategoryTabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".cat-tab");
    if (!tab) return;
    document.querySelectorAll(".cat-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    liveFilterKind = tab.dataset.kind || "all";
    renderLiveActivityView();
  });
}

if ($("liveSearchInput")) {
  $("liveSearchInput").addEventListener("input", (e) => {
    liveSearchQuery = e.target.value;
    renderLiveActivityView();
  });
}

if ($("liveAutoScrollCheck")) {
  $("liveAutoScrollCheck").addEventListener("change", (e) => {
    liveAutoScroll = !!e.target.checked;
  });
}

if ($("livePauseToggleBtn")) {
  $("livePauseToggleBtn").addEventListener("click", () => {
    livePaused = !livePaused;
    const btnText = $("livePauseBtnText");
    if (btnText) btnText.textContent = livePaused ? "Resume Feed" : "Pause Feed";
    $("livePauseToggleBtn").classList.toggle("danger", livePaused);
    $("livePauseToggleBtn").classList.toggle("secondary", !livePaused);
    renderLiveActivityView();
  });
}

if ($("liveClearEventsBtn")) {
  $("liveClearEventsBtn").addEventListener("click", async () => {
    liveEventsList = [];
    if (window.confirm("Clear server activity event history as well? Click OK to reset server log, or Cancel to clear current screen view only.")) {
      try {
        await api("/api/clear-events", {});
        notice("Server activity log cleared.");
      } catch (err) {
        notice(`Failed to clear server log: ${err.message}`);
      }
    } else {
      notice("Screen event view cleared.");
    }
    renderLiveActivityView();
  });
}

if ($("btnModeVisual")) {
  $("btnModeVisual").addEventListener("click", () => {
    liveViewMode = "visual";
    $("btnModeVisual").classList.add("active");
    $("btnModeTerminal").classList.remove("active");
    if ($("liveVisualFeedContainer")) $("liveVisualFeedContainer").hidden = false;
    if ($("liveTerminalContainer")) $("liveTerminalContainer").hidden = true;
    renderLiveActivityView();
  });
}

if ($("btnModeTerminal")) {
  $("btnModeTerminal").addEventListener("click", () => {
    liveViewMode = "terminal";
    $("btnModeTerminal").classList.add("active");
    $("btnModeVisual").classList.remove("active");
    if ($("liveVisualFeedContainer")) $("liveVisualFeedContainer").hidden = true;
    if ($("liveTerminalContainer")) $("liveTerminalContainer").hidden = false;
    renderLiveActivityView();
  });
}

if ($("liveTerminalCopyBtn")) {
  $("liveTerminalCopyBtn").addEventListener("click", () => {
    const text = $("liveTerminalOutput")?.textContent || "";
    if (navigator.clipboard && text) {
      navigator.clipboard.writeText(text).then(() => {
        notice("Terminal console log copied to clipboard.");
      });
    } else {
      notice("No log content to copy.");
    }
  });
}

// Setup click and input listeners
if ($("reload"))
  $("reload").onclick = () => action($("reload"), () => api("/api/reload", {}));

if ($("upload"))
  $("upload").onchange = () =>
    action($("reload"), async () => {
      const file = $("upload").files[0];
      if (!file) return;
      const r = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "X-FC-Request": "1",
          "X-Filename": encodeURIComponent(file.name),
        },
        body: file,
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      selected.clear();
      offset = 0;
      previewId = null;
      await refresh();
      fillCampaign();
      $("upload").value = "";
      notice("Campaign imported successfully.");
    });

if ($("connect"))
  $("connect").onclick = () =>
    action($("connect"), async () => {
      const password = $("password").value;
      $("password").value = "";
      await api("/api/connect", { password });
      notice("Mailbox connected successfully.");
    });

if ($("disconnect"))
  $("disconnect").onclick = () =>
    action($("disconnect"), () => api("/api/disconnect", {}));

if ($("resume"))
  $("resume").onclick = () => action($("resume"), () => api("/api/resume", {}));

if ($("saveTemplate"))
  $("saveTemplate").onclick = () =>
    action($("saveTemplate"), async () => {
      const saved = await api("/api/template", {
        key: $("template").value,
        name: $("templateName").value,
        subject: $("subject").value,
        body: $("body").value,
        enabled: $("templateEnabled").checked,
        weight: Number($("templateWeight").value),
        requiredFields: $("requiredFields")
          .value.split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      });
      await refresh();
      $("template").value = saved.key;
      fillTemplate();
      if (previewId) await preview(previewId);
      notice("Template variant saved.");
    });

if ($("template"))
  $("template").onchange = () => {
    fillTemplate();
    if (previewId) preview(previewId).catch((e) => notice(e.message));
  };

if ($("subject")) $("subject").oninput = updateTemplateLivePreview;
if ($("body")) $("body").oninput = updateTemplateLivePreview;

// Token chip click helper
document.querySelectorAll(".token-chip").forEach((chip) => {
  chip.onclick = () => {
    const token = chip.dataset.token;
    const bodyEl = $("body");
    if (!bodyEl || !token) return;
    const start = bodyEl.selectionStart || bodyEl.value.length;
    const end = bodyEl.selectionEnd || bodyEl.value.length;
    const txt = bodyEl.value;
    bodyEl.value = txt.substring(0, start) + token + txt.substring(end);
    bodyEl.selectionStart = bodyEl.selectionEnd = start + token.length;
    bodyEl.focus();
    updateTemplateLivePreview();
  };
});

if ($("prepare"))
  $("prepare").onclick = () =>
    action($("prepare"), async () => {
      const r = await api("/api/prepare", {
        id: previewId,
        key: $("template").value,
        randomTemplates: $("randomTemplates").checked,
      });
      if ($("signatureText")) $("signatureText").textContent = r.signature;
      if ($("previewTitle")) $("previewTitle").textContent = r.message.subject;
      if ($("previewBody")) $("previewBody").textContent = r.message.body;
      notice("Compose filled in your browser. Review it before sending.");
    });

if ($("release"))
  $("release").onclick = () =>
    action($("release"), () => {
      closePreviewDrawer();
      return api("/api/release", {});
    });

if ($("sendOne"))
  $("sendOne").onclick = () =>
    action($("sendOne"), async () => {
      await api("/api/send", {});
      selected.delete(previewId);
      closePreviewDrawer();
      notice("Send confirmed. Workbook status updated.");
    });

if ($("batch"))
  $("batch").onclick = () =>
    action($("batch"), async () => {
      await api("/api/batch", {
        ids: [...selected],
        key: $("template").value,
        randomTemplates: $("randomTemplates").checked,
      });
      selected.clear();
      notice("Batch dispatch initiated.");
    });

if ($("start"))
  $("start").onclick = () =>
    action($("start"), async () => {
      await api("/api/start", {
        key: $("template").value,
        randomTemplates: $("randomTemplates").checked,
      });
      notice("Continuous outreach started.");
    });

if ($("stop"))
  $("stop").onclick = async () => {
    try {
      await api("/api/stop", {});
      await refresh();
      notice("Outreach stop requested.");
    } catch (e) {
      notice(e.message);
    }
  };

if ($("suppress"))
  $("suppress").onclick = () =>
    action($("suppress"), async () => {
      await api("/api/suppress", {
        email: $("suppressEmail").value,
        reason: $("suppressReason").value,
      });
      $("suppressEmail").value = "";
      $("suppressReason").value = "";
      notice("Recipient added to suppression list.");
    });

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

if ($("leadRows")) {
  $("leadRows").onclick = (e) => {
    const previewBtn = e.target.closest("[data-preview]");
    if (previewBtn) {
      preview(previewBtn.dataset.preview).catch((err) => notice(err.message));
      return;
    }
    const delBtn = e.target.closest("[data-delete-lead]");
    if (delBtn) {
      const id = delBtn.dataset.deleteLead;
      if (!confirm("Are you sure you want to permanently delete this lead from the workbook?")) return;
      action(delBtn, async () => {
        await api("/api/delete-leads", { ids: [id] });
        selected.delete(id);
        notice("Lead deleted.");
      });
      return;
    }
  };

  $("leadRows").onchange = (e) => {
    const id = e.target.dataset.select;
    if (id) {
      if (e.target.checked) selected.add(id);
      else selected.delete(id);
      updateControls();
    }
  };
}

if ($("selectPage"))
  $("selectPage").onchange = () => {
    for (const l of rows)
      if (!l.blocked) {
        if ($("selectPage").checked) selected.add(l.id);
        else selected.delete(l.id);
      }
    loadLeads().catch((e) => notice(e.message));
  };

if ($("clearSelection"))
  $("clearSelection").onclick = () => {
    selected.clear();
    loadLeads().catch((e) => notice(e.message));
  };

if ($("deleteSelectedLeads"))
  $("deleteSelectedLeads").onclick = () => {
    if (!selected.size) return;
    if (
      !confirm(
        `Are you sure you want to delete ${selected.size} selected lead(s) permanently from the workbook?`,
      )
    )
      return;
    action($("deleteSelectedLeads"), async () => {
      await api("/api/delete-leads", { ids: [...selected] });
      selected.clear();
      notice("Selected leads deleted.");
    });
  };

async function deleteActiveCampaign(btn) {
  if (!state.activeCampaign) return;
  const c = state.campaigns.find((c) => c.id === state.activeCampaign);
  if (
    !confirm(
      `Are you sure you want to delete workspace "${c?.name || "Current"}" and all its leads?`,
    )
  )
    return;
  action(btn, async () => {
    await api("/api/delete-campaign", { id: state.activeCampaign });
    selected.clear();
    previewId = null;
    offset = 0;
    await refresh();
    fillCampaign();
    await loadLeads();
    notice("Workspace deleted.");
  });
}

if ($("deleteWorkspace"))
  $("deleteWorkspace").onclick = () =>
    deleteActiveCampaign($("deleteWorkspace"));

if ($("deleteCampaignBtn"))
  $("deleteCampaignBtn").onclick = () =>
    deleteActiveCampaign($("deleteCampaignBtn"));

if ($("suppressionSearch"))
  $("suppressionSearch").oninput = () => {
    renderSuppressionList();
  };

if ($("suppressionList"))
  $("suppressionList").onclick = (e) => {
    const unsuppBtn = e.target.closest("[data-unsuppress]");
    if (unsuppBtn) {
      const email = unsuppBtn.dataset.unsuppress;
      if (!confirm(`Remove ${email} from Do Not Contact list?`)) return;
      action(unsuppBtn, async () => {
        await api("/api/unsuppress", { email });
        notice(`Removed ${email} from suppression list.`);
      });
    }
  };

for (const id of ["sheet", "filter"]) {
  if ($(id))
    $(id).onchange = () => {
      offset = 0;
      loadLeads().catch((e) => notice(e.message));
    };
}

let searchTimer;
if ($("search"))
  $("search").oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      offset = 0;
      loadLeads().catch((e) => notice(e.message));
    }, 250);
  };

if ($("previous"))
  $("previous").onclick = () => {
    offset = Math.max(0, offset - 50);
    loadLeads().catch((e) => notice(e.message));
  };

if ($("next"))
  $("next").onclick = () => {
    offset += 50;
    loadLeads().catch((e) => notice(e.message));
  };

function syncOptions(id, entries, value) {
  const el = $(id);
  if (!el) return;
  const snapshot = JSON.stringify(entries.map((x) => [x.id, x.name]));
  if (el.dataset.options !== snapshot) {
    el.innerHTML = entries
      .map((x) => `<option value="${escape(x.id)}">${escape(x.name)}</option>`)
      .join("");
    el.dataset.options = snapshot;
  }
  el.value = value || "";
}

const pacingFields = [
  "minSeconds",
  "maxSeconds",
  "hourlyCap",
  "dailyCap",
  "pauseEveryMin",
  "pauseEveryMax",
  "pauseMinSeconds",
  "pauseMaxSeconds",
  "pollSeconds",
];

const PACING_PRESETS = {
  warmup: {
    name: "New Mailbox Warmup",
    minSeconds: 240,
    maxSeconds: 480,
    hourlyCap: 10,
    dailyCap: 40,
    pauseEveryMin: 5,
    pauseEveryMax: 8,
    pauseMinSeconds: 900,
    pauseMaxSeconds: 1800,
    pollSeconds: 60,
  },
  balanced: {
    name: "Balanced Human Pace",
    minSeconds: 150,
    maxSeconds: 300,
    hourlyCap: 18,
    dailyCap: 80,
    pauseEveryMin: 8,
    pauseEveryMax: 14,
    pauseMinSeconds: 600,
    pauseMaxSeconds: 1200,
    pollSeconds: 60,
  },
  established: {
    name: "Aged / Established Domain",
    minSeconds: 90,
    maxSeconds: 180,
    hourlyCap: 25,
    dailyCap: 120,
    pauseEveryMin: 12,
    pauseEveryMax: 20,
    pauseMinSeconds: 480,
    pauseMaxSeconds: 900,
    pollSeconds: 45,
  },
  stealth: {
    name: "Stealth Background",
    minSeconds: 300,
    maxSeconds: 600,
    hourlyCap: 8,
    dailyCap: 50,
    pauseEveryMin: 6,
    pauseEveryMax: 10,
    pauseMinSeconds: 900,
    pauseMaxSeconds: 1500,
    pollSeconds: 60,
  },
};

function highlightPacingPreset(presetKey) {
  document.querySelectorAll(".pacing-preset-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.preset === presetKey);
  });
}

function detectActivePreset() {
  for (const [key, preset] of Object.entries(PACING_PRESETS)) {
    let matches = true;
    for (const [field, val] of Object.entries(preset)) {
      if (field !== "name") {
        const inputVal = Number($(field)?.value);
        if (inputVal !== val) {
          matches = false;
          break;
        }
      }
    }
    if (matches) {
      highlightPacingPreset(key);
      return key;
    }
  }
  highlightPacingPreset(null);
  return null;
}

function applyPacingPreset(presetKey, showNotice = true) {
  const preset = PACING_PRESETS[presetKey];
  if (!preset) return;

  for (const [key, val] of Object.entries(preset)) {
    if (key !== "name" && $(key)) {
      $(key).value = val;
    }
  }

  highlightPacingPreset(presetKey);

  if (showNotice) {
    notice(`Applied "${preset.name}" preset. Click "Save sending settings" to persist.`);
  }
}

function readBusiness() {
  return {
    company: $("businessName")?.value || "",
    senderName: $("senderName")?.value || "",
    legalName: $("legalName")?.value || "",
    address: $("address")?.value || "",
    services: $("services")?.value || "",
  };
}

function fillProfile(explicitProfile) {
  const p =
    explicitProfile ||
    state.profiles.find((p) => p.id === (profileEditId || state.activeProfile));
  profileEditId = p?.id || null;
  if ($("accountName")) $("accountName").value = p?.name || "";
  if ($("accountEmail")) $("accountEmail").value = p?.email || "";
  if ($("accountUrl"))
    $("accountUrl").value =
      p?.url || "https://privateemail.com/spm/mail/INBOX/";
  if ($("provider")) $("provider").value = p?.provider || "privateemail";
  if ($("browserChannel"))
    $("browserChannel").value = p?.browserChannel || "chrome";

  const b = p?.business || state.settings.business;
  for (const [id, key] of Object.entries({
    businessName: "company",
    senderName: "senderName",
    legalName: "legalName",
    address: "address",
    services: "services",
  })) {
    if ($(id)) $(id).value = b[key] || "";
  }
  updateTemplateLivePreview();
  updateControls();
}

function fillSettings() {
  const s = state.settings;
  for (const key of pacingFields) {
    if ($(key)) $(key).value = s.pacing[key];
  }
  for (const key of ["requireActive", "requireNoOutOfService", "allowHidden"]) {
    if ($(key)) $(key).checked = s.eligibility[key];
  }
  if ($("readyStatuses")) {
    $("readyStatuses").value = s.eligibility.readyStatuses
      .map((v) => v || "blank")
      .join(", ");
  }
  if ($("sentStatus")) $("sentStatus").value = s.eligibility.sentStatus;
  if ($("teamEnabled")) $("teamEnabled").checked = s.team.enabled;
  if ($("teamUrl")) $("teamUrl").value = s.team.url;
  if ($("workerName")) $("workerName").value = s.team.workerName;
  detectActivePreset();
}

function fillCampaign() {
  const c = state.campaigns.find((c) => c.id === state.activeCampaign);
  if ($("campaignName")) $("campaignName").value = c?.name || "";
  if ($("campaignEnabled")) $("campaignEnabled").checked = c?.enabled !== false;
  if ($("campaignSheets")) $("campaignSheets").value = (c?.sheets || []).join("\n");
  if ($("mapping")) $("mapping").value = JSON.stringify(c?.mapping || {}, null, 2);
  if ($("headers")) {
    $("headers").textContent = state.sheets
      .map(
        (s) =>
          `${s.name}: ${Object.entries(s.headers || {})
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")}`,
      )
      .join("\n");
  }
}

if ($("saveProfile"))
  $("saveProfile").onclick = () =>
    action($("saveProfile"), async () => {
      await api("/api/profile", {
        id: profileEditId,
        name: $("accountName").value,
        email: $("accountEmail").value,
        url: $("accountUrl").value,
        provider: $("provider").value,
        browserChannel: $("browserChannel").value,
        business: readBusiness(),
      });
      await refresh();
      fillProfile();
      notice("Profile saved.");
    });

if ($("newProfile"))
  $("newProfile").onclick = () => {
    profileEditId = null;
    if ($("accountName")) {
      $("accountName").value = "";
      $("accountName").focus();
    }
    if ($("accountEmail")) $("accountEmail").value = "";
    if ($("password")) $("password").value = "";
    if ($("senderName")) $("senderName").value = "";
    updateControls();
    notice("Enter the new profile details, then save.");
  };

if ($("newProfileBtn"))
  $("newProfileBtn").onclick = () => {
    if ($("newProfile")) $("newProfile").click();
    $("profileSetupTitle")?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  };

if ($("deleteCurrentProfile"))
  $("deleteCurrentProfile").onclick = () => {
    if (!profileEditId) return;
    const p = state.profiles.find((p) => p.id === profileEditId);
    if (
      !confirm(
        `Are you sure you want to delete mailbox profile "${p?.name || p?.email}"?`,
      )
    )
      return;
    action($("deleteCurrentProfile"), async () => {
      await api("/api/delete-profile", { id: profileEditId });
      profileEditId = null;
      await refresh();
      fillProfile();
      notice("Mailbox profile deleted.");
    });
  };

if ($("profilesTableBody")) {
  $("profilesTableBody").onclick = (e) => {
    const selBtn = e.target.closest("[data-select-profile]");
    if (selBtn) {
      action(selBtn, async () => {
        await api("/api/select-profile", { id: selBtn.dataset.selectProfile });
        await refresh();
        fillProfile();
        notice("Mailbox profile activated.");
      });
      return;
    }
    const editBtn = e.target.closest("[data-edit-profile]");
    if (editBtn) {
      const p = state.profiles.find((x) => x.id === editBtn.dataset.editProfile);
      if (p) {
        fillProfile(p);
        $("profileSetupTitle")?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
        $("accountName")?.focus();
      }
      return;
    }
    const delBtn = e.target.closest("[data-delete-profile]");
    if (delBtn) {
      const p = state.profiles.find(
        (x) => x.id === delBtn.dataset.deleteProfile,
      );
      if (
        !confirm(
          `Are you sure you want to delete mailbox profile "${p?.name || p?.email}"?`,
        )
      )
        return;
      action(delBtn, async () => {
        await api("/api/delete-profile", { id: delBtn.dataset.deleteProfile });
        if (profileEditId === delBtn.dataset.deleteProfile) profileEditId = null;
        await refresh();
        fillProfile();
        notice("Mailbox profile deleted.");
      });
      return;
    }
  };
}

if ($("profileSelect"))
  $("profileSelect").onchange = () =>
    action($("connect"), async () => {
      await api("/api/select-profile", { id: $("profileSelect").value });
      await refresh();
      fillProfile();
      if ($("password")) $("password").value = "";
    });

if ($("campaignSelect"))
  $("campaignSelect").onchange = () =>
    action($("reload"), async () => {
      await api("/api/select-campaign", { id: $("campaignSelect").value });
      selected.clear();
      previewId = null;
      offset = 0;
      await refresh();
      fillCampaign();
    });

if ($("saveSettings"))
  $("saveSettings").onclick = () =>
    action($("saveSettings"), async () => {
      const s = structuredClone(state.settings);
      s.business = readBusiness();
      for (const key of pacingFields) s.pacing[key] = Number($(key).value);
      for (const key of [
        "requireActive",
        "requireNoOutOfService",
        "allowHidden",
      ])
        s.eligibility[key] = $(key).checked;
      s.eligibility.readyStatuses = $("readyStatuses")
        .value.split(",")
        .map((v) => (v.trim() === "blank" ? "" : v.trim()));
      s.eligibility.sentStatus = $("sentStatus").value;
      s.team = {
        enabled: $("teamEnabled").checked,
        url: $("teamUrl").value,
        workerName: $("workerName").value,
      };
      const token = $("teamToken").value;
      $("teamToken").value = "";
      await api("/api/settings", { settings: s, teamToken: token });
      notice("Sending settings saved.");
    });

// Pacing presets click and input listeners
const presetsGrid = $("pacingPresetsGrid");
if (presetsGrid) {
  presetsGrid.onclick = (e) => {
    const card = e.target.closest(".pacing-preset-card");
    if (card && card.dataset.preset) {
      applyPacingPreset(card.dataset.preset, true);
    }
  };
}

for (const key of pacingFields) {
  if ($(key)) {
    $(key).addEventListener("input", detectActivePreset);
  }
}

if ($("saveCampaign"))
  $("saveCampaign").onclick = () =>
    action($("saveCampaign"), () =>
      api("/api/campaign", {
        id: state.activeCampaign,
        name: $("campaignName").value,
        enabled: $("campaignEnabled").checked,
        sheets: $("campaignSheets").value.split("\n").filter(Boolean),
        mapping: JSON.parse($("mapping").value || "{}"),
      }),
    );

if ($("newTemplate"))
  $("newTemplate").onclick = () => {
    const tmplSelect = $("template");
    if (tmplSelect) {
      tmplSelect.add(new Option("New template", ""));
      tmplSelect.value = "";
    }
    fillTemplate();
    if ($("templateName")) $("templateName").focus();
  };

if ($("deleteTemplate"))
  $("deleteTemplate").onclick = () => {
    const key = $("template")?.value;
    const t = state.templates[key];
    if (
      !confirm(
        `Are you sure you want to delete template variant "${t?.name || "variant"}"?`,
      )
    )
      return;
    action($("deleteTemplate"), async () => {
      await api("/api/delete-template", { key });
      if ($("template")) $("template").dataset.options = "";
      await refresh();
      fillTemplate();
      notice("Template variant deleted.");
    });
  };

if ($("exportTemplatesBtn"))
  $("exportTemplatesBtn").onclick = () => {
    downloadJson(
      {
        exportedAt: new Date().toISOString(),
        templates: state.templates,
      },
      "outreach-templates.json",
    );
    notice("All templates exported.");
  };

if ($("importTemplatesFile"))
  $("importTemplatesFile").onchange = async () => {
    const file = $("importTemplatesFile").files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await api("/api/import-templates", { templates: json });
      await refresh();
      fillTemplate();
      notice(`Successfully imported ${res.count} template variant(s).`);
    } catch (err) {
      notice("Failed to import templates: " + err.message);
    } finally {
      $("importTemplatesFile").value = "";
    }
  };

if ($("templateSearch"))
  $("templateSearch").oninput = () => {
    renderTemplatesTable();
  };

if ($("templatesTableBody")) {
  $("templatesTableBody").onclick = (e) => {
    const editBtn = e.target.closest("[data-edit-template]");
    if (editBtn) {
      const key = editBtn.dataset.editTemplate;
      if ($("template")) $("template").value = key;
      fillTemplate();
      $("template")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (previewId) preview(previewId).catch((err) => notice(err.message));
      return;
    }
    const expBtn = e.target.closest("[data-export-template]");
    if (expBtn) {
      const key = expBtn.dataset.exportTemplate;
      const t = state.templates[key];
      if (t) {
        downloadJson(
          { [key]: t },
          `template-${(t.name || "custom").replace(/\s+/g, "_")}.json`,
        );
        notice("Template exported.");
      }
      return;
    }
    const delBtn = e.target.closest("[data-delete-template]");
    if (delBtn) {
      const key = delBtn.dataset.deleteTemplate;
      const t = state.templates[key];
      if (
        !confirm(
          `Are you sure you want to delete template variant "${t?.name || "variant"}"?`,
        )
      )
        return;
      action(delBtn, async () => {
        await api("/api/delete-template", { key });
        if ($("template")?.value === key) {
          if ($("template")) $("template").dataset.options = "";
        }
        await refresh();
        fillTemplate();
        notice("Template variant deleted.");
      });
      return;
    }
  };
}

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

// Drawer tab switching listeners
if ($("tabLeadDetails")) {
  $("tabLeadDetails").onclick = () => switchDrawerTab("details");
}
if ($("tabEmailDraft")) {
  $("tabEmailDraft").onclick = () => switchDrawerTab("email");
}
if ($("closeDrawerBtn")) {
  $("closeDrawerBtn").onclick = closePreviewDrawer;
}

// Close drawer listeners
if ($("closePreviewDrawer")) {
  $("closePreviewDrawer").onclick = closePreviewDrawer;
}
if ($("leadPreviewDrawer")) {
  $("leadPreviewDrawer").onclick = (e) => {
    if (e.target === $("leadPreviewDrawer")) closePreviewDrawer();
  };
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePreviewDrawer();
});

let trackingOffset = 0, trackingRecords = [], trackingBusy = false;
const trackingLabels = { recipients: "Recipients", attempts: "Attempts", webmail_sent: "Webmail confirmed", send_failed: "Send failed", hard_bounced: "Hard bounces", soft_bounced: "Soft bounces", open_detected: "Open signals", delivery_unknown: "Delivery unknown", inbox: "Seed Inbox", spam: "Seed Spam", other: "Seed Other", not_found: "Seed not found", awaiting: "Seeds awaiting" };
async function loadTracking() {
  if (trackingBusy || !$('trackingRows') || !state) return;
  trackingBusy = true;
  try {
    const campaign = $('trackingCampaign'), previous = campaign.value;
    campaign.innerHTML = '<option value="">All campaigns</option>' + state.campaigns.map((c) => `<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('');
    campaign.value = previous;
    const params = new URLSearchParams({ q: $('trackingSearch').value, campaign: campaign.value,
      status: $('trackingStatus').value, from: $('trackingFrom').value, until: $('trackingUntil').value, offset: String(trackingOffset) });
    const data = await api('/api/tracking?' + params);
    trackingRecords = data.records;
    $('trackingMetrics').innerHTML = Object.entries(trackingLabels).map(([key, label]) => `<div><span>${label}</span><strong>${data.summary[key] || 0}</strong></div>`).join('');
    const bounced = data.summary.hard_bounced + data.summary.soft_bounced;
    $('trackingRate').textContent = `Observed bounce rate: ${data.summary.attempts ? (100 * bounced / data.summary.attempts).toFixed(1) + '%' : 'No attempts'}. Definition: unique messages with a DSN failure / attempted messages in this filtered view. Incomplete mailbox monitoring can undercount failures.`;
    $('trackingRows').innerHTML = data.records.length ? data.records.map((r, i) => {
      const sendStatusBadge = r.sendStatus === 'webmail_sent'
        ? `<span class="status-pill good" style="background:#ecfdf5;color:#047857;border:1px solid rgba(16,185,129,0.3);font-weight:600;">✓ Delivered</span>`
        : r.sendStatus === 'send_failed'
          ? `<span class="status-pill blocked" style="background:#fef2f2;color:#b91c1c;border:1px solid rgba(239,68,68,0.3);font-weight:600;">✕ Failed</span>`
          : r.sendStatus === 'send_attempted'
            ? `<span class="status-pill" style="background:#eff6ff;color:#1d4ed8;font-weight:600;">⏳ Sending...</span>`
            : `<span class="status-pill" style="color:var(--text-muted);">${escape(r.sendStatus)}</span>`;

      const bounceBadge = r.bounceStatus === 'hard_bounced'
        ? `<span class="status-pill blocked" style="background:#fef2f2;color:#b91c1c;border:1px solid rgba(239,68,68,0.3);font-weight:700;">⛔ Hard Bounce</span>`
        : r.bounceStatus === 'soft_bounced'
          ? `<span class="status-pill" style="background:#fffbeb;color:#b45309;border:1px solid rgba(245,158,11,0.3);font-weight:600;">⚠️ Soft Bounce</span>`
          : `<span style="color:#059669;font-size:12px;font-weight:500;">✓ Clean</span>`;

      const seenBadge = r.firstOpenAt
        ? `<div style="display:inline-flex;flex-direction:column;gap:2px;"><span class="status-pill good" style="background:#ecfdf5;color:#047857;border:1px solid #10b981;font-weight:700;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;font-size:12px;">👁️ Seen${r.opens?.length > 1 ? ` (${r.opens.length}x)` : ''}</span><small style="color:#059669;font-weight:500;">Opened ${new Date(r.firstOpenAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</small></div>`
        : `<span class="status-pill" style="background:#f1f5f9;color:#64748b;font-weight:500;font-size:11.5px;">✉️ Unopened</span>`;

      return `<tr><td><strong>${escape(r.recipient)}</strong><small>${escape(r.subject)}</small></td><td>${sendStatusBadge}<small>${escape(new Date(r.attemptedAt || r.createdAt).toLocaleString())}</small></td><td>${bounceBadge}<small>${escape(r.bounceReason || '')}</small></td><td>${seenBadge}<small>${escape(r.placement?.status || (r.seedId ? 'Awaiting test' : ''))}</small></td><td><button class="secondary" data-track="${i}">Details</button>${r.seedId && r.sendStatus === 'pending' && !r.preparationStartedAt ? `<button data-seed-send="${escape(r.id)}">Send seed</button>` : ''}</td></tr>`;
    }).join('') : '<tr><td colspan="5">No tracking records match your filters.</td></tr>';
    $('trackingPageInfo').textContent = data.total ? `${trackingOffset + 1}–${Math.min(trackingOffset + 50, data.total)} of ${data.total}` : 'No messages recorded';
    $('trackingPrev').disabled = trackingOffset === 0;
    $('trackingNext').disabled = trackingOffset + 50 >= data.total;
    $('trackingConfig').textContent = `IMAP monitor: ${data.monitorEnabled ? 'enabled' : 'disabled (set FC_MONITOR_ENABLED=1)'}. Open tracking: ${data.opensEnabled ? 'enabled by configuration' : 'disabled'}. Keep the app running for monitoring.`;
    $('trackingWorker').textContent = Object.keys(data.worker).length ? JSON.stringify(data.worker, null, 2) : 'No mailbox checks recorded.';
    $('trackingReview').textContent = data.review.length ? JSON.stringify(data.review, null, 2) : 'No unmatched notifications.';
    $('trackingSeeds').textContent = data.seeds.length ? data.seeds.map((s) => `${s.id}: ${s.email} (${s.automated ? 'IMAP configured; see monitor status' : 'manual inspection'})`).join(' · ') : 'No seed recipients configured. See TRACKING.md.';
    const sample = $('seedSample'), selectedSample = sample.value;
    sample.innerHTML = rows.map((r) => `<option value="${escape(r.id)}">${escape(r.company)} · ${escape(r.email)}</option>`).join('');
    if (rows.some((r) => r.id === selectedSample)) sample.value = selectedSample;
    else if (rows.some((r) => r.id === previewId)) sample.value = previewId;
    if (!$('healthDomain').value) $('healthDomain').value = state.profiles.find((p) => p.id === state.activeProfile)?.email.split('@')[1] || '';
  } finally { trackingBusy = false; }
}
$('trackingRefresh').onclick = (e) => action(e.currentTarget, loadTracking);
for (const id of ['trackingSearch', 'trackingCampaign', 'trackingStatus', 'trackingFrom', 'trackingUntil']) {
  $(id).onchange = () => { trackingOffset = 0; loadTracking().catch((e) => notice(e.message)); };
}
$('trackingPrev').onclick = () => { trackingOffset = Math.max(0, trackingOffset - 50); loadTracking().catch((e) => notice(e.message)); };
$('trackingNext').onclick = () => { trackingOffset += 50; loadTracking().catch((e) => notice(e.message)); };
$('trackingRows').onclick = (e) => {
  const button = e.target.closest('button');
  if (!button) return;
  if (button.dataset.seedSend) return action(button, async () => {
    await api('/api/tracking/seed-send', { trackingId: button.dataset.seedSend });
    await loadTracking();
  });
  const r = trackingRecords[Number(button.dataset.track)];
  if (!r) return;
  $('trackingDetail').hidden = false;
  $('trackingDetail').textContent = JSON.stringify(r, null, 2);
  $('placementForm').hidden = !r.seedId || !r.attemptedAt;
  $('placementId').value = r.id;
  $('placementEvidence').value = '';
};
$('placementForm').onsubmit = (e) => {
  e.preventDefault();
  action(e.submitter, async () => {
    await api('/api/tracking/manual-placement', { trackingId: $('placementId').value, status: $('placementStatus').value, evidence: $('placementEvidence').value });
    await loadTracking();
    $('placementForm').hidden = true;
    $('trackingDetail').hidden = true;
  });
};
$('seedPlanForm').onsubmit = (e) => {
  e.preventDefault();
  action(e.submitter, async () => {
    const result = await api('/api/tracking/seed-plan', { testKey: $('seedTestKey').value, leadId: $('seedSample').value, key: $('template').value });
    $('seedPlanResult').textContent = `Plan ${result.testKey}: ${result.ids.length} dedicated test recipients. Use Send seed in the table for each message; the same test key reuses this plan.`;
    trackingOffset = 0;
    await loadTracking();
  });
};
$('domainForm').onsubmit = (e) => {
  e.preventDefault();
  $('domainResult').textContent = 'Checking public DNS records…';
  action(e.submitter, async () => {
    const result = await api('/api/tracking/domain?' + new URLSearchParams({ domain: $('healthDomain').value, selectors: $('healthSelectors').value }));
    $('domainResult').textContent = JSON.stringify(result, null, 2);
  });
};
setInterval(() => {
  if (!pending && location.hash === '#tracking') loadTracking().catch((e) => notice(e.message));
}, 10000);

// Initial boot
navigate(location.hash.replace("#", ""));
await refresh();
await loadLeads();
await loadHistory();
if (location.hash === "#tracking") await loadTracking();

// Background polling loop
setInterval(async () => {
  try {
    const previous = state.job.current;
    const previousAttempts = state.attemptCount;
    await refresh();
    if (state.job.current !== previous) await loadLeads();
    if (state.attemptCount !== previousAttempts) await loadHistory();
  } catch (e) {
    notice("Connection to the local tool was lost. Restart it to continue.");
  }
}, 1500);
