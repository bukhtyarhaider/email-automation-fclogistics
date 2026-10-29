import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { workspace } from './fixtures/carrier-workspace.mjs';
import { eml, account, recipient, originalId } from './fixtures/replies.mjs';
import { ReplyCapture } from '../src/reply-capture.mjs';
import { parseReply } from '../src/reply-parser.mjs';
const now=Date.parse('2026-11-06T13:00:00Z');
const old=(raw)=>Buffer.from(raw.toString().replace(/Date:.*?\r\n/,'Date: Sat, 02 Nov 2019 12:00:00 +0000\r\n'));
async function scanner(t,folders,{batch=1,pages=1,hook,validity=()=>1}={}){
 const f=await workspace(t),calls=[];f.ops.replies.clock=()=>now;f.ops.assistant.clock=()=>now;
 const prepared={};for(const [folder,items]of Object.entries(folders)){prepared[folder]=await Promise.all(items.map(async(item,i)=>{const m=await parseReply(item.raw);return {...item,uid:item.uid||i+1,parsed:m};}));}
 let capture;
 const env={FC_EXPERIMENT_REPLY_CAPTURE_ENABLED:'1',FC_EXPERIMENT_REPLY_SINCE:'2026-10-01',FC_EXPERIMENT_REPLY_BATCH:String(batch),FC_EXPERIMENT_REPLY_PAGES:String(pages),FC_EXPERIMENT_REPLY_MAILBOXES:JSON.stringify([{id:'one',email:account,host:'mail.example.invalid',passwordEnv:'TEST_SECRET'}]),TEST_SECRET:'SYNTHETIC_SECRET'};
 capture=new ReplyCapture({replies:f.ops.replies,env,clock:()=>now,clientFactory:()=>({folder:'',on(){},async connect(){},close(){},async list(){return Object.keys(prepared).map((p)=>({path:p,...(p==='Sent'?{specialUse:'\\Sent'}:p==='Drafts'?{specialUse:'\\Drafts'}:{})}));},async mailboxOpen(folder,o){assert.equal(o.readOnly,true);this.folder=folder;return {uidValidity:validity(folder)};},async search(query){let items=prepared[this.folder]||[];if(query.since)items=items.filter((x)=>Date.parse(x.parsed.date)>=query.since.getTime());if(query.uid){const [low,high]=query.uid.split(':');items=items.filter((x)=>x.uid>=Number(low)&&(high==='*'||x.uid<=Number(high||low)));}return items.filter((x)=>!x.gone).map((x)=>x.uid);},async fetchOne(uid,query){const item=(prepared[this.folder]||[]).find((x)=>x.uid===Number(uid));if(hook)await hook({folder:this.folder,uid:Number(uid),query,item,capture});if(!item||item.gone)return false;if(query.source){calls.push({folder:this.folder,uid:Number(uid)});if(item.fail)throw new Error('synthetic fetch error');return {source:item.raw};}const m=item.parsed;return {size:item.size||item.raw.length,flags:new Set(),headers:Buffer.from('References: '+m.references.join(' ')),envelope:{from:m.from.map((address)=>({address})),to:m.to.map((address)=>({address})),messageId:m.messageId,subject:m.subject}};},async messageFlagsAdd(){throw new Error('Read only');},async messageMove(){throw new Error('Read only');},async messageDelete(){throw new Error('Read only');}})});
 async function scan(){capture.start({historical:true});for(let n=0;n<1000&&capture.running;n++)await new Promise((r)=>setTimeout(r,5));assert.equal(capture.running,false);return capture.status();}
 return {...f,capture,scan,calls,prepared};
}
test('one manual historical scan drains old replies beyond the configured page limit and excludes unsent imported/unrelated contacts',async(t)=>{
 const raws=Array.from({length:5},(_,i)=>old(eml({id:`<old-${i}@example.com>`,text:'I am interested.'})));
 const f=await scanner(t,{Sent:[],INBOX:[...raws.map((raw)=>({raw})),{raw:old(eml({from:'second@example.com',reference:null,text:'Not a tool conversation'}))}],Archive:[{raw:raws[1]}]});
 const status=await f.scan();assert.equal(status.historyScan.status,'Complete');const rows=await f.ops.assistant.list(new URLSearchParams({work:'replied'}));assert.equal(rows.total,1);assert.equal(rows.rows[0].replyCount,5);assert.equal(rows.summary.respondedContacts,1);assert.equal(rows.rows[0].firstReplyAt,'2019-11-02T12:00:00.000Z');assert(!f.calls.some((c)=>c.folder==='INBOX'&&c.uid===6));
 const id=status.historyScan.id;await f.scan();assert.notEqual((await f.capture.status()).historyScan.id,id);assert.equal((await f.ops.assistant.list()).summary.humanMessages,5);
});
test('full Sent backfill reconciles a deep original tool send before a changed-address historical reply is reviewed',async(t)=>{
 const f=await scanner(t,{Sent:[{raw:eml({id:'<unrelated-sent@example.com>',from:account,to:'other@example.com',reference:null})}],INBOX:[{raw:eml({id:'<changed-old@example.com>',from:'new-address@example.net',reference:'<recovered-tool@example.com>'})}]});
 f.state.tracking.records[f.trackingId].messageIds=[];await f.ops.replies.transaction((s)=>{for(const r of Object.values(s.roots))r.messageIds=[];});
 const raw=eml({id:'<recovered-tool@example.com>',from:account,to:recipient,reference:null,subject:'Dispatch support',html:`<p data-fc-tracking="${f.trackingId}">Original introduction</p>`});f.prepared.Sent.push({uid:2,raw,parsed:await parseReply(raw)});
 await f.scan();const list=await f.ops.assistant.list();assert.equal(list.summary.needsMatch,1);assert.equal(list.summary.humanMessages,0);assert(f.calls.some((c)=>c.folder==='INBOX'&&c.uid===1));
});
test('cross-folder ancestry discoveries revisit earlier folders, and child-before-parent known replies resolve without subject matching',async(t)=>{
 const f=await scanner(t,{Sent:[],INBOX:[{raw:eml({id:'<changed-child@example.com>',from:'changed@example.net',reference:'<parent-archive@example.com>'})},{raw:eml({id:'<child-first@example.com>',reference:'<parent-archive@example.com>'})}],Archive:[{raw:eml({id:'<parent-archive@example.com>',text:'I am interested.'})}]});
 await f.scan();const list=await f.ops.assistant.list();assert.equal(list.summary.humanMessages,2);assert.equal(list.summary.needsMatch,1);assert(f.calls.some((c)=>c.folder==='INBOX'&&c.uid===1));
 const review=list.rows.find((r)=>r.type==='review');assert(review);assert.equal(list.rows.find((r)=>r.type==='conversation').replyCount,2);
});
test('a new confirmed tool send widens incremental capture and older nonlatest tracking sends remain visible',async(t)=>{
 const f=await scanner(t,{Sent:[],INBOX:[{raw:eml({id:'<formerly-unrelated@example.com>',from:'second@example.com',reference:'<second-tool@example.com>'})},{raw:eml({id:'<first-owner@example.com>'})}]},{pages:5});
 const {replyCaptureConfig}=await import('../src/reply-capture.mjs');await f.capture.run(replyCaptureConfig(f.capture.env,()=>now));assert(!f.calls.some((c)=>c.uid===1));
 f.state.history['second@example.com']={accountEmail:account,recipient:'second@example.com',status:'Sent',sendStatus:'webmail_sent',providerMessageId:'<second-tool@example.com>',confirmedAt:'2026-10-28T12:00:00Z',subject:'Dispatch support'};
 await f.ops.replies.transaction((s)=>{delete s.monitors.one;});await f.capture.run(replyCaptureConfig(f.capture.env,()=>now));assert.equal((await f.ops.assistant.list()).summary.respondedContacts,2);
 const older={...f.state.tracking.records[f.trackingId],id:'22345678-1234-1234-1234-123456789abc',messageIds:['<older-tool@example.com>'],sendStatus:'webmail_sent',confirmedAt:'2025-01-01T00:00:00Z'};f.state.tracking.records[older.id]=older;await f.ops.replies.refreshHistory();await f.ops.replies.ingest(eml({id:'<older-reply@example.com>',reference:'<older-tool@example.com>'}),account);assert.equal((await f.ops.assistant.list()).summary.repliedConversations,3);
});
test('stopped and partial historical scans retain the run and cursors and resume without losing earlier responses',async(t)=>{
 let stop=true;const f=await scanner(t,{Sent:[],INBOX:[{raw:eml({id:'<resume-one@example.com>'})},{raw:eml({id:'<resume-two@example.com>'})}]},{hook:({query,capture})=>{if(query.source&&stop){stop=false;capture.stop();}}});
 const stopped=await f.scan();assert.equal(stopped.historyScan.status,'Stopped');assert.equal((await f.ops.assistant.list()).summary.humanMessages,1);const prior=f.calls.length;await f.scan();assert.equal((await f.capture.status()).historyScan.id,stopped.historyScan.id);assert.equal(f.calls[prior].uid,2);assert.equal((await f.ops.assistant.list()).summary.humanMessages,2);
});
test('expunged UIDs advance only after disappearance is verified; fetch failures keep the failed cursor and incomplete status',async(t)=>{
 let expunge=true;const f=await scanner(t,{Sent:[],INBOX:[{raw:eml({id:'<vanished@example.com>'})},{raw:eml({id:'<failed-fetch@example.com>'}),fail:true}]},{hook:({query,item,uid})=>{if(query.size&&uid===1&&expunge){expunge=false;item.gone=true;}}});
 const status=await f.scan();assert.equal(status.historyScan.status,'Incomplete');const cursor=Object.values((await f.ops.replies.load()).cursors).find((c)=>c.folder==='INBOX');assert.equal(cursor.uid,1);f.prepared.INBOX[1].fail=false;await f.scan();assert.equal((await f.ops.assistant.list()).summary.humanMessages,1);
});
test('imported-only threads and unsupported manual links are excluded while old opt-out protections are retained',async(t)=>{
 const f=await scanner(t,{Sent:[],INBOX:[]});await f.ops.replies.transaction((s)=>{s.roots['a'.repeat(64)]={id:'a'.repeat(64),source:'carrier_inbound',account,recipient:'unsent@example.com',messageIds:[],demo:false};s.protections['real:unsent@example.com']={email:'unsent@example.com',demo:false,messageId:'old-proof',at:new Date(now).toISOString()};});
 const list=await f.ops.assistant.list();assert.equal(list.total,1);assert.match(f.ops.guard('unsent@example.com'),/opt-out/);await assert.rejects(f.ops.assistant.startConversation({}),/tool-sent/);
 const result=await f.ops.replies.ingest(eml({from:'unsent@example.com',reference:null}),account);assert.equal(result.ignored,true);await f.scan();assert.equal((await f.ops.assistant.list()).total,1);
});
test('saved wording preview does not create a draft, asks one missing question and leaves custom templates intact',async(t)=>{
 const f=await scanner(t,{Sent:[],INBOX:[]});await f.ops.replies.ingest(eml({text:'My name is John Smith. Phone: 8175550199. We have 2 dry vans. ZIP: 75001. I am interested.'}),account);
 const root=(await f.ops.assistant.list()).rows[0],view=await f.ops.assistant.detail(root.id,'conversation');const file=path.join(f.dataDir,'carrier-workspace/replies.json'),before=await fs.readFile(file,'utf8');const preview=await f.ops.assistant.previewTemplate({rootId:root.id,expectedContext:view.assistant.version});assert.match(preview.body,/When are the trucks ready/);assert.equal((preview.body.match(/\?/g)||[]).length,1);assert(!/Please confirm/.test(preview.body));assert.equal(await fs.readFile(file,'utf8'),before);assert.equal((await f.ops.assistant.detail(root.id,'conversation')).assistant.draft,null);
 const made=await f.ops.assistant.saveTemplate({name:'My own line',category:'interested',body:'John, when can we talk?'});const edited=await f.ops.assistant.saveTemplate({...made.template,expectedVersion:made.template.version,body:'John, can we talk tomorrow?'});assert.equal(edited.template.previousVersions[0].body,made.template.body);await assert.rejects(f.ops.assistant.previewTemplate({rootId:root.id,expectedContext:view.assistant.version,templateId:made.template.id,expectedTemplateVersion:made.template.version}),/changed/);
});

test('incremental backlog cursors keep advancing as newly matched replies expand the thread index',async(t)=>{
 const f=await scanner(t,{Sent:[],INBOX:Array.from({length:4},(_,i)=>({raw:eml({id:`<incremental-${i}@example.com>`})}))});const {replyCaptureConfig}=await import('../src/reply-capture.mjs');
 for(let expected=1;expected<=4;expected++){await f.ops.replies.transaction((s)=>{delete s.monitors.one;});await f.capture.run(replyCaptureConfig(f.capture.env,()=>now));const cursor=Object.values((await f.ops.replies.load()).cursors).find((c)=>c.folder==='INBOX');assert.equal(cursor.uid,expected);}
 assert.equal((await f.ops.assistant.list()).summary.humanMessages,4);
});
test('a response elsewhere or a recent send to the same contact prevents an old-thread follow-up',async(t)=>{
 const f=await scanner(t,{Sent:[],INBOX:[]});const root=(await f.ops.assistant.list()).rows[0];const id='32345678-1234-1234-1234-123456789abc';f.state.tracking.records[id]={...f.state.tracking.records[f.trackingId],id,messageIds:['<other-thread@example.com>'],sendStatus:'webmail_sent',confirmedAt:new Date(now-3600000).toISOString()};await f.ops.replies.refreshHistory();let view=await f.ops.assistant.detail(root.id,'conversation');assert.equal(view.assistant.followUpReady,false);
 await f.ops.replies.ingest(eml({id:'<reply-other-thread@example.com>',reference:'<other-thread@example.com>',text:'I am interested.'}),account);view=await f.ops.assistant.detail(root.id,'conversation');assert.equal(view.assistant.repliedElsewhere,true);await assert.rejects(f.ops.assistant.draft({rootId:root.id,expectedContext:view.assistant.version,requestId:'old-thread-followup-request'}),/another tool conversation/);
});

test('UIDVALIDITY changes during pagination reset the old high-water bound and deduplicate replayed messages',async(t)=>{
 let validity=1,change=true,f;const raw=eml({id:'<validity-one@example.com>'});f=await scanner(t,{Sent:[],INBOX:[{raw},{raw:eml({id:'<validity-two@example.com>'})}]},{validity:()=>validity,hook:async({query,item,folder})=>{if(query.source&&folder==='INBOX'&&change){change=false;validity=2;f.prepared.INBOX=f.prepared.INBOX.map((m,i)=>({...m,uid:10+i}));}}});
 const status=await f.scan();assert.equal(status.historyScan.status,'Complete');assert.equal((await f.ops.assistant.list()).summary.humanMessages,2);assert(f.calls.some((c)=>c.uid===11));
});
test('Drafts are never treated as Sent, even when a capture folder was configured incorrectly',async(t)=>{
 const f=await scanner(t,{Sent:[],INBOX:[{raw:eml()}],Drafts:[{raw:eml({from:account,to:recipient,reference:null})}]});const config=JSON.parse(f.capture.env.FC_EXPERIMENT_REPLY_MAILBOXES);config[0].sentFolder='Drafts';f.capture.env.FC_EXPERIMENT_REPLY_MAILBOXES=JSON.stringify(config);const status=await f.scan();assert.equal(status.historyScan.status,'Incomplete');assert(!f.calls.some((c)=>c.folder==='Drafts'));assert.equal((await f.ops.assistant.list()).summary.humanMessages,1);
});
test('upgrading untouched starter wording preserves edited/archived templates and existing exact-text approvals',async(t)=>{
 const f=await scanner(t,{Sent:[],INBOX:[]});await f.ops.replies.ingest(eml({text:'I am interested.'}),account);const row=(await f.ops.assistant.list()).rows[0],ctx=(await f.ops.assistant.detail(row.id,'conversation')).assistant;
 const body='John, let me know when both trucks can start.';const draft=await f.ops.assistant.draft({rootId:row.id,expectedContext:ctx.version,body,requestId:'migration-retained-draft'});await f.ops.assistant.approve({id:draft.draft.id,expectedVersion:draft.draft.version,expectedContext:ctx.version,confirm:true,note:'Approved the exact body before the wording upgrade'});
 const oldBody='Hi {{contact_name}},\n\nThank you for your interest. Before we discuss the next steps, could you confirm the details below?\n\n{{confirmation_questions}}\n\nThank you.';
 await f.ops.replies.transaction((s)=>{s.assistant.templates.interest={id:'interest',name:'Interested carrier',category:'interested',body:oldBody,version:1,active:true};s.assistant.templates.mine={id:'mine',name:'My exact wording',category:'interested',body:'Keep my words.',version:1,active:true};s.assistant.templates.acknowledge.active=false;});
 const library=await f.ops.assistant.library();assert.equal(library.templates.find((x)=>x.id==='interest').version,2);assert.equal(library.templates.find((x)=>x.id==='interest').previousVersions[0].body,oldBody);assert.equal(library.templates.find((x)=>x.id==='mine').body,'Keep my words.');assert.equal(library.templates.find((x)=>x.id==='acknowledge').active,false);assert.equal((await f.ops.assistant.approved(draft.draft.id)).draft.body,body);
});
