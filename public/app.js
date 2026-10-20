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

async function copyToClipboard(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    console.warn("navigator.clipboard failed, attempting fallback execCommand", e);
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  } catch (err) {
    console.error("Clipboard copy failed:", err);
    return false;
  }
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

  const resetWait = $("resetWait");
  if (resetWait)
    resetWait.disabled = pending || state.busy || !!state.prepared ||
      !(state.job.nextAt || state.job.sincePause || state.job.pauseAfter);

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
  if (connBtn) connBtn.disabled = pending || state.busy || state.connected || state.signInOpen || !!state.prepared;

  const resBtn = $("resume");
  if (resBtn) {
    resBtn.hidden = state.connected || !state.signInOpen;
    resBtn.disabled = pending || state.busy;
  }

  const disBtn = $("disconnect");
  if (disBtn) {
    disBtn.disabled = pending || state.busy;
    disBtn.hidden = !state.connected && !state.signInOpen;
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
  const waitStatus = $("settingsWaitStatus");
  if (waitStatus) {
    const remaining = Math.max(0, Math.ceil((Date.parse(state.job.nextAt) - Date.now()) / 1000));
    waitStatus.textContent = state.job.nextAt
      ? `${state.job.status} · ${remaining}s until the next queue check.`
      : `No scheduled wait. ${state.job.sincePause || 0} sends since the last rest.`;
  }
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
    $("signatureText").textContent = state.prepared.signature || "No signature configured in this mailbox.";
  }

  updateControls();
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


function insertOptOutInstruction() {
  const bodyEl = $("body");
  if (!bodyEl) return;
  const optOutText = "\n\nIf you’d prefer no further outreach, reply “remove” and I’ll take you off our list.";
  const val = bodyEl.value;
  const legalMatch = val.search(/\{\{legalName\}\}/);
  if (legalMatch !== -1) {
    bodyEl.value = val.substring(0, legalMatch).trimEnd() + optOutText + "\n\n" + val.substring(legalMatch).trimStart();
  } else {
    bodyEl.value = val.trimEnd() + optOutText;
  }
  updateTemplateLivePreview();
  notice("Opt-out instruction added to template.");
}

function fillTemplate() {
  const isNew = $("template")?.value === "";
  const defaultNewBody = `Hi {{firstName}},\n\nI’m {{senderName}} with {{businessName}}. I wanted to see whether {{company}} could use dispatch support for your equipment.\n\nWe help with {{services}}, based on your equipment, preferred lanes, and availability. You decide which loads you accept.\n\nWould a brief overview of how we work be useful?\n\nIf you’d prefer no further outreach, reply “remove” and I’ll take you off our list.\n\n{{legalName}}\n{{address}}`;
  const defaultNewSubject = "Dispatch support for {{company}}";

  const t = state.templates[$("template")?.value] || {
    name: "New template",
    subject: isNew ? defaultNewSubject : "",
    body: isNew ? defaultNewBody : "",
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

  const rawBody = $("body")?.value || "";
  const words = rawBody.split(/\s+/).filter(Boolean).length;
  const compStatus = $("templateComplianceStatus");
  if (compStatus) {
    if (!rawBody.trim()) {
      compStatus.textContent = "Draft";
      compStatus.className = "status-pill";
    } else {
      compStatus.textContent = `${words} words`;
      compStatus.className = "status-pill ready";
    }
  }
}

if ($("insertOptOutChip")) $("insertOptOutChip").onclick = insertOptOutInstruction;

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
      if (saved.warnings && saved.warnings.length) {
        notice(`Template saved with warning: ${saved.warnings.join(" ")}`);
      } else {
        notice("Template variant saved.");
      }
    });

if ($("template"))
  $("template").onchange = () => {
    fillTemplate();
    if (previewId) preview(previewId).catch((e) => notice(e.message));
  };

if ($("subject")) $("subject").oninput = updateTemplateLivePreview;
if ($("body")) $("body").oninput = updateTemplateLivePreview;

let lastFocusedTmplInput = $("body");
if ($("subject")) {
  $("subject").addEventListener("focus", () => { lastFocusedTmplInput = $("subject"); });
}
if ($("body")) {
  $("body").addEventListener("focus", () => { lastFocusedTmplInput = $("body"); });
}

// Token chip click helper
document.querySelectorAll(".token-chip").forEach((chip) => {
  chip.onclick = () => {
    const token = chip.dataset.token;
    if (!token) return;
    const targetEl = (lastFocusedTmplInput === $("subject")) ? $("subject") : ($("body") || $("subject"));
    if (!targetEl) return;
    const start = targetEl.selectionStart || targetEl.value.length;
    const end = targetEl.selectionEnd || targetEl.value.length;
    const txt = targetEl.value;
    targetEl.value = txt.substring(0, start) + token + txt.substring(end);
    targetEl.selectionStart = targetEl.selectionEnd = start + token.length;
    targetEl.focus();
    updateTemplateLivePreview();
  };
});

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


if ($("connect"))
  $("connect").onclick = () =>
    action($("connect"), async () => {
      const password = $("password").value;
      $("password").value = "";
      const result = await api("/api/connect", { password });
      notice(result.message || (result.connected ? "Mailbox connected successfully." : "Complete sign-in in the browser."));
    });

if ($("disconnect"))
  $("disconnect").onclick = () =>
    action($("disconnect"), () => api("/api/disconnect", {}));

if ($("resume"))
  $("resume").onclick = () => action($("resume"), async () => {
    const result = await api("/api/resume", {});
    notice(result.message || "Mailbox connected.");
  });

function fillBrowserMethod() {
  if ($("cdpSettings")) $("cdpSettings").hidden = $("connectionMode")?.value !== "cdp";
  const guide = state?.browserGuides?.[$("browserChannel")?.value] || state?.browserGuide;
  if ($("browserGuideMessage")) $("browserGuideMessage").textContent = guide?.message || "";
  if ($("browserDebugCommand")) $("browserDebugCommand").textContent = guide?.command || "";
}
if ($("connectionMode")) $("connectionMode").onchange = fillBrowserMethod;
if ($("browserChannel")) $("browserChannel").onchange = fillBrowserMethod;
if ($("discoverBrowsers")) $("discoverBrowsers").onclick = () => action($("discoverBrowsers"), async () => {
  const result = await api("/api/browser-discover", { endpoint: $("cdpEndpoint").value });
  $("availableBrowsers").innerHTML = '<option value="">Select a debugging browser</option>' + result.browsers.map((b) =>
    `<option value="${escape(b.endpoint)}">${escape(b.browser)} — ${escape(b.endpoint)}</option>`).join("");
  notice(result.browsers.length ? "Select a browser, then save the mailbox profile." : "No debugging browser found. Start one using the command below, or use Saved Browser Profile.");
});
if ($("availableBrowsers")) $("availableBrowsers").onchange = () => {
  if ($("availableBrowsers").value) $("cdpEndpoint").value = $("availableBrowsers").value;
};



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
  if ($("connectionMode")) $("connectionMode").value = p?.connectionMode || "saved";
  if ($("cdpEndpoint")) $("cdpEndpoint").value = p?.cdpEndpoint || "http://127.0.0.1:9222";
  if ($("autoReconnect")) $("autoReconnect").checked = p?.autoReconnect !== false;
  fillBrowserMethod();

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
        connectionMode: $("connectionMode").value,
        cdpEndpoint: $("cdpEndpoint").value,
        autoReconnect: $("autoReconnect").checked,
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

if ($("resetWait"))
  $("resetWait").onclick = () =>
    action($("resetWait"), async () => {
      const result = await api("/api/reset-wait", {});
      await refresh();
      notice(result.message);
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

function openTrackingDrawer(r) {
  const drawer = $("trackingDrawer");
  if (drawer) drawer.classList.add("open");
  if (r) renderTrackingDetail(r);
}

function closeTrackingDrawer() {
  const drawer = $("trackingDrawer");
  if (drawer) drawer.classList.remove("open");
}

function switchTrackingDrawerTab(tabName) {
  const tabOverview = $("tabTrackingOverview");
  const tabSpecs = $("tabTrackingSpecs");
  const tabRaw = $("tabTrackingRaw");
  const secOverview = $("trackingSecOverview");
  const secSpecs = $("trackingSecSpecs");
  const secRaw = $("trackingSecRaw");

  if (tabOverview) tabOverview.classList.toggle("active", tabName === "overview");
  if (tabSpecs) tabSpecs.classList.toggle("active", tabName === "specs");
  if (tabRaw) tabRaw.classList.toggle("active", tabName === "raw");

  if (secOverview) secOverview.style.display = tabName === "overview" ? "block" : "none";
  if (secSpecs) secSpecs.style.display = tabName === "specs" ? "block" : "none";
  if (secRaw) secRaw.style.display = tabName === "raw" ? "block" : "none";
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

  container.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const text = btn.dataset.copy;
      const ok = await copyToClipboard(text);
      if (ok) {
        const originalHtml = btn.innerHTML;
        btn.classList.add("copied");
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        setTimeout(() => {
          btn.classList.remove("copied");
          btn.innerHTML = originalHtml;
        }, 1500);
        notice(`Copied to clipboard: ${text}`);
      }
    };
  });
}


if ($("prepare"))
  $("prepare").onclick = () =>
    action($("prepare"), async () => {
      const r = await api("/api/prepare", {
        id: previewId,
        key: $("template").value,
        randomTemplates: $("randomTemplates").checked,
      });
      if ($("signatureText")) $("signatureText").textContent = r.signature || "No signature configured in this mailbox.";
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
if ($("tabTrackingOverview")) {
  $("tabTrackingOverview").onclick = () => switchTrackingDrawerTab("overview");
}
if ($("tabTrackingSpecs")) {
  $("tabTrackingSpecs").onclick = () => switchTrackingDrawerTab("specs");
}
if ($("tabTrackingRaw")) {
  $("tabTrackingRaw").onclick = () => switchTrackingDrawerTab("raw");
}
if ($("closeTrackingDrawerBtn")) {
  $("closeTrackingDrawerBtn").onclick = closeTrackingDrawer;
}
if ($("closeTrackingDrawer")) {
  $("closeTrackingDrawer").onclick = closeTrackingDrawer;
}
if ($("trackingDrawer")) {
  $("trackingDrawer").onclick = (e) => {
    if (e.target === $("trackingDrawer")) closeTrackingDrawer();
  };
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closePreviewDrawer();
    closeTrackingDrawer();
  }
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
  $("liveTerminalCopyBtn").addEventListener("click", async () => {
    const text = $("liveTerminalOutput")?.textContent || "";
    if (text) {
      const ok = await copyToClipboard(text);
      if (ok) {
        const btn = $("liveTerminalCopyBtn");
        const orig = btn.textContent;
        btn.textContent = "✓ Copied!";
        setTimeout(() => { btn.textContent = orig; }, 1800);
        notice("Terminal console log copied to clipboard.");
      }
    } else {
      notice("No log content to copy.");
    }
  });
}


if ($("reload"))
  $("reload").onclick = () => action($("reload"), () => api("/api/reload", {}));


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

let trackingOffset = 0, trackingRecords = [], trackingBusy = false;
let trackingSearchDebounce = null;
const trackingLabels = {
  recipients: "Recipients",
  attempts: "Attempts",
  webmail_sent: "Webmail confirmed",
  send_failed: "Send failed",
  hard_bounced: "Hard bounces",
  soft_bounced: "Soft bounces",
  open_detected: "Open signals",
  delivery_unknown: "Delivery unknown",
  inbox: "Seed Inbox",
  spam: "Seed Spam",
  other: "Seed Other",
  not_found: "Seed not found",
  awaiting: "Seeds awaiting",
};

async function loadTracking() {
  if (trackingBusy || !$('trackingRows') || !state) return;
  trackingBusy = true;
  try {
    const campaign = $('trackingCampaign');
    if (campaign) {
      const previous = campaign.value;
      campaign.innerHTML =
        '<option value="">All campaigns</option>' +
        state.campaigns.map((c) => `<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('');
      campaign.value = previous;
    }

    const qVal = $('trackingSearch')?.value || '';
    const campVal = $('trackingCampaign')?.value || '';
    const statusVal = $('trackingStatus')?.value || '';
    const fromVal = $('trackingFrom')?.value || '';
    const untilVal = $('trackingUntil')?.value || '';

    const params = new URLSearchParams({
      q: qVal,
      campaign: campVal,
      status: statusVal,
      from: fromVal,
      until: untilVal,
      offset: String(trackingOffset),
    });

    const data = await api('/api/tracking?' + params);
    trackingRecords = data.records || [];
    const summary = data.summary || {};
    const total = data.total || 0;

    // Calculate core deliverability KPIs
    const attempts = summary.attempts || 0;
    const sent = summary.webmail_sent || 0;
    const deliveryRate = attempts ? Math.round((sent / attempts) * 100) : (total ? 100 : 0);
    const opens = summary.open_detected || 0;
    const openRate = attempts ? Math.round((opens / attempts) * 100) : 0;
    const hardBounced = summary.hard_bounced || 0;
    const softBounced = summary.soft_bounced || 0;
    const bounced = hardBounced + softBounced;
    const bounceRate = attempts ? ((100 * bounced) / attempts).toFixed(1) + '%' : '0.0%';

    const seedsTotal = (summary.inbox || 0) + (summary.spam || 0) + (summary.other || 0) + (summary.not_found || 0);
    const inboxRate = seedsTotal ? Math.round(((summary.inbox || 0) / seedsTotal) * 100) : (summary.inbox ? 100 : 0);

    // Update active records badge
    if ($('trackingRecordCountBadge')) {
      $('trackingRecordCountBadge').textContent = `${total} recorded message${total === 1 ? '' : 's'}`;
    }

    // Render High-Impact Deliverability Telemetry Deck into #trackingMetrics
    if ($('trackingMetrics')) {
      $('trackingMetrics').innerHTML = `
        <!-- Tier 1: 4 Executive Cyber KPI Cards -->
        <div class="tracking-kpi-grid">
          <!-- Card 1: Dispatched / Confirmed -->
          <div class="tracking-kpi-card kpi-sent">
            <div class="kpi-top">
              <span class="kpi-title">Dispatched (Sent)</span>
              <div class="kpi-icon-wrap icon-emerald">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
            </div>
            <div class="kpi-val-row">
              <span class="kpi-value">${sent}</span>
              <span class="kpi-rate-badge badge-green">${deliveryRate}%</span>
            </div>
            <div class="kpi-progress-bar">
              <div class="kpi-progress-fill fill-green" style="width: ${Math.min(100, deliveryRate)}%;"></div>
            </div>
            <div class="kpi-subtext">of ${attempts} attempted sends confirmed by webmail</div>
          </div>

          <!-- Card 2: Open Signals Telemetry -->
          <div class="tracking-kpi-card kpi-opens">
            <div class="kpi-top">
              <span class="kpi-title">Open Signals</span>
              <div class="kpi-icon-wrap icon-blue">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </div>
            </div>
            <div class="kpi-val-row">
              <span class="kpi-value">${opens}</span>
              <span class="kpi-rate-badge badge-blue">${openRate}%</span>
            </div>
            <div class="kpi-progress-bar">
              <div class="kpi-progress-fill fill-blue" style="width: ${Math.min(100, openRate)}%;"></div>
            </div>
            <div class="kpi-subtext">1×1 pixel requests captured by proxy</div>
          </div>

          <!-- Card 3: Seed Inbox Placement -->
          <div class="tracking-kpi-card kpi-seeds">
            <div class="kpi-top">
              <span class="kpi-title">Seed Inbox Rate</span>
              <div class="kpi-icon-wrap icon-purple">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              </div>
            </div>
            <div class="kpi-val-row">
              <span class="kpi-value">${seedsTotal ? `${inboxRate}%` : (summary.inbox ? '100%' : '—')}</span>
              <span class="kpi-rate-badge badge-purple">${summary.inbox || 0} Inbox</span>
            </div>
            <div class="kpi-progress-bar">
              <div class="kpi-progress-fill fill-purple" style="width: ${Math.min(100, inboxRate)}%;"></div>
            </div>
            <div class="kpi-subtext">${summary.spam || 0} landed in spam · ${summary.awaiting || 0} awaiting</div>
          </div>

          <!-- Card 4: DSN Health & Bounce Rate -->
          <div class="tracking-kpi-card ${bounced > 0 ? 'kpi-warn' : 'kpi-clean'}">
            <div class="kpi-top">
              <span class="kpi-title">Deliverability Health</span>
              <div class="kpi-icon-wrap ${bounced > 0 ? 'icon-amber' : 'icon-emerald'}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
              </div>
            </div>
            <div class="kpi-val-row">
              <span class="kpi-value">${bounced === 0 ? 'Clean' : bounceRate}</span>
              <span class="kpi-rate-badge ${bounced > 0 ? 'badge-amber' : 'badge-green'}">${bounced === 0 ? '0 DSN' : `${bounced} Bounces`}</span>
            </div>
            <div class="kpi-progress-bar">
              <div class="kpi-progress-fill ${bounced > 0 ? 'fill-amber' : 'fill-green'}" style="width: ${bounced === 0 ? '100' : Math.max(10, 100 - parseFloat(bounceRate))}%;"></div>
            </div>
            <div class="kpi-subtext">${hardBounced} hard bounces · ${softBounced} soft bounces</div>
          </div>
        </div>

        <!-- Tier 2: Telemetry Data-Chip Ribbon -->
        <div class="tracking-chips-ribbon">
          <div class="telemetry-chip">
            <span class="chip-label">Total Outreaches</span>
            <strong class="chip-val">${total}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Unique Recipients</span>
            <strong class="chip-val">${summary.recipients || 0}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Send Attempts</span>
            <strong class="chip-val">${attempts}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Confirmed Dispatched</span>
            <strong class="chip-val" style="color: #34d399;">${sent}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Failed Submissions</span>
            <strong class="chip-val" style="color: ${summary.send_failed ? '#f87171' : 'inherit'};">${summary.send_failed || 0}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Hard Bounces</span>
            <strong class="chip-val" style="color: ${hardBounced ? '#f87171' : 'inherit'};">${hardBounced}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Soft Bounces</span>
            <strong class="chip-val" style="color: ${softBounced ? '#fbbf24' : 'inherit'};">${softBounced}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Open Signals</span>
            <strong class="chip-val" style="color: #60a5fa;">${opens}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Seed Inbox</span>
            <strong class="chip-val" style="color: #34d399;">${summary.inbox || 0}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Seed Spam</span>
            <strong class="chip-val" style="color: ${summary.spam ? '#f87171' : 'inherit'};">${summary.spam || 0}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Seed Awaiting</span>
            <strong class="chip-val">${summary.awaiting || 0}</strong>
          </div>
          <div class="telemetry-chip">
            <span class="chip-label">Delivery Unknown</span>
            <strong class="chip-val">${summary.delivery_unknown || 0}</strong>
          </div>
        </div>
      `;
    }

    // Render Deliverability Guidance Note
    if ($('trackingRate')) {
      $('trackingRate').innerHTML = `
        <div class="rate-callout-card">
          <div class="rate-callout-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          </div>
          <div class="rate-callout-content">
            <div class="rate-callout-title">
              <span>Observed DSN Bounce Rate: <strong>${attempts ? (100 * bounced / attempts).toFixed(1) + '%' : 'No attempts'}</strong></span>
              <span class="rate-status-tag ${bounced === 0 ? 'good' : 'warn'}">${bounced === 0 ? '✓ Healthy Sender Score' : '⚠️ Failure Monitored'}</span>
            </div>
            <div class="rate-callout-desc">
              Formula: Unique messages with an IMAP DSN failure (${bounced}) divided by attempted messages (${attempts}) in this filtered view. Incomplete mailbox monitoring or delayed remote mail exchangers can undercount failures.
            </div>
          </div>
        </div>
      `;
    }

    // Render Data Table Rows
    if ($('trackingRows')) {
      $('trackingRows').innerHTML = trackingRecords.length
        ? trackingRecords.map((r, i) => {
            const sendStatusBadge =
              r.sendStatus === 'webmail_sent'
                ? `<span class="status-pill good"><span class="badge-dot dot-green"></span>✓ Delivered</span>`
                : r.sendStatus === 'send_failed'
                  ? `<span class="status-pill blocked"><span class="badge-dot dot-red"></span>✕ Failed</span>`
                  : r.sendStatus === 'send_attempted'
                    ? `<span class="status-pill sent"><span class="badge-dot dot-blue"></span>⏳ Sending...</span>`
                    : `<span class="status-pill"><span class="badge-dot dot-muted"></span>${escape(r.sendStatus || 'pending')}</span>`;

            // Required for unit tests: Must include '(hard_bounced)' or '(soft_bounced)'
            const bounceBadge =
              r.bounceStatus === 'hard_bounced'
                ? `<div class="bounce-status-block"><span class="status-pill blocked"><span class="badge-dot dot-red"></span>⛔ Hard Bounce <small class="test-token">(hard_bounced)</small></span></div>`
                : r.bounceStatus === 'soft_bounced'
                  ? `<div class="bounce-status-block"><span class="status-pill warn"><span class="badge-dot dot-amber"></span>⚠️ Soft Bounce <small class="test-token">(soft_bounced)</small></span></div>`
                  : `<div class="clean-delivery-chip"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg> <span>✓ Clean Delivery</span></div>`;

            const seenBadge = r.firstOpenAt
              ? `<div class="seen-indicator-stack">
                   <span class="status-pill good seen-pill">
                     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                     Seen${r.opens?.length > 1 ? ` (${r.opens.length}x)` : ''}
                   </span>
                   <small class="seen-time-hint">Opened ${new Date(r.firstOpenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                 </div>`
              : `<span class="status-pill unopened-pill">
                   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                   Unopened
                 </span>`;

            let placementStatusHtml = '';
            if (r.seedId) {
              if (r.placement?.status === 'inbox') {
                placementStatusHtml = `<div class="placement-result-tag"><span class="status-pill good" style="font-weight: 700; padding: 2px 8px; font-size: 11px;">📥 Inbox</span></div>`;
              } else if (r.placement?.status === 'spam') {
                placementStatusHtml = `<div class="placement-result-tag"><span class="status-pill blocked" style="font-weight: 700; padding: 2px 8px; font-size: 11px;">🚫 Spam</span></div>`;
              } else if (r.placement?.status && r.placement?.status !== 'awaiting') {
                placementStatusHtml = `<div class="placement-result-tag"><span class="status-pill" style="font-size: 11px;">📁 ${escape(r.placement.status)}</span></div>`;
              } else if (r.attemptedAt) {
                placementStatusHtml = `
                  <div class="quick-placement-actions">
                    <button type="button" class="quick-place-btn inbox" data-seed-place="${escape(r.id)}" data-place-status="inbox" title="Confirm email reached Inbox">📥 Inbox</button>
                    <button type="button" class="quick-place-btn spam" data-seed-place="${escape(r.id)}" data-place-status="spam" title="Email landed in Spam folder">🚫 Spam</button>
                  </div>
                `;
              } else {
                placementStatusHtml = `<small class="awaiting-seed-note">Awaiting dispatch</small>`;
              }
            }

            const sendTimeStr = new Date(r.attemptedAt || r.createdAt).toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return `
              <tr class="tracking-table-row">
                <td>
                  <div class="recipient-cell-content">
                    <div class="recipient-meta-line">
                      <strong class="recipient-address" title="${escape(r.recipient)}">${escape(r.recipient)}</strong>
                      ${r.seedId ? `<span class="badge-seed-tag">🌱 Seed</span>` : ''}
                      ${r.campaignId ? `<span class="badge-campaign-tag">${escape(r.campaignId)}</span>` : ''}
                    </div>
                    <div class="recipient-subject-line" title="${escape(r.subject || '')}">
                      ${escape(r.subject || '(No subject)')}
                    </div>
                  </div>
                </td>
                <td>
                  <div class="send-status-cell">
                    ${sendStatusBadge}
                    <small class="timestamp-sub">${escape(sendTimeStr)}</small>
                  </div>
                </td>
                <td>
                  <div class="bounce-cell-content">
                    ${bounceBadge}
                    ${r.bounceReason ? `<small class="bounce-reason-text" title="${escape(r.bounceReason)}">${escape(r.bounceReason)}</small>` : ''}
                  </div>
                </td>
                <td>
                  <div class="engagement-cell-content">
                    ${seenBadge}
                    ${placementStatusHtml}
                  </div>
                </td>
                <td style="text-align: right;">
                  <div class="row-actions-group">
                    <button class="secondary action-inspect-btn" data-track="${i}" title="Inspect complete delivery timeline & technical specs">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                      Details
                    </button>
                    ${r.seedId && r.sendStatus === 'pending' && !r.preparationStartedAt
                      ? `<button class="primary-btn seed-dispatch-btn" data-seed-send="${escape(r.id)}" title="Send seed test email">
                           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                           Send seed
                         </button>`
                      : ''}
                  </div>
                </td>
              </tr>
            `;
          }).join('')
        : '<tr><td colspan="5" class="empty-table-state"><div class="empty-message">No tracking records match your current filters.</div></td></tr>';
    }

    if ($('trackingPageInfo')) {
      $('trackingPageInfo').textContent = total
        ? `${trackingOffset + 1}–${Math.min(trackingOffset + 50, total)} of ${total} records`
        : 'No messages recorded';
    }
    if ($('trackingPrev')) $('trackingPrev').disabled = trackingOffset === 0;
    if ($('trackingNext')) $('trackingNext').disabled = trackingOffset + 50 >= total;

    if ($('trackingConfig')) {
      $('trackingConfig').textContent = `IMAP monitor: ${data.monitorEnabled ? 'enabled' : 'disabled (set FC_MONITOR_ENABLED=1)'}. Open tracking: ${data.opensEnabled ? 'enabled by configuration' : 'disabled'}. Keep the app running for monitoring.`;
    }
    if ($('trackingWorker')) {
      $('trackingWorker').textContent = Object.keys(data.worker || {}).length
        ? JSON.stringify(data.worker, null, 2)
        : 'No mailbox checks recorded.';
    }
    if ($('trackingReview')) {
      $('trackingReview').textContent = data.review && data.review.length
        ? JSON.stringify(data.review, null, 2)
        : 'No unmatched notifications.';
    }

    if ($('trackingSeeds')) {
      if (data.seeds && data.seeds.length) {
        $('trackingSeeds').innerHTML = `
          <div class="seed-targets-deck">
            ${data.seeds.map((s) => `
              <div class="seed-target-tile">
                <div class="seed-target-badge-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                </div>
                <div>
                  <div class="seed-target-address"><strong>${escape(s.email)}</strong> <span class="seed-id-tag">${escape(s.id)}</span></div>
                  <div class="seed-target-sub"><span class="status-dot-pulse"></span> ${s.automated ? 'Automated IMAP Active' : 'Manual Placement Inspection'}</div>
                </div>
              </div>
            `).join('')}
          </div>
        `;
        if ($('seedCountBadge')) {
          $('seedCountBadge').textContent = `📬 ${data.seeds.length} Active Test Mailbox${data.seeds.length > 1 ? 'es' : ''}`;
        }
      } else {
        $('trackingSeeds').innerHTML = `<div class="seed-empty-alert">⚠️ No seed recipients configured. Configure <code>FC_SEEDS</code> in <code>.env</code> to enable controlled inbox testing.</div>`;
      }
    }

    if ($('seedTestKey') && !$('seedTestKey').value) $('seedTestKey').value = generateSeedKey();
    loadSeedTemplates();
    await loadSeedSamples($('seedSampleSearch')?.value || '');

    if (!$('healthDomain').value) {
      $('healthDomain').value =
        state.profiles.find((p) => p.id === state.activeProfile)?.email.split('@')[1] || '';
    }
    if ($('healthSelectors') && !$('healthSelectors').value) $('healthSelectors').value = 'privateemail';
  } finally {
    trackingBusy = false;
  }
}

function generateSeedKey() {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Math.floor(100 + Math.random() * 900);
  return `seed-${dateStr}-${rand}`;
}

async function loadSeedSamples(query = '') {
  const sampleEl = $('seedSample');
  if (!sampleEl) return;
  const previous = sampleEl.value;
  try {
    const params = new URLSearchParams({ q: query, filter: 'ready', offset: '0' });
    let result = await api(`/api/leads?${params}`);
    let leads = result.leads || [];
    if (!leads.length && !query) {
      const allResult = await api('/api/leads?offset=0');
      leads = allResult.leads || [];
    }
    if (leads.length) {
      if ($('sampleCountHint')) $('sampleCountHint').textContent = `${leads.length} lead${leads.length > 1 ? 's' : ''}`;
      sampleEl.innerHTML = leads
        .map((l) => {
          const desc = [l.company, l.fields?.['owner / principal'], l.email].filter(Boolean).join(' · ');
          return `<option value="${escape(l.id)}">${escape(desc)}</option>`;
        })
        .join('');
      if (leads.some((l) => l.id === previous)) {
        sampleEl.value = previous;
      } else if (leads.some((l) => l.id === previewId)) {
        sampleEl.value = previewId;
      } else if (leads.length > 0) {
        sampleEl.selectedIndex = 0;
      }
    } else {
      if ($('sampleCountHint')) $('sampleCountHint').textContent = '0 leads';
      sampleEl.innerHTML = '<option value="">No campaign leads match</option>';
    }
    updateSeedPreview();
  } catch (err) {
    console.error('Failed to load dynamic seed samples:', err);
  }
}

function loadSeedTemplates() {
  const tmplEl = $('seedTemplate');
  if (!tmplEl || !state?.templates) return;
  const activeKey = $('template')?.value || Object.keys(state.templates)[0];
  const keys = Object.keys(state.templates);
  tmplEl.innerHTML = keys.map((k) => `<option value="${escape(k)}">${escape(k)}</option>`).join('');
  if (keys.includes(activeKey)) tmplEl.value = activeKey;
}

async function updateSeedPreview() {
  const leadId = $('seedSample')?.value;
  const templateKey = $('seedTemplate')?.value || $('template')?.value;
  const subjEl = $('seedPreviewSubject');
  const bodyEl = $('seedPreviewBody');
  const metaEl = $('seedPreviewMeta');
  const warnEl = $('seedPreviewWarnings');

  if (!leadId || !templateKey) {
    if (subjEl) subjEl.textContent = 'Select a lead to preview';
    if (bodyEl) bodyEl.textContent = 'Click any lead on the left under "Content Sample Lead" to render dynamic template variables (company name, owner, city).';
    if (metaEl) metaEl.textContent = 'Awaiting selection';
    if (warnEl) warnEl.hidden = true;
    return;
  }

  try {
    const preview = await api(`/api/preview?id=${encodeURIComponent(leadId)}&key=${encodeURIComponent(templateKey)}`);
    if (!preview || !preview.message) {
      if (subjEl) subjEl.textContent = '(Template could not render preview)';
      if (bodyEl) bodyEl.textContent = 'Unable to evaluate template tokens for this lead.';
      if (metaEl) metaEl.textContent = 'Render error';
      if (warnEl) warnEl.hidden = true;
      return;
    }

    if (subjEl) subjEl.textContent = `${preview.message.subject} [FC seed <id>]`;
    if (bodyEl) bodyEl.textContent = preview.message.body;
    if (metaEl) metaEl.textContent = `${preview.lead.company} · ${preview.lead.email || 'sample lead'}`;

    if (warnEl) {
      if (preview.warnings && preview.warnings.length) {
        warnEl.innerHTML = `<strong>Note:</strong> ${preview.warnings.map(escape).join(' ')}`;
        warnEl.hidden = false;
      } else {
        warnEl.hidden = true;
      }
    }
  } catch (err) {
    if (subjEl) subjEl.textContent = 'Unable to load preview';
    if (bodyEl) bodyEl.textContent = err.message || 'Error communicating with local preview endpoint.';
  }
}

// Refresh Button Action
if ($('trackingRefresh')) {
  $('trackingRefresh').onclick = (e) => action(e.currentTarget, loadTracking);
}

// Wire Change & Input Listeners
for (const id of ['trackingCampaign', 'trackingStatus', 'trackingFrom', 'trackingUntil']) {
  if ($(id)) {
    $(id).onchange = () => {
      trackingOffset = 0;
      loadTracking().catch((e) => notice(e.message));
    };
  }
}

if ($('trackingSearch')) {
  $('trackingSearch').oninput = () => {
    clearTimeout(trackingSearchDebounce);
    trackingSearchDebounce = setTimeout(() => {
      trackingOffset = 0;
      loadTracking().catch((e) => notice(e.message));
    }, 280);
  };
  $('trackingSearch').onchange = () => {
    trackingOffset = 0;
    loadTracking().catch((e) => notice(e.message));
  };
}

// Quick Filter Segmented Pills
if ($('trackingQuickPills')) {
  $('trackingQuickPills').querySelectorAll('[data-pill-status]').forEach((pill) => {
    pill.onclick = () => {
      $('trackingQuickPills').querySelectorAll('[data-pill-status]').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      const targetStatus = pill.dataset.pillStatus;

      if (targetStatus === 'seeds') {
        if ($('trackingStatus')) $('trackingStatus').value = '';
        if ($('trackingSearch')) $('trackingSearch').value = 'seed';
      } else {
        if ($('trackingStatus')) $('trackingStatus').value = targetStatus;
      }

      trackingOffset = 0;
      loadTracking().catch((e) => notice(e.message));
    };
  });
}

// Reset Filters Action Button
if ($('trackingResetFilters')) {
  $('trackingResetFilters').onclick = () => {
    if ($('trackingSearch')) $('trackingSearch').value = '';
    if ($('trackingCampaign')) $('trackingCampaign').value = '';
    if ($('trackingStatus')) $('trackingStatus').value = '';
    if ($('trackingFrom')) $('trackingFrom').value = '';
    if ($('trackingUntil')) $('trackingUntil').value = '';
    if ($('trackingQuickPills')) {
      $('trackingQuickPills').querySelectorAll('[data-pill-status]').forEach((p, idx) => {
        p.classList.toggle('active', idx === 0);
      });
    }
    trackingOffset = 0;
    loadTracking().catch((e) => notice(e.message));
    notice('All tracking filters reset.');
  };
}

if ($('trackingPrev')) {
  $('trackingPrev').onclick = () => {
    trackingOffset = Math.max(0, trackingOffset - 50);
    loadTracking().catch((e) => notice(e.message));
  };
}
if ($('trackingNext')) {
  $('trackingNext').onclick = () => {
    trackingOffset += 50;
    loadTracking().catch((e) => notice(e.message));
  };
}

function renderTrackingDetail(r) {
  const panel = $('trackingDetail');
  if (!panel) return;

  if ($('trackingDrawerTitle')) {
    $('trackingDrawerTitle').textContent = r.recipient ? `Tracking: ${r.recipient}` : 'Tracking Details';
  }

  const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '—');
  const fmtTime = (iso) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

  // Badges matching lead details system
  const sendBadge =
    r.sendStatus === 'webmail_sent'
      ? `<span class="status-pill good"><span class="badge-dot dot-green"></span>✓ Dispatched</span>`
      : r.sendStatus === 'send_failed'
        ? `<span class="status-pill blocked"><span class="badge-dot dot-red"></span>✕ Failed</span>`
        : r.sendStatus === 'send_attempted'
          ? `<span class="status-pill sent"><span class="badge-dot dot-blue"></span>⏳ Sending...</span>`
          : `<span class="status-pill"><span class="badge-dot dot-muted"></span>${escape(r.sendStatus || 'Pending')}</span>`;

  const seenBadge = r.firstOpenAt
    ? `<span class="status-pill good">👁️ Seen${r.opens?.length > 1 ? ` (${r.opens.length}x)` : ''}</span>`
    : `<span class="status-pill unopened-pill">✉️ Unopened</span>`;

  const bounceBadge =
    r.bounceStatus === 'hard_bounced'
      ? `<span class="status-pill blocked">⛔ Hard Bounce</span>`
      : r.bounceStatus === 'soft_bounced'
        ? `<span class="status-pill warn">⚠️ Soft Bounce</span>`
        : `<span class="status-pill good">✓ Clean Delivery</span>`;

  // Relative timing calculation
  let openRelative = '';
  if (r.attemptedAt && r.firstOpenAt) {
    const diffSec = Math.round((new Date(r.firstOpenAt) - new Date(r.attemptedAt)) / 1000);
    if (diffSec < 60) openRelative = `+${Math.max(0, diffSec)}s after send`;
    else if (diffSec < 3600) openRelative = `+${Math.round(diffSec / 60)}m after send`;
    else openRelative = `+${(diffSec / 3600).toFixed(1)}h after send`;
  }

  // Build Timeline Items
  const timelineEvents = [];
  if (r.events && r.events.length) {
    for (const ev of r.events) {
      if (ev.type === 'pending') {
        timelineEvents.push({
          time: ev.at,
          title: 'Queued for Outreach',
          desc: 'Message created and queued in campaign.',
          color: 'blue',
          icon: '⏱️',
        });
      } else if (ev.type === 'send_attempted') {
        timelineEvents.push({
          time: ev.at,
          title: 'Webmail Send Initiated',
          desc: 'Playwright initialized browser compose window and inserted content.',
          color: 'blue',
          icon: '🚀',
        });
      } else if (ev.type === 'webmail_sent') {
        timelineEvents.push({
          time: ev.at,
          title: 'Webmail Confirmed Dispatched',
          desc: 'Namecheap mail server verified message was sent.',
          color: 'green',
          icon: '✓',
        });
      } else if (ev.type === 'sent_message_id') {
        timelineEvents.push({
          time: ev.at,
          title: 'Message-ID Recorded',
          desc: `Mail server assigned identifier: <code>${escape(ev.messageId)}</code>`,
          color: 'blue',
          icon: '🆔',
        });
      } else if (ev.type === 'open_detected') {
        timelineEvents.push({
          time: ev.at,
          title: 'Recipient Opened Email (Open Signal)',
          desc: `${escape(ev.signal || 'Remote 1x1 image request received from mail client.')} ${openRelative ? `<strong style="color:#10b981;">(${openRelative})</strong>` : ''}`,
          color: 'emerald',
          icon: '👁️',
        });
      } else if (ev.type === 'hard_bounced') {
        timelineEvents.push({
          time: ev.at,
          title: 'Hard Bounce Reported (Permanent DSN)',
          desc: `${escape(ev.diagnostic || ev.status || r.bounceReason || 'Mailbox unavailable.')}`,
          color: 'red',
          icon: '⛔',
        });
      } else if (ev.type === 'soft_bounced') {
        timelineEvents.push({
          time: ev.at,
          title: 'Soft Bounce Reported (Temporary Delay)',
          desc: `${escape(ev.diagnostic || ev.status || r.bounceReason || 'Temporary delivery delay.')}`,
          color: 'amber',
          icon: '⚠️',
        });
      } else if (ev.type === 'seed_placement') {
        timelineEvents.push({
          time: ev.at,
          title: 'Seed Placement Verified',
          desc: `Folder: <strong>${escape(ev.status || '')}</strong> · Evidence: ${escape(ev.evidence || '')}`,
          color: 'green',
          icon: '🎯',
        });
      } else {
        timelineEvents.push({
          time: ev.at,
          title: escape(ev.type),
          desc: escape(JSON.stringify(ev)),
          color: 'blue',
          icon: '•',
        });
      }
    }
  } else {
    if (r.createdAt) timelineEvents.push({ time: r.createdAt, title: 'Message Initialized', desc: 'Added to tracking index.', color: 'blue', icon: '⏱️' });
    if (r.attemptedAt) timelineEvents.push({ time: r.attemptedAt, title: 'Send Attempted', desc: 'Webmail compose window prepared.', color: 'blue', icon: '🚀' });
    if (r.confirmedAt) timelineEvents.push({ time: r.confirmedAt, title: 'Webmail Send Confirmed', desc: 'Message sent successfully.', color: 'green', icon: '✓' });
    if (r.firstOpenAt) timelineEvents.push({ time: r.firstOpenAt, title: 'Recipient Opened Email', desc: 'Tracking pixel loaded.', color: 'emerald', icon: '👁️' });
    if (r.bounceStatus) timelineEvents.push({ time: r.lastEventAt || r.confirmedAt, title: `${r.bounceStatus} Notification`, desc: r.bounceReason || 'Delivery failure notice.', color: 'red', icon: '⛔' });
  }

  const timelineHtml = timelineEvents
    .map(
      (ev) => `
      <div class="timeline-item">
        <div class="timeline-node node-${ev.color}">${ev.icon}</div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="timeline-title">${ev.title}</span>
            <span class="timeline-time">${fmt(ev.time)}</span>
          </div>
          <div class="timeline-desc">${ev.desc}</div>
        </div>
      </div>`,
    )
    .join('');

  panel.innerHTML = `
    <!-- Top Hero Card (Consistent with Lead Details Inspector) -->
    <div class="lead-details-hero">
      <h2 class="lead-hero-company" style="font-size: 17px; word-break: break-all;">${escape(r.recipient)}</h2>
      <div class="lead-hero-subtitle">
        <span><strong>${escape(r.subject || '(No Subject)')}</strong></span>
        ${r.sender ? `<span>• From: ${escape(r.sender)}</span>` : ''}
      </div>
      <div class="lead-badges-row">
        ${sendBadge}
        ${seenBadge}
        ${bounceBadge}
      </div>
    </div>

    <!-- SECTION 1: OVERVIEW & TIMELINE -->
    <div id="trackingSecOverview" class="drawer-tab-pane active">
      <!-- Delivery & Engagement Metrics Card -->
      <div class="lead-details-card">
        <h4 class="lead-details-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          Delivery &amp; Engagement Metrics
        </h4>
        <div class="lead-details-grid">
          <div class="lead-detail-item">
            <span class="lead-detail-label">Send Status</span>
            <span class="lead-detail-value">${r.sendStatus === 'webmail_sent' ? 'Confirmed' : escape(r.sendStatus || 'Pending')} <small style="color:var(--text-muted);font-weight:normal;">(${r.confirmedAt ? fmtTime(r.confirmedAt) : (r.attemptedAt ? fmtTime(r.attemptedAt) : '—')})</small></span>
          </div>
          <div class="lead-detail-item">
            <span class="lead-detail-label">Read Engagement</span>
            <span class="lead-detail-value" style="color: ${r.firstOpenAt ? '#10b981' : 'var(--text-muted)'};">${r.firstOpenAt ? `Seen (${r.opens?.length || 1}x)` : 'Unopened'} <small style="font-weight:normal;">(${r.firstOpenAt ? (openRelative || fmtTime(r.firstOpenAt)) : 'No read detected'})</small></span>
          </div>
          <div class="lead-detail-item">
            <span class="lead-detail-label">Deliverability Health</span>
            <span class="lead-detail-value" style="color: ${r.bounceStatus ? '#ef4444' : '#10b981'};">${r.bounceStatus ? `${escape(r.bounceStatus)}` : 'Clean (No DSN)'}</span>
          </div>
          <div class="lead-detail-item">
            <span class="lead-detail-label">Sender Account</span>
            <span class="lead-detail-value">${escape(r.sender || 'Not recorded')}</span>
          </div>
        </div>
      </div>

      <!-- Bounce Diagnostic Card (Shown when failure / bounce detected) -->
      ${r.bounceReason || r.bounceStatus ? `
      <div class="lead-details-card" style="border-left: 3px solid #ef4444;">
        <h4 class="lead-details-title" style="color: #f87171;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          Delivery Failure Diagnostic (${escape(r.bounceStatus || 'bounced')})
        </h4>
        <div style="font-size: 13px; font-weight: 600; color: #fca5a5; font-family: ui-monospace, SFMono-Regular, monospace; margin-bottom: 6px; word-break: break-all;">${escape(r.bounceReason || 'smtp; 550 mailbox unavailable')}</div>
        <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">Recipient reported a permanent delivery failure via IMAP DSN notification. This recipient has been automatically excluded from future outreach.</div>
      </div>` : ''}

      <!-- Lifecycle Event Timeline Card -->
      <div class="lead-details-card">
        <h4 class="lead-details-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          Lifecycle Event Timeline
        </h4>
        <div class="tracking-timeline">
          ${timelineHtml || '<div style="color:var(--text-muted);font-size:12px;padding:8px 0;">No timeline events recorded.</div>'}
        </div>
      </div>
    </div>

    <!-- SECTION 2: TECHNICAL SPECS -->
    <div id="trackingSecSpecs" class="drawer-tab-pane" style="display: none;">
      <!-- Identifiers & Routing Card -->
      <div class="lead-details-card">
        <h4 class="lead-details-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Message Identifiers &amp; Routing
        </h4>
        <div class="lead-details-grid">
          <div class="lead-detail-item">
            <span class="lead-detail-label">Recipient</span>
            <span class="lead-detail-value"><a href="mailto:${escape(r.recipient)}">${escape(r.recipient)}</a><button type="button" class="copy-mini-btn" data-copy="${escape(r.recipient)}" title="Copy recipient"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button></span>
          </div>
          <div class="lead-detail-item">
            <span class="lead-detail-label">Sender Account</span>
            <span class="lead-detail-value">${escape(r.sender || 'Not recorded')}</span>
          </div>
          <div class="lead-detail-item">
            <span class="lead-detail-label">Campaign ID</span>
            <span class="lead-detail-value">${escape(r.campaignId || 'Direct Outreach')}</span>
          </div>
          <div class="lead-detail-item">
            <span class="lead-detail-label">Tracking UUID</span>
            <span class="lead-detail-value"><code>${escape(r.id)}</code><button type="button" class="copy-mini-btn" data-copy="${escape(r.id)}" title="Copy UUID"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button></span>
          </div>
          ${r.messageIds?.length ? `
          <div class="lead-detail-item full-width">
            <span class="lead-detail-label">Recorded Message-ID</span>
            <span class="lead-detail-value"><code>${escape(r.messageIds[0])}</code><button type="button" class="copy-mini-btn" data-copy="${escape(r.messageIds[0])}" title="Copy Message-ID"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button></span>
          </div>` : ''}
        </div>
      </div>

      <!-- Transmission & Interaction Timestamps Card -->
      <div class="lead-details-card">
        <h4 class="lead-details-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          Transmission &amp; Interaction Timestamps
        </h4>
        <div class="lead-details-grid">
          <div class="lead-detail-item">
            <span class="lead-detail-label">Created At</span>
            <span class="lead-detail-value">${fmt(r.createdAt)}</span>
          </div>
          <div class="lead-detail-item">
            <span class="lead-detail-label">Webmail Confirmed At</span>
            <span class="lead-detail-value">${fmt(r.confirmedAt || r.attemptedAt)}</span>
          </div>
          <div class="lead-detail-item">
            <span class="lead-detail-label">First Read Detected</span>
            <span class="lead-detail-value">${r.firstOpenAt ? `<span style="color:#10b981;font-weight:600;">${fmt(r.firstOpenAt)} ${openRelative ? `<small>(${openRelative})</small>` : ''}</span>` : '<span style="color:var(--text-muted);">Unopened</span>'}</span>
          </div>
          <div class="lead-detail-item">
            <span class="lead-detail-label">Total Read Sessions</span>
            <span class="lead-detail-value"><strong>${r.opens?.length || (r.firstOpenAt ? 1 : 0)} recorded interaction(s)</strong></span>
          </div>
        </div>
      </div>

      <!-- Seed Placement Card (if applicable) -->
      ${r.seedId ? `
      <div class="lead-details-card">
        <h4 class="lead-details-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
          Seed Inbox Placement Verification
        </h4>
        <div class="lead-details-grid">
          <div class="lead-detail-item">
            <span class="lead-detail-label">Seed ID</span>
            <span class="lead-detail-value">${escape(r.seedId)}</span>
          </div>
          <div class="lead-detail-item">
            <span class="lead-detail-label">Folder Placement</span>
            <span class="lead-detail-value">
              <strong style="color: ${r.placement?.status === 'inbox' ? '#10b981' : r.placement?.status === 'spam' ? '#ef4444' : '#fff'};">
                ${r.placement?.status === 'inbox' ? '📥 Inbox (Verified)' : r.placement?.status === 'spam' ? '🚫 Spam / Junk Folder' : escape(r.placement?.status || 'Awaiting verification')}
              </strong>
            </span>
          </div>
          <div class="lead-detail-item full-width">
            <span class="lead-detail-label">Verification Evidence / Note</span>
            <span class="lead-detail-value">${escape(r.placement?.evidence || (r.attemptedAt ? 'Not yet verified. Select folder below:' : 'Awaiting dispatch'))}</span>
          </div>
          ${r.attemptedAt ? `
          <div class="lead-detail-item full-width" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-subtle);">
            <span class="lead-detail-label">Record Placement Result</span>
            <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">
              <button type="button" class="btn-placement-inbox" data-drawer-place="${escape(r.id)}" data-drawer-status="inbox">📥 Mark as Inbox</button>
              <button type="button" class="btn-placement-spam" data-drawer-place="${escape(r.id)}" data-drawer-status="spam">🚫 Mark as Spam</button>
              <button type="button" class="secondary" data-drawer-place="${escape(r.id)}" data-drawer-status="other" style="font-size:11.5px;padding:6px 12px;">📁 Other Folder</button>
            </div>
          </div>` : ''}
        </div>
      </div>` : ''}
    </div>

    <!-- SECTION 3: RAW JSON -->
    <div id="trackingSecRaw" class="drawer-tab-pane" style="display: none;">
      <div class="lead-details-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h4 class="lead-details-title" style="margin:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
            Complete Tracking Record (JSON)
          </h4>
          <button type="button" class="secondary" data-copy-json style="font-size:11px;padding:4px 10px;">Copy JSON</button>
        </div>
        <pre class="message-preview-box" style="max-height: 440px; overflow: auto; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11.5px; line-height: 1.5; color: #cbd5e1; background: var(--bg-surface-elevated, #1a1e26); border-radius: var(--radius-sm); padding: 12px; margin: 0;">${escape(JSON.stringify(r, null, 2))}</pre>
      </div>
    </div>
  `;

  panel.hidden = false;
  switchTrackingDrawerTab('overview');

  // Wire footer Copy Summary button
  const copySummaryBtn = $('trackingCopyBtn');
  if (copySummaryBtn) {
    copySummaryBtn.onclick = async () => {
      const summaryText = `Recipient: ${r.recipient}\nSubject: ${r.subject || '(No Subject)'}\nSend Status: ${r.sendStatus}\nDelivery: ${r.confirmedAt ? 'Confirmed' : 'Pending'}\nFirst Open: ${r.firstOpenAt || 'Unopened'}\nDeliverability: ${r.bounceStatus || 'Clean'}\nTracking ID: ${r.id}`;
      const ok = await copyToClipboard(summaryText);
      if (ok) {
        const orig = copySummaryBtn.innerHTML;
        copySummaryBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!';
        setTimeout(() => { copySummaryBtn.innerHTML = orig; }, 1500);
        notice('Summary copied to clipboard.');
      }
    };
  }

  // Wire mini copy buttons
  panel.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.onclick = async () => {
      const text = btn.dataset.copy;
      const ok = await copyToClipboard(text);
      if (ok) {
        const orig = btn.innerHTML;
        btn.classList.add('copied');
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = orig;
        }, 1500);
        notice(`Copied: ${text}`);
      }
    };
  });

  // Wire drawer placement buttons
  panel.querySelectorAll('[data-drawer-place]').forEach((btn) => {
    btn.onclick = () => action(btn, async () => {
      const trackingId = btn.dataset.drawerPlace;
      const status = btn.dataset.drawerStatus;
      await api('/api/tracking/manual-placement', {
        trackingId,
        status,
        evidence: `Manual verification: marked ${status} in Tracking Details Drawer`
      });
      await loadTracking();
      const updated = trackingRecords.find((rec) => rec.id === trackingId);
      if (updated) renderTrackingDetail(updated);
    });
  });

  // Wire copy JSON button
  const copyJsonBtn = panel.querySelector('[data-copy-json]');
  if (copyJsonBtn) {
    copyJsonBtn.onclick = async () => {
      const ok = await copyToClipboard(JSON.stringify(r, null, 2));
      if (ok) {
        const orig = copyJsonBtn.textContent;
        copyJsonBtn.textContent = '✓ Copied!';
        setTimeout(() => { copyJsonBtn.textContent = orig; }, 1500);
        notice('Raw JSON copied to clipboard.');
      }
    };
  }
}

// Table click delegation
if ($('trackingRows')) {
  $('trackingRows').onclick = (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.dataset.seedSend) return action(button, async () => {
      await api('/api/tracking/seed-send', { trackingId: button.dataset.seedSend });
      await loadTracking();
    });
    if (button.dataset.seedPlace) return action(button, async () => {
      const trackingId = button.dataset.seedPlace;
      const status = button.dataset.placeStatus;
      await api('/api/tracking/manual-placement', {
        trackingId,
        status,
        evidence: `Manual verification: marked ${status} directly from Tracking dashboard`
      });
      await loadTracking();
    });
    const r = trackingRecords[Number(button.dataset.track)];
    if (!r) return;
    openTrackingDrawer(r);
    if ($('placementForm')) {
      $('placementForm').hidden = !r.seedId || !r.attemptedAt;
      $('placementId').value = r.id;
      $('placementEvidence').value = '';
    }
  };
}

if ($('placementForm')) {
  $('placementForm').onsubmit = (e) => {
    e.preventDefault();
    action(e.submitter, async () => {
      await api('/api/tracking/manual-placement', {
        trackingId: $('placementId').value,
        status: $('placementStatus').value,
        evidence: $('placementEvidence').value,
      });
      await loadTracking();
      $('placementForm').hidden = true;
      closeTrackingDrawer();
    });
  };
}

if ($('seedGenKeyBtn')) {
  $('seedGenKeyBtn').onclick = () => { $('seedTestKey').value = generateSeedKey(); };
}
if ($('seedSample')) {
  $('seedSample').onchange = () => updateSeedPreview();
}
if ($('seedTemplate')) {
  $('seedTemplate').onchange = () => updateSeedPreview();
}
if ($('seedSampleSearch')) {
  let searchTimer = null;
  $('seedSampleSearch').oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      loadSeedSamples($('seedSampleSearch').value);
    }, 250);
  };
}

if ($('seedPlanForm')) {
  $('seedPlanForm').onsubmit = (e) => {
    e.preventDefault();
    action(e.submitter, async () => {
      const templateKey = $('seedTemplate')?.value || $('template')?.value;
      const result = await api('/api/tracking/seed-plan', { testKey: $('seedTestKey').value, leadId: $('seedSample').value, key: templateKey });
      $('seedPlanResult').innerHTML = `<div class="seed-plan-success-box"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> <div><strong>Plan ${escape(result.testKey)}:</strong> ${result.ids.length} dedicated test recipient(s) reserved. Use <strong>"Send seed"</strong> in the tracking table above to dispatch; the same test key reuses this plan.</div></div>`;
      $('seedTestKey').value = generateSeedKey();
      trackingOffset = 0;
      await loadTracking();
    });
  };
}

function setDomainPreset(selectors, btn) {
  if ($('healthSelectors')) $('healthSelectors').value = selectors;
  document.querySelectorAll('.preset-pill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

$('presetPrivateEmail')?.addEventListener('click', () => {
  setDomainPreset('privateemail', $('presetPrivateEmail'));
});
$('presetGoogle')?.addEventListener('click', () => {
  setDomainPreset('google', $('presetGoogle'));
});
$('presetM365')?.addEventListener('click', () => {
  setDomainPreset('selector1, selector2', $('presetM365'));
});

function renderDomainReport(result) {
  const reportEl = $('domainHealthReport');
  if (!reportEl) return;
  reportEl.style.display = 'block';
  if ($('domainRawDetails')) $('domainRawDetails').hidden = false;

  const domain = escape(result.domain || '');
  const spfFound = result.spf?.state === 'found' && (result.spf.records || []).length === 1;
  const dkimFound = Array.isArray(result.dkim) && result.dkim.some(d => d.state === 'found' && (d.records || []).length > 0);
  const dmarcFound = result.dmarc?.state === 'found' && (result.dmarc.records || []).length >= 1;

  let passedChecks = 0;
  if (spfFound) passedChecks++;
  if (dkimFound) passedChecks++;
  if (dmarcFound) passedChecks++;

  let bannerClass = 'good';
  let bannerTitle = 'All Authentication Records Active';
  let bannerDesc = `Domain <strong>${domain}</strong> meets all modern deliverability standards (SPF, DKIM, and DMARC aligned). Outreach emails will reach primary inboxes.`;

  if (passedChecks === 2) {
    bannerClass = 'warn';
    bannerTitle = '2 of 3 Checks Passing — DMARC Action Required';
    bannerDesc = `SPF and DKIM are validated, but <strong>DMARC is missing</strong>. Google and Yahoo spam filters heavily deprioritize domains without published DMARC policies.`;
  } else if (passedChecks < 2) {
    bannerClass = 'bad';
    bannerTitle = `${passedChecks} of 3 Checks Passing — Deliverability Risk`;
    bannerDesc = `Key email authentication records are missing or unverified. Emails sent from <strong>${domain}</strong> have high risk of landing in spam or being rejected.`;
  }

  if ($('domainScoreBadge')) {
    if (passedChecks === 3) {
      $('domainScoreBadge').innerHTML = `<span class="status-pill" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-weight: 600; padding: 4px 10px; font-size: 11.5px;">✅ 100% Authenticated (3/3)</span>`;
    } else if (passedChecks === 2) {
      $('domainScoreBadge').innerHTML = `<span class="status-pill" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); font-weight: 600; padding: 4px 10px; font-size: 11.5px;">⚠️ 67% Healthy (DMARC Missing)</span>`;
    } else {
      $('domainScoreBadge').innerHTML = `<span class="status-pill" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 600; padding: 4px 10px; font-size: 11.5px;">❌ ${passedChecks}/3 Checks Passing</span>`;
    }
  }

  const activeProfileEmail = state.profiles.find((p) => p.id === state.activeProfile)?.email || `markanthony@${result.domain || 'fclogistics.us'}`;
  const recommendedDmarcVal = `v=DMARC1; p=none; sp=none; rua=mailto:${activeProfileEmail}`;

  const spfCard = `
    <div class="domain-health-card ${spfFound ? 'status-pass' : 'status-fail'}">
      <div>
        <div class="domain-card-head">
          <div class="domain-card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${spfFound ? '#10b981' : '#ef4444'}" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle>${spfFound ? '<polyline points="16 9 10 15 7 12"></polyline>' : '<line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>'}</svg>
            SPF Record
          </div>
          <span class="status-pill" style="background: ${spfFound ? 'rgba(16, 185, 129, 0.12); color: #34d399;' : 'rgba(239, 68, 68, 0.12); color: #f87171;'} font-weight: 700; font-size: 11px;">
            ${spfFound ? 'PASS' : 'FAIL'}
          </span>
        </div>
        <p style="font-size: 12px; color: var(--text-muted); margin: 6px 0 10px 0;">Specifies mail servers authorized to send on behalf of <code>${domain}</code>.</p>
        <div class="domain-record-box">
          ${(result.spf?.records && result.spf.records.length > 0) ? escape(result.spf.records.join('\n')) : '<span style="color: #ef4444;">No valid SPF TXT record detected.</span>'}
        </div>
      </div>
      <div style="font-size: 11.5px; color: ${spfFound ? '#34d399' : '#f87171'}; display: flex; align-items: center; gap: 6px;">
        ${spfFound ? '✓ PrivateEmail mail server authorized' : '⚠ Outreach may bounce or fail authentication'}
      </div>
    </div>
  `;

  const dkimResults = result.dkim || [];
  const dkimCard = `
    <div class="domain-health-card ${dkimFound ? 'status-pass' : 'status-fail'}">
      <div>
        <div class="domain-card-head">
          <div class="domain-card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${dkimFound ? '#10b981' : '#ef4444'}" stroke-width="2.5"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
            DKIM Signatures
          </div>
          <span class="status-pill" style="background: ${dkimFound ? 'rgba(16, 185, 129, 0.12); color: #34d399;' : 'rgba(239, 68, 68, 0.12); color: #f87171;'} font-weight: 700; font-size: 11px;">
            ${dkimFound ? 'PASS' : 'FAIL'}
          </span>
        </div>
        <p style="font-size: 12px; color: var(--text-muted); margin: 6px 0 10px 0;">Cryptographic signature verifying mail has not been tampered in transit.</p>
        <div class="domain-record-box">
          ${dkimResults.length > 0 ? dkimResults.map(d => `<strong>Selector:</strong> <code>${escape(d.selector)}</code> — ${d.state === 'found' ? '<span style="color: #34d399;">Valid RSA Key</span><br>' + escape(d.records.join('\n')) : '<span style="color: #f87171;">Key missing</span>'}`).join('<hr style="border:0;border-top:1px solid #1f2533;margin:6px 0;">') : '<span style="color: #94a3b8;">No DKIM selectors queried.</span>'}
        </div>
      </div>
      <div style="font-size: 11.5px; color: ${dkimFound ? '#34d399' : '#f87171'}; display: flex; align-items: center; gap: 6px;">
        ${dkimFound ? '✓ Valid DKIM key found on selector: ' + escape(dkimResults.filter(d=>d.state==='found').map(d=>d.selector).join(', ')) : '⚠ No valid DKIM keys located'}
      </div>
    </div>
  `;

  const dmarcCard = `
    <div class="domain-health-card ${dmarcFound ? 'status-pass' : 'status-fail'}">
      <div>
        <div class="domain-card-head">
          <div class="domain-card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${dmarcFound ? '#10b981' : '#f59e0b'}" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            DMARC Policy
          </div>
          <span class="status-pill" style="background: ${dmarcFound ? 'rgba(16, 185, 129, 0.12); color: #34d399;' : 'rgba(245, 158, 11, 0.15); color: #fbbf24;'} font-weight: 700; font-size: 11px;">
            ${dmarcFound ? 'PASS' : 'MISSING'}
          </span>
        </div>
        <p style="font-size: 12px; color: var(--text-muted); margin: 6px 0 10px 0;">Instructs Gmail & Outlook how to handle messages failing SPF/DKIM.</p>
        <div class="domain-record-box">
          ${(result.dmarc?.records && result.dmarc.records.length > 0) ? escape(result.dmarc.records.join('\n')) : '<span style="color: #fbbf24;">No record at <code>_dmarc.' + domain + '</code>.</span>'}
        </div>
      </div>
      <div style="font-size: 11.5px; color: ${dmarcFound ? '#34d399' : '#fbbf24'}; display: flex; align-items: center; gap: 6px;">
        ${dmarcFound ? '✓ DMARC policy active' : '⚠ Required by 2024+ Gmail & Yahoo sender rules'}
      </div>
    </div>
  `;

  let dmarcGuide = '';
  if (!dmarcFound) {
    dmarcGuide = `
      <div class="dmarc-alert-box">
        <div style="font-size: 24px; line-height: 1;">🛡️</div>
        <div style="flex: 1;">
          <div style="font-size: 13.5px; font-weight: 700; color: #fde68a;">
            Action Required: Add Recommended DMARC TXT Record to Namecheap DNS
          </div>
          <p style="font-size: 12.5px; color: #e2e8f0; margin: 6px 0 10px 0; line-height: 1.5;">
            Without DMARC, Gmail and Yahoo mark outreach emails as unauthenticated or throttle delivery to Spam. Add this single TXT record in your <strong>Namecheap Advanced DNS</strong> management console:
          </p>
          <div style="background: #0f1219; border: 1px solid #283044; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
            <table class="dmarc-rec-table">
              <tr><td>Type:</td><td><strong style="color: #38bdf8;">TXT Record</strong></td></tr>
              <tr><td>Host:</td><td><code>_dmarc</code></td></tr>
              <tr><td>Value / Target:</td><td><code id="dmarcRecordText" style="color: #a7f3d0; word-break: break-all;">${escape(recommendedDmarcVal)}</code></td></tr>
              <tr><td>TTL:</td><td><code>Automatic</code> (or <code>30 min</code>)</td></tr>
            </table>
          </div>
          <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <button type="button" class="copy-btn-action" id="copyDmarcBtn" style="padding: 7px 14px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; border-radius: 6px; cursor: pointer;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              Copy DMARC TXT Record Value
            </button>
            <span style="font-size: 11.5px; color: var(--text-muted);">
              Policy <code>p=none</code> is safe monitoring mode (no legitimate mail will ever be dropped).
            </span>
          </div>
        </div>
      </div>
    `;
  }

  reportEl.innerHTML = `
    <div class="domain-score-banner ${bannerClass}">
      <div style="display: flex; align-items: center; gap: 14px;">
        <div style="width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: ${passedChecks === 3 ? 'rgba(16, 185, 129, 0.2)' : passedChecks === 2 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; font-size: 20px;">
          ${passedChecks === 3 ? '🛡️' : passedChecks === 2 ? '⚠️' : '🚨'}
        </div>
        <div>
          <div style="font-size: 15px; font-weight: 700; color: #fff;">${bannerTitle}</div>
          <div style="font-size: 12.5px; color: #cbd5e1; margin-top: 2px;">${bannerDesc}</div>
        </div>
      </div>
      <div style="font-size: 12px; color: var(--text-muted); text-align: right;">
        Audited at: <code>${new Date(result.checkedAt).toLocaleTimeString()}</code>
      </div>
    </div>
    <div class="domain-cards-grid">
      ${spfCard}
      ${dkimCard}
      ${dmarcCard}
    </div>
    ${dmarcGuide}
  `;

  const copyBtn = $('copyDmarcBtn');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      const ok = await copyToClipboard(recommendedDmarcVal);
      if (ok) {
        notice('Copied recommended DMARC record to clipboard!');
        copyBtn.textContent = '✓ Copied!';
        setTimeout(() => {
          copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy DMARC TXT Record Value`;
        }, 2000);
      }
    };
  }
}

if ($('domainForm')) {
  $('domainForm').onsubmit = (e) => {
    e.preventDefault();
    $('domainResult').textContent = 'Checking public DNS records…';
    action(e.submitter, async () => {
      const result = await api('/api/tracking/domain?' + new URLSearchParams({ domain: $('healthDomain').value, selectors: $('healthSelectors').value }));
      $('domainResult').textContent = JSON.stringify(result, null, 2);
      renderDomainReport(result);
    });
  };
}

setInterval(() => {
  if (!pending && location.hash === '#tracking') loadTracking().catch((e) => notice(e.message));
}, 10000);

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

// Ensure mouse click removes focus ring
document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    link.blur();
  });
});

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
