(() => {
  const $ = (id) => document.getElementById(id);
  const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  const production = !!$('view-conversations');
  const route = (url) => production ? url.replace('/api/experiment/reply-detail', '/api/conversation-detail').replace('/api/experiment/replies', '/api/conversations') : url;
  const labels = { unclassified:'Not classified', interested:'Interested', pricing:'Pricing question', how_it_works:'How it works', later:'Later', already_has_dispatcher:'Has dispatcher', wrong_contact:'Wrong contact', not_fit:'Not a fit', opt_out:'Opt-out', out_of_office:'Out of office', automated:'Automated', bounce:'Bounce notice' };
  const options = Object.entries(labels).map(([value,label]) => `<option value="${value}">${label}</option>`).join('');
  $('replyCategory').insertAdjacentHTML('beforeend', options); $('replyReviewCategory').innerHTML = options;
  let busy = false, offset = 0, report = null, selection = null, detail = null, selectedMessage = null, lastLoad = 0, loadSequence = 0;
  const drafts = new Map();let deskBusy=false,pendingOpen=null;
  let captureToolsInitialized = false,detailSequence=0;
  const time = (s) => s ? new Date(s).toLocaleString() : 'unknown';
  async function request(url, data) {
    const response = await fetch(route(url), data === undefined ? {} : { method:'POST', headers:{ 'Content-Type':'application/json', 'X-FC-Request':'1' }, body:JSON.stringify(data) });
    const value = await response.json(); if (!response.ok) throw new Error(value.error || 'Reply action failed.'); return value;
  }
  function error(message) { $('replyError').hidden = !message; $('replyError').textContent = message; }
  const mailroom=production&&$('mailroomWorkspace');
  const friendly=(value)=>({interested:'Interested',positive:'Positive',negative:'Not interested',neutral:'Needs a look',pricing:'Pricing question',how_it_works:'Service question',opt_out:'Opt-out',needs_review:'Needs match',unknown:'Waiting',out_of_office:'Out of office',automated:'Automatic reply',bounce:'Delivery notice',later:'Later'})[value]||value||'Waiting';
  function markSelection(){if(!mailroom)return;document.querySelectorAll('#mailroomList [data-reply]').forEach((b)=>{const active=b.dataset.reply===selection?.id;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});}
  function renderMailroomRows(){
    const focusedRow=document.activeElement?.closest('#mailroomList [data-reply]')?.dataset.reply;
    const compactTime=(value)=>{if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toDateString()===new Date().toDateString()?d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):d.toLocaleDateString([],{month:'short',day:'numeric'});};
    $('mailroomList').innerHTML=report.rows.map((r)=>`<button type="button" title="${escape(r.recipient)}" class="mailroom-card ${r.id===selection?.id?'selected':''}" data-reply="${escape(r.id)}" data-type="${r.type}" aria-pressed="${r.id===selection?.id}"><span class="mailroom-card-top"><strong>${escape(r.contactName||r.company||r.recipient)}</strong><time>${escape(compactTime(r.lastReplyAt||r.at))}</time></span>${r.contactName&&r.company&&r.company!==r.recipient?'<span class="mailroom-card-company">'+escape(r.company)+'</span>':''}${r.contactName||r.company!==r.recipient?'':'<span class="mailroom-card-address">'+escape(r.recipient)+'</span>'}<span class="mailroom-card-subject">${escape(r.subject)}</span><span class="mailroom-card-excerpt">${escape(r.excerpt||'No captured human reply. Check scan coverage.')}</span><span class="mailroom-badge ${r.needsReply||r.intent?.intent==='interested'?'warm':''}">${escape(r.type==='review'?'Needs match':r.needsReply?'Needs reply':r.noReply?'Waiting':friendly(r.intent?.intent))}${r.unread?' · unread':''}</span></button>`).join('')||'<div class="mailroom-list-empty"><strong>No conversations in this queue</strong><p>Try All, change the filters, or scan your previous replies.</p></div>';
    if(focusedRow)Array.from($('mailroomList').querySelectorAll('[data-reply]')).find((b)=>b.dataset.reply===focusedRow)?.focus({preventScroll:true});
    $('mailroomNeedsCount').textContent=report.summary.needsReply;$('mailroomAllCount').textContent=report.summary.conversations+report.summary.needsMatch;$('mailroomWaitingCount').textContent=report.summary.noReply;
    document.querySelectorAll('[data-mailroom-work]').forEach((b)=>b.setAttribute('aria-pressed',String(b.dataset.mailroomWork===$('replyWork').value)));
    $('replyPage').textContent=report.total?`${offset+1}–${Math.min(offset+report.rows.length,report.total)} of ${report.total}`:'0 conversations';
    $('replyStopCapture').hidden=!report.capture.running;
    $('mailroomFilterNote').hidden=!selection||report.rows.some((r)=>r.id===selection.id);$('mailroomFilterNote').textContent='This selected conversation is outside the current filters.';
  }
  function renderMailroomThread(data){
    const c=data.assistant,messages=data.messages,root=data.root,previousOpen=$('mailroomOlder')?.open;
    const stated=c?.fields.contactName;const person=stated?.confirmed?.value||(!stated?.conflict&&stated?.candidates.length===1?stated.candidates[0].value:null)||messages.findLast((m)=>m.direction==='inbound')?.senderName||root?.company||root?.recipient;
    const initials=(name)=>String(name||'?').split(/\s+/).slice(0,2).map((s)=>s[0]).join('').toUpperCase();
    const message=(m)=>{const own=m.direction==='outbound',name=own?'You':m.senderName||person||m.from[0]||'Unknown sender';return `<article class="mailroom-message ${own?'outbound':''}"><header class="mailroom-message-heading"><span class="profile-avatar mailroom-avatar">${escape(initials(name))}</span><div class="mailroom-sender"><strong>${escape(name)}</strong><span>${escape(m.from.join(', '))}</span></div><time title="${m.date?'Sender-reported date':'Capture time'}">${escape(time(m.date||m.capturedAt))}</time></header>${!own?`<span class="mailroom-badge ${c?.intent?.sentiment==='positive'?'warm':''}">${escape(friendly(c?.intent?.intent||m.category))} · ${m.classificationSource==='manual'?'reviewed':'suggested'}</span>`:''}<pre>${escape(m.bodyUnavailable?'Body unavailable. Inspect the original mailbox before responding.':m.text||'No new text was extracted. Inspect the original email for full context.')}</pre><details class="mailroom-message-evidence"><summary>Message details</summary><p>To ${escape(m.to?.join(', ')||m.account)} · ${escape(m.match)} · ${escape(m.source.type)}${m.source.folder?' / '+escape(m.source.folder):''} · captured ${escape(time(m.capturedAt))}</p><pre>${escape(m.messageId||'(No Message-ID)')}\n${escape(m.references.join('\n'))}</pre><button class="secondary" data-review-message="${m.id}">Review message</button></details></article>`;};
    let focus=messages.findIndex((m)=>m.id===c?.lastMessageId);if(focus<0)focus=Math.max(0,messages.length-1);
    const earlier=messages.slice(0,focus),latest=messages.slice(focus);
    const original=root?`<article class="mailroom-message outbound"><strong>Original email · sent by this tool</strong><p class="hint">${escape(root.account)} → ${escape(root.recipient)} · ${escape(time(root.sentAt))}</p><pre>${escape(root.bodyUnavailable?'The original body is not retained here. Confirmed tracking history anchors this send; inspect its mailbox copy.':root.body||'(Original body not retained)')}</pre></article>`:'';
    $('replyThread').innerHTML=latest.map(message).join('')+(!latest.length&&root?'<p class="hint mailroom-waiting-note">No captured carrier reply on this thread. Check the scan coverage before following up.</p>':'');
    $('mailroomThreadHistory').innerHTML=original+messages.map(message).join('');
    $('mailroomHold').hidden=!c?.hold;$('mailroomHold').textContent=c?.hold?'Contact held · '+c.hold:'';$('mailroomResolve').hidden=Boolean(root);
    const inbound=messages.filter((m)=>m.direction==='inbound'&&m.kind==='human'&&!['review','ignored'].includes(m.match));
    $('mailroomReplyHistory').textContent=`${inbound.length} matched human ${inbound.length===1?'reply':'replies'} · ${root?.account||messages[0]?.account||''}. Header dates are sender-reported. Quoted text may be omitted; inspect the original mailbox for complete context.`;
    markSelection();
  }
  function controls() {
    const blocked=busy||deskBusy;
    for (const id of ['replyHistory','replyDemo','replyImport','replyRefresh','replyThreadRefresh','replyReviewSave','replyBackfill','replyIgnore','replyUnignore']) $(id).disabled = blocked;
    $('replyReviewSave').disabled = blocked || !selectedMessage || detail?.messages.find((m) => m.id === selectedMessage)?.match === 'ignored';
    $('replyScan').disabled = blocked || !report?.capture.enabled || report.capture.running;
    $('replyBackfill').disabled = blocked || report?.capture.running;
    for (const id of ['replyReviewCategory','replyReviewNote','replyLink','replyLinkConfirm']) $(id).disabled = blocked;
    for (const id of ['replyMode','replyMailbox','replyCategory','replySearch',...(production?['replyWork']:[])]) $(id).disabled = blocked;
    document.querySelectorAll('[data-reply], [data-review-message], [data-mailroom-work]').forEach((button) => { button.disabled = blocked; });
    $('replyPrev').disabled = blocked || offset === 0; $('replyNext').disabled = blocked || offset + 25 >= (report?.total || 0);
  }
  async function action(button, fn) {
    if (busy||deskBusy) return;
    busy = true; const text = button.textContent,queueButton=button.hasAttribute('data-mailroom-work');button.setAttribute('aria-busy','true');if(!queueButton)button.textContent = 'Working…'; controls(); error('');
    $('replyStatus').textContent = 'Processing reply evidence…';
    try { const note = await fn(); await load(); $('replyStatus').textContent = note || 'Reply action complete. No email was sent.'; }
    catch (e) { error(e.message); $('replyStatus').textContent = 'Needs attention. Your review draft/file selection is retained.'; }
    finally { busy = false;button.removeAttribute('aria-busy');if(!queueButton)button.textContent = text; controls(); if(pendingOpen&&!deskBusy){const next=pendingOpen;pendingOpen=null;window.dispatchEvent(new CustomEvent("fc-open-conversation",{detail:next}));} }
  }
  function syncSelect(id, entries) {
    const value = $(id).value;
    $(id).innerHTML = (id === 'replyMailbox' ? '<option value="">All mailboxes</option>' : '<option value="">Choose a mailbox…</option>') + entries.map((a) => `<option value="${escape(a.email)}">${escape(a.email)}${a.demo ? ' · sample' : ''}</option>`).join('');
    if (entries.some((a) => a.email === value) || !value) $(id).value = value;
  }
  async function load() {
    const sequence = ++loadSequence;
    const params = new URLSearchParams({ mode:$('replyMode').value, mailbox:$('replyMailbox').value, category:$('replyCategory').value, q:$('replySearch').value, work:production?$('replyWork').value:'all', offset });
    const value = await request('/api/experiment/replies?' + params); if (sequence !== loadSequence) return;
    report = value; offset = report.offset; lastLoad = Date.now();
    syncSelect('replyMailbox', report.accounts.filter((a) => a.demo === ($('replyMode').value === 'demo')));
    syncSelect('replyImportAccount', report.accounts);
    const metrics = production ? [['Contacts who replied','respondedContacts'],['Captured human replies','humanMessages'],['Needs my reply','needsReply'],['Needs conversation match','needsMatch']] : [['Human reply candidates','humanMessages'],['Needs conversation match','needsMatch'],['Automatic replies','automatedMessages'],['Bounce notices','bounceNotices'],['Protected opt-out contacts','protectedContacts']];
    $('replyMetrics').innerHTML = metrics.map(([label,key]) => `<div class="experiment-metric"><span>${label}</span><strong>${report.summary[key]}</strong></div>`).join('');
    $('replyMetricNote').textContent = report.note;
    $('replyProtection').hidden = !report.protectionNote; $('replyProtection').textContent = report.protectionNote || '';
    $('replyCoverage').textContent = `${report.coverage.rootsWithMessageIds} of ${report.coverage.roots} loaded source conversations have outbound Message-IDs. Missing IDs need Sent reconciliation or explicit manual review.`;
    const capture = report.capture;
    if(production){const scan=capture.historyScan;$('replyScanProgress').textContent=capture.running?`${scan?.status==='Running'?'Historical scan':'Mailbox sync'} in progress${scan?.currentFolder?' · '+scan.currentMailbox+' / '+scan.currentFolder:''}${scan?.scanned?' · '+scan.scanned+' message checks':''}${capture.progress&&scan?.status==='Running'?' · activity '+time(capture.progress.at):''}. You can stop and resume safely.`:scan?`Last historical scan: ${scan.status} · ${scan.scanned||0} message checks. ${scan.status==='Complete'?'Available folders checked; uncertain matches remain in review.':'Run the scan again to resume saved progress.'}`:capture.enabled?'Scan all previous replies to tool-sent emails, including available archived messages.':'Configure authorized read-only capture to scan. Imported contacts alone do not qualify.';}

    if (production) { if(!captureToolsInitialized){$('replyCaptureTools').open=(report.summary.humanMessages+report.summary.automatedMessages+report.summary.bounceNotices+report.summary.needsMatch)===0;captureToolsInitialized=true;} $('replyCaptureSummary').textContent='Capture & mailbox setup · ' + (capture.configurationError || capture.captureError || capture.mailboxes.some((m)=>m.status==='Needs attention') ? 'Needs attention' : capture.running ? 'Checking mailboxes…' : capture.enabled ? 'Live capture enabled' : 'Live capture off'); window.dispatchEvent(new CustomEvent('fc-capture-status', { detail:capture })); $('replyProtectionDelivery').textContent = `${capture.protectionHealth}. ${capture.sharedProtection.enabled ? 'Coordinator protection updates pending: ' + capture.sharedProtection.pending + '. Shared sending protections are checked before each send.' : 'Independent PC: captured opt-outs protect this PC. Other PCs need the shared coordinator.'}`; }
    $('replyCaptureNote').textContent = capture.configurationError || `${capture.enabled ? 'Live read-only capture enabled' : 'Live capture off'} · ${capture.auto ? 'Automatic checks enabled' : 'Manual checks only'}${capture.running ? ' · Checking mailboxes…' : ''}${capture.since ? ` · Initial backfill since ${capture.since} · ${capture.allFolders?'All available response folders':'Inbox and Sent folders'}` : ''}. ${production ? 'EML imports do not connect to a provider.' : 'Samples and EML imports do not connect to a provider.'}`;
    $('replyMonitor').innerHTML = (capture.captureError ? `<div class="reply-monitor">${escape(capture.captureError.message)}</div>` : '') + capture.mailboxes.map((m) => `<div class="reply-monitor"><strong>${escape(m.email)} · ${escape(m.status)}</strong><p class="hint">Credentials: ${m.credentialsConfigured ? 'configured' : 'missing'} · Last successful check: ${escape(time(m.checkedAt))} · Next eligible check: ${escape(time(m.nextAt))}</p>${m.message ? `<p>${escape(m.message)}</p>` : ''}${(m.folders || []).map((f) => `<p class="hint">${escape(f.folder)} · ${f.processed} scanned this check${f.error?' · Folder failed; incomplete coverage':''} · ${f.more ? 'Backfill incomplete; more messages remain' : 'Current search page completed'} · UID ${f.lastUid}</p>`).join('')}</div>`).join('');
    if(mailroom)renderMailroomRows();else {
    $('replyRows').innerHTML = report.rows.map((r) => `<tr><td>${r.company&&r.company!==r.recipient?'<strong>'+escape(r.company)+'</strong><br>':''}${escape(r.recipient)}</td><td>${escape(r.subject)}<br>${escape(r.account)}${production&&r.excerpt?'<p class="hint">'+escape(r.excerpt.slice(0,130))+'</p>':''}</td><td>${production?`<strong>${escape(r.intent?.intent||'unknown')}</strong><br>${r.unread?'New / unread · ':''}${r.needsReply?'Needs your reply':r.repliedElsewhere?'Replied in another thread':r.noReply?'No captured reply':''}<br>${escape(r.draftStatus||'')}`:`${r.classificationSource==='manual'?'Reviewed':'Suggested'}: ${escape(labels[r.category]||r.category)}`}</td><td>${production?(r.responded?`<strong>${r.replyCount} human ${r.replyCount===1?'reply':'replies'}</strong><br>First: ${escape(time(r.firstReplyAt))}<br>Latest: ${escape(time(r.lastReplyAt))}`:r.type==='review'?'Needs matching review<br>'+escape(r.reason):'No matched human reply'):`${escape(r.match)}${r.paused?'<br>Experiment follow-up paused':''}<br>${r.count} captured message(s)`}</td><td><button class="secondary" data-reply="${escape(r.id)}" data-type="${r.type}">View</button></td></tr>`).join('') || (production?'<tr><td colspan="5">No matching replies yet. Run the historical scan, or choose All tool-sent conversations to see emails awaiting a captured response.</td></tr>':'<tr><td colspan="5">No captured conversations match. Load samples, import EML, or configure read-only capture.</td></tr>');
    $('replyPage').textContent = `${report.total ? offset + 1 : 0}–${Math.min(offset + report.rows.length, report.total)} of ${report.total} matching conversations/review items`;
    }
    controls();
    if(mailroom&&!selection&&report.rows.length&&location.hash==='#conversations'&&!busy&&!deskBusy){selection={id:report.rows[0].id,type:report.rows[0].type};await loadDetail(false);}
    const selectedRow=production&&selection&&report.rows.find((r)=>r.id===selection.id);
    if(!deskBusy&&selectedRow&&detail&& !$('replyInspector').hidden&&(selectedRow.count!==detail.messages.length||(selectedRow.sourceMessageId&&!detail.messages.some((m)=>m.id===selectedRow.sourceMessageId))))await loadDetail();
  }
  if(mailroom)window.addEventListener('fc-conversation-detail',(event)=>{const data=event.detail;if(selection&&(data.root?.id===selection.id||data.messages.some((m)=>m.id===selection.id))){detail=data;renderMailroomThread(data);}});
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
    const sequence=++detailSequence,target={...selection};if(mailroom){$('mailroomWorkspace').dataset.threadOpen='true';$('mailroomEmpty').hidden=true;$('mailroomLoading').hidden=false;}
    let next;try{next=await request('/api/experiment/reply-detail?'+new URLSearchParams(target));}finally{if(mailroom&&sequence===detailSequence)$('mailroomLoading').hidden=true;}
    if(sequence!==detailSequence||selection?.id!==target.id||selection?.type!==target.type)return;
    const sameThread=detail?.root?.id===next.root?.id&&detail?.messages?.[0]?.id===next.messages?.[0]?.id;detail=next;
    $('replyInspector').hidden = false; $('replyThreadTitle').textContent = detail.messages.findLast((m)=>m.direction==='inbound')?.subject || detail.root?.subject || 'Message needs a conversation match';
    if(mailroom){renderMailroomThread(detail);if(!sameThread)$('replyInspector').scrollTop=0;}else {
    const initial = detail.root ? `<article class="reply-message outbound"><h3>${detail.root.source==='carrier_inbound'?'Carrier-started conversation · reviewed sender':'Original send · source history'}</h3><p class="hint">${escape(detail.root.account)} → ${escape(detail.root.recipient)} · ${escape(time(detail.root.sentAt))}</p><p class="hint">${detail.root.carrierId ? 'Source carrier ID: ' + escape(detail.root.carrierId) : 'Carrier identity unresolved / not linked'} · ${detail.root.demo ? 'Sample data' : escape(detail.root.campaignName)}</p><pre>${escape(detail.root.bodyUnavailable?'Original body is not retained here. This send is anchored by confirmed tool tracking history; inspect its original mailbox copy.':detail.root.body)}</pre>${detail.root.bodyTruncated ? '<p class="hint">Source body truncated for this view.</p>' : ''}</article>` : '';
    $('replyThread').innerHTML = initial + detail.messages.map((m) => `<article class="reply-message ${m.direction === 'outbound' ? 'outbound' : ''}"><h3>${escape(m.from.join(', ') || 'Unknown sender')} · ${escape(m.kind)}</h3><p class="hint">${escape(m.subject)} · ${escape(m.match)} · ${escape(m.classificationSource === 'manual' ? 'Reviewed' : 'Suggested')}: ${escape(labels[m.category])}</p><p class="hint">Header date: ${escape(time(m.date))} · Captured: ${escape(time(m.capturedAt))} · ${escape(m.source.type)}${m.source.folder ? ' / ' + escape(m.source.folder) + ' / UID ' + m.source.uid : ''}</p><pre>${escape(m.bodyUnavailable ? 'Body unavailable. Inspect the original mailbox before linking or classifying.' : m.text || '(No new text extracted; inspect the original message.)')}</pre>${m.textTruncated ? '<p class="hint">New-text view truncated at 24,000 characters.</p>' : ''}<details><summary>Message reference evidence</summary><pre>${escape(m.messageId || '(No Message-ID)')}\n${escape(m.references.join('\n'))}</pre></details><button class="secondary" data-review-message="${m.id}">Review message</button></article>`).join('');
    }
    if(production) window.dispatchEvent(new CustomEvent('fc-conversation-detail',{detail}));
    if(detail.messages.length) selectReview(detail.messages.some((m) => m.id === selectedMessage) ? selectedMessage : detail.messages.at(-1).id);else { selectedMessage=null;$('replyReviewPanel').hidden=true;controls(); }
  }
  $(mailroom?'mailroomList':'replyRows').onclick = (event) => { if(deskBusy)return; const button = event.target.closest('[data-reply]'); if (!button) return; rememberDraft(); selectedMessage = null; $('replyInspector').hidden = true; $('replyReviewPanel').hidden = true; selection = { id:button.dataset.reply, type:button.dataset.type }; action(button, () => loadDetail(false)); };
  const reviewMessageClick = (event) => { const button = event.target.closest('[data-review-message]'); if (button) { selectReview(button.dataset.reviewMessage); if(mailroom){if(!$('mailroomDetailsDialog').open)$('mailroomDetailsDialog').showModal();$('replyReviewNote').focus();}else $('replyReviewPanel').scrollIntoView({ behavior:'smooth', block:'center' }); } };
  $('replyThread').onclick=reviewMessageClick;if(mailroom)$('mailroomThreadHistory').onclick=reviewMessageClick;
  $('replyClose').onclick = () => { rememberDraft();$('replyInspector').hidden=true;if(mailroom){$('mailroomWorkspace').dataset.threadOpen='false';$('mailroomEmpty').hidden=false;}};
  $('replyThreadRefresh').onclick = () => action($('replyThreadRefresh'), () => loadDetail());
  $('replyReviewSave').onclick = () => action($('replyReviewSave'), async () => {
    await request('/api/experiment/replies/review', { messageId:selectedMessage, expectedReview:detail.messages.find((m)=>m.id===selectedMessage)?.reviewVersion, category:$('replyReviewCategory').value, note:$('replyReviewNote').value, rootId:$('replyLink').value, confirmLink:$('replyLinkConfirm').checked });
    drafts.delete(selectedMessage); await loadDetail(false); return 'Reply review saved. Captured opt-outs protect normal outreach. No message was sent.';
  });
  for (const [id, method] of [['replyIgnore','ignore'],['replyUnignore','restore']]) $(id).onclick = () => action($(id), async () => {
    await request('/api/experiment/replies/review', { messageId:selectedMessage, expectedReview:detail.messages.find((m)=>m.id===selectedMessage)?.reviewVersion, action:method, note:$('replyReviewNote').value });
    drafts.delete(selectedMessage); await loadDetail(false); return method === 'ignore' ? 'Review item ignored with history/protections retained.' : 'Item returned to the matching review queue.';
  });
  $('replyHistory').onclick = () => action($('replyHistory'), async () => { const r = await request('/api/experiment/replies/history', {}); return `Loaded ${r.roots} source conversations; ${r.withMessageIds} currently have Message-IDs in source history.`; });
  $('replyDemo').onclick = () => action($('replyDemo'), async () => { await request('/api/experiment/replies/demo', {}); $('replyMode').value = 'demo'; $('replyMailbox').value = ''; $('replyCategory').value = ''; $('replySearch').value = ''; offset = 0; return 'Sample inbox loaded. No real email was sent or fetched.'; });
  $('replyScan').onclick = () => action($('replyScan'), async () => { await request('/api/experiment/replies/scan', {}); $('replyMode').value = 'real'; $('replyMailbox').value = ''; $('replyCategory').value = ''; $('replySearch').value = ''; offset = 0; return 'Historical scan started. All available pages are checked; monitor progress and partial errors above.'; });
  $('replyBackfill').onclick = () => action($('replyBackfill'), async () => { await request('/api/experiment/replies/backfill', {}); return 'Reply cursors reset. Existing messages/reviews/protections retained; the next enabled check rescans the configured lookback.'; });
  $('replyImport').onclick = () => action($('replyImport'), async () => {
    const file = $('replyEml').files[0], mailbox = $('replyImportAccount').value;
    if (!file || !mailbox) throw new Error('Choose a mailbox and EML file.');
    if (file.size > 2_000_000) throw new Error('Use an EML file up to 2 MB.');
    const response = await fetch(route('/api/experiment/replies/import') + '?' + new URLSearchParams({ mailbox }), { method:'POST', headers:{ 'X-FC-Request':'1', 'Content-Type':'message/rfc822' }, body:file });
    const r = await response.json(); if (!response.ok) throw new Error(r.error);
    $('replyMode').value = mailbox === 'demo.dispatch@example.invalid' ? 'demo' : 'real'; $('replyMailbox').value = ''; $('replyCategory').value = ''; $('replySearch').value = ''; offset = 0;
    return r.ignored ? 'No known contact/reference matched. Message was not retained.' : r.duplicate ? 'This message was already captured; no duplicate added.' : 'EML evidence imported. Inspect its match and suggested category.';
  });
  $('replyRefresh').onclick = () => action($('replyRefresh'), async () => {});
  for (const id of ['replyMode','replyMailbox','replyCategory',...(production?['replyWork']:[])]) $(id).onchange = () => { if (id === 'replyMode') $('replyMailbox').value = ''; offset = 0; action($('replyRefresh'), async () => {}); };
  if(mailroom){let searchTimer;$('replySearch').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{offset=0;void load().catch((e)=>error(e.message));},300);};document.querySelectorAll('[data-mailroom-work]').forEach((b)=>{b.onclick=()=>{$('replyWork').value=b.dataset.mailroomWork;offset=0;void action(b,async()=>{});};});}
  $('replySearch').onkeydown = (e) => { if (e.key === 'Enter') { offset = 0; $('replyRefresh').click(); } };
  $('replyPrev').onclick = () => { offset = Math.max(0,offset - 25); action($('replyPrev'), async () => {}); };
  $('replyNext').onclick = () => { offset += 25; action($('replyNext'), async () => {}); };
  if (production) window.addEventListener('fc-open-conversation',(event)=>{if(busy||deskBusy){pendingOpen=event.detail;return;}rememberDraft();selection=event.detail;selectedMessage=null;$('replyInspector').hidden=true;void action($('replyRefresh'),()=>loadDetail(false));});
  if(production)window.addEventListener('fc-reply-desk-busy',(event)=>{deskBusy=event.detail===true;controls();if(!deskBusy){if(pendingOpen){const next=pendingOpen;pendingOpen=null;window.dispatchEvent(new CustomEvent('fc-open-conversation',{detail:next}));}else void load().catch((e)=>error(e.message));}});
  if (production) window.addEventListener('fc-conversation-search', (event) => { $('replySearch').value=event.detail;offset=0;void load().catch((e)=>error(e.message)); });
  if (production) window.addEventListener('fc-conversation-view', () => { if(!busy&&!deskBusy) void request('/api/experiment/replies/history',{}).then(load).catch((e)=>error(e.message)); });
  load().then(() => { $('replyStatus').textContent = production ? 'Ready. Import a reply or configure authorized read-only capture.' : 'Ready. Choose samples, an EML import, or explicitly enabled live capture.'; }).catch((e) => error(e.message));
  setInterval(() => { if (!document.hidden && (!production || location.hash==='#conversations') && !busy && (report?.capture.running || Date.now() - lastLoad >= 15000)) void load().catch((e) => error(e.message)); }, 1500);
})();
