(() => {
  const $ = (id) => document.getElementById(id);
  const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let busy = false, saved = null, baseline = null, reviewedCampaign = null;
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
  }
  async function run(button, fn) {
    if (busy) return;
    busy = true; const label = button.textContent;
    button.textContent = 'Reviewing…'; $('reviewError').hidden = true;
    $('reviewStatus').textContent = 'Reading the workbook and checking columns…'; controls();
    try { await fn(); $('reviewStatus').textContent = 'Review complete. Source files and sending settings are unchanged.'; }
    catch (error) { $('reviewError').textContent = error.message; $('reviewError').hidden = false; $('reviewStatus').textContent = 'Review needs attention. Your mapping draft is retained.'; }
    finally { busy = false; button.textContent = label; controls(); }
  }
  function render(report) {
    $('reviewResults').hidden = false;
    $('reviewHeading').textContent = report.mode === 'preview' ? 'Proposed mapping · preview only' : 'Saved mapping · review only';
    $('reviewBasis').textContent = report.basis;
    const metrics = [['Parsed rows', 'rows'], ['Rows with layout issues', 'flaggedRows'], ['Sheets without status', 'missingStatusSheets'], ['Invalid / missing email', 'invalidEmailRows'], ['Extra rows sharing email', 'duplicateEmailRows']];
    $('reviewMetrics').innerHTML = metrics.map(([label, key]) => `<div class="experiment-metric"><span>${escape(label)}</span><strong>${report.summary[key].toLocaleString()}</strong></div>`).join('');
    const delta = report.summary.flaggedRows - baseline.flaggedRows;
    $('reviewChange').textContent = report.mode === 'preview' ? `${delta > 0 ? '+' : ''}${delta} flagged rows versus saved mapping. Nothing applied.` : 'Raw samples are bounded; issue counts cover all parsed rows.';
    $('reviewSheets').innerHTML = report.sheets.map((sheet) => {
      const issues = [sheet.flaggedRows ? `${sheet.flaggedRows} row/header mismatches` : '', sheet.missingStatus ? 'Missing Status column' : '', !sheet.emailColumn ? 'Missing Email mapping; rows not imported' : '', sheet.hidden ? 'Hidden worksheet' : ''].filter(Boolean);
      const candidates = Object.entries(sheet.review.emailColumns).sort((a,b) => b[1] - a[1]).map(([col,n]) => `${col}: ${n} email-shaped values`).join(' · ') || 'None found';
      const headers = Object.entries(sheet.headers).map(([col,value]) => `<tr><th>${escape(col)}</th><td>${escape(value)}</td></tr>`).join('');
      const samples = sheet.review.samples.map((sample) => `<p class="experiment-sample">Row ${sample.row}${sample.issue ? ` · ${escape(sample.issue)}` : ''}</p><div class="experiment-scroll"><table><thead><tr><th>Column</th><th>Original header</th><th>Original cell value (up to 200 characters)</th></tr></thead><tbody>${Object.entries(sample.cells).map(([col,value]) => `<tr><th>${escape(col)}</th><td>${escape(sheet.headers[col] || '(unlabelled)')}</td><td>${escape(value)}</td></tr>`).join('')}</tbody></table></div>`).join('');
      return `<article class="experiment-sheet"><h3>${escape(sheet.name)}</h3><p>${sheet.rows} parsed rows · Email: ${escape(sheet.emailColumn || 'unmapped')} · Status: ${escape(sheet.statusColumn || 'unmapped')}</p><p class="experiment-issues">${escape(issues.join(' · ') || 'No layout/status issues detected. This is not a full eligibility check.')}</p><p class="hint">Email-column candidates: ${escape(candidates)}</p><details><summary>Original headers</summary><div class="experiment-scroll"><table><thead><tr><th>Column</th><th>Header</th></tr></thead><tbody>${headers}</tbody></table></div></details><details><summary>Sample source rows</summary>${samples || '<p class="hint">No source rows available.</p>'}</details></article>`;
    }).join('') || '<p>No worksheets found.</p>';
  }
  async function loadSaved() {
    const report = await request('/api/experiment/import-review', { campaignId: $('reviewCampaign').value });
    reviewedCampaign = report.campaignId; saved = report.mapping; baseline = report.summary;
    $('reviewMapping').value = JSON.stringify(saved, null, 2); render(report);
  }
  $('reviewLoad').onclick = () => run($('reviewLoad'), loadSaved);
  $('reviewReset').onclick = () => run($('reviewReset'), loadSaved);
  $('reviewPreview').onclick = () => run($('reviewPreview'), async () => {
    const mapping = JSON.parse($('reviewMapping').value);
    render(await request('/api/experiment/import-review', { campaignId: reviewedCampaign, mapping }));
  });
  $('reviewCampaign').onchange = () => {
    saved = null; baseline = null; reviewedCampaign = null;
    $('reviewResults').hidden = true; $('reviewError').hidden = true;
    $('reviewStatus').textContent = 'Choose Review saved mapping to inspect this campaign.'; controls();
  };
  request('/api/experiment/campaigns').then(({ campaigns }) => {
    $('reviewCampaign').innerHTML = '<option value="">Choose a campaign…</option>' + campaigns.map((c) => `<option value="${escape(c.id)}" ${c.available ? '' : 'disabled'}>${escape(c.name)}${c.available ? '' : ' · workbook unavailable'}</option>`).join('');
    $('reviewStatus').textContent = campaigns.length ? 'Select a campaign. Unavailable workbook files cannot be reviewed.' : 'No campaigns found. This preview reads existing imports; it does not import or save files.';
    controls();
  }).catch((error) => { $('reviewStatus').textContent = 'Source data could not be loaded.'; $('reviewError').textContent = error.message; $('reviewError').hidden = false; });
})();
