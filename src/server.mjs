import http from 'node:http';
import fs from 'node:fs/promises';
import {unlinkSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {MailBrowser} from './browser.mjs';
import {templates, render, reason, assess, EMAIL} from './core.mjs';
import {deliver} from './delivery.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.resolve(process.env.FC_DATA_DIR || path.join(ROOT, 'data'));
const PORT = Number(process.env.PORT || 4317);
const DEFAULT_SOURCE = '/Users/bukhtyarhaider/Downloads/Fclogistics - Jessica Miller - Motus leads - July (20-24).xlsx';
const mail = new MailBrowser();
await fs.mkdir(DATA, {recursive:true, mode:0o700});
await fs.chmod(DATA,0o700);
const lockPath=path.join(DATA,'app.lock');
async function lock() {
  try {
    const handle=await fs.open(lockPath,'wx',0o600);
    await handle.writeFile(String(process.pid));await handle.close();
  } catch(error) {
    if(error.code!=='EEXIST') throw error;
    const pid=Number(await fs.readFile(lockPath,'utf8'));
    try {process.kill(pid,0);throw new Error('Another outreach instance is already using this data folder. Close it first.');}
    catch(e) {if(e.code!=='ESRCH') throw e;await fs.unlink(lockPath);return lock();}
  }
}
await lock();
process.once('exit',()=>{try{unlinkSync(lockPath);}catch{}});
const storePath = path.join(DATA, 'state.json');
let state;
try { state = JSON.parse(await fs.readFile(storePath,'utf8')); }
catch (e) {
  if (e.code !== 'ENOENT') throw new Error('Cannot read campaign state. Restore data/state.json from backup before starting.');
  state = {workbook:null, templates, history:{}, events:[], suppression:{
    'rkhaulingcflllc@gmail.com':'Explicit opt-out in mailbox, October 7, 2026',
    'lnandgxpresscorp@gmail.com':'Permanent nonexistent-account bounce in mailbox, October 8, 2026'
  }};
}
for (const item of Object.values(state.history)) if (item.status==='Sending') item.status='Uncertain';
let workbook = {sheets:[],leads:[]};
let busy = false, prepared = null;
let job = {status:'Idle', current:0,total:0, message:'Import a workbook to get started.', stop:false};
async function persist() {
  const tmp = `${storePath}.tmp`;
  const handle=await fs.open(tmp,'w',0o600);
  try {await handle.writeFile(JSON.stringify(state,null,2));await handle.sync();} finally {await handle.close();}
  await fs.rename(tmp,storePath);
  const directory=await fs.open(DATA,'r');
  try {await directory.sync();} finally {await directory.close();}
}
function event(message) {
  state.events.push({at:new Date().toISOString(),message});
  state.events = state.events.slice(-200);
}
function python(command, filename, input) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.env.FC_PYTHON || 'python3', [path.join(ROOT,'src/workbook.py'),command,filename], {stdio:['pipe','pipe','pipe']});
    let out='',err='';
    child.stdout.on('data',b=>out+=b); child.stderr.on('data',b=>err+=b);
    child.on('error',reject); child.on('close',code=>code===0 ? resolve(JSON.parse(out)) : reject(new Error(err.trim() || 'Workbook processing failed.')));
    child.stdin.end(input ? JSON.stringify(input) : '');
  });
}
async function reload() {
  if (!state.workbook) return;
  workbook=await python('read',path.join(DATA,state.workbook.file));
  for(const lead of workbook.leads) lead.hidden=workbook.sheets.find(s=>s.part===lead.part)?.hidden;
}
await reload();
await persist();
function candidates() {
  // Opt-outs and historical sends on any tab suppress that address on every tab.
  const globalState = {...state, suppression:{...state.suppression}};
  for(const lead of workbook.leads) {
    const notes=`${lead.status} ${lead.fields['historical notes']||''}`;
    if (/unsubscribe|remove|do not contact|opt.?out|declined|not interested|bounc/i.test(notes)) globalState.suppression[lead.email]='Workbook opt-out / declined / bounce';
    else if (/sent|email send|proposal|follow.?up|replied|interested|client|onboard/i.test(notes)) globalState.suppression[lead.email] ||= 'Previously contacted in workbook';
  }
  const seen = new Set();
  return workbook.leads.map(l=>({...l, blocked:reason(l,globalState,seen), lastAttempt:state.history[l.email]||null}));
}
function eligible(id) {
  const lead=candidates().find(x=>x.id===id);
  if (!lead) throw new Error('Lead not found.');
  if (lead.blocked) throw new Error(lead.blocked);
  return lead;
}
function template(key) {
  if (!state.templates[key]) throw new Error('Template not found.');
  return state.templates[key];
}
function recentAttempts() {return Object.values(state.history).filter(x=>Date.now()-Date.parse(x.at)<3600000).length;}
async function syncStatus(lead,status) {
  await python('patch',path.join(DATA,state.workbook.file), [{id:lead.id,email:lead.email,status}]);
  const target=workbook.leads.find(l=>l.id===lead.id); if(target) target.status=status;
}
async function sendPrepared() {
  if (!prepared) throw new Error('Prepare a message first.');
  const lead=eligible(prepared.id);
  if (recentAttempts()>=20) throw new Error('Rolling hourly cap reached (20). Wait before sending more.');
  await mail.validate();
  await deliver({state,lead,message:prepared.message,persist,send:()=>mail.send(),syncStatus,event,onConfirmed:()=>{prepared=null;}});
}
async function runBatch(ids,key,seconds) {
  busy=true;
  job={status:'Running',current:0,total:ids.length,message:'Preparing first message…',stop:false};
  try {
    for(const id of ids) {
      if(job.stop) break;
      const lead=eligible(id);
      if(recentAttempts()>=20) throw new Error('Hourly cap reached. Batch paused.');
      job.message=`Preparing ${lead.company}`;
      const message=render(lead,template(key));
      const warnings=assess(message);
      if(warnings.length) throw new Error(warnings.join(' '));
      const proof=await mail.prepare(message);
      prepared={id,message,signature:proof.signature};
      if(job.stop) {await mail.release(); prepared=null; break;}
      job.message=`Sending to ${lead.company}`;
      await sendPrepared();
      job.current++;
      if(job.current<ids.length) {
        const deadline=Date.now()+seconds*1000;
        while(Date.now()<deadline&&!job.stop) {
          job.message=`Next message in ${Math.ceil((deadline-Date.now())/1000)}s`;
          await new Promise(resolve=>setTimeout(resolve,500));
        }
      }
    }
    job.status=job.stop?'Stopped':'Complete';
    job.message=`${job.current} of ${job.total} messages sent.`;
  } catch(e) {
    job.status='Needs attention'; job.message=e.message;
    event(e.message);
  } finally {busy=false; await persist();}
}
async function body(req) {
  let data='';
  for await(const chunk of req) {data+=chunk; if(data.length>1_000_000) throw new Error('Request too large.');}
  return JSON.parse(data||'{}');
}
function response(res,data,status=200) {
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
}
async function importWorkbook(source, bytes) {
  if(!bytes && (!source || path.extname(source).toLowerCase()!=='.xlsx')) throw new Error('Choose an .xlsx workbook.');
  const file=`leads-${randomUUID()}.xlsx`;
  const target=path.join(DATA,file);
  if(bytes) await fs.writeFile(target,bytes,{mode:0o600});
  else {await fs.copyFile(source,target); await fs.chmod(target,0o600);}
  const parsed=await python('read',target);
  await fs.copyFile(target,`${target}.original.xlsx`);
  await fs.chmod(`${target}.original.xlsx`,0o600);
  state.workbook={file,name:bytes?source:path.basename(source)};
  workbook=parsed; await reload(); event(`Imported ${workbook.leads.length} lead rows. Original preserved.`); await persist();
}
const server=http.createServer(async(req,res)=>{
  try {
    const expected=`127.0.0.1:${PORT}`;
    if(![expected,`localhost:${PORT}`].includes(req.headers.host)) return response(res,{error:'Invalid host'},403);
    const url=new URL(req.url,`http://${expected}`);
    const pathname=url.pathname;
    if(req.method==='POST') {
      if(req.headers.origin && ![`http://${expected}`,`http://localhost:${PORT}`].includes(req.headers.origin)) return response(res,{error:'Invalid origin'},403);
      if(req.headers['x-fc-request']!=='1') return response(res,{error:'Missing request header'},403);
      if(pathname==='/api/stop') {job.stop=true; job.message='Stopping after the current operation…'; return response(res,{ok:true});}
      if(busy) throw new Error('An operation is in progress. Wait or stop the batch.');
      busy=true;
      try {
        if(pathname==='/api/upload') {
          if(prepared) throw new Error('Close the prepared message before importing.');
          let size=0; const chunks=[];
          for await(const chunk of req) {size+=chunk.length;if(size>20_000_000) throw new Error('Upload limit is 20 MB.');chunks.push(chunk);}
          const name=decodeURIComponent(req.headers['x-filename']||'leads.xlsx');
          if(!name.endsWith('.xlsx')) throw new Error('Choose an .xlsx file.');
          await importWorkbook(path.basename(name),Buffer.concat(chunks));
          return response(res,{ok:true});
        }
        const input=await body(req);
        if(pathname==='/api/import') {
          if(prepared) throw new Error('Close the prepared message before importing.');
          await importWorkbook(input.path || DEFAULT_SOURCE); return response(res,{ok:true});
        }
        if(pathname==='/api/connect') {
          if(typeof input.password!=='string' || !input.password) throw new Error('Enter the mailbox password.');
          job.message='Signing in. Complete any verification in Chrome.';
          try {const result=await mail.connect(input.password);job.message='Mailbox connected. Preview a lead to compose an introduction.';return response(res,result);} finally {input.password='';prepared=null;}
        }
        if(pathname==='/api/resume') {const result=await mail.resume();job.message='Mailbox connected.';return response(res,result);}
        if(pathname==='/api/disconnect') {await mail.close();prepared=null;return response(res,{ok:true});}
        if(pathname==='/api/template') {
          if(prepared) throw new Error('Close the prepared message before changing templates.');
          const t=template(input.key);
          if(typeof input.subject!=='string'||typeof input.body!=='string') throw new Error('Invalid template.');
          const sample=workbook.leads[0] || {company:'Carrier',email:'carrier@example.com',fields:{}};
          render(sample,input); state.templates[input.key]={...t,subject:input.subject,body:input.body};await persist();return response(res,{ok:true});
        }
        if(pathname==='/api/prepare') {
          const lead=eligible(input.id), message=render(lead,template(input.key));
          const warnings=assess(message);
          if(warnings.length) throw new Error(warnings.join(' '));
          const proof=await mail.prepare(message);prepared={id:lead.id,message,signature:proof.signature};return response(res,{...proof,message});
        }
        if(pathname==='/api/release') {await mail.release();prepared=null;return response(res,{ok:true});}
        if(pathname==='/api/send') {
          try {await sendPrepared();job={status:'Complete',current:1,total:1,message:'Send confirmed. Workbook status updated.',stop:false};return response(res,{ok:true});}
          catch(e){job={status:'Needs attention',current:0,total:1,message:e.message,stop:false};throw e;}
        }
        if(pathname==='/api/batch') {
          if(prepared) throw new Error('Close the prepared message first.');
          if(!await mail.isConnected()) throw new Error('Connect the mailbox first.');
          const ids=input.ids;
          if(!Array.isArray(ids)||!ids.length||ids.length>20||new Set(ids).size!==ids.length) throw new Error('Choose 1–20 distinct leads.');
          if(recentAttempts()+ids.length>20) throw new Error('Selected batch exceeds the remaining hourly cap.');
          const seconds=Number(input.seconds);
          if(!Number.isFinite(seconds)||seconds<180||seconds>3600) throw new Error('Use an interval from 180 to 3600 seconds.');
          ids.forEach(eligible);template(input.key);
          busy=false; void runBatch(ids,input.key,seconds);return response(res,{ok:true});
        }
        if(pathname==='/api/suppress') {
          const email=String(input.email||'').trim().toLowerCase();
          if(!EMAIL.test(email)) throw new Error('Enter one valid email.');
          state.suppression[email]=String(input.reason||'Do not contact').slice(0,200);await persist();return response(res,{ok:true});
        }
        if(pathname==='/api/reconcile') {
          const item=state.history[input.email];
          if(!item) throw new Error('Attempt not found.');
          if(item.status==='Uncertain'&&input.outcome==='sent') {item.status='Sent';item.evidence='Manually verified in Sent folder';item.syncNeeded=true;}
          if(item.status==='Uncertain'&&input.outcome==='not-sent') {item.status='Not sent — manual review';}
          const lead=workbook.leads.find(l=>l.id===item.leadId);
          if(item.status==='Sent'&&lead) {await syncStatus(lead,'Proposal Sent');item.syncNeeded=false;}
          await persist();return response(res,{ok:true});
        }
        throw new Error('Unknown action.');
      } finally {if(job.status!=='Running') busy=false;}
    }
    if(req.method!=='GET') return response(res,{error:'Method not allowed'},405);
    if(pathname==='/api/state') {
      const leads=candidates();
      const counts={total:leads.length,ready:leads.filter(x=>!x.blocked).length,excluded:leads.filter(x=>x.blocked).length,sent:Object.values(state.history).filter(x=>x.status==='Sent').length};
      return response(res,{workbook:state.workbook,sheets:workbook.sheets,counts,templates:state.templates,connected:await mail.isConnected(),signInOpen:!!mail.page&&!mail.page.isClosed(),busy,job,prepared,suppression:state.suppression,attempts:state.history,events:state.events.slice(-30),remaining:Math.max(0,20-recentAttempts())});
    }
    if(pathname==='/api/leads') {
      let leads=candidates();
      if(url.searchParams.get('sheet')) leads=leads.filter(l=>l.sheet===url.searchParams.get('sheet'));
      if(url.searchParams.get('filter')==='ready') leads=leads.filter(l=>!l.blocked);
      if(url.searchParams.get('filter')==='excluded') leads=leads.filter(l=>l.blocked);
      const q=(url.searchParams.get('q')||'').toLowerCase();
      if(q) leads=leads.filter(l=>`${l.company} ${l.email} ${l.fields['owner / principal']||''}`.toLowerCase().includes(q));
      const offset=Math.max(0,Number(url.searchParams.get('offset'))||0);
      return response(res,{total:leads.length,leads:leads.slice(offset,offset+50)});
    }
    if(pathname==='/api/preview') {const lead=workbook.leads.find(l=>l.id===url.searchParams.get('id'));if(!lead) throw new Error('Lead not found.');const message=render(lead,template(url.searchParams.get('key')));return response(res,{message,warnings:assess(message)});}
    if(pathname==='/api/download') {
      if(busy) throw new Error('Wait until the current operation finishes before downloading.');
      if(!state.workbook) throw new Error('Import a workbook first.');
      const bytes=await fs.readFile(path.join(DATA,state.workbook.file));
      res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="FC-Logistics-status.xlsx"','Cache-Control':'no-store'});return res.end(bytes);
    }
    const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
    if(!files[pathname]) return response(res,{error:'Not found'},404);
    const filename=files[pathname];
    res.writeHead(200,{'Content-Type':filename.endsWith('.css')?'text/css':filename.endsWith('.js')?'text/javascript':'text/html','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'X-Content-Type-Options':'nosniff'});
    res.end(await fs.readFile(path.join(ROOT,'public',filename)));
  } catch(e) {
    const message=/locator\.|page\.|browserType\.|Call log:/.test(e.message)
      ? 'The Private Email screen did not match the expected controls. Check Chrome, close any compose window, and try again.' : e.message;
    response(res,{error:message},400);
  }
});
server.listen(PORT,'127.0.0.1',()=>console.log(`FC Logistics Outreach: http://127.0.0.1:${PORT}`));
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{job.stop=true;await mail.close();server.close();});
