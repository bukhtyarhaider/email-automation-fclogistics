let catalogData = null, catalogEditId = null;
async function loadCatalog() {
  $("catalogStatus").textContent = "Loading catalog…";
  try {
    catalogData = await api("/api/catalog");
    if (!$("catalogNoteVersion").value) $("catalogNoteVersion").value = catalogData.installedVersion;
    if (!$("catalogNoteDate").value) $("catalogNoteDate").value = new Date().toLocaleDateString("en-CA");
    const metrics = [["Installed on this PC", `v${catalogData.installedVersion}`], ["Recorded package versions", catalogData.packageVersions], ["Historical updates", catalogData.milestones], ["My local notes", catalogData.notes.length]];
    $("catalogMetrics").innerHTML = metrics.map(([label, value]) => `<div class="history-metric"><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`).join("");
    $("catalogUpgradeSteps").innerHTML = catalogData.upgradeSteps.map((step) => `<li>${escape(step)}</li>`).join("");
    renderCatalogEntries();
  } catch (error) { $("catalogStatus").textContent = `Could not load catalog: ${error.message}`; throw error; }
}
function renderCatalogEntries() {
  if (!catalogData) return;
  const q = $("catalogSearch").value.trim().toLowerCase(), kind = $("catalogType").value;
  const entries = [...catalogData.releases, ...catalogData.notes].filter((r) => (!kind || r.kind === kind) && (!q || [r.version, r.date, r.title, ...r.changes].join(" ").toLowerCase().includes(q))).sort((a, b) => b.date.localeCompare(a.date));
  $("catalogEntries").innerHTML = entries.map((r) => `<article class="panel catalog-entry ${r.kind === "release" && r.version === catalogData.installedVersion ? "catalog-current" : ""}"><div class="catalog-entry-meta"><span class="status-pill">${r.kind === "release" ? "Package release" : r.kind === "milestone" ? "Historical update" : "Local note"}</span><span>v${escape(r.version)} · ${escape(r.date)}</span>${r.kind === "release" && r.version === catalogData.installedVersion ? '<span class="status-pill good">Installed build</span>' : ""}</div><h2>${escape(r.title)}</h2><ul>${r.changes.map((change) => `<li>${escape(change)}</li>`).join("")}</ul>${r.evidence ? `<small class="hint">Source: ${escape(r.evidence)}</small>` : `<button class="secondary" data-catalog-edit="${escape(r.id)}">Edit local note</button>`}</article>`).join("") || '<div class="panel">No catalog entries match your search.</div>';
  $("catalogStatus").textContent = `${entries.length} matching catalog entries · includes this build's recorded history`;
}
function newCatalogNote() {
  catalogEditId = null;
  $("catalogNoteHeading").textContent = "Add a local release note";
  $("catalogNoteVersion").value = catalogData?.installedVersion || state?.appVersion || "";
  $("catalogNoteDate").value = new Date().toLocaleDateString("en-CA");
  $("catalogNoteTitle").value = ""; $("catalogNoteChanges").value = "";
}
$("catalogSearch").oninput = renderCatalogEntries;
$("catalogType").onchange = renderCatalogEntries;
$("catalogRefresh").onclick = () => action($("catalogRefresh"), loadCatalog);
$("catalogNewNote").onclick = newCatalogNote;
$("catalogEntries").onclick = (e) => {
  const button = e.target.closest("[data-catalog-edit]");
  if (!button) return;
  const note = catalogData.notes.find((note) => note.id === button.dataset.catalogEdit);
  if (!note) return;
  catalogEditId = note.id; $("catalogNoteHeading").textContent = "Edit local release note";
  $("catalogNoteVersion").value = note.version; $("catalogNoteDate").value = note.date;
  $("catalogNoteTitle").value = note.title; $("catalogNoteChanges").value = note.changes.join("\n");
  $("catalogNoteTitle").scrollIntoView({ behavior: "smooth", block: "center" });
};
$("catalogSaveNote").onclick = () => action($("catalogSaveNote"), async () => {
  await api("/api/catalog/note", { id: catalogEditId, version: $("catalogNoteVersion").value.trim(), date: $("catalogNoteDate").value, title: $("catalogNoteTitle").value, changes: $("catalogNoteChanges").value });
  newCatalogNote(); await loadCatalog(); notice("Local catalog note saved.");
});
