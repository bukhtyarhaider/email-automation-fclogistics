import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ReplyCapture, replyCaptureConfig } from '../src/reply-capture.mjs';
import { fixture, eml, account, recipient } from './fixtures/replies.mjs';
const fixed = Date.parse('2026-10-29T13:00:00.000Z');
const envFor = () => ({ FC_EXPERIMENT_REPLY_CAPTURE_ENABLED:'1', FC_EXPERIMENT_REPLY_SINCE:'2026-10-01', FC_EXPERIMENT_REPLY_BATCH:'1',
  FC_EXPERIMENT_REPLY_MAILBOXES:JSON.stringify([{id:'one',email:account,host:'mail.example.invalid',passwordEnv:'MAIL_SECRET'}]), MAIL_SECRET:'PRIVATE_IMAP_PASSWORD' });
function fakeClient(items, calls, validity = 1) {
  return { folder:'', on(){}, async connect(){calls.push('connect');}, close(){calls.push('close');}, async list(){return [{path:'Sent',specialUse:'\\Sent'}];},
    async mailboxOpen(folder,options){assert.equal(options.readOnly,true);this.folder=folder;return {uidValidity:validity};},
    async search(query,options){assert.equal(options.uid,true);calls.push({query,folder:this.folder});return this.folder==='Sent'?[]:items.map((m)=>m.uid);},
    async fetchOne(uid,query,options){assert.equal(options.uid,true);const item=items.find((m)=>m.uid===Number(uid));if(query.size){assert.deepEqual(query.headers,['references','in-reply-to']);return {size:item.size??item.source.length,headers:Buffer.from(item.headers||''),envelope:item.envelope||{from:[{address:recipient}],to:[{address:account}],messageId:`<capture-${uid}@example.com>`,subject:'Reply'}};}calls.push('fetch-source');if(item.fail)throw new Error('PRIVATE_TRANSPORT_ERROR');return {source:item.source};},
    async messageFlagsAdd(){throw new Error('Must never mutate mailbox');}, async messageMove(){throw new Error('Must never move messages');}, async messageDelete(){throw new Error('Must never delete messages');},
  };
}

test('live capture requires its own explicit configuration; credentials use TLS/env references and never appear in diagnostics',async(t)=>{
 const {replies}=await fixture(t);let invoked=0;
 const disabled=new ReplyCapture({replies,env:{FC_MONITOR_ENABLED:'1'},clientFactory:()=>{invoked++;}});
 assert.throws(()=>disabled.start(),/disabled/);assert.equal(invoked,0);
 assert.throws(()=>replyCaptureConfig({...envFor(),FC_EXPERIMENT_REPLY_MAILBOXES:JSON.stringify([{id:'x',email:account,host:'x',password:'secret'}])}),/references/);
 for(const id of ['_capture','_history','_progress','__proto__'])assert.throws(()=>replyCaptureConfig({...envFor(),FC_EXPERIMENT_REPLY_MAILBOXES:JSON.stringify([{id,email:account,host:'mail.example.invalid'}])}),/nonreserved/);
 const env=envFor(),calls=[];
 const capture=new ReplyCapture({replies,env,clock:()=>fixed,clientFactory:(opts)=>{assert.equal(opts.tls.rejectUnauthorized,true);assert.equal(opts.tls.minVersion,'TLSv1.2');assert.equal(opts.logger,false);assert.equal(opts.auth.pass,'PRIVATE_IMAP_PASSWORD');return fakeClient([],calls);}});
 await capture.run(replyCaptureConfig(env,()=>fixed));
 assert((await capture.status()).mailboxes[0].checkedAt);
 assert(!JSON.stringify(await capture.status()).includes('PRIVATE_IMAP_PASSWORD'));
});

test('full-history pages resume across checks and References-only changed senders are retained for explicit review',async(t)=>{
 const {replies}=await fixture(t),calls=[],env={...envFor(),FC_EXPERIMENT_REPLY_ALL_HISTORY:'1',FC_EXPERIMENT_REPLY_PAGES:'2'};let now=fixed;
 const source=eml({id:'<changed-sender@example.net>',from:'new-address@example.net'}).toString().replace(/In-Reply-To:.*?\r\n/,'');
 const items=[{uid:1,source:Buffer.from(source),headers:'References: <sent-one@example.com>\r\n',envelope:{from:[{address:'new-address@example.net'}],to:[{address:account}],subject:'Re: Dispatch support'}},{uid:2,source:eml({id:'<page-2@example.com>'})},{uid:3,source:eml({id:'<page-3@example.com>'})}];
 const capture=new ReplyCapture({replies,env,clock:()=>now,clientFactory:()=>fakeClient(items,calls)});await capture.run(replyCaptureConfig(env,()=>now));
 let s=await capture.status();assert.equal(s.since,'1970-01-01');assert.equal(s.mailboxes[0].folders.find((f)=>f.folder==='INBOX').processed,2);assert.equal(s.mailboxes[0].status,'Backfill in progress');assert.equal((await replies.list()).summary.needsMatch,1);
 now+=61000;await capture.run(replyCaptureConfig(env,()=>now));s=await capture.status();assert.equal(s.mailboxes[0].status,'Checked');assert.equal(Object.keys((await replies.load()).messages).length,3);
});

test('known imported contacts are captured without an outbound anchor and Inbox capture survives unavailable Sent/folder listings',async(t)=>{
 const f=await fixture(t);f.state.history={};await fs.writeFile(path.join(f.dataDir,'state.json'),JSON.stringify(f.state));
 f.replies.allowedAccounts=()=>[account];f.replies.contactEmails=()=>[recipient];const original=f.replies.rootsFromSource.bind(f.replies);f.replies.rootsFromSource=async()=>({...await original(),knownEmails:[recipient]});
 const capture=new ReplyCapture({replies:f.replies,env:envFor(),clock:()=>fixed,clientFactory:()=>{const c=fakeClient([{uid:1,source:eml({reference:null})}],[]);c.list=async()=>[];return c;}});await capture.run(replyCaptureConfig(envFor(),()=>fixed));
 assert.equal((await capture.status()).mailboxes[0].status,'Inbox checked; Sent unavailable');const messages=Object.values((await f.replies.load()).messages);assert.equal(messages.length,1);assert.equal(messages[0].match,'review');assert.equal(messages[0].knownCarrierContact,true);
});

test('archived carrier responses are included, Drafts are excluded and one folder failure does not hide successful Inbox pages',async(t)=>{
 const {replies}=await fixture(t),opened=[],env={...envFor(),FC_EXPERIMENT_REPLY_ALL_FOLDERS:'1'};
 const capture=new ReplyCapture({replies,env,clock:()=>fixed,clientFactory:()=>{const c=fakeClient([{uid:1,source:eml()}],[]);c.list=async()=>[{path:'Sent',specialUse:'\\Sent'},{path:'Archive'},{path:'Drafts',specialUse:'\\Drafts'},{path:'Parent',flags:new Set(['\\Noselect'])}];const open=c.mailboxOpen.bind(c);c.mailboxOpen=async(folder,o)=>{opened.push(folder);if(folder==='Sent')throw new Error('Unavailable');return open(folder,o);};return c;}});
 await capture.run(replyCaptureConfig(env,()=>fixed));assert.deepEqual(opened,['Sent','INBOX','Archive']);const s=(await capture.status()).mailboxes[0];assert.equal(s.status,'Needs attention');assert(s.folders.find((f)=>f.folder==='Sent').error);assert.equal((await replies.list()).summary.humanMessages,1);
});

test('stopping a scan keeps committed pages and permits a new start from retained cursors',async(t)=>{
 const {replies}=await fixture(t),env={...envFor(),FC_EXPERIMENT_REPLY_PAGES:'3'};let capture,stopOnce=true;
 capture=new ReplyCapture({replies,env,clock:()=>fixed,clientFactory:()=>{const c=fakeClient([{uid:1,source:eml({id:'<stop-one@example.com>'})},{uid:2,source:eml({id:'<stop-two@example.com>'})}],[]),fetch=c.fetchOne.bind(c);c.fetchOne=async(...args)=>{const r=await fetch(...args);if(args[1].source&&stopOnce){stopOnce=false;capture.stop();}return r;};return c;}});
 await capture.run(replyCaptureConfig(env,()=>fixed));assert.equal((await capture.status()).mailboxes[0].status,'Stopped');assert.equal(Object.keys((await replies.load()).messages).length,1);
 capture.start();for(let i=0;i<100&&capture.running;i++)await new Promise((r)=>setTimeout(r,10));assert.equal(capture.running,false);assert.equal(Object.keys((await replies.load()).messages).length,2);
});

test('read-only UID backfill is bounded, resumable, restart-safe and independent of source DSN cursors',async(t)=>{
 const f=await fixture(t);let now=fixed;const env=envFor(),calls=[];
 const items=[{uid:1,source:eml({id:'<capture-1@example.com>'})},{uid:2,source:eml({id:'<capture-2@example.com>',text:'I am interested'})}];
 const capture=new ReplyCapture({replies:f.replies,env,clock:()=>now,clientFactory:()=>fakeClient(items,calls)});
 await capture.run(replyCaptureConfig(env,()=>now));
 assert.equal((await capture.status()).mailboxes[0].status,'Backfill in progress');
 assert.equal((await f.replies.list()).summary.humanMessages,1);
 now+=61000;await capture.run(replyCaptureConfig(env,()=>now));
 assert.equal((await f.replies.list()).summary.humanMessages,2);
 const before=JSON.stringify((await f.replies.load()).messages);
 now+=61000;const resetValidity=new ReplyCapture({replies:f.replies,env,clock:()=>now,clientFactory:()=>fakeClient(items,calls,2)});
 await resetValidity.run(replyCaptureConfig(env,()=>now));
 assert.equal(JSON.stringify((await f.replies.load()).messages),before);
 assert.equal(await fs.readFile(path.join(f.dataDir,'state.json'),'utf8'),f.before);
});

test('fetch errors back off without advancing a failed cursor; unrelated envelopes are skipped without reading their bodies',async(t)=>{
 const {replies}=await fixture(t);const env=envFor(),calls=[];
 const capture=new ReplyCapture({replies,env,clock:()=>fixed,clientFactory:()=>fakeClient([{uid:1,source:eml(),fail:true}],calls)});
 await capture.run(replyCaptureConfig(env,()=>fixed));
 const status=await capture.status(); assert.equal(status.mailboxes[0].status,'Needs attention'); assert(!JSON.stringify(status).includes('PRIVATE_TRANSPORT_ERROR'));
 assert(!Object.values((await replies.load()).cursors).some((c)=>c.folder==='INBOX'));
 const calls2=[];const unrelated=new ReplyCapture({replies,env,clock:()=>fixed+200000,clientFactory:()=>fakeClient([{uid:2,source:eml(),envelope:{from:[{address:'unrelated@example.com'}],to:[{address:account}],subject:'Private unrelated mail'}}],calls2)});
 await unrelated.run(replyCaptureConfig(env,()=>fixed+200000));assert(!calls2.includes('fetch-source'));
 assert.equal(Object.keys((await replies.load()).messages).length,0);
});

test('oversized relevant messages become review stubs; backfill reset retains messages and protections',async(t)=>{
 const {replies}=await fixture(t);const env=envFor();
 const capture=new ReplyCapture({replies,env,clock:()=>fixed,clientFactory:()=>fakeClient([{uid:1,source:eml(),size:3_000_000}],[])});
 await capture.run(replyCaptureConfig(env,()=>fixed));
 let state=await replies.load();assert.equal(Object.values(state.messages)[0].bodyUnavailable,true);assert.equal((await replies.list()).summary.needsMatch,1);
  await replies.refreshHistory();assert.equal((await replies.list()).summary.needsMatch,1);
 await replies.ingest(eml({id:'<remove@example.com>',text:'Please remove me'}),account);
 await capture.resetBackfill();state=await replies.load();assert.equal(Object.keys(state.cursors).length,0);assert.equal(Object.keys(state.messages).length,2);assert.equal(Object.keys(state.protections).length,1);
});

test('a failed durable commit cannot advance cursor; capture locks prevent concurrent scanners/reset',async(t)=>{
 const f=await fixture(t);await f.replies.refreshHistory();
 const env=envFor();const capture=new ReplyCapture({replies:f.replies,env,clock:()=>fixed,clientFactory:()=>fakeClient([{uid:1,source:eml()}],[])});
 const original=f.replies.persist.bind(f.replies);f.replies.persist=async()=>{throw new Error('disk failure');};
 await capture.run(replyCaptureConfig(env,()=>fixed));
 assert(!Object.values((await f.replies.load()).cursors).some((c)=>c.uid===1));assert((await capture.status()).captureError);
 f.replies.persist=original;
 await fs.writeFile(path.join(f.workspaceDir,'reply-capture.lock'),'999999');
 await assert.rejects(capture.resetBackfill(),/lock/);
 await capture.run(replyCaptureConfig(env,()=>fixed));assert((await capture.status()).captureError);
 await fs.unlink(path.join(f.workspaceDir,'reply-capture.lock'));
});

test('batched metadata avoids reading unrelated bodies and falls back safely if a batch fails',async(t)=>{
 for(const failBatch of [false,true]){const {replies}=await fixture(t),calls=[],env={...envFor(),FC_EXPERIMENT_REPLY_BATCH:'2'},items=[{uid:1,source:eml()},{uid:2,source:eml({from:'unrelated@example.net',reference:null}),envelope:{from:[{address:'unrelated@example.net'}],to:[{address:account}],subject:'Unrelated'}}];let batches=0;
 const capture=new ReplyCapture({replies,env,clock:()=>fixed,clientFactory:()=>{const c=fakeClient(items,calls);c.fetchAll=async(range,query)=>{batches++;assert.equal(range,'1,2');assert.equal(query.source,undefined);if(failBatch)throw new Error('Synthetic metadata batch failure');return items.map(m=>({uid:m.uid,size:m.source.length,flags:new Set(),headers:Buffer.from(''),envelope:m.envelope||{from:[{address:recipient}],to:[{address:account}],subject:'Re: Dispatch support'}}));};return c;}});
 await capture.run(replyCaptureConfig(env,()=>fixed));assert.equal(batches,1);assert.equal(calls.filter(c=>c==='fetch-source').length,1);assert.equal((await replies.list()).summary.humanMessages,1);}
});
