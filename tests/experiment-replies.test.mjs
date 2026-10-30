import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ExperimentReplies, DEMO_ACCOUNT } from '../src/experiment-replies.mjs';
import { fixture, eml, account, recipient, originalId, dsn } from './fixtures/replies.mjs';

test('exact references/participants create durable conversations; replay and restart do not duplicate or alter source history', async (t) => {
  const f=await fixture(t);
  const result=await f.replies.ingest(eml(),account);
  assert.equal(result.match,'exact');
  assert.equal((await f.replies.ingest(eml(),account)).duplicate,true);
  const restarted=new ExperimentReplies({imports:f.imports});
  const list=await restarted.list(); assert.equal(list.total,1); assert.equal(list.summary.humanMessages,1);
  const detail=await restarted.detail(list.rows[0].id,'conversation');
  assert.equal(detail.root.followUpPaused,true); assert.equal(detail.messages[0].category,'pricing');
  assert(!JSON.stringify(await restarted.load()).includes('PRIVATE_TEAM_SECRET'));
  assert(!JSON.stringify(await restarted.load()).includes('PRIVATE_TOKEN_HASH'));
  assert.equal(await fs.readFile(path.join(f.dataDir,'state.json'),'utf8'),f.before);
});

test('subject-only, wrong-participant, multiple-root and Message-ID collisions stay in review; unrelated mail is not retained', async (t) => {
  const {replies}=await fixture(t);
  assert.equal((await replies.ingest(eml({reference:null}),account)).match,'review');
  assert.equal((await replies.ingest(eml({id:'<other@example.com>',from:'other@example.com'}),account)).match,'review');
  assert.equal((await replies.ingest(eml({id:'<wrong-to@example.com>',to:'unrelated@example.com'}),account)).match,'review');
  assert.equal((await replies.ingest(eml({id:'<unrelated@example.com>',from:'unknown@example.com',reference:null}),account)).ignored,true);
  await replies.ingest(eml({id:'<collision@example.com>'}),account);
  assert.equal((await replies.ingest(eml({id:'<collision@example.com>',text:'Different content'}),account)).match,'review');
  await replies.transaction((state)=>{const root=Object.values(state.roots)[0];state.roots.duplicate={...root,id:'duplicate'};});
  assert.equal((await replies.ingest(eml({id:'<ambiguous@example.com>'}),account)).match,'review');
});

test('opt-outs protect known contacts even without a thread match; labels and backfill/revisions cannot silently erase them', async (t) => {
  const {replies,imports}=await fixture(t);
  const result=await replies.ingest(eml({reference:null,text:'Please remove me from your list.'}),account);
  assert.equal(result.match,'review');
  const state=await replies.load(), message=state.messages[result.messageId], root=Object.values(state.roots)[0];
  assert.equal(root.followUpPaused,true); assert.equal(Object.values(state.protections).length,1);
  await assert.rejects(replies.review({messageId:message.id,category:'pricing',note:'',rootId:root.id,confirmLink:true}),/record your evidence/);
  await replies.review({messageId:message.id,category:'pricing',note:'Original mailbox inspected; linked manually',rootId:root.id,confirmLink:true});
  assert.equal(Object.values((await replies.load()).protections).length,1);
  assert.match((await imports.replyProtections({}))[recipient][0],/Opt-out/);
  assert((await replies.list()).protectionNote.includes('normal app'));
});

test('automatic replies and bounces never become human counts or opt-outs; quoted remove instructions do not suppress', async (t)=>{
  const {replies}=await fixture(t);
  await replies.ingest(eml({text:'Interested\n\nOn Tuesday, Dispatch wrote:\nPlease remove me'}),account);
  await replies.ingest(eml({id:'<auto@example.com>',headers:'Auto-Submitted: auto-replied\r\n',text:'Please remove me'}),account);
  await replies.ingest(dsn(),account);
  const list=await replies.list(); assert.equal(list.summary.humanMessages,1); assert.equal(list.summary.automatedMessages,1); assert.equal(list.summary.bounceNotices,1); assert.equal(list.summary.protectedContacts,0);
});

test('Sent marker reconciliation retries pending matches and captured outbound responses support nested replies', async(t)=>{
  const f=await fixture(t);
  f.state.tracking.records[f.trackingId].messageIds=[];
  await fs.writeFile(path.join(f.dataDir,'state.json'),JSON.stringify(f.state));
  const first=await f.replies.ingest(eml(),account); assert.equal(first.match,'review');
  const sent=eml({id:originalId,from:account,to:recipient,reference:null,subject:'Dispatch support',html:`<div data-fc-tracking="${f.trackingId}">Original introduction</div>`});
  assert.equal(await f.replies.sentCopy(sent,account),true);
  assert.equal((await f.replies.load()).messages[first.messageId].match,'exact');
  await f.replies.ingest(eml({id:'<our-response@example.com>',from:account,to:recipient,reference:'<reply-one@example.com>',text:'Our actual fee terms'}),account);
  assert.equal((await f.replies.ingest(eml({id:'<nested@example.com>',reference:'<our-response@example.com>',text:'Tell me more'}),account)).match,'exact');
});

test('demo data stays separate, duplicate demo loads are idempotent and review notes persist', async(t)=>{
  const {replies}=await fixture(t);
  await replies.seedDemo(); await replies.seedDemo();
  assert.equal((await replies.list()).total,0);
  const demo=await replies.list(new URLSearchParams({mode:'demo'})); assert.equal(demo.total,8); assert.equal(demo.summary.protectedContacts,1);
  const pending=demo.rows.find((r)=>r.type==='review');const detail=await replies.detail(pending.id,'review');
  const root=detail.candidates[0];
  await replies.review({messageId:pending.id,rootId:root.id,confirmLink:true,category:'how_it_works',note:'Synthetic mailbox reviewed'});
  assert.equal((await replies.detail(pending.id,'review')).root.id,root.id);
  assert.equal((await replies.load()).messages[pending.id].classificationSource,'manual');
  assert((await replies.accounts()).some((a)=>a.email===DEMO_ACCOUNT));
});

test('serialized writes do not lose messages; failed persistence does not advance cursor or poison the queue', async(t)=>{
  const {replies}=await fixture(t); await replies.refreshHistory();
  await Promise.all([1,2,3].map((n)=>replies.ingest(eml({id:`<parallel-${n}@example.com>`}),account)));
  assert.equal((await replies.list()).summary.humanMessages,3);
  const persist=replies.persist.bind(replies); replies.persist=async()=>{throw new Error('Synthetic storage failure');};
  await assert.rejects(replies.recordParsed(null,account,null,{key:'cursor',value:{uid:10}}),/storage failure/);
  assert.equal((await replies.load()).cursors.cursor,undefined);
  replies.persist=persist; await replies.recordParsed(null,account,null,{key:'cursor',value:{uid:10}});
  assert.equal((await replies.load()).cursors.cursor.uid,10);
});

test('original Sent copies are not inbound replies; review items can be ignored and restored without deleting evidence',async(t)=>{
 const {replies}=await fixture(t);
 const sent=await replies.ingest(eml({id:originalId,from:account,to:recipient,reference:null,subject:'Dispatch support'}),account);
 assert.equal(sent.sourceCopy,true);assert.equal((await replies.list()).total,0);
 const pending=await replies.ingest(eml({reference:null,text:'Please remove me'}),account);
 await replies.review({messageId:pending.messageId,action:'ignore',note:'Unrelated topic reviewed in mailbox'});
 assert.equal((await replies.list()).summary.needsMatch,0);
 assert.equal((await replies.list(new URLSearchParams({category:'ignored'}))).total,1);
 assert.equal(Object.keys((await replies.load()).protections).length,1);
 await replies.review({messageId:pending.messageId,action:'restore',note:'Returning for a second review'});
 assert.equal((await replies.list()).summary.needsMatch,1);
});
