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
