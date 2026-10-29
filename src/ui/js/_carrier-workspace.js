(() => {
  const $ = (id) => document.getElementById(id);
  if (!$('view-conversations')) return;
  const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let loaded = false, dirty = false, saving = false, mailboxes = [];
  const field = (key,label,value='',type='text') => `<label>${label}<input data-config-field="${key}" type="${type}" value="${escape(value)}" ${key==='port'?'min="1" max="65535"':''}></label>`;
  function renderMailboxes() {
    $('replyConfigMailboxes').innerHTML = mailboxes.map((c,index) => `<article class="reply-config-mailbox" data-config-index="${index}"><h3>Mailbox ${index+1}</h3><div class="reply-config-grid">${field('id','Unique mailbox ID',c.id)}${field('email','Sending identity / email',c.email,'email')}${field('host','IMAP host',c.host)}${field('user','Login user (blank uses email)',c.user)}${field('port','TLS port',c.port||993,'number')}${field('inboxFolder','Inbox folder',c.inboxFolder||'INBOX')}${field('sentFolder','Sent folder (blank auto-detects)',c.sentFolder)}${field('passwordEnv','Password environment variable',c.passwordEnv)}${field('accessTokenEnv','OAuth token environment variable',c.accessTokenEnv)}<label>Provider<select data-config-field="provider">${[['custom','Private Email / other'],['gmail','Gmail'],['yahoo','Yahoo'],['outlook','Outlook']].map(([v,l])=>`<option value="${v}" ${(c.provider||'custom')===v?'selected':''}>${l}</option>`).join('')}</select></label><label>Authentication<select data-config-field="authMode">${[['password','Provider password'],['app_password','Provider app password'],['oauth','OAuth token']].map(([v,l])=>`<option value="${v}" ${(c.authMode||'password')===v?'selected':''}>${l}</option>`).join('')}</select></label></div><button type="button" class="secondary" data-config-remove="${index}">Remove from capture configuration</button><p class="hint">Removing configuration retains captured messages and opt-outs. Gmail/Yahoo password access requires an approved app password; Outlook requires OAuth. Tokens must be enrolled/refreshed through the provider.</p></article>`).join('') || '<p class="hint">No live mailboxes configured. You can still import an authorized EML export.</p>';
  }
  function readMailboxes() {
    return Array.from(document.querySelectorAll('[data-config-index]'), (element) => {
      const config = {};
      for (const input of element.querySelectorAll('[data-config-field]')) {
        const value = input.value.trim(); if(value)config[input.dataset.configField]=input.dataset.configField==='port'?Number(value):value;
      }
      return config;
    });
  }
  window.addEventListener('fc-capture-status', ({detail}) => {
    const shared = detail.sharedProtection;
    $('replyStopCapture').disabled=!detail.running;
    $('replyConfigNote').textContent = `${detail.configurationSource || ''} · ${detail.protectionHealth || ''}. ${shared?.enabled ? `${shared.pending} opt-out(s) awaiting coordinator sync.` : 'Independent PC: opt-outs are local. Configure the team coordinator for shared sending protection.'}`;
    if(loaded||dirty||!detail.configuration)return;
    loaded=true;const c=detail.configuration;mailboxes=c.mailboxes;
    $('replyConfigEnabled').checked=c.enabled;$('replyConfigAuto').checked=c.auto;$('replyConfigSince').value=c.since;$('replyConfigBatch').value=c.batch;$('replyConfigAll').checked=c.allHistory===true;$('replyConfigAllFolders').checked=c.allFolders===true;$('replyConfigPages').value=c.pages||5;$('replyConfigSince').disabled=c.allHistory===true;renderMailboxes();
  });
  $('replyConfigAll').onchange=()=>{$('replyConfigSince').disabled=$('replyConfigAll').checked;dirty=true;};
  $('replyStopCapture').onclick=async()=>{try{await api('/api/conversations/stop-capture',{});notice('Stopping capture. Saved messages and cursors are retained.');}catch(e){notice(e.message);}};
  $('replyConfigPanel').oninput=()=>{dirty=true;};
  $('replyConfigAdd').onclick=()=>{if(saving)return;mailboxes=readMailboxes();if(mailboxes.length>=20){notice('Up to 20 mailboxes are supported.');return;}mailboxes.push({id:'mailbox'+(mailboxes.length+1)});dirty=true;renderMailboxes();};
  $('replyConfigMailboxes').onclick=(event)=>{const b=event.target.closest('[data-config-remove]');if(!b||saving)return;mailboxes=readMailboxes();mailboxes.splice(Number(b.dataset.configRemove),1);dirty=true;renderMailboxes();};
  $('replyConfigSave').onclick=async()=>{
    if(saving)return;saving=true;const b=$('replyConfigSave');b.textContent='Saving…';b.disabled=true;
    try {await api('/api/conversations/config',{enabled:$('replyConfigEnabled').checked,auto:$('replyConfigAuto').checked,since:$('replyConfigSince').value,batch:Number($('replyConfigBatch').value),allHistory:$('replyConfigAll').checked,allFolders:$('replyConfigAllFolders').checked,pages:Number($('replyConfigPages').value),mailboxes:readMailboxes(),confirmReadOnly:$('replyConfigConfirm').checked});loaded=false;dirty=false;$('replyConfigConfirm').checked=false;window.dispatchEvent(new Event('fc-conversation-view'));notice('Read-only capture configuration saved. Secret values were not stored.');}
    catch(e){notice(e.message);$('replyConfigNote').textContent=e.message+' Your settings draft is retained.';}
    finally{saving=false;b.textContent='Save capture settings';b.disabled=false;}
  };
  $('openImportReview').onclick=()=>{location.hash='imports';window.dispatchEvent(new CustomEvent('fc-import-view',{detail:state.activeCampaign}));};
  window.addEventListener('fc-import-activated',async()=>{selected.clear();previewId=null;offset=0;await refresh();fillCampaign();await loadLeads();});
  document.addEventListener('click',(event)=>{const button=event.target.closest('[data-conversation-email]');if(!button)return;closePreviewDrawer();location.hash='conversations';window.dispatchEvent(new CustomEvent('fc-conversation-search',{detail:button.dataset.conversationEmail}));});
})();
