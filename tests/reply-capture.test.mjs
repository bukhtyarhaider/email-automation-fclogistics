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
    async fetchOne(uid,query,options){assert.equal(options.uid,true);const item=items.find((m)=>m.uid===Number(uid));if(query.size)return {size:item.size??item.source.length,envelope:item.envelope||{from:[{address:recipient}],to:[{address:account}],messageId:`<capture-${uid}@example.com>`,subject:'Reply'}};calls.push('fetch-source');if(item.fail)throw new Error('PRIVATE_TRANSPORT_ERROR');return {source:item.source};},
    async messageFlagsAdd(){throw new Error('Must never mutate mailbox');}, async messageMove(){throw new Error('Must never move messages');}, async messageDelete(){throw new Error('Must never delete messages');},
  };
}

test('live capture requires its own explicit configuration; credentials use TLS/env references and never appear in diagnostics',async(t)=>{
 const {replies}=await fixture(t);let invoked=0;
 const disabled=new ReplyCapture({replies,env:{FC_MONITOR_ENABLED:'1'},clientFactory:()=>{invoked++;}});
 assert.throws(()=>disabled.start(),/disabled/);assert.equal(invoked,0);
 assert.throws(()=>replyCaptureConfig({...envFor(),FC_EXPERIMENT_REPLY_MAILBOXES:JSON.stringify([{id:'x',email:account,host:'x',password:'secret'}])}),/references/);
 const env=envFor(),calls=[];
 const capture=new ReplyCapture({replies,env,clock:()=>fixed,clientFactory:(opts)=>{assert.equal(opts.tls.rejectUnauthorized,true);assert.equal(opts.tls.minVersion,'TLSv1.2');assert.equal(opts.logger,false);assert.equal(opts.auth.pass,'PRIVATE_IMAP_PASSWORD');return fakeClient([],calls);}});
 await capture.run(replyCaptureConfig(env,()=>fixed));
 assert((await capture.status()).mailboxes[0].checkedAt);
 assert(!JSON.stringify(await capture.status()).includes('PRIVATE_IMAP_PASSWORD'));
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
