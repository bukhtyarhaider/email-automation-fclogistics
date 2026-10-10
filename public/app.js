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
  profileEditId = null;

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

  const supList = $("suppressionList");
  if (supList) {
    supList.innerHTML = Object.entries(state.suppression)
      .map(
        ([e, r]) =>
          `<li><strong>${escape(e)}</strong><span class="hint" style="margin:0">${escape(r)}</span></li>`,
      )
      .join("");
  }

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
              `<tr><td style="text-align: center;"><input type="checkbox" data-select="${l.id}" aria-label="Select ${escape(l.company)}" ${l.blocked ? "disabled" : ""} ${selected.has(l.id) ? "checked" : ""}></td><td><strong>${escape(l.company)}</strong><small>${escape(l.fields["owner / principal"]) || "No contact listed"}</small></td><td>${escape(l.email) || "—"}</td><td>${escape([l.fields.city, l.fields.state].filter(Boolean).join(", ")) || "—"}</td><td><span class="status-pill ${l.blocked ? "blocked" : "ready"}">${escape(l.blocked || "Ready")}</span></td><td style="text-align: right;"><button class="secondary" style="font-size: 11px; padding: 4px 8px;" data-preview="${l.id}">Preview</button></td></tr>`,
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

async function preview(id) {
  previewId = id;
  const templateKey = $("template")?.value;
  const { message, warnings } = await api(
    `/api/preview?${new URLSearchParams({ id, key: templateKey })}`,
  );
  if ($("previewTitle")) $("previewTitle").textContent = message.subject;
  if ($("previewTo")) $("previewTo").textContent = `To: ${message.to}`;
  if ($("previewBody")) $("previewBody").textContent = message.body;

  const warnEl = $("warnings");
  if (warnEl) {
    warnEl.hidden = !warnings.length;
    warnEl.textContent = warnings.join(" ");
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
    "settings",
    "activity",
    "suppression",
  ];
  const target = validViews.includes(viewName) ? viewName : "dashboard";

  document.querySelectorAll(".view-page").forEach((el) => {
    el.classList.toggle("active", el.id === `view-${target}`);
  });

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.view === target);
  });
}

window.addEventListener("hashchange", () => {
  navigate(location.hash.replace("#", ""));
});

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
    const id = e.target.dataset.preview;
    if (id) preview(id).catch((err) => notice(err.message));
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

function readBusiness() {
  return {
    company: $("businessName")?.value || "",
    senderName: $("senderName")?.value || "",
    legalName: $("legalName")?.value || "",
    address: $("address")?.value || "",
    services: $("services")?.value || "",
  };
}

function fillProfile() {
  const p = state.profiles.find((p) => p.id === state.activeProfile);
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
    notice("Enter the new profile details, then save.");
  };

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
  $("deleteTemplate").onclick = () =>
    action($("deleteTemplate"), async () => {
      await api("/api/delete-template", { key: $("template").value });
      if ($("template")) $("template").dataset.options = "";
    });

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
              `<tr><td><strong>${escape(r.to)}</strong><small>${escape(new Date(r.at).toLocaleString())}</small></td><td>${escape(r.accountEmail || "Legacy")}<small>${escape(state.templates[r.templateKey]?.name || r.templateKey || "Variant")}</small></td><td>${escape(r.subject)}</td><td><span class="status-pill ${r.status === "Sent" ? "good" : "blocked"}">${escape(r.status)}</span></td><td style="text-align: right;"><button class="secondary" style="font-size: 11px; padding: 4px 8px;" data-history="${index}">View</button></td></tr>`,
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
    msgEl.textContent = `To: ${r.to}\nFrom: ${r.accountEmail || "Not recorded"}\nCampaign: ${r.campaignName || "Legacy campaign"}\nTemplate: ${r.templateKey || "Not recorded"}\nOutcome: ${r.status}\nConfirmation Evidence: ${r.evidence || "Not confirmed"}\nSubject: ${r.subject}\n\n${r.body || "Message body was not recorded by previous version."}\n\n${r.signature || ""}`;
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

// Initial boot
navigate(location.hash.replace("#", ""));
await refresh();
await loadLeads();
await loadHistory();

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
