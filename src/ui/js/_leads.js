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
