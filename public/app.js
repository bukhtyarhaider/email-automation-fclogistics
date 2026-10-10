const $=id=>document.getElementById(id);
let state, rows=[],offset=0,total=0,previewId=null,selected=new Set(), pending=false;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url,data) {
  const response=await fetch(url,data?{method:'POST',headers:{'Content-Type':'application/json','X-FC-Request':'1'},body:JSON.stringify(data)}:{});
  const result=await response.json();if(!response.ok) throw new Error(result.error||'Request failed.');return result;
}
function notice(text) {$('notice').hidden=!text;$('notice').textContent=text;}
async function action(button,fn) {
  if(pending)return;pending=true;const original=button.textContent;button.disabled=true;button.textContent='Working…';notice('');
  try {await fn();await refresh();await loadLeads();}
  catch(e){notice(e.message);}
  finally{pending=false;button.textContent=original;button.disabled=false;updateControls();}
}
function updateControls() {
  if(!state)return;
  $('prepare').disabled=pending||state.busy||!state.connected||!previewId||!!state.prepared||rows.find(x=>x.id===previewId)?.blocked;
  $('sendOne').disabled=pending||state.busy||!state.prepared||!state.connected||!!state.attempts[state.prepared?.message.to];
  $('release').disabled=pending||state.busy||!state.connected;
  $('batch').disabled=pending||state.busy||!state.connected||!selected.size||!!state.prepared;
  $('stop').hidden=state.job.status!=='Running';
  $('importAttached').disabled=pending||state.busy||!!state.prepared;
  $('connect').disabled=pending||state.busy;
  $('resume').hidden=state.connected||!state.signInOpen;
  $('resume').disabled=pending||state.busy;
  $('disconnect').disabled=pending||state.busy;
  $('disconnect').hidden=!state.connected;
  $('selectedCount').textContent=`${selected.size} selected`;
}
async function refresh() {
  state=await api('/api/state');
  for(const key of ['total','ready','excluded','sent'])$(key).textContent=state.counts[key].toLocaleString();
  $('connection').textContent=state.connected?'Mailbox connected':'Mailbox disconnected';
  $('connection').className=`pill ${state.connected?'good':''}`;
  $('workbookName').textContent=state.workbook?.name||'No workbook imported.';
  const options=JSON.stringify(state.sheets);
  if($('sheet').dataset.options!==options){const v=$('sheet').value;$('sheet').innerHTML='<option value="">All worksheets</option>'+state.sheets.map(s=>`<option value="${escape(s.name)}">${escape(s.name)}${s.hidden?' (hidden)':''}</option>`).join('');$('sheet').value=v;$('sheet').dataset.options=options;}
  if(!$('template').options.length){$('template').innerHTML=Object.entries(state.templates).map(([key,t])=>`<option value="${key}">${escape(t.name)}</option>`).join('');fillTemplate();}
  $('quota').textContent=`${state.remaining} attempts remaining this hour. Maximum 20; one recipient per message.`;
  $('jobStatus').textContent=state.job.status;$('jobMessage').textContent=state.job.message;
  $('progress').max=state.job.total||1;$('progress').value=state.job.current;
  $('events').innerHTML=state.events.slice().reverse().map(e=>`<li><time>${escape(new Date(e.at).toLocaleString(undefined,{timeZone:'Asia/Karachi'}))}</time>${escape(e.message)}</li>`).join('');
  $('suppressionList').innerHTML=Object.entries(state.suppression).map(([e,r])=>`<li>${escape(e)} — ${escape(r)}</li>`).join('');
  $('recovery').innerHTML=Object.entries(state.attempts).filter(([,i])=>i.status==='Uncertain'||i.syncNeeded).map(([email,i])=>`<div class="recovery-item"><strong>${escape(email)}</strong><p>${i.status==='Uncertain'?'Send result uncertain. Check the Sent folder in Chrome. This address remains blocked from automatic retries.':'Send confirmed. Workbook update needs repair.'}</p>${i.status==='Uncertain'?`<button class="secondary" data-reconcile="${escape(email)}" data-outcome="sent">I verified it was sent</button><button class="secondary" data-reconcile="${escape(email)}" data-outcome="not-sent">I verified it was not sent</button>`:`<button class="secondary" data-reconcile="${escape(email)}" data-outcome="sent">Repair workbook status</button>`}</div>`).join('');
  if(state.prepared){$('signatureText').textContent=state.prepared.signature;}
  updateControls();
}
function fillTemplate(){const t=state.templates[$('template').value];$('subject').value=t.subject;$('body').value=t.body;}
async function loadLeads(){
  const query=new URLSearchParams({sheet:$('sheet').value,filter:$('filter').value,q:$('search').value,offset:String(offset)});
  const result=await api(`/api/leads?${query}`);rows=result.leads;total=result.total;
  $('leadRows').innerHTML=rows.length?rows.map(l=>`<tr><td><input type="checkbox" data-select="${l.id}" aria-label="Select ${escape(l.company)}" ${l.blocked?'disabled':''} ${selected.has(l.id)?'checked':''}></td><td><strong>${escape(l.company)}</strong><small>${escape(l.fields['owner / principal'])}</small></td><td>${escape(l.email)||'—'}</td><td>${escape([l.fields.city,l.fields.state].filter(Boolean).join(', '))||'—'}</td><td class="${l.blocked?'blocked':'good'}">${escape(l.blocked||'Ready')}</td><td><button class="secondary" data-preview="${l.id}">Preview</button></td></tr>`).join(''):'<tr><td colspan="6">No leads match these filters.</td></tr>';
  $('pageInfo').textContent=total?`${offset+1}–${Math.min(offset+50,total)} of ${total.toLocaleString()} leads`:'No leads';
  $('previous').disabled=offset===0;$('next').disabled=offset+50>=total;$('selectPage').checked=false;updateControls();
}
async function preview(id){previewId=id;const {message,warnings}=await api(`/api/preview?${new URLSearchParams({id,key:$('template').value})}`);$('previewTitle').textContent=message.subject;$('previewTo').textContent=`To: ${message.to}`;$('previewBody').textContent=message.body;$('warnings').textContent=warnings.join(' ');updateControls();}
$('importAttached').onclick=()=>action($('importAttached'),async()=>{await api('/api/import',{});selected.clear();offset=0;previewId=null;});
$('upload').onchange=()=>action($('importAttached'),async()=>{const file=$('upload').files[0];if(!file)return;const r=await fetch('/api/upload',{method:'POST',headers:{'X-FC-Request':'1','X-Filename':encodeURIComponent(file.name)},body:file});const result=await r.json();if(!r.ok)throw new Error(result.error);selected.clear();offset=0;previewId=null;$('upload').value='';});
$('connect').onclick=()=>action($('connect'),async()=>{const password=$('password').value;$('password').value='';await api('/api/connect',{password});notice('Mailbox connected.');});
$('disconnect').onclick=()=>action($('disconnect'),()=>api('/api/disconnect',{}));
$('resume').onclick=()=>action($('resume'),()=>api('/api/resume',{}));
$('saveTemplate').onclick=()=>action($('saveTemplate'),async()=>{await api('/api/template',{key:$('template').value,subject:$('subject').value,body:$('body').value});if(previewId)await preview(previewId);});
$('template').onchange=()=>{fillTemplate();if(previewId)preview(previewId).catch(e=>notice(e.message));};
$('prepare').onclick=()=>action($('prepare'),async()=>{const r=await api('/api/prepare',{id:previewId,key:$('template').value});$('signatureText').textContent=r.signature;notice('Compose filled in Chrome. Review it before sending.');});
$('release').onclick=()=>action($('release'),()=>api('/api/release',{}));
$('sendOne').onclick=()=>action($('sendOne'),async()=>{await api('/api/send',{});selected.delete(previewId);notice('Send confirmed. Workbook status updated.');});
$('batch').onclick=()=>action($('batch'),async()=>{if(!confirm(`Send personalized introductions to ${selected.size} selected leads from markanthony@fclogistics.us? The existing signature will be preserved.`))return;await api('/api/batch',{ids:[...selected],key:$('template').value,seconds:Number($('interval').value)});selected.clear();});
$('stop').onclick=async()=>{try{await api('/api/stop',{});await refresh();}catch(e){notice(e.message);}};
$('suppress').onclick=()=>action($('suppress'),async()=>{await api('/api/suppress',{email:$('suppressEmail').value,reason:$('suppressReason').value});$('suppressEmail').value='';$('suppressReason').value='';});
$('recovery').onclick=e=>{if(e.target.dataset.reconcile)action(e.target,()=>api('/api/reconcile',{email:e.target.dataset.reconcile,outcome:e.target.dataset.outcome}));};
$('leadRows').onclick=e=>{const id=e.target.dataset.preview;if(id)preview(id).catch(err=>notice(err.message));};
$('leadRows').onchange=e=>{const id=e.target.dataset.select;if(id){if(e.target.checked){if(selected.size>=Math.min(20,state.remaining)){e.target.checked=false;notice('The selection has reached the remaining hourly allowance (maximum 20).');}else selected.add(id);}else selected.delete(id);updateControls();}};
$('selectPage').onchange=()=>{for(const l of rows)if(!l.blocked){if($('selectPage').checked){if(selected.size<Math.min(20,state.remaining))selected.add(l.id);}else selected.delete(l.id);}loadLeads().catch(e=>notice(e.message));};
$('clearSelection').onclick=()=>{selected.clear();loadLeads().catch(e=>notice(e.message));};
for(const id of ['sheet','filter'])$(id).onchange=()=>{offset=0;loadLeads().catch(e=>notice(e.message));};
let searchTimer;$('search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{offset=0;loadLeads().catch(e=>notice(e.message));},250);};
$('previous').onclick=()=>{offset=Math.max(0,offset-50);loadLeads().catch(e=>notice(e.message));};
$('next').onclick=()=>{offset+=50;loadLeads().catch(e=>notice(e.message));};
await refresh();await loadLeads();
setInterval(async()=>{try{const previous=state.job.current;await refresh();if(state.job.current!==previous)await loadLeads();}catch(e){notice('Connection to the local tool was lost. Restart it to continue.');}},1500);
