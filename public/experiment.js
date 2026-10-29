(() => {
  const $ = (id) => document.getElementById(id);
  const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let busy = false, saved = null, baseline = null, reviewedCampaign = null, previewId = null, workspace = null, workspaceOffset = 0;
  async function request(url, data) {
    const response = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FC-Request': '1' }, body: JSON.stringify(data) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || 'Review failed.');
    return value;
  }
  function controls() {
    $('reviewCampaign').disabled = busy;
    $('reviewLoad').disabled = busy || !$('reviewCampaign').value;
    $('reviewPreview').disabled = busy || !saved;
    $('reviewReset').disabled = busy || !saved;
    $('reviewMapping').disabled = busy;
    $('reviewStatusColumns').disabled = busy;
    for (const id of ['repairSource', 'repairAcquired', 'repairPermission', 'repairConfirm', 'workspaceSearch']) $(id).disabled = busy;
    $('repairApply').disabled = busy || !previewId || !$('repairConfirm').checked || !$('repairSource').value.trim();
    for (const id of ['workspaceRefresh', 'workspaceFind', 'workspaceDraft']) $(id).disabled = busy;
    $('workspaceDraft').disabled = busy || !workspace?.activeRevision;
    $('workspaceFind').disabled = busy || !workspace?.activeRevision;
    $('workspaceRevision').disabled = busy || !workspace?.activeRevision;
    $('workspaceRestore').disabled = busy || !workspace?.activeRevision || $('workspaceRevision').value === workspace.activeRevision;
    $('workspacePrev').disabled = busy || workspaceOffset === 0;
    $('workspaceNext').disabled = busy || workspaceOffset + 25 >= (workspace?.total || 0);
  }
  async function run(button, fn) {
    if (busy) return;
    busy = true; const label = button.textContent;
    button.textContent = 'Working…'; $('reviewError').hidden = true;
    $('reviewStatus').textContent = 'Reading the workbook and checking columns…'; controls();
    try { await fn(); $('reviewStatus').textContent = button.id === 'repairApply' ? 'Experiment revision saved. Original data and sending settings are unchanged.' : button.id === 'workspaceRestore' ? 'Experiment revision restored. Original data and sending settings are unchanged.' : 'Review complete. Source files and sending settings are unchanged.'; }
    catch (error) { $('reviewError').textContent = error.message; $('reviewError').hidden = false; $('reviewStatus').textContent = 'Review needs attention. Your mapping draft is retained.'; }
    finally { busy = false; button.textContent = label; controls(); }
  }
  function render(report) {
    $('reviewResults').hidden = false; $('repairPanel').hidden = false;
    previewId = report.mode === 'preview' ? report.previewId : null;
    $('repairConfirm').checked = false;
    $('repairPreviewNote').textContent = previewId ? 'This exact preview is ready to save to an experiment copy.' : 'Preview your proposal before saving.';
    $('reviewHeading').textContent = report.mode === 'preview' ? 'Proposed mapping · preview only' : 'Saved mapping · review only';
    $('reviewBasis').textContent = report.basis;
    const identity = report.identitySummary;
    $('reviewIdentity').textContent = identity ? `Identity preview: ${identity.sourceDotCarriers} carriers grouped by source USDOT; ${identity.provisionalRows} provisional rows; ${identity.conflictRows} identifier conflicts; ${identity.layoutRows} layout-review rows. Source identifiers are not externally verified.` : '';
    const metrics = [['Parsed rows', 'rows'], ['Rows with layout issues', 'flaggedRows'], ['Sheets without status', 'missingStatusSheets'], ['Invalid / missing email', 'invalidEmailRows'], ['Extra rows sharing email', 'duplicateEmailRows']];
    $('reviewMetrics').innerHTML = metrics.map(([label, key]) => `<div class="experiment-metric"><span>${escape(label)}</span><strong>${report.summary[key].toLocaleString()}</strong></div>`).join('');
    const delta = report.summary.flaggedRows - baseline.flaggedRows;
    $('reviewChange').textContent = report.mode === 'preview' ? `${delta > 0 ? '+' : ''}${delta} flagged rows versus saved mapping. Nothing applied.` : 'Raw samples are bounded; issue counts cover all parsed rows.';
    $('reviewSheets').innerHTML = report.sheets.map((sheet) => {
      const issues = [sheet.flaggedRows ? `${sheet.flaggedRows} row/header mismatches` : '', sheet.missingStatus ? 'Missing Status column' : '', !sheet.emailColumn ? 'Missing Email mapping; rows not imported' : '', sheet.hidden ? 'Hidden worksheet' : ''].filter(Boolean);
      const candidates = Object.entries(sheet.review.emailColumns).sort((a,b) => b[1] - a[1]).map(([col,n]) => `${col}: ${n} email-shaped values`).join(' · ') || 'None found';
      const headers = Object.entries(sheet.headers).map(([col,value]) => `<tr><th>${escape(col)}</th><td>${escape(value)}</td></tr>`).join('');
      const samples = sheet.review.samples.map((sample) => `<p class="experiment-sample">Row ${sample.row}${sample.issue ? ` · ${escape(sample.issue)}` : ''}</p><div class="experiment-scroll"><table><thead><tr><th>Column</th><th>Original header</th><th>Original cell value (up to 200 characters)</th></tr></thead><tbody>${Object.entries(sample.cells).map(([col,value]) => `<tr><th>${escape(col)}</th><td>${escape(sheet.headers[col] || '(unlabelled)')}</td><td>${escape(value)}</td></tr>`).join('')}</tbody></table></div>`).join('');
      return `<article class="experiment-sheet"><h3>${escape(sheet.name)}</h3><p>${sheet.rows} parsed rows · Email: ${escape(sheet.emailColumn || 'unmapped')} · Status: ${escape(sheet.statusColumn || 'unmapped')}</p><p class="experiment-issues">${escape(issues.join(' · ') || 'No layout/status issues detected. This is not a full eligibility check.')}</p><p class="hint">Email-column candidates: ${escape(candidates)}</p>${sheet.missingStatus && sheet.review.unusedStatusColumn ? `<p class="hint">Unused column for a new Status header: ${escape(sheet.review.unusedStatusColumn)}</p>` : ''}<details><summary>Original headers</summary><div class="experiment-scroll"><table><thead><tr><th>Column</th><th>Header</th></tr></thead><tbody>${headers}</tbody></table></div></details><details><summary>Sample source rows</summary>${samples || '<p class="hint">No source rows available.</p>'}</details></article>`;
    }).join('') || '<p>No worksheets found.</p>';
  }
  async function loadSaved() {
    const report = await request('/api/experiment/import-review', { campaignId: $('reviewCampaign').value });
    reviewedCampaign = report.campaignId; saved = report.mapping; baseline = report.summary;
    $('reviewMapping').value = JSON.stringify(saved, null, 2); $('reviewStatusColumns').value = '{}'; render(report);
    workspaceOffset = 0; await loadWorkspace();
  }
  $('reviewLoad').onclick = () => run($('reviewLoad'), loadSaved);
  $('reviewReset').onclick = () => run($('reviewReset'), loadSaved);
  $('reviewPreview').onclick = () => run($('reviewPreview'), async () => {
    const mapping = JSON.parse($('reviewMapping').value);
    render(await request('/api/experiment/import-review', { campaignId: reviewedCampaign, mapping, addStatusColumns: JSON.parse($('reviewStatusColumns').value) }));
  });
  $('reviewCampaign').onchange = () => {
    saved = null; baseline = null; reviewedCampaign = null; previewId = null; workspace = null;
    workspaceOffset = 0; $('workspaceSearch').value = ''; $('repairSource').value = ''; $('repairAcquired').value = ''; $('repairPermission').value = 'unknown'; $('repairConfirm').checked = false;
    $('reviewResults').hidden = true; $('reviewError').hidden = true; $('repairPanel').hidden = true; $('workspacePanel').hidden = true;
    $('reviewStatus').textContent = 'Choose Review saved mapping to inspect this campaign.'; controls();
    if ($('reviewCampaign').value) run($('workspaceRefresh'), loadWorkspace);
  };
  function invalidate() {
    previewId = null; $('repairConfirm').checked = false;
    $('repairPreviewNote').textContent = 'Proposal changed. Preview again before saving.'; controls();
  }
  $('reviewMapping').oninput = invalidate; $('reviewStatusColumns').oninput = invalidate;
  $('repairSource').oninput = controls; $('repairConfirm').onchange = controls;
  async function loadWorkspace() {
    const campaignId = $('reviewCampaign').value;
    if (!campaignId) return;
    const query = new URLSearchParams({ campaignId, offset: workspaceOffset, q: $('workspaceSearch').value });
    workspace = await request('/api/experiment/imports?' + query);
    $('workspacePanel').hidden = false;
    $('workspaceNote').textContent = !workspace.activeRevision ? 'No experiment revisions yet. Preview a mapping, enter its source details and save a revision.' : workspace.sourceUnavailable ? 'Source workbook is unavailable. Your saved experiment revision is retained.' : workspace.sourceChanged ? 'Source workbook changed since this revision. Review the source again before a new repair.' : 'Saved in the separate experiment workspace. Original campaign files are unchanged.';
    const selected = $('workspaceRevision').value;
    $('workspaceRevision').innerHTML = workspace.revisions.map((r) => `<option value="${escape(r.revisionId)}">${escape(new Date(r.importedAt).toLocaleString())} · ${escape(r.sourceLabel)}${r.revisionId === workspace.activeRevision ? ' · active' : ''}</option>`).join('');
    if (workspace.revisions.some((r) => r.revisionId === selected)) $('workspaceRevision').value = selected;
    else if (workspace.activeRevision) $('workspaceRevision').value = workspace.activeRevision;
    downloadLinks();
    const summary = workspace.identitySummary;
    $('workspaceIdentity').textContent = summary ? `${summary.carriers} recorded identities · ${summary.sourceDotCarriers} grouped by source USDOT · ${summary.provisionalRows} provisional rows · ${summary.conflictRows} identifier conflicts · ${summary.layoutRows} layout-review rows · ${summary.protectedRows} protected rows` : '';
    $('workspaceRows').innerHTML = workspace.records.map((r) => `<tr><td>${escape(r.company)}<br>${escape(r.email)}</td><td>${escape(r.identityStatus)}<br>USDOT: ${escape(r.dot || 'unresolved')}<br><code>${escape(r.carrierId)}</code></td><td>${escape(r.provenance.sourceLabel)}<br>${escape(r.provenance.sheet)} · row ${r.provenance.row}<br>Acquired: ${escape(r.provenance.acquiredAt || 'unknown')}<br>Permission: ${escape(r.provenance.permission)}<br>Import: <code>${escape(r.provenance.importId)}</code></td><td>${escape(r.protection.join('; ') || 'No prior-contact marker captured. This is not permission to send.')}</td></tr>`).join('') || '<tr><td colspan="4">No saved records match this view.</td></tr>';
    $('workspacePage').textContent = `${workspace.total ? workspace.offset + 1 : 0}–${Math.min(workspace.offset + workspace.records.length, workspace.total)} of ${workspace.total} records in the active revision`;
    controls();
  }
  $('repairApply').onclick = () => run($('repairApply'), async () => {
    await request('/api/experiment/import-apply', { previewId, confirmExperiment: $('repairConfirm').checked,
      provenance: { label: $('repairSource').value, acquiredAt: $('repairAcquired').value, permission: $('repairPermission').value } });
    previewId = null; $('repairConfirm').checked = false;
    $('repairPreviewNote').textContent = 'Experiment revision saved. To save another repair, preview again.';
    workspaceOffset = 0; $('workspaceRevision').value = ''; await loadWorkspace();
  });
  $('workspaceRefresh').onclick = () => run($('workspaceRefresh'), loadWorkspace);
  $('workspaceFind').onclick = () => { workspaceOffset = 0; run($('workspaceFind'), loadWorkspace); };
  function downloadLinks() {
    const id = $('workspaceRevision').value;
    $('workspaceDownloads').hidden = !id;
    for (const [element, kind] of [['workspaceWorking', 'working'], ['workspaceOriginal', 'original'], ['workspaceMapping', 'mapping']]) $(element).href = '/api/experiment/import-download?' + new URLSearchParams({ revisionId: id, kind });
  }
  $('workspaceRevision').onchange = () => { controls(); downloadLinks(); };
  $('workspaceDraft').onclick = () => run($('workspaceDraft'), async () => {
    const revision = workspace?.revisions.find((r) => r.revisionId === $('workspaceRevision').value);
    if (!revision) return;
    if (!saved) await loadSaved();
    $('reviewMapping').value = JSON.stringify(revision.mapping, null, 2);
    $('reviewStatusColumns').value = JSON.stringify(revision.addStatusColumns, null, 2);
    $('repairSource').value = revision.sourceLabel; $('repairAcquired').value = revision.acquiredAt || '';
    $('repairPermission').value = revision.permission;
    invalidate(); $('reviewMapping').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('workspaceRestore').onclick = () => {
    if (!confirm('Restore this saved revision in the experiment workspace? All revisions and contact protections will be retained. Original campaign data will stay unchanged.')) return;
    run($('workspaceRestore'), async () => { await request('/api/experiment/import-restore', { revisionId: $('workspaceRevision').value, confirmExperiment: true }); previewId = null; workspaceOffset = 0; await loadWorkspace(); });
  };
  $('workspacePrev').onclick = () => { workspaceOffset = Math.max(0, workspaceOffset - 25); run($('workspacePrev'), loadWorkspace); };
  $('workspaceNext').onclick = () => { workspaceOffset += 25; run($('workspaceNext'), loadWorkspace); };
  request('/api/experiment/campaigns').then(({ campaigns }) => {
    $('reviewCampaign').innerHTML = '<option value="">Choose a campaign…</option>' + campaigns.map((c) => `<option value="${escape(c.id)}" ${c.available || c.hasWorkspace ? '' : 'disabled'}>${escape(c.name)}${c.available ? '' : ' · workbook unavailable'}</option>`).join('');
    $('reviewStatus').textContent = campaigns.length ? 'Select a campaign. Unavailable source files cannot be reviewed; saved experiment revisions remain accessible.' : 'No campaigns found. Import a campaign through the normal app before reviewing an experiment copy.';
    controls();
  }).catch((error) => { $('reviewStatus').textContent = 'Source data could not be loaded.'; $('reviewError').textContent = error.message; $('reviewError').hidden = false; });
})();
