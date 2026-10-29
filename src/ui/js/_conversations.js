(() => {
  const $ = (id) => document.getElementById(id);
  const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  const labels = { unclassified:'Not classified', interested:'Interested', pricing:'Pricing question', how_it_works:'How it works', later:'Later', already_has_dispatcher:'Has dispatcher', wrong_contact:'Wrong contact', not_fit:'Not a fit', opt_out:'Opt-out', out_of_office:'Out of office', automated:'Automated', bounce:'Bounce notice' };
  const options = Object.entries(labels).map(([value,label]) => `<option value="${value}">${label}</option>`).join('');
  $('replyCategory').insertAdjacentHTML('beforeend', options); $('replyReviewCategory').innerHTML = options;
  let busy = false, offset = 0, report = null, selection = null, detail = null, selectedMessage = null, lastLoad = 0, loadSequence = 0;
  const drafts = new Map();
  const time = (s) => s ? new Date(s).toLocaleString() : 'unknown';
  async function request(url, data) {
    const response = await fetch(url, data === undefined ? {} : { method:'POST', headers:{ 'Content-Type':'application/json', 'X-FC-Request':'1' }, body:JSON.stringify(data) });
    const value = await response.json(); if (!response.ok) throw new Error(value.error || 'Reply action failed.'); return value;
  }
  function error(message) { $('replyError').hidden = !message; $('replyError').textContent = message; }
  function controls() {
    for (const id of ['replyHistory','replyDemo','replyImport','replyRefresh','replyThreadRefresh','replyReviewSave','replyBackfill','replyIgnore','replyUnignore']) $(id).disabled = busy;
    $('replyReviewSave').disabled = busy || !selectedMessage || detail?.messages.find((m) => m.id === selectedMessage)?.match === 'ignored';
    $('replyScan').disabled = busy || !report?.capture.enabled || report.capture.running;
    $('replyBackfill').disabled = busy || report?.capture.running;
    for (const id of ['replyReviewCategory','replyReviewNote','replyLink','replyLinkConfirm']) $(id).disabled = busy;
    for (const id of ['replyMode','replyMailbox','replyCategory','replySearch']) $(id).disabled = busy;
    document.querySelectorAll('[data-reply], [data-review-message]').forEach((button) => { button.disabled = busy; });
    $('replyPrev').disabled = busy || offset === 0; $('replyNext').disabled = busy || offset + 25 >= (report?.total || 0);
  }
  async function action(button, fn) {
    if (busy) return;
    busy = true; const text = button.textContent; button.textContent = 'Working…'; controls(); error('');
    $('replyStatus').textContent = 'Processing reply evidence…';
    try { const note = await fn(); await load(); $('replyStatus').textContent = note || 'Reply action complete. No email was sent.'; }
    catch (e) { error(e.message); $('replyStatus').textContent = 'Needs attention. Your review draft/file selection is retained.'; }
    finally { busy = false; button.textContent = text; controls(); }
  }
  function syncSelect(id, entries) {
    const value = $(id).value;
    $(id).innerHTML = (id === 'replyMailbox' ? '<option value="">All mailboxes</option>' : '<option value="">Choose a mailbox…</option>') + entries.map((a) => `<option value="${escape(a.email)}">${escape(a.email)}${a.demo ? ' · sample' : ''}</option>`).join('');
    if (entries.some((a) => a.email === value) || !value) $(id).value = value;
  }
  async function load() {
    const sequence = ++loadSequence;
    const params = new URLSearchParams({ mode:$('replyMode').value, mailbox:$('replyMailbox').value, category:$('replyCategory').value, q:$('replySearch').value, offset });
    const value = await request('/api/experiment/replies?' + params); if (sequence !== loadSequence) return;
    report = value; offset = report.offset; lastLoad = Date.now();
    syncSelect('replyMailbox', report.accounts.filter((a) => a.demo === ($('replyMode').value === 'demo')));
    syncSelect('replyImportAccount', report.accounts);
    const metrics = [['Human reply candidates','humanMessages'],['Needs conversation match','needsMatch'],['Automatic replies','automatedMessages'],['Bounce notices','bounceNotices'],['Protected opt-out contacts','protectedContacts']];
    $('replyMetrics').innerHTML = metrics.map(([label,key]) => `<div class="experiment-metric"><span>${label}</span><strong>${report.summary[key]}</strong></div>`).join('');
    $('replyMetricNote').textContent = report.note;
    $('replyProtection').hidden = !report.protectionNote; $('replyProtection').textContent = report.protectionNote || '';
    $('replyCoverage').textContent = `${report.coverage.rootsWithMessageIds} of ${report.coverage.roots} loaded source conversations have outbound Message-IDs. Missing IDs need Sent reconciliation or explicit manual review.`;
    const capture = report.capture;
    $('replyCaptureNote').textContent = capture.configurationError || `${capture.enabled ? 'Live read-only capture enabled' : 'Live capture off'} · ${capture.auto ? 'Automatic checks enabled' : 'Manual checks only'}${capture.running ? ' · Checking mailboxes…' : ''}${capture.since ? ` · Initial backfill since ${capture.since}` : ''}. Samples and EML imports do not connect to a provider.`;
    $('replyMonitor').innerHTML = (capture.captureError ? `<div class="reply-monitor">${escape(capture.captureError.message)}</div>` : '') + capture.mailboxes.map((m) => `<div class="reply-monitor"><strong>${escape(m.email)} · ${escape(m.status)}</strong><p class="hint">Credentials: ${m.credentialsConfigured ? 'configured' : 'missing'} · Last successful check: ${escape(time(m.checkedAt))} · Next eligible check: ${escape(time(m.nextAt))}</p>${m.message ? `<p>${escape(m.message)}</p>` : ''}${(m.folders || []).map((f) => `<p class="hint">${escape(f.folder)} · ${f.processed} scanned this check · ${f.more ? 'Backfill incomplete; more messages remain' : 'Current search page completed'} · UID ${f.lastUid}</p>`).join('')}</div>`).join('');
    $('replyRows').innerHTML = report.rows.map((r) => `<tr><td>${escape(r.recipient)}</td><td>${escape(r.subject)}<br>${escape(r.account)}<br>${escape(time(r.at))}</td><td>${r.classificationSource === 'manual' ? 'Reviewed' : 'Suggested'}: ${escape(labels[r.category] || r.category)}</td><td>${escape(r.match)}${r.paused ? '<br>Experiment follow-up paused' : ''}${r.reason ? '<br>' + escape(r.reason) : ''}<br>${r.count} captured message(s)</td><td><button class="secondary" data-reply="${escape(r.id)}" data-type="${r.type}">View</button></td></tr>`).join('') || '<tr><td colspan="5">No captured conversations match. Load the sample inbox, import an authorized EML reply, or configure read-only live capture.</td></tr>';
    $('replyPage').textContent = `${report.total ? offset + 1 : 0}–${Math.min(offset + report.rows.length, report.total)} of ${report.total} matching conversations/review items`;
    controls();
  }
  function rememberDraft() { if (selectedMessage) drafts.set(selectedMessage, { category:$('replyReviewCategory').value, note:$('replyReviewNote').value, rootId:$('replyLink').value, confirm:$('replyLinkConfirm').checked }); }
  function selectReview(id) {
    rememberDraft(); selectedMessage = id;
    const message = detail.messages.find((m) => m.id === id), draft = drafts.get(id);
    $('replyReviewPanel').hidden = false; $('replyReviewCategory').value = draft?.category || message.category; $('replyReviewNote').value = draft?.note ?? message.reviewNote;
    $('replyReviewEvidence').textContent = `${message.classificationSource === 'manual' ? 'Manually reviewed' : 'Rule suggestion'} · ${message.reason} · ${message.suggestion.reason}`;
    $('replyMatchPanel').hidden = message.match !== 'review';
    $('replyLink').innerHTML = '<option value="">Select a conversation…</option>' + detail.candidates.map((r) => `<option value="${r.id}">${escape(r.recipient)} · ${escape(r.subject)}</option>`).join('');
    $('replyLink').value = draft?.rootId || ''; $('replyLinkConfirm').checked = draft?.confirm || false;
    $('replyIgnore').hidden = message.match !== 'review'; $('replyUnignore').hidden = message.match !== 'ignored'; controls();
  }
  async function loadDetail(preserve = true) {
    if (preserve) rememberDraft();
    detail = await request('/api/experiment/reply-detail?' + new URLSearchParams(selection));
    $('replyInspector').hidden = false; $('replyThreadTitle').textContent = detail.root?.subject || 'Message needs a conversation match';
    const initial = detail.root ? `<article class="reply-message outbound"><h3>Original send · source history</h3><p class="hint">${escape(detail.root.account)} → ${escape(detail.root.recipient)} · ${escape(time(detail.root.sentAt))}</p><p class="hint">${detail.root.carrierId ? 'Source carrier ID: ' + escape(detail.root.carrierId) : 'Carrier identity unresolved / not linked'} · ${detail.root.demo ? 'Sample data' : escape(detail.root.campaignName)}</p><pre>${escape(detail.root.body)}</pre>${detail.root.bodyTruncated ? '<p class="hint">Source body truncated for this view.</p>' : ''}</article>` : '';
    $('replyThread').innerHTML = initial + detail.messages.map((m) => `<article class="reply-message ${m.direction === 'outbound' ? 'outbound' : ''}"><h3>${escape(m.from.join(', ') || 'Unknown sender')} · ${escape(m.kind)}</h3><p class="hint">${escape(m.subject)} · ${escape(m.match)} · ${escape(m.classificationSource === 'manual' ? 'Reviewed' : 'Suggested')}: ${escape(labels[m.category])}</p><p class="hint">Header date: ${escape(time(m.date))} · Captured: ${escape(time(m.capturedAt))} · ${escape(m.source.type)}${m.source.folder ? ' / ' + escape(m.source.folder) + ' / UID ' + m.source.uid : ''}</p><pre>${escape(m.bodyUnavailable ? 'Body unavailable. Inspect the original mailbox before linking or classifying.' : m.text || '(No new text extracted; inspect the original message.)')}</pre>${m.textTruncated ? '<p class="hint">New-text view truncated at 24,000 characters.</p>' : ''}<details><summary>Message reference evidence</summary><pre>${escape(m.messageId || '(No Message-ID)')}\n${escape(m.references.join('\n'))}</pre></details><button class="secondary" data-review-message="${m.id}">Review message</button></article>`).join('');
    selectReview(detail.messages.some((m) => m.id === selectedMessage) ? selectedMessage : detail.messages.at(-1).id);
  }
  $('replyRows').onclick = (event) => { const button = event.target.closest('[data-reply]'); if (!button) return; rememberDraft(); selectedMessage = null; $('replyInspector').hidden = true; $('replyReviewPanel').hidden = true; selection = { id:button.dataset.reply, type:button.dataset.type }; action(button, () => loadDetail(false)); };
  $('replyThread').onclick = (event) => { const button = event.target.closest('[data-review-message]'); if (button) { selectReview(button.dataset.reviewMessage); $('replyReviewPanel').scrollIntoView({ behavior:'smooth', block:'center' }); } };
  $('replyClose').onclick = () => { rememberDraft(); $('replyInspector').hidden = true; };
  $('replyThreadRefresh').onclick = () => action($('replyThreadRefresh'), () => loadDetail());
  $('replyReviewSave').onclick = () => action($('replyReviewSave'), async () => {
    await request('/api/experiment/replies/review', { messageId:selectedMessage, category:$('replyReviewCategory').value, note:$('replyReviewNote').value, rootId:$('replyLink').value, confirmLink:$('replyLinkConfirm').checked });
    drafts.delete(selectedMessage); await loadDetail(false); return 'Reply review saved. Production sending and suppression are unchanged.';
  });
  for (const [id, method] of [['replyIgnore','ignore'],['replyUnignore','restore']]) $(id).onclick = () => action($(id), async () => {
    await request('/api/experiment/replies/review', { messageId:selectedMessage, action:method, note:$('replyReviewNote').value });
    drafts.delete(selectedMessage); await loadDetail(false); return method === 'ignore' ? 'Review item ignored with history/protections retained.' : 'Item returned to the matching review queue.';
  });
  $('replyHistory').onclick = () => action($('replyHistory'), async () => { const r = await request('/api/experiment/replies/history', {}); return `Loaded ${r.roots} source conversations; ${r.withMessageIds} currently have Message-IDs in source history.`; });
  $('replyDemo').onclick = () => action($('replyDemo'), async () => { await request('/api/experiment/replies/demo', {}); $('replyMode').value = 'demo'; $('replyMailbox').value = ''; $('replyCategory').value = ''; $('replySearch').value = ''; offset = 0; return 'Sample inbox loaded. No real email was sent or fetched.'; });
  $('replyScan').onclick = () => action($('replyScan'), async () => { await request('/api/experiment/replies/scan', {}); $('replyMode').value = 'real'; $('replyMailbox').value = ''; $('replyCategory').value = ''; $('replySearch').value = ''; offset = 0; return 'Read-only capture started. Monitor progress and errors below.'; });
  $('replyBackfill').onclick = () => action($('replyBackfill'), async () => { await request('/api/experiment/replies/backfill', {}); return 'Reply cursors reset. Existing messages/reviews/protections retained; the next enabled check rescans the configured lookback.'; });
  $('replyImport').onclick = () => action($('replyImport'), async () => {
    const file = $('replyEml').files[0], mailbox = $('replyImportAccount').value;
    if (!file || !mailbox) throw new Error('Choose a mailbox and EML file.');
    if (file.size > 2_000_000) throw new Error('Use an EML file up to 2 MB.');
    const response = await fetch('/api/experiment/replies/import?' + new URLSearchParams({ mailbox }), { method:'POST', headers:{ 'X-FC-Request':'1', 'Content-Type':'message/rfc822' }, body:file });
    const r = await response.json(); if (!response.ok) throw new Error(r.error);
    $('replyMode').value = mailbox === 'demo.dispatch@example.invalid' ? 'demo' : 'real'; $('replyMailbox').value = ''; $('replyCategory').value = ''; $('replySearch').value = ''; offset = 0;
    return r.ignored ? 'No known contact/reference matched. Message was not retained.' : r.duplicate ? 'This message was already captured; no duplicate added.' : 'EML evidence imported. Inspect its match and suggested category.';
  });
  $('replyRefresh').onclick = () => action($('replyRefresh'), async () => {});
  for (const id of ['replyMode','replyMailbox','replyCategory']) $(id).onchange = () => { if (id === 'replyMode') $('replyMailbox').value = ''; offset = 0; action($('replyRefresh'), async () => {}); };
  $('replySearch').onkeydown = (e) => { if (e.key === 'Enter') { offset = 0; $('replyRefresh').click(); } };
  $('replyPrev').onclick = () => { offset = Math.max(0,offset - 25); action($('replyPrev'), async () => {}); };
  $('replyNext').onclick = () => { offset += 25; action($('replyNext'), async () => {}); };
  load().then(() => { $('replyStatus').textContent = 'Ready. Choose samples, an EML import, or explicitly enabled live capture.'; }).catch((e) => error(e.message));
  setInterval(() => { if (!document.hidden && !busy && (report?.capture.running || Date.now() - lastLoad >= 15000)) void load().catch((e) => error(e.message)); }, 1500);
})();
