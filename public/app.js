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
  $("notice").hidden = !text;
  $("notice").textContent = text;
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
  $("prepare").disabled =
    pending ||
    state.busy ||
    !state.connected ||
    !previewId ||
    !state.templates[$("template").value] ||
    !!state.prepared ||
    state.job.enabled ||
    rows.find((x) => x.id === previewId)?.blocked;
  $("sendOne").disabled =
    pending ||
    state.busy ||
    !state.prepared ||
    !state.connected ||
    !!state.attempts[state.prepared?.message.to];
  $("release").disabled = pending || state.busy || !state.connected;
  $("batch").disabled =
    pending ||
    state.busy ||
    !state.connected ||
    state.job.enabled ||
    !selected.size ||
    !!state.prepared;
  $("stop").hidden = !state.job.enabled;
  $("start").disabled =
    pending ||
    state.busy ||
    state.job.enabled ||
    !!state.prepared ||
    !state.campaigns.some((c) => c.enabled);
  $("saveProfile").disabled = pending || state.busy || state.job.enabled;
  $("newProfile").disabled = pending || state.busy || state.job.enabled;
  $("reload").disabled = pending || state.busy || !!state.prepared;
  $("connect").disabled = pending || state.busy;
  $("resume").hidden = state.connected || !state.signInOpen;
  $("resume").disabled = pending || state.busy;
  $("disconnect").disabled = pending || state.busy;
  $("disconnect").hidden = !state.connected;
  $("selectedCount").textContent = `${selected.size} selected`;
}
async function refresh() {
  state = await api("/api/state");
  for (const key of ["total", "ready", "excluded", "sent"])
    $(key).textContent = state.counts[key].toLocaleString();
  $("connection").textContent = state.connected
    ? "Mailbox connected"
    : "Mailbox disconnected";
  $("connection").className = `pill ${state.connected ? "good" : ""}`;
  $("workbookName").textContent =
    state.workbook?.name || "No workbook imported.";
  const options = JSON.stringify(state.sheets);
  if ($("sheet").dataset.options !== options) {
    const v = $("sheet").value;
    $("sheet").innerHTML =
      '<option value="">All worksheets</option>' +
      state.sheets
        .map(
          (s) =>
            `<option value="${escape(s.name)}">${escape(s.name)}${s.hidden ? " (hidden)" : ""}</option>`,
        )
        .join("");
    $("sheet").value = v;
    $("sheet").dataset.options = options;
  }
  const templateOptions = JSON.stringify(
    Object.entries(state.templates).map(([k, t]) => [k, t.name]),
  );
  if ($("template").dataset.options !== templateOptions) {
    const v = $("template").value;
    $("template").innerHTML = Object.entries(state.templates)
      .map(
        ([key, t]) =>
          `<option value="${escape(key)}">${escape(t.name)}</option>`,
      )
      .join("");
    if (state.templates[v]) $("template").value = v;
    $("template").dataset.options = templateOptions;
    fillTemplate();
  }
  $("quota").textContent =
    `${state.remaining} attempts remaining this rolling hour; ${state.dayRemaining} in the next rolling 24-hour allowance. One recipient per message.`;
  syncOptions("profileSelect", state.profiles, state.activeProfile);
  syncOptions("campaignSelect", state.campaigns, state.activeCampaign);
  const p = state.profiles.find((p) => p.id === state.activeProfile);
  $("profileName").textContent = p?.name || "My mailbox";
  $("brandName").textContent = p?.business?.company || "OUTREACH DESK";
  $("brandMark").textContent = (p?.business?.company || "Outreach Desk")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  if (!configLoaded) {
    fillSettings();
    fillProfile();
    fillCampaign();
    configLoaded = true;
    if (!p?.email) $("settingsDetails").open = true;
  }
  $("teamStatus").textContent = state.settings.team.enabled
    ? state.teamConnected
      ? "Team token connected. The shared server is checked before each send."
      : "Shared team server needs its access token."
    : "Independent PC mode. Other PCs’ sends are not tracked here.";
  $("nextSend").textContent = state.job.nextAt
    ? `Next queue check: ${new Date(state.job.nextAt).toLocaleString()} · ${Math.max(0, Math.ceil((Date.parse(state.job.nextAt) - Date.now()) / 1000))} seconds remaining`
    : "";
  $("jobStatus").textContent = state.job.status;
  $("jobMessage").textContent = state.job.message;
  $("progress").max = state.job.total || 1;
  $("progress").value = state.job.current;
  $("events").innerHTML = state.events
    .slice()
    .reverse()
    .map(
      (e) =>
        `<li><time>${escape(new Date(e.at).toLocaleString())}</time>${escape(e.message)}</li>`,
    )
    .join("");
  $("suppressionList").innerHTML = Object.entries(state.suppression)
    .map(([e, r]) => `<li>${escape(e)} — ${escape(r)}</li>`)
    .join("");
  $("recovery").innerHTML = Object.entries(state.attempts)
    .filter(
      ([, i]) => i.status === "Uncertain" || i.syncNeeded || i.teamSyncNeeded,
    )
    .map(
      ([email, i]) =>
        `<div class="recovery-item"><strong>${escape(email)}</strong><p>${i.status === "Uncertain" ? "Send result uncertain. Check the Sent folder in your browser. This address remains blocked from automatic retries." : "Send confirmed. Workbook update needs repair."}</p>${i.status === "Uncertain" ? `<button class="secondary" data-reconcile="${escape(email)}" data-outcome="sent">I verified it was sent</button><button class="secondary" data-reconcile="${escape(email)}" data-outcome="not-sent">I verified it was not sent</button>` : `<button class="secondary" data-reconcile="${escape(email)}" data-outcome="sent">Repair workbook status</button>`}</div>`,
    )
    .join("");
  if (state.prepared) {
    $("signatureText").textContent = state.prepared.signature;
  }
  updateControls();
}
function fillTemplate() {
  const t = state.templates[$("template").value] || {
    name: "New template",
    subject: "",
    body: "",
    weight: 1,
    enabled: true,
    requiredFields: [],
  };
  $("subject").value = t.subject;
  $("body").value = t.body;
  $("templateName").value = t.name;
  $("templateEnabled").checked = t.enabled !== false;
  $("templateWeight").value = t.weight || 1;
  $("requiredFields").value = (t.requiredFields || []).join(", ");
}
async function loadLeads() {
  const query = new URLSearchParams({
    sheet: $("sheet").value,
    filter: $("filter").value,
    q: $("search").value,
    offset: String(offset),
  });
  const result = await api(`/api/leads?${query}`);
  rows = result.leads;
  total = result.total;
  $("leadRows").innerHTML = rows.length
    ? rows
        .map(
          (l) =>
            `<tr><td><input type="checkbox" data-select="${l.id}" aria-label="Select ${escape(l.company)}" ${l.blocked ? "disabled" : ""} ${selected.has(l.id) ? "checked" : ""}></td><td><strong>${escape(l.company)}</strong><small>${escape(l.fields["owner / principal"])}</small></td><td>${escape(l.email) || "—"}</td><td>${escape([l.fields.city, l.fields.state].filter(Boolean).join(", ")) || "—"}</td><td class="${l.blocked ? "blocked" : "good"}">${escape(l.blocked || "Ready")}</td><td><button class="secondary" data-preview="${l.id}">Preview</button></td></tr>`,
        )
        .join("")
    : '<tr><td colspan="6">No leads match these filters.</td></tr>';
  $("pageInfo").textContent = total
    ? `${offset + 1}–${Math.min(offset + 50, total)} of ${total.toLocaleString()} leads`
    : "No leads";
  $("previous").disabled = offset === 0;
  $("next").disabled = offset + 50 >= total;
  $("selectPage").checked = false;
  updateControls();
}
async function preview(id) {
  previewId = id;
  const { message, warnings } = await api(
    `/api/preview?${new URLSearchParams({ id, key: $("template").value })}`,
  );
  $("previewTitle").textContent = message.subject;
  $("previewTo").textContent = `To: ${message.to}`;
  $("previewBody").textContent = message.body;
  $("warnings").textContent = warnings.join(" ");
  updateControls();
}
$("reload").onclick = () => action($("reload"), () => api("/api/reload", {}));
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
  });
$("connect").onclick = () =>
  action($("connect"), async () => {
    const password = $("password").value;
    $("password").value = "";
    await api("/api/connect", { password });
    notice("Mailbox connected.");
  });
$("disconnect").onclick = () =>
  action($("disconnect"), () => api("/api/disconnect", {}));
$("resume").onclick = () => action($("resume"), () => api("/api/resume", {}));
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
  });
$("template").onchange = () => {
  fillTemplate();
  if (previewId) preview(previewId).catch((e) => notice(e.message));
};
$("prepare").onclick = () =>
  action($("prepare"), async () => {
    const r = await api("/api/prepare", {
      id: previewId,
      key: $("template").value,
      randomTemplates: $("randomTemplates").checked,
    });
    $("signatureText").textContent = r.signature;
    $("previewTitle").textContent = r.message.subject;
    $("previewBody").textContent = r.message.body;
    notice("Compose filled in your browser. Review it before sending.");
  });
$("release").onclick = () =>
  action($("release"), () => api("/api/release", {}));
$("sendOne").onclick = () =>
  action($("sendOne"), async () => {
    await api("/api/send", {});
    selected.delete(previewId);
    notice("Send confirmed. Workbook status updated.");
  });
$("batch").onclick = () =>
  action($("batch"), async () => {
    await api("/api/batch", {
      ids: [...selected],
      key: $("template").value,
      randomTemplates: $("randomTemplates").checked,
    });
    selected.clear();
  });
$("start").onclick = () =>
  action($("start"), () =>
    api("/api/start", {
      key: $("template").value,
      randomTemplates: $("randomTemplates").checked,
    }),
  );
$("stop").onclick = async () => {
  try {
    await api("/api/stop", {});
    await refresh();
  } catch (e) {
    notice(e.message);
  }
};
$("suppress").onclick = () =>
  action($("suppress"), async () => {
    await api("/api/suppress", {
      email: $("suppressEmail").value,
      reason: $("suppressReason").value,
    });
    $("suppressEmail").value = "";
    $("suppressReason").value = "";
  });
$("recovery").onclick = (e) => {
  if (e.target.dataset.reconcile)
    action(e.target, () =>
      api("/api/reconcile", {
        email: e.target.dataset.reconcile,
        outcome: e.target.dataset.outcome,
      }),
    );
};
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
$("selectPage").onchange = () => {
  for (const l of rows)
    if (!l.blocked) {
      if ($("selectPage").checked) selected.add(l.id);
      else selected.delete(l.id);
    }
  loadLeads().catch((e) => notice(e.message));
};
$("clearSelection").onclick = () => {
  selected.clear();
  loadLeads().catch((e) => notice(e.message));
};
for (const id of ["sheet", "filter"])
  $(id).onchange = () => {
    offset = 0;
    loadLeads().catch((e) => notice(e.message));
  };
let searchTimer;
$("search").oninput = () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    offset = 0;
    loadLeads().catch((e) => notice(e.message));
  }, 250);
};
$("previous").onclick = () => {
  offset = Math.max(0, offset - 50);
  loadLeads().catch((e) => notice(e.message));
};
$("next").onclick = () => {
  offset += 50;
  loadLeads().catch((e) => notice(e.message));
};

function syncOptions(id, entries, value) {
  const el = $(id),
    snapshot = JSON.stringify(entries.map((x) => [x.id, x.name]));
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
    company: $("businessName").value,
    senderName: $("senderName").value,
    legalName: $("legalName").value,
    address: $("address").value,
    services: $("services").value,
  };
}
function fillProfile() {
  const p = state.profiles.find((p) => p.id === state.activeProfile);
  profileEditId = p?.id || null;
  $("accountName").value = p?.name || "";
  $("accountEmail").value = p?.email || "";
  $("accountUrl").value = p?.url || "https://privateemail.com/spm/mail/INBOX/";
  $("provider").value = p?.provider || "privateemail";
  $("browserChannel").value = p?.browserChannel || "chrome";
  const b = p?.business || state.settings.business;
  for (const [id, key] of Object.entries({
    businessName: "company",
    senderName: "senderName",
    legalName: "legalName",
    address: "address",
    services: "services",
  }))
    $(id).value = b[key] || "";
}
function fillSettings() {
  const s = state.settings;
  for (const key of pacingFields) $(key).value = s.pacing[key];
  for (const key of ["requireActive", "requireNoOutOfService", "allowHidden"])
    $(key).checked = s.eligibility[key];
  $("readyStatuses").value = s.eligibility.readyStatuses
    .map((v) => v || "blank")
    .join(", ");
  $("sentStatus").value = s.eligibility.sentStatus;
  $("teamEnabled").checked = s.team.enabled;
  $("teamUrl").value = s.team.url;
  $("workerName").value = s.team.workerName;
}
function fillCampaign() {
  const c = state.campaigns.find((c) => c.id === state.activeCampaign);
  $("campaignName").value = c?.name || "";
  $("campaignEnabled").checked = c?.enabled !== false;
  $("campaignSheets").value = (c?.sheets || []).join("\n");
  $("mapping").value = JSON.stringify(c?.mapping || {}, null, 2);
  $("headers").textContent = state.sheets
    .map(
      (s) =>
        `${s.name}: ${Object.entries(s.headers || {})
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")}`,
    )
    .join("\n");
}
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
  });
$("newProfile").onclick = () => {
  profileEditId = null;
  $("accountName").value = "";
  $("accountEmail").value = "";
  $("password").value = "";
  $("senderName").value = "";
  $("accountName").focus();
  notice("Enter the new profile details, then save.");
};
$("profileSelect").onchange = () =>
  action($("connect"), async () => {
    await api("/api/select-profile", { id: $("profileSelect").value });
    await refresh();
    fillProfile();
    $("password").value = "";
  });
$("campaignSelect").onchange = () =>
  action($("reload"), async () => {
    await api("/api/select-campaign", { id: $("campaignSelect").value });
    selected.clear();
    previewId = null;
    offset = 0;
    await refresh();
    fillCampaign();
  });
$("saveSettings").onclick = () =>
  action($("saveSettings"), async () => {
    const s = structuredClone(state.settings);
    s.business = readBusiness();
    for (const key of pacingFields) s.pacing[key] = Number($(key).value);
    for (const key of ["requireActive", "requireNoOutOfService", "allowHidden"])
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
$("newTemplate").onclick = () => {
  $("template").add(new Option("New template", ""));
  $("template").value = "";
  fillTemplate();
  $("templateName").focus();
};
$("deleteTemplate").onclick = () =>
  action($("deleteTemplate"), async () => {
    await api("/api/delete-template", { key: $("template").value });
    $("template").dataset.options = "";
  });

async function loadHistory() {
  const result = await api(
    "/api/history?" +
      new URLSearchParams({
        q: $("historySearch").value,
        status: $("historyStatus").value,
        offset: String(historyOffset),
      }),
  );
  historyRecords = result.records;
  $("historyRows").innerHTML = historyRecords.length
    ? historyRecords
        .map(
          (r, index) =>
            `<tr><td>${escape(new Date(r.at).toLocaleString())}<small>${escape(r.to)}</small></td><td>${escape(r.accountEmail || "Legacy record")}<small>${escape(state.templates[r.templateKey]?.name || r.templateKey || "Not recorded")}</small></td><td>${escape(r.subject)}</td><td>${escape(r.status)}</td><td><button class="secondary" data-history="${index}">View message</button></td></tr>`,
        )
        .join("")
    : '<tr><td colspan="5">No attempts match.</td></tr>';
  $("historyPageInfo").textContent = result.total
    ? `${historyOffset + 1}–${Math.min(historyOffset + 25, result.total)} of ${result.total} attempts`
    : "No attempts";
  $("historyPrev").disabled = historyOffset === 0;
  $("historyNext").disabled = historyOffset + 25 >= result.total;
}
$("historyRows").onclick = (e) => {
  if (e.target.dataset.history === undefined) return;
  const r = historyRecords[Number(e.target.dataset.history)];
  $("historyMessage").hidden = false;
  $("historyMessage").textContent =
    `To: ${r.to}\nFrom: ${r.accountEmail || "Not recorded"}\nCampaign: ${r.campaignName || "Legacy campaign"}\nTemplate: ${r.templateKey || "Not recorded"}\nOutcome: ${r.status}\nConfirmation: ${r.evidence || "Not confirmed"}\nSubject: ${r.subject}\n\n${r.body || "Message body was not recorded by the previous version."}\n\n${r.signature || ""}`;
};
let historyTimer;
$("historySearch").oninput = () => {
  clearTimeout(historyTimer);
  historyTimer = setTimeout(() => {
    historyOffset = 0;
    loadHistory().catch((e) => notice(e.message));
  }, 250);
};
$("historyStatus").onchange = () => {
  historyOffset = 0;
  loadHistory().catch((e) => notice(e.message));
};
$("historyPrev").onclick = () => {
  historyOffset = Math.max(0, historyOffset - 25);
  loadHistory().catch((e) => notice(e.message));
};
$("historyNext").onclick = () => {
  historyOffset += 25;
  loadHistory().catch((e) => notice(e.message));
};
await refresh();
await loadLeads();
await loadHistory();
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
