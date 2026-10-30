import test from 'node:test';import assert from 'node:assert/strict';
import {workspace} from './fixtures/carrier-workspace.mjs';import {eml,account,recipient,originalId} from './fixtures/replies.mjs';
const list=(f,params={})=>f.ops.assistant.list(new URLSearchParams({group:'carriers',...params}));
const old=(raw)=>Buffer.from(raw.toString().replace('Thu, 29 Oct 2026 12:00:00 +0000','Mon, 02 Nov 2020 12:00:00 +0000'));
test('carrier history includes older unlinked chains, native sent replies and exact replies only for tool-contacted peers',async(t)=>{
 const f=await workspace(t);await f.ops.replies.ingest(old(eml({reference:null,id:'<older-chain@example.com>',text:'Earlier carrier context.'})),account);
 await f.ops.replies.ingest(eml({id:'<matched-latest@example.com>',text:'I am interested.'}),account);
 await f.ops.replies.ingest(eml({from:account,to:recipient,id:'<native-answer@example.com>',reference:'<matched-latest@example.com>',text:'Thanks. What lanes work for you?'}),account);
 await f.ops.replies.ingest(eml({from:'second@example.com',reference:null,text:'Unsent imported contact, not in scope.'}),account);
 const r=await list(f);assert.equal(r.total,1);assert.equal(r.summary.active,1);assert.equal(r.rows[0].historyCount,3);assert.equal(r.rows[0].needsReply,false);assert.equal(r.rows[0].reviewRequired,false);assert.equal(r.rows[0].carrierStatus,'active');
 const d=await f.ops.assistant.detail(r.rows[0].id,'conversation');assert.equal(d.carrierHistory.messages.length,3);assert.equal(d.assistant.pendingReviewCount,0);assert(d.carrierHistory.messages.some(m=>m.contactHistoryOnly&&m.text.includes('Earlier carrier')));assert(!JSON.stringify(d.carrierHistory).includes('Unsent imported'));assert.equal((await list(f,{q:'Earlier carrier context'})).total,1);
});
test('a known carrier without thread references appears in Active and In review without authorizing an automatic reply',async(t)=>{
 const f=await workspace(t);await f.ops.replies.ingest(eml({reference:null,text:'I am interested. My earlier subject was different.'}),account);
 const r=await list(f,{work:'active'});assert.equal(r.total,1);assert.equal(r.rows[0].carrierStatus,'in_review');assert.equal((await list(f,{work:'in_review'})).total,1);
 const d=await f.ops.assistant.detail(r.rows[0].id,'conversation');assert.equal(d.carrierHistory.messages[0].match,'review');assert.equal(d.assistant.pendingReviewCount,1);await assert.rejects(f.ops.assistant.draft({rootId:r.rows[0].id,expectedContext:d.assistant.version,requestId:'carrier-review-blocked'}),/matching/);
});
test('multiple tool sends group into one carrier per mailbox; workflow status persists and stale changes are rejected',async(t)=>{
 const f=await workspace(t),id='a2345678-1234-1234-1234-123456789abc';f.state.tracking.records[id]={...f.state.tracking.records[f.trackingId],id,sendStatus:'webmail_sent',messageIds:['<another-tool-send@example.com>']};await f.persist();await f.ops.replies.refreshHistory();
 const r=(await list(f)).rows[0];assert.equal((await list(f)).total,1);const input={carrierInboxId:r.carrierInboxId,expectedVersion:r.statusVersion,stage:'follow_up',followUpAt:'2026-11-10T13:00:00Z',note:'Check whether the truck is available.'};await f.ops.inbox.update(input);await assert.rejects(f.ops.inbox.update({...input,stage:'active'}),/changed/);
 let next=(await list(f)).rows[0];assert.equal(next.carrierStatus,'follow_up');assert.equal(next.followUpAt,'2026-11-10T13:00:00.000Z');assert.equal((await f.ops.assistant.detail(next.id,'conversation')).carrierHistory.roots.length,2);
 const {CarrierWorkspace}=await import('../src/carrier-workspace.mjs');const restarted=new CarrierWorkspace({dataDir:f.dataDir,state:f.state,persist:f.persist,readWorkbook:f.read,team:{call:async()=>({})},python:f.imports.python,env:{}});await restarted.initialize();assert.equal((await restarted.inbox.list()).rows[0].carrierStatus,'follow_up');
});
test('carrier workflow changes never clear opt-outs and newly received messages return a closed carrier to Active review',async(t)=>{
 const f=await workspace(t);await f.ops.replies.ingest(eml({text:'I am interested.'}),account);let row=(await list(f)).rows[0];await f.ops.inbox.update({carrierInboxId:row.carrierInboxId,expectedVersion:row.statusVersion,stage:'closed',note:'Closed for now.'});assert.equal((await list(f,{work:'active'})).total,0);
 await f.ops.replies.ingest(eml({id:'<new-after-closed@example.com>',text:'I have another question.'}),account);assert.equal((await list(f,{work:'active'})).total,1);
 await f.ops.replies.ingest(eml({id:'<carrier-optout@example.com>',reference:null,text:'Please remove me from your list.'}),account);row=(await list(f)).rows[0];await f.ops.inbox.update({carrierInboxId:row.carrierInboxId,expectedVersion:row.statusVersion,stage:'active'});assert.match(f.ops.guard(recipient),/opt-out/);assert.equal((await list(f,{work:'active'})).total,0);
});
test('carrier read markers reject newer evidence and preserve explicit unread state',async(t)=>{
 const f=await workspace(t);await f.ops.replies.ingest(eml({text:'I am interested.'}),account);let row=(await list(f)).rows[0];await f.ops.inbox.seen({carrierInboxId:row.carrierInboxId,expectedVersion:row.statusVersion,messageId:row.latestInboundId});assert.equal((await list(f)).rows[0].unread,false);assert.equal((await f.ops.assistant.detail(row.id,'conversation')).assistant.unread,false);
 row=(await list(f)).rows[0];await f.ops.inbox.seen({carrierInboxId:row.carrierInboxId,expectedVersion:row.statusVersion,messageId:row.latestInboundId,unread:true});assert.equal((await list(f)).rows[0].unread,true);
 await f.ops.replies.ingest(eml({id:'<new-unread-carrier@example.com>',text:'One more question.'}),account);await assert.rejects(f.ops.inbox.seen({carrierInboxId:row.carrierInboxId,expectedVersion:row.statusVersion,messageId:row.latestInboundId}),/New carrier evidence/);
});
test('marking read dismisses the dashboard message while retaining its reply task and new replies restore the alert',async(t)=>{
 const f=await workspace(t);await f.ops.replies.ingest(eml({text:'I am interested.'}),account);let row=(await list(f)).rows[0];
 assert((await f.ops.assistant.dashboard()).highlights.some(r=>r.carrierInboxId===row.carrierInboxId));
 await f.ops.inbox.seen({carrierInboxId:row.carrierInboxId,expectedVersion:row.statusVersion,messageId:row.latestInboundId});
 let dashboard=await f.ops.assistant.dashboard();assert(!dashboard.highlights.some(r=>r.carrierInboxId===row.carrierInboxId));assert.equal(dashboard.summary.needsReply,1);assert.equal((await list(f,{work:'needs_reply'})).total,1);
 row=(await list(f)).rows[0];await f.ops.inbox.seen({carrierInboxId:row.carrierInboxId,expectedVersion:row.statusVersion,messageId:row.latestInboundId,unread:true});assert((await f.ops.assistant.dashboard()).highlights.some(r=>r.carrierInboxId===row.carrierInboxId));
 await f.ops.inbox.seen({carrierInboxId:row.carrierInboxId,expectedVersion:row.statusVersion,messageId:row.latestInboundId});await f.ops.replies.ingest(eml({id:'<new-dashboard-alert@example.com>',text:'One more question.'}),account);dashboard=await f.ops.assistant.dashboard();assert(dashboard.highlights.some(r=>r.carrierInboxId===row.carrierInboxId&&r.unread));
});
test('reusing monitor setup exposes environment references for the matching profile only and never enables capture automatically',async(t)=>{
 const f=await workspace(t);f.ops.env={FC_IMAP_USER:account,FC_IMAP_HOST:'mail.example.com',FC_IMAP_PASSWORD:'DO_NOT_EXPOSE'};f.ops.capture.env=f.ops.captureEnv();const s=await f.ops.status();assert.equal(s.enabled,false);assert.equal(s.setupCandidates[0].passwordEnv,'FC_IMAP_PASSWORD');assert.equal(s.setupCandidates[0].credentialsConfigured,true);assert(!JSON.stringify(s).includes('DO_NOT_EXPOSE'));f.ops.env.FC_IMAP_USER='unrelated@example.com';assert.equal((await f.ops.status()).setupCandidates.length,0);
});

test('new evidence in another carrier thread invalidates an old exact approval',async(t)=>{
 const f=await workspace(t);await f.ops.replies.ingest(eml({text:'I am interested.'}),account);let root=(await f.ops.assistant.list()).rows[0],c=(await f.ops.assistant.detail(root.id,'conversation')).assistant;
 const made=await f.ops.assistant.draft({rootId:root.id,expectedContext:c.version,requestId:'old-exact-contact-approval',body:'Thanks. Let us discuss the next steps.'});await f.ops.assistant.approve({id:made.draft.id,expectedVersion:made.draft.version,expectedContext:c.version,confirm:true,note:'Reviewed exact thread, account and recipient.'});
 const id='b2345678-1234-1234-1234-123456789abc';f.state.tracking.records[id]={...f.state.tracking.records[f.trackingId],id,sendStatus:'webmail_sent',messageIds:['<new-tool-thread@example.com>']};await f.persist();await f.ops.replies.refreshHistory();await f.ops.replies.ingest(eml({id:'<newer-other-thread@example.com>',reference:'<new-tool-thread@example.com>',text:'I have a new question.'}),account);await assert.rejects(f.ops.assistant.approved(made.draft.id),/another tool conversation|changed/);
});

test('reviewed independent chains keep their own reply subject',async(t)=>{
 const f=await workspace(t);await f.ops.replies.ingest(eml({reference:null,subject:'Equipment ready next week',text:'My trucks are ready. Are you available?'}),account);let d=await f.ops.assistant.detail((await list(f)).rows[0].id,'conversation'),m=d.carrierHistory.messages[0];await f.ops.replies.review({messageId:m.id,expectedReview:m.reviewVersion,category:'interested',note:'Reviewed the actual carrier sender and this independent email chain.',rootId:d.root.id,confirmLink:true});d=await f.ops.assistant.detail(d.root.id,'conversation');assert.equal(d.assistant.subject,'Equipment ready next week');const made=await f.ops.assistant.draft({rootId:d.root.id,expectedContext:d.assistant.version,requestId:'independent-subject-draft',body:'What day are the trucks ready to load?'});assert.equal(made.draft.subject,'Re: Equipment ready next week');
});

test('unlinked outgoing email does not manufacture an incoming response, unread alert or review queue item',async(t)=>{
 const f=await workspace(t);await f.ops.replies.ingest(eml({from:account,to:recipient,reference:null,id:'<unlinked-outgoing@example.com>',subject:'Different earlier outbound subject',text:'Checking whether you need dispatch help.'}),account);const r=await list(f);assert.equal(r.summary.active,0);assert.equal(r.summary.inReview,0);assert.equal(r.summary.unread,0);assert.equal(r.rows[0].responded,false);assert.equal(r.rows[0].carrierStatus,'waiting');assert.equal(r.rows[0].historyCount,1);
});
test('earlier ordinary outgoing context does not block a newer matched carrier response',async(t)=>{
 const f=await workspace(t);await f.ops.replies.ingest(old(eml({from:account,to:recipient,reference:null,id:'<earlier-outgoing@example.com>',text:'Earlier contact context.'})),account);await f.ops.replies.ingest(eml({text:'I am interested.'}),account);const row=(await list(f)).rows[0],d=await f.ops.assistant.detail(row.id,'conversation');assert.equal(d.assistant.pendingReviewCount,0);assert.equal(d.carrierHistory.messages.length,2);assert.equal(row.carrierStatus,'active');
});

test('a later captured incoming reply with the same header second as an outgoing reply still needs attention',async(t)=>{
 const f=await workspace(t);await f.ops.replies.ingest(eml({from:account,to:recipient,id:'<same-second-out@example.com>',text:'Which lanes work for you?'}),account);
 await f.ops.replies.ingest(eml({id:'<same-second-in@example.com>',text:'Can you help with Texas lanes?'}),account);
 assert.equal((await list(f)).rows[0].needsReply,true);
});
test('dashboard finds attention across the entire carrier backlog rather than the first page',async(t)=>{
 const f=await workspace(t);f.ops.assistant.clock=()=>Date.parse('2026-11-02T12:00:00Z');
 await f.ops.replies.transaction(s=>{const original=Object.values(s.roots)[0];original.sentAt='2026-10-01T12:00:00Z';for(let i=0;i<30;i++){const id=String(i+1).padStart(64,'0');s.roots[id]={...original,id,recipient:`recent-${i}@example.com`,sentAt:'2026-11-01T12:00:00Z',messageIds:[]};}});
 const first=await list(f);assert.equal(first.rows.some(r=>r.recipient===recipient),false);const dashboard=await f.ops.assistant.dashboard();assert.equal(dashboard.summary.followUpReady,1);assert(dashboard.highlights.some(r=>r.recipient===recipient));
});
test('recent native outgoing contact history postpones follow-up even without thread references',async(t)=>{
 const f=await workspace(t);f.ops.assistant.clock=()=>Date.parse('2026-10-31T13:00:00Z');await f.ops.replies.transaction(s=>{Object.values(s.roots)[0].sentAt='2026-10-01T12:00:00Z';});
 await f.ops.replies.ingest(eml({from:account,to:recipient,reference:null,id:'<recent-independent-out@example.com>',text:'Are you available next week?'}),account);
 const row=(await list(f)).rows[0],d=await f.ops.assistant.detail(row.id,'conversation');assert.equal(d.assistant.followUpReady,false);assert.equal(d.assistant.dueAt,'2026-11-01T12:00:00.000Z');await assert.rejects(f.ops.assistant.draft({rootId:row.id,expectedContext:d.assistant.version,requestId:'too-soon-after-independent-out'}),/not eligible/);
});
test('native outgoing contact history counts toward the follow-up limit without requiring thread references',async(t)=>{
 const f=await workspace(t);f.ops.assistant.clock=()=>Date.parse('2026-11-10T12:00:00Z');await f.ops.replies.ingest(eml({from:account,to:recipient,reference:null,id:'<independent-followup@example.com>',text:'Checking whether dispatch support is useful.'}),account);
 const row=(await list(f)).rows[0],d=await f.ops.assistant.detail(row.id,'conversation');assert.equal(d.assistant.followUps,1);assert.equal(d.assistant.followUpReady,false);await assert.rejects(f.ops.assistant.draft({rootId:row.id,expectedContext:d.assistant.version,requestId:'repeat-native-followup'}),/not eligible/);
});
test('closing or signing a carrier clears its reply task until another incoming message arrives',async(t)=>{
 for(const stage of ['closed','signed']){const f=await workspace(t);await f.ops.replies.ingest(eml({text:'I am interested.'}),account);const row=(await list(f)).rows[0];await f.ops.inbox.update({carrierInboxId:row.carrierInboxId,expectedVersion:row.statusVersion,stage});assert.equal((await list(f,{work:'needs_reply'})).total,0);await f.ops.replies.ingest(eml({id:`<new-after-${stage}@example.com>`,text:'One more question.'}),account);assert.equal((await list(f,{work:'needs_reply'})).total,1);}
});
