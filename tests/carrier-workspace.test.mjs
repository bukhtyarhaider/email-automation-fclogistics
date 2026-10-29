import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fixture, eml, account, recipient } from './fixtures/replies.mjs';
import { CarrierWorkspace } from '../src/carrier-workspace.mjs';
import { workspace } from './fixtures/carrier-workspace.mjs';
async function revision(f){const p=await f.ops.imports.review({campaignId:'c1',mapping:{},addStatusColumns:{Leads:'D'}});return f.ops.imports.apply({previewId:p.previewId,confirmExperiment:true,provenance:{label:'Authorized lead export',permission:'unknown'}});}
async function activate(f,r){const status=await f.ops.importStatus('c1');return f.ops.activate({campaignId:'c1',revisionId:r.revisionId,expectedToken:status.activationToken,confirmActivation:true});}

test('reviewed imports activate real campaign copies with stable identities and sources; original and saved revisions remain immutable; undo restores exact prior workbook',async(t)=>{
 const f=await workspace(t),r=await revision(f),c=f.state.campaigns[0];assert.equal(c.workbook.file,'leads.xlsx');
 const activated=await activate(f,r);assert(activated.ok);assert.notEqual(c.workbook.file,'leads.xlsx');assert.equal(c.enabled,false);assert.equal(c.reviewRequired,false);assert.equal(c.mapping.Leads.status,'D');
 const enriched=await f.ops.enrich(c,activated.parsed);assert.equal(enriched.leads[0].carrier.id,enriched.leads[1].carrier.id);assert.equal(enriched.leads[0].carrier.identityStatus,'source_dot');assert.equal(enriched.leads[0].carrier.provenance.sourceLabel,'Authorized lead export');assert.match(enriched.leads[0].importProtection,/Prior attempt/);
 await f.ops.replies.refreshHistory();assert.equal(Object.values((await f.ops.replies.load()).roots)[0].carrierId,enriched.leads[0].carrier.id);
 assert.deepEqual(await fs.readFile(path.join(f.dataDir,'leads.xlsx')),f.original);
 const saved=await f.ops.imports.download(r.revisionId,'working');await fs.appendFile(path.join(f.dataDir,c.workbook.file),' ');assert.deepEqual((await f.ops.imports.download(r.revisionId,'working')).bytes,saved.bytes);
 const status=await f.ops.importStatus('c1');await f.ops.undo({campaignId:'c1',expectedToken:status.activationToken,confirmActivation:true});assert.equal(c.workbook.file,'leads.xlsx');assert.equal(c.enabled,false);assert.equal(c.reviewRequired,true);assert.equal(c.importRevision,undefined);
 assert.deepEqual(await fs.readFile(path.join(f.dataDir,'leads.xlsx')),f.original);assert.equal(f.state.history[recipient].teamToken,'PRIVATE_TEAM_SECRET');
});

test('activation refuses stale/corrupt/cross-campaign revisions and running outreach; failed state publication retains prior campaign and data',async(t)=>{
 const f=await workspace(t),r=await revision(f),before=structuredClone(f.state.campaigns[0]),status=await f.ops.importStatus('c1');
 f.state.campaigns[0].name='Changed';await assert.rejects(f.ops.activate({campaignId:'c1',revisionId:r.revisionId,expectedToken:status.activationToken,confirmActivation:true}),/changed/);f.state.campaigns[0].name=before.name;
 f.state.automation.enabled=true;await assert.rejects(activate(f,r),/Stop outreach/);f.state.automation.enabled=false;
 const persist=f.ops.persist;f.ops.persist=async()=>{throw new Error('State disk unavailable');};await assert.rejects(activate(f,r),/disk unavailable/);f.ops.persist=persist;assert.deepEqual(f.state.campaigns[0],before);assert.deepEqual(await fs.readFile(path.join(f.dataDir,'leads.xlsx')),f.original);
 const file=path.join(f.ops.imports.workspaceDir,'revisions',r.revisionId,'working.xlsx');await fs.appendFile(file,'corrupt');await assert.rejects(activate(f,r),/changed/);assert.deepEqual(f.state.campaigns[0],before);
});

test('captured opt-outs guard production immediately, persist normal suppression, retry team delivery and survive reviewed revision activation and restart',async(t)=>{
 const f=await workspace(t);f.state.settings.team.enabled=true;f.ops.team.call=async()=>{throw new Error('Coordinator offline');};
 await f.ops.replies.ingest(eml({text:'Remove me from your list.'}),account,{type:'eml'});assert.match(f.ops.guard(recipient),/opt-out/);assert.match(f.state.suppression[recipient],/Captured carrier opt-out/);
 await f.ops.flushSuppression();assert.equal(Object.keys(f.state.replySuppressionOutbox).length,1);assert.equal((await f.ops.status()).sharedProtection.pending,1);
 f.ops.team.call=async(action,input)=>{f.calls.push({action,input});return {ok:true};};await f.ops.flushSuppression();assert.equal(Object.keys(f.state.replySuppressionOutbox).length,0);assert.equal(f.calls[0].action,'suppress');
 await f.ops.replies.refreshHistory();assert.equal(Object.keys(f.state.replySuppressionOutbox).length,0);
 const r=await revision(f);await activate(f,r);assert.match(f.ops.guard(recipient),/opt-out/);assert.match(f.state.suppression[recipient],/opt-out/);
 const list=await f.ops.replies.list(),detail=await f.ops.replies.detail(list.rows[0].id,'conversation'),message=detail.messages[0];
 await f.ops.replies.review({messageId:message.id,expectedReview:message.reviewVersion,category:'pricing',note:'Inspecting the original evidence'});assert.match(f.ops.guard(recipient),/opt-out/);
 await assert.rejects(f.ops.replies.review({messageId:message.id,expectedReview:message.reviewVersion,category:'interested',note:'Stale browser tab'}),/changed/);
 const second=new CarrierWorkspace({dataDir:f.dataDir,state:f.state,persist:f.persist,readWorkbook:f.read,team:f.ops.team,python:f.imports.python,env:{}});await second.initialize();assert.match(second.guard(recipient),/opt-out/);
});

test('reply evidence storage failure fails closed and clears only after durable recovery',async(t)=>{
 const f=await workspace(t),persist=f.ops.replies.persist;f.ops.replies.persist=async()=>{throw new Error('Reply disk unavailable');};await assert.rejects(f.ops.replies.ingest(eml({text:'Remove me.'}),account),/disk unavailable/);assert.match(f.ops.guard('another@example.com'),/storage failed/);
 f.ops.replies.persist=persist;await f.ops.replies.ingest(eml({text:'Remove me.'}),account);assert.equal(f.ops.guard('another@example.com'),null);assert.match(f.ops.guard(recipient),/opt-out/);
});

test('real capture configuration keeps secrets external, requires explicit opt-in, validates TLS/provider rules and isolates experiment flags',async(t)=>{
 const f=await workspace(t);const base={enabled:true,auto:false,since:'2026-10-01',batch:25,mailboxes:[{id:'rep1',email:account,host:'mail.example.com',passwordEnv:'REP_IMAP_PASSWORD'}]};
 await assert.rejects(f.ops.configure(base),/Confirm/);await assert.rejects(f.ops.configure({...base,confirmReadOnly:true,mailboxes:[{...base.mailboxes[0],password:'secret'}]}),/secret/);
 await assert.rejects(f.ops.configure({...base,confirmReadOnly:true,mailboxes:[{...base.mailboxes[0],provider:'outlook'}]}),/OAuth/);
 await assert.rejects(f.ops.configure({...base,confirmReadOnly:true,mailboxes:[{...base.mailboxes[0],port:143}]}),/993/);
 await f.ops.configure({...base,confirmReadOnly:true});const status=await f.ops.status();assert.equal(status.enabled,true);assert.equal(status.mailboxes[0].credentialsConfigured,false);assert.equal(status.configurationSource,'Saved on this PC');assert(!JSON.stringify(status).includes('secret'));
 f.ops.capture.running=true;await assert.rejects(f.ops.configure({...base,enabled:false}),/current mailbox/);f.ops.capture.running=false;
 delete f.state.replyCapture;const env=f.ops.captureEnv();assert.equal(env.FC_EXPERIMENT_REPLY_CAPTURE_ENABLED,undefined);
});
