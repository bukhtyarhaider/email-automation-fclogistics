import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { captureScopeSignature, relatedToolRoots, toolReferenceIndex } from './tool-conversation-scope.mjs';
import { ImapFlow } from 'imapflow';
import { imapOptions } from './mailbox-monitor.mjs';
import { parseReply, digest, messageIds } from './reply-parser.mjs';

export function replyCaptureConfig(env = process.env, clock = Date.now) {
  const mailboxes = JSON.parse(env.FC_EXPERIMENT_REPLY_MAILBOXES || '[]');
  if (!Array.isArray(mailboxes) || mailboxes.length > 20) throw new Error('Use a reply-mailbox JSON array with at most 20 accounts.');
  const seen = new Set(), accounts = new Set();
  for (const c of mailboxes) {
    if (!c || !/^[a-z0-9_-]{1,50}$/i.test(c.id || '') || ['__proto__','constructor','prototype','_capture'].includes(c.id) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email || '') || typeof c.host !== 'string' || !c.host || seen.has(c.id) || accounts.has(c.email.toLowerCase())) throw new Error('Reply mailboxes need unique IDs/emails and a host.');
    if (c.password || c.pass || c.accessToken || c.token) throw new Error('Use environment-variable references for reply mailbox secrets.');
    for (const key of ['passwordEnv','accessTokenEnv']) if (c[key] && !/^[A-Z_][A-Z0-9_]*$/i.test(c[key])) throw new Error('Use a valid environment-variable name for credentials.');
    c.email = c.email.toLowerCase(); c.user ||= c.email;
    seen.add(c.id); accounts.add(c.email);
  }
  const allHistory = env.FC_EXPERIMENT_REPLY_ALL_HISTORY === '1';
  const allFolders = env.FC_EXPERIMENT_REPLY_ALL_FOLDERS === '1';
  const pages = Number(env.FC_EXPERIMENT_REPLY_PAGES || 1);
  if(!Number.isInteger(pages)||pages<1||pages>10)throw new Error('Choose 1–10 pages per folder/check.');
  const since = allHistory ? '1970-01-01' : env.FC_EXPERIMENT_REPLY_SINCE || new Date(clock() - 30 * 86400000).toISOString().slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !Number.isFinite(Date.parse(since)) || new Date(since).toISOString().slice(0,10) !== since || Date.parse(since) > clock()) throw new Error('Use a valid reply backfill start date in the past.');
  const batch = Number(env.FC_EXPERIMENT_REPLY_BATCH || 50);
  if (!Number.isInteger(batch) || batch < 1 || batch > 100) throw new Error('Reply batch must be from 1 to 100 messages per folder/check.');
  return { mailboxes, since, batch, pages, allHistory, allFolders, enabled: env.FC_EXPERIMENT_REPLY_CAPTURE_ENABLED === '1', auto: env.FC_EXPERIMENT_REPLY_AUTO === '1' };
}
export class ReplyCapture {
  constructor({ replies, env = process.env, clientFactory = (opts) => new ImapFlow(opts), clock = Date.now }) {
    Object.assign(this, { replies, env, clientFactory, clock }); this.running = false; this.clients = new Set(); this.stopped = false;
  }
  async status() {
    let config;
    try { config = replyCaptureConfig(this.env, this.clock); }
    catch { return { enabled: false, auto: false, running: this.running, configurationError: 'Invalid experiment reply configuration. Check mailbox IDs, dates and credential references.', mailboxes: [] }; }
    const state = await this.replies.load();
    return { enabled: config.enabled, auto: config.enabled && config.auto, running: this.running, since: config.since, batch: config.batch, pages:config.pages, allHistory:config.allHistory, allFolders:config.allFolders, historyScan:state.monitors._history||null, scope:this.replies.imports.managed?'tool_sent_only':'experiment', progress:state.monitors._progress||null,captureError: this.lastError ? { status: 'Needs attention', message: this.lastError } : state.monitors._capture || null,
      mailboxes: config.mailboxes.map((c) => ({ id: c.id, email: c.email, credentialsConfigured: Boolean((c.passwordEnv && this.env[c.passwordEnv]) || (c.accessTokenEnv && this.env[c.accessTokenEnv])), ...(state.monitors[c.id] || { status: 'Not checked' }) })) };
  }
  start({ historical = false } = {}) {
    if (this.running) return { started: false, running: true };
    const config = replyCaptureConfig(this.env, this.clock);
    if (!config.enabled) throw new Error('Live reply capture is disabled. Configure authorized read-only mailbox access first.');
    if (!config.mailboxes.length) throw new Error('No reply mailboxes are configured.');
    this.stopped = false; this.running = true;
    const full = historical && this.replies.imports.managed;
    const effective = full ? { ...config, since:'1970-01-01', allHistory:true, allFolders:true, historical:true } : config;
    void this.run(effective).catch(() => { this.lastError = 'Reply capture did not finish. Inspect workspace storage and capture lock.'; }).finally(() => { this.running = false; });
    return { started:true, running:true, mode:full?'All previous tool conversations':'Configured sync' };
  }
  async scanFolder(client, c, folder, sent, config, snapshot, scopeToken = null, ceiling = null) {
    const box = await client.mailboxOpen(folder, { readOnly:true });
    const key = digest(`${c.email}:${c.user}:${c.host}:${folder}`);
    const prior = (await this.replies.load()).cursors[key], validity = String(box.uidValidity);
    if(prior?.validity&&prior.validity!==validity)ceiling=null;
    const same = prior?.validity === validity && prior.since === config.since && (!scopeToken || prior.scope === scopeToken);
    let uid = same ? prior.uid : 0;
    if (ceiling === null && same && prior.uid < prior.ceiling) ceiling = prior.ceiling;
    const searched = ceiling !== null && uid >= ceiling ? [] : await client.search(uid ? { uid:`${uid+1}:${ceiling || '*'}` } : { since:new Date(config.since+'T00:00:00Z') }, { uid:true }) || [];
    const uids = [...new Set(searched)].filter((n)=>Number.isSafeInteger(n)&&n>uid&&(ceiling===null||n<=ceiling)).sort((a,b)=>a-b);
    const highWater = ceiling ?? (uids.at(-1) || uid);
    let processed=0, vanished=0;
    const advance = async(next, parsed, evidence) => {
      await this.replies.recordParsed(parsed,c.email,evidence,{key,value:{account:c.email,folder,validity,uid:next,ceiling:highWater,since:config.since,scope:scopeToken,checkedAt:new Date(this.clock()).toISOString()},progress:{mailbox:c.email,folder,uid:next,at:new Date(this.clock()).toISOString(),historyId:config._historyId||null}});
      uid=next;processed++;
    };
    const isGone = async(next) => !((await client.search({uid:String(next)},{uid:true}))||[]).includes(next);
    const pageUids=uids.slice(0,config.batch),metadata=new Map();
    // One bounded metadata request per page avoids a network round-trip for every unrelated email.
    if(pageUids.length&&typeof client.fetchAll==='function')try{for(const m of await client.fetchAll(pageUids.join(','),{size:true,envelope:true,flags:true,headers:['references','in-reply-to']},{uid:true}))if(Number.isSafeInteger(m.uid))metadata.set(m.uid,m);}catch{/* Per-UID fallback retains the established failure/cursor behavior. */}
    for (const next of pageUids) {
      if(this.stopped)throw new Error('Capture stopped.');
      const evidence={type:'imap',folder,folderRole:sent?'sent':'inbox',uid:next,uidValidity:validity};
      const meta=metadata.get(next)||await client.fetchOne(String(next),{size:true,envelope:true,flags:true,headers:['references','in-reply-to']},{uid:true});
      if(!meta){if(await isGone(next)){await advance(next,null,evidence);vanished++;continue;}throw new Error('Metadata unavailable; cursor retained.');}
      if(!Number.isFinite(meta.size))throw new Error('Metadata size unavailable; cursor retained.');
      if(new Set(meta.flags||[]).has('\\Draft')){await advance(next,null,evidence);continue;}
      const state=await this.replies.load(), envelope=meta.envelope;
      const from=(envelope?.from||[]).map((a)=>a.address?.toLowerCase()).filter(Boolean),to=[...(envelope?.to||[]),...(envelope?.cc||[])].map((a)=>a.address?.toLowerCase()).filter(Boolean);
      const reference=[...new Set([...messageIds(envelope?.inReplyTo),...messageIds(meta.headers?.length<=65536?meta.headers.toString():'')])];
      const roots=Object.values(state.roots).filter((r)=>r.account===c.email),known=new Set(snapshot.knownEmails||[]);
      const relevant=this.replies.imports.managed
        ? !envelope || relatedToolRoots(state,{from,to,references:reference},c.email).length>0 || /mailer-daemon|postmaster/.test(from.join(' '))
        : !envelope||from.some((e)=>known.has(e))||(sent&&to.some((e)=>known.has(e)))||roots.some((r)=>from.includes(r.recipient)||(sent&&to.includes(r.recipient))||r.messageIds.some((id)=>reference.includes(id)))||/mailer-daemon|postmaster/.test(from.join(' '))||/undeliverable|delivery fail|returned mail/i.test(envelope.subject||'');
      if(!relevant){await advance(next,null,evidence);continue;}
      const original=sent&&!reference.length&&messageIds(envelope?.messageId)[0]&&roots.find(r=>r.body&&!r.bodyUnavailable&&r.messageIds.includes(messageIds(envelope.messageId)[0])&&from.length===1&&from[0]===c.email&&to.includes(r.recipient)&&envelope.subject===r.subject);
      if(original){await advance(next,null,evidence);continue;} // The existing tool body/Message-ID already represents this original send.
      let parsed,raw;
      if(meta.size<=2_000_000){const fetched=await client.fetchOne(String(next),{source:true},{uid:true});raw=fetched?.source;if(!raw){if(await isGone(next)){await advance(next,null,evidence);vanished++;continue;}throw new Error('Message unavailable; cursor retained.');}try{parsed=await parseReply(raw);}catch{}}
      if(!parsed){
        if(!envelope)throw new Error('Insufficient metadata for review; cursor retained.');
        parsed={messageId:messageIds(envelope.messageId)[0]||null,references:reference,from,to,deliveredTo:'',subject:String(envelope.subject||'(Body needs mailbox review)').slice(0,500),text:'',date:null,kind:'unknown',dsn:[],bodyUnavailable:true,fingerprint:digest(JSON.stringify({account:c.email,messageId:envelope.messageId,from,to,subject:envelope.subject})),sourceHash:raw?digest(raw):null,suggestion:{category:'unclassified',reason:'Body unavailable; inspect mailbox'}};
      }
      if(sent&&raw&&!parsed.bodyUnavailable)await this.replies.sentCopy(raw,c.email,snapshot);
      await advance(next,parsed,evidence);
    }
    if(!uids.length)await this.replies.recordParsed(null,c.email,null,{key,value:{account:c.email,folder,validity,uid,ceiling:highWater,since:config.since,scope:scopeToken,checkedAt:new Date(this.clock()).toISOString()}});
    return {folder,processed,vanished,more:uids.length>config.batch,remaining:Math.max(0,uids.length-processed),since:config.since,lastUid:uid,highWater};
  }
  async run(config) {
    let captureLock,history=null,incomplete=false;
    const started=this.clock(),native=this.replies.imports.managed;
    const saveHistory=(s,patch={})=>{history.scanned=Math.max(history.scanned||0,s.monitors._history?.id===history.id?s.monitors._history.scanned||0:0);s.monitors._history={...history,...patch};};
    try {
      await this.replies.imports.withWrite(async()=>{captureLock=await fs.open(path.join(this.replies.imports.workspaceDir,'reply-capture.lock'),'wx',0o600);await captureLock.writeFile(String(process.pid));});
      const snapshot=await this.replies.rootsFromSource();await this.replies.refreshHistory(snapshot);this.lastError=null;
      await this.replies.transaction((s)=>{delete s.monitors._capture;if(config.historical){const signature=digest(JSON.stringify([captureScopeSignature(s,null,false),config.mailboxes.map((c)=>[c.email,c.host,c.user,c.inboxFolder,c.sentFolder]).sort()])),previous=s.monitors._history;history=previous&&previous.pass<8&&previous.signature===signature&&['Running','Stopped','Incomplete'].includes(previous.status)?{...previous}:{id:randomUUID(),signature,pass:0,scanned:0,startedAt:new Date(this.clock()).toISOString()};history.status='Running';config._historyId=history.id;saveHistory(s);}});
      for(let pass=history?.pass||0;pass<(config.historical?8:1);pass++){
        const before=history?.beforeReferences||captureScopeSignature(await this.replies.load());
        if(history){history.pass=pass;history.beforeReferences=before;await this.replies.transaction((s)=>{saveHistory(s);});}
        for(const c of config.mailboxes){
          if(this.stopped)break;
          const state=await this.replies.load(),previous=state.monitors[c.id]||{};
          if(!config.historical&&previous.nextAt&&Date.parse(previous.nextAt)>this.clock())continue;
          let client,folders=[];
          if(native&&!toolReferenceIndex(state,c.email).roots.length){await this.replies.transaction((s)=>{s.monitors[c.id]={status:'No tool-sent emails',folders:[],message:'No confirmed emails sent by this tool for this mailbox; no unrelated Inbox mail was fetched.'};});continue;}
          try{
            if(!native&&!Object.values(state.roots).some((r)=>r.account===c.email&&!r.demo)&&!((await this.replies.allowedAccounts()).includes(c.email)&&snapshot.knownEmails?.length))throw new Error('No confirmed source history.');
            client=this.clientFactory(imapOptions(c,this.env));client.on('error',()=>{});this.clients.add(client);await client.connect();
            let available=[],listingFailed=false;try{available=await client.list();}catch{listingFailed=true;}
            const draftPaths=new Set(available.filter((f)=>f.specialUse==='\\Drafts').map((f)=>f.path)),selectedSent=c.sentFolder||available.find((f)=>f.specialUse==='\\Sent')?.path;
            const sent=draftPaths.has(selectedSent)?null:selectedSent;
            const targets=[...new Set([...(sent?[sent]:[]),c.inboxFolder||'INBOX',...(config.allFolders?available.filter((f)=>f.specialUse!=='\\Drafts'&&!new Set(f.flags||[]).has('\\Noselect')).map((f)=>f.path):[])])].filter((folder)=>!draftPaths.has(folder));
            let partial=listingFailed||draftPaths.has(c.inboxFolder)||draftPaths.has(c.sentFolder)||Boolean(config.historical&&!sent);
            const tasks=targets.map(folder=>({folder,count:0,page:0,ceiling:null,done:false}));
            do{for(const task of tasks.filter(t=>!t.done)){
              const {folder}=task;
              const scope=native?(history?`tool-v3:${history.id}:${pass}`:captureScopeSignature(await this.replies.load(),c.email,'anchors')):null;
              let count=task.count,ceiling=task.ceiling;
              try{
                for(let turn=0;turn<(config.historical?1:(config.pages||1));turn++){
                  const page=task.page++;
                  if(this.stopped)throw new Error('Capture stopped.');
                  if(config.historical&&this.clock()-started>15*60*1000){incomplete=true;throw new Error('Continue from saved cursors.');}
                  await this.replies.transaction((s)=>{s.monitors[c.id]={status:'Checking',folders,checkedAt:previous.checkedAt||null};if(history)saveHistory(s,{currentMailbox:c.email,currentFolder:folder});});
                  const result=await this.scanFolder(client,c,folder,folder===sent,config,snapshot,scope,ceiling);ceiling=result.highWater;count+=result.processed;task.ceiling=ceiling;task.count=count;
                  const progress={...result,processed:count,pages:page+1},index=folders.findIndex((f)=>f.folder===folder);if(index<0)folders.push(progress);else folders[index]=progress;
                  await this.replies.transaction((s)=>{s.monitors[c.id]={status:'Checking',checkedAt:previous.checkedAt||null,folders,sentUnavailable:!sent,attemptedAt:new Date(this.clock()).toISOString()};if(history)saveHistory(s,{currentMailbox:c.email,currentFolder:folder});});
                  if(!result.more){task.done=true;break;}
                  await new Promise((resolve)=>setTimeout(resolve,0));
                }
              }catch{task.done=true;if(this.stopped)throw new Error('Capture stopped.');partial=true;const p=folders.find((f)=>f.folder===folder);if(p)Object.assign(p,{error:true,more:true});else folders.push({folder,processed:0,error:true,more:true});}
            }
            }while(config.historical&&tasks.some(t=>!t.done)&&!this.stopped);
            incomplete||=partial;
            await this.replies.transaction((s)=>{s.monitors[c.id]={status:partial?'Needs attention':folders.some((f)=>f.more)?'Backfill in progress':sent?'Checked':'Inbox checked; Sent unavailable',sentUnavailable:!sent,checkedAt:partial?(previous.checkedAt||null):new Date(this.clock()).toISOString(),attemptedAt:new Date(this.clock()).toISOString(),folders,failures:partial?(previous.failures||0)+1:0,message:partial?'Partial capture. A folder, listing, or time limit needs attention. Successful pages are saved; run the scan again to resume.':null,nextAt:new Date(this.clock()+(partial?120000:60000)).toISOString()};});
          }catch{
            incomplete=true;const failures=Math.min((previous.failures||0)+1,10);
            await this.replies.transaction((s)=>{s.monitors[c.id]={status:this.stopped?'Stopped':'Needs attention',checkedAt:previous.checkedAt||null,attemptedAt:new Date(this.clock()).toISOString(),failures,folders,message:this.stopped?'Stopped. Saved pages and cursors are retained.':'Read-only check failed. Check credentials, folders and connectivity. Failed fetches/storage do not advance the failed cursor.',nextAt:new Date(this.clock()+(this.stopped?0:Math.min(3600000,60000*2**failures))).toISOString()};});
          }finally{try{client?.close();}catch{}this.clients.delete(client);}
        }
        if(!config.historical||this.stopped||incomplete)break;
        const after=captureScopeSignature(await this.replies.load());
        if(after===before)break;
        history.beforeReferences=null;history.pass=pass+1;
        if(pass===7)incomplete=true; // Long cross-folder ancestry stays visibly incomplete, never silently complete.
      }
    }catch{incomplete=true;this.lastError='Could not acquire the capture lock or persist reply state. Check workspace permissions and stale reply-capture.lock after stopping its process.';await this.replies.transaction((s)=>{s.monitors._capture={status:'Needs attention',message:this.lastError};}).catch(()=>{});}
    finally{
      if(history&&captureLock)await this.replies.transaction((s)=>{saveHistory(s,{beforeReferences:history.beforeReferences||null,status:this.stopped?'Stopped':incomplete?'Incomplete':'Complete',finishedAt:new Date(this.clock()).toISOString(),currentMailbox:null,currentFolder:null,note:'Only available mailbox folders and retained tool-sent evidence are covered. Uncertain matches remain in review.'});}).catch(()=>{this.lastError='Could not save historical scan completion. Check storage before trusting coverage.';});
      if(captureLock){await captureLock.close();await fs.unlink(path.join(this.replies.imports.workspaceDir,'reply-capture.lock'));}
    }
  }
  async resetBackfill() {
    if (this.running) throw new Error('Wait for the current capture to finish before restarting backfill.');
    await this.replies.transaction(async (state) => {
      const exists = await fs.access(path.join(this.replies.imports.workspaceDir, 'reply-capture.lock')).then(() => true).catch(() => false);
      if (exists) throw new Error('A capture lock is held. Stop its process before restarting backfill.');
      state.cursors = {}; state.monitors = {}; state.events.push({ kind: 'backfill_reset', at: new Date(this.clock()).toISOString() });
    });
    return { ok: true };
  }
  stop() { this.stopped = true; for (const client of this.clients) client.close(); }
}
