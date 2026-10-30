import test from 'node:test';
import assert from 'node:assert/strict';
import { workspace } from './fixtures/carrier-workspace.mjs';
import { eml,account,recipient,originalId } from './fixtures/replies.mjs';
import { sharedReplyHold } from '../src/conversation-assistant.mjs';
import { carrierIntent,extractCarrierDetails } from '../src/carrier-intelligence.mjs';
const now=Date.parse('2026-11-06T13:00:00Z');
async function setup(t,text=null){const f=await workspace(t);f.ops.assistant.clock=()=>now;f.ops.replies.clock=()=>now;if(text)await f.ops.replies.ingest(eml({text}),account);const rows=await f.ops.assistant.list(),root=rows.rows.find((r)=>r.type==='conversation');const get=()=>f.ops.assistant.detail(root.id,'conversation');return {...f,desk:f.ops.assistant,root,get};}
async function suggest(f,extra={}){const d=await f.get();return f.desk.draft({rootId:f.root.id,expectedContext:d.assistant.version,requestId:'request-'+crypto.randomUUID(),...extra});}
async function approve(f,draft){const d=await f.get();return f.desk.approve({id:draft.id,expectedVersion:draft.version,expectedContext:d.assistant.version,confirm:true,note:'Reviewed exact recipient, wording and evidence'});}

test('carrier intent keeps pricing neutral, handles negation/mixed messages and honors explicit operator review',()=>{
 const base={kind:'human',direction:'inbound',match:'exact',category:'unclassified',classificationSource:'rule'};
 for(const [text,intent]of [['I am interested. Send the agreement.','interested'],['Not really interested.','negative'],['What are your fees?','pricing'],['We already have a dispatcher, but what are your rates?','mixed'],['Sounds good, tell me more.','positive']])assert.equal(carrierIntent({...base,text}).intent,intent,text);
 assert.equal(carrierIntent({...base,text:'not interested',category:'interested',classificationSource:'manual'}).confidence,'operator_reviewed');assert.equal(carrierIntent({...base,match:'review',text:'yes interested'}).intent,'needs_review');assert.equal(carrierIntent({...base,kind:'automated',text:'I am interested'}).sentiment,'neutral');
});
test('detail extraction identifies phone/equipment/ZIP without treating DOT, trailer length, automation or negated equipment as confirmed facts',()=>{
 const base={id:'message',kind:'human',direction:'inbound',match:'exact',from:[recipient],capturedAt:new Date(now).toISOString()};
 const details=extractCarrierDetails({...base,text:"My name is John Smith. Phone is (817) 555-0199. ZIP is 75001. We have 2 trucks and a 53 ft reefer. USDOT 12345, MC 75002. No flatbed."});
 assert(details.some((d)=>d.field==='phone'&&d.value==='(817) 555-0199'));assert(details.some((d)=>d.field==='zip'&&d.value==='75001'));assert(details.some((d)=>d.field==='equipment'&&d.value.includes('reefer')&&!d.value.includes('flatbed')));assert(details.some((d)=>d.field==='truckCount'&&d.value==='2'));
 assert(!extractCarrierDetails({...base,text:'USDOT 75001. MC 75002. We have 53 ft dry van.'}).some((d)=>d.field==='zip'||d.field==='truckCount'));
 assert(extractCarrierDetails({...base,text:'We have 2 trucks and 53 ft dry vans.'}).some((d)=>d.field==='equipment'&&d.value.includes('dry vans')));
 assert.equal(extractCarrierDetails({...base,kind:'automated',text:'Phone: 8175550199 ZIP: 75001'}).length,0);
});
test('all known sent conversations include no-response work; suggestions wait, use editable templates and never become sent on approval',async(t)=>{
 const f=await setup(t);assert.equal(f.root.noReply,true);assert.equal(f.root.followUpReady,true);const made=await suggest(f);assert.equal(made.draft.status,'draft');assert.match(made.draft.body,/following up/);assert.equal((made.draft.body.match(/\?/g)||[]).length,1);await assert.rejects(f.desk.approved(made.draft.id),/approved/);
 const approved=await approve(f,made.draft);assert.equal(approved.draft.status,'approved');assert.equal((await f.desk.approved(made.draft.id)).draft.body,made.draft.body);assert.equal((await f.get()).assistant.draft.reportedAt,undefined);
 await f.desk.reportSent({id:made.draft.id,expectedVersion:approved.draft.version,confirm:true,note:'Sent myself using native Reply in the correct mailbox'});const after=await f.get();assert.equal(after.assistant.draft.status,'reported_sent');assert.equal(after.assistant.followUpReady,false);assert.equal(f.state.history[recipient].status,'Sent');
 await assert.rejects(f.desk.draft({id:made.draft.id,rootId:f.root.id,expectedContext:after.assistant.version,expectedVersion:after.assistant.draft.version,body:'Changed past sent report',requestId:'past-report-edit'}),/history/);
});
test('approval binds exact draft, source and recipient; edits or new replies invalidate it and retain earlier versions',async(t)=>{
 const f=await setup(t,'I am interested. Please send details.');const made=await suggest(f);
 await assert.rejects(f.desk.approve({id:made.draft.id,expectedVersion:made.draft.version,expectedContext:(await f.get()).assistant.version,confirm:false,note:'Reviewed'}),/Confirm/);
 const approved=await approve(f,made.draft);const ctx=(await f.get()).assistant;
 const edited=await f.desk.draft({id:made.draft.id,expectedVersion:approved.draft.version,rootId:f.root.id,expectedContext:ctx.version,body:'Thanks for your interest. Please confirm your best phone, equipment and ZIP.',requestId:'same-draft-edit'});assert.equal(edited.draft.status,'draft');assert.equal(edited.draft.previousVersions.length,1);await assert.rejects(f.desk.approved(made.draft.id),/approved/);
 await approve(f,edited.draft);await f.ops.replies.ingest(eml({id:'<new-message@example.com>',text:'My phone is 8175550199. ZIP: 75001.'}),account);await assert.rejects(f.desk.approved(made.draft.id),/review again/);
});
test('carrier detail confirmation cites actual message evidence, preserves conflicts and asks to confirm missing data',async(t)=>{
 const f=await setup(t,'I am interested. Phone: 8175550199. Equipment: dry van. ZIP: 75001.');let view=await f.get(),ctx=view.assistant;assert(ctx.missing.includes('phone'));
 await assert.rejects(f.desk.confirmDetails({rootId:f.root.id,expectedContext:ctx.version,confirm:true,fields:[{field:'zip',value:'99999',messageId:ctx.lastMessageId}]}),/quote/);
 await f.desk.confirmDetails({rootId:f.root.id,expectedContext:ctx.version,confirm:true,fields:[{field:'phone',value:'8175550199',messageId:ctx.lastMessageId},{field:'zip',value:'75001',messageId:ctx.lastMessageId}]});view=await f.get();assert(!view.assistant.missing.includes('phone'));assert.equal(view.assistant.fields.phone.confirmed.source,'operator-reviewed carrier email');
 await f.ops.replies.ingest(eml({id:'<phone-change@example.com>',text:'My phone is 2145550177. ZIP is 75002.'}),account);view=await f.get();assert(view.assistant.fields.phone.conflict);assert(view.assistant.missing.includes('phone'));
 const draft=await suggest(f);assert.match(draft.draft.body,/Which phone number/);
});
test('opt-outs, uncertain source history and unmatched pending messages hold approval and approved export',async(t)=>{
 const f=await setup(t,'What are your fees?');const made=await suggest(f);await approve(f,made.draft);
 await f.ops.replies.ingest(eml({id:'<unmatched@example.com>',reference:null,text:'Wait, please check my latest question.'}),account);await assert.rejects(f.desk.approved(made.draft.id),/matching/);
 const pending=(await f.ops.replies.load()).messages;const m=Object.values(pending).find((m)=>m.match==='review');const detail=await f.ops.replies.detail(m.id,'review');await f.ops.replies.review({messageId:m.id,action:'ignore',expectedReview:detail.messages[0].reviewVersion,note:'Unrelated message checked in original mailbox'});
 const fresh=await suggest(f);await approve(f,fresh.draft);await f.ops.replies.ingest(eml({id:'<stop@example.com>',text:'Please remove me from your list.'}),account);await assert.rejects(f.desk.approved(fresh.draft.id),/protected/);await assert.rejects(suggest(f),/protected/);
});
test('read markers are bound to displayed evidence and new carrier messages return to dashboard attention',async(t)=>{
 const f=await setup(t,'Tell me more.');let c=(await f.get()).assistant;assert(c.unread);await f.desk.seen({rootId:f.root.id,expectedContext:c.version,messageId:c.latestInboundId});assert.equal((await f.get()).assistant.unread,false);
 await f.ops.replies.ingest(eml({id:'<next-unread@example.com>',text:'I am interested.'}),account);await assert.rejects(f.desk.seen({rootId:f.root.id,expectedContext:c.version,messageId:c.latestInboundId}),/newer/);const dashboard=await f.desk.dashboard();assert.equal(dashboard.summary.unread,1);assert.equal(dashboard.summary.interested,1);assert(dashboard.highlights.some((r)=>r.id===f.root.id));
});
test('reply template edits are versioned, active templates use explicit allowed fields and stale editors cannot overwrite changes',async(t)=>{
 const f=await setup(t,'Tell me more.');const library=await f.desk.library();const t1=library.templates[0];await assert.rejects(f.desk.saveTemplate({name:'Bad',category:'positive',body:'{{execute_this}}'}),/Unknown/);
 const saved=await f.desk.saveTemplate({name:'Our reply',category:'positive',body:'Hi {{contact_name}},\nPlease confirm:\n{{confirmation_questions}}',active:true});assert(saved.template.id);
 await f.desk.saveTemplate({...t1,expectedVersion:t1.version,name:'Edited starter'});await assert.rejects(f.desk.saveTemplate({...t1,expectedVersion:t1.version,name:'Stale editor'}),/changed/);
 const draft=await suggest(f,{templateId:saved.template.id});assert.match(draft.draft.body,/Please confirm/);assert(!draft.draft.body.includes('{{'));
});
test('known imported carriers without tool-sent history are excluded from the conversation inbox',async(t)=>{
 const f=await setup(t);const result=await f.ops.replies.ingest(eml({id:'<unsent-carrier@example.net>',from:'new-carrier@example.com',reference:null,text:'I am interested.'}),account);assert.equal(result.ignored,true);assert.equal((await f.desk.list()).total,1);await assert.rejects(f.desk.startConversation({}),/tool-sent/);
});
test('a matching Sent copy is distinct from approval/reporting and a later response reopens attention',async(t)=>{
 const f=await setup(t,'I am interested.');const made=await suggest(f);await approve(f,made.draft);let raw=eml({id:'<approved-outbound@example.com>',from:account,to:recipient,reference:originalId,text:made.draft.body+'\n\nExisting mailbox signature'}).toString().replace(/Date:.*?\r\n/,'Date: Fri, 06 Nov 2026 13:01:00 +0000\r\n');await f.ops.replies.ingest(Buffer.from(raw),account);const observed=await f.ops.replies.ingest(Buffer.from(raw),account,{type:'imap',folder:'Sent',folderRole:'sent',uid:22});assert.equal(observed.duplicate,true);let ctx=(await f.get()).assistant;assert.equal(ctx.sentCopyMatches.length,1);assert.equal(ctx.draft.status,'approved');assert.equal(ctx.needsReply,false);
 raw=eml({id:'<carrier-after-outbound@example.com>',reference:'<approved-outbound@example.com>',text:'Please call me to discuss.'}).toString().replace(/Date:.*?\r\n/,'Date: Fri, 06 Nov 2026 13:03:00 +0000\r\n');f.ops.replies.clock=()=>now+180000;await f.ops.replies.ingest(Buffer.from(raw),account);assert.equal((await f.get()).assistant.needsReply,true);
});

test('reviewed conflicting details can be resolved explicitly and later changes require another review',async(t)=>{
 const f=await setup(t,'Phone: 8175550199. ZIP: 75001.');await f.ops.replies.ingest(eml({id:'<replacement-detail@example.com>',text:'Correction: phone is 2145550177. ZIP: 75002.'}),account);let c=(await f.get()).assistant;assert(c.fields.phone.conflict);
 const candidate=c.fields.phone.candidates.find((v)=>v.value==='2145550177');await f.desk.confirmDetails({rootId:f.root.id,expectedContext:c.version,confirm:true,fields:[{field:'phone',value:candidate.value,messageId:candidate.messageId}],note:'Carrier corrected the old phone; reviewed both messages'});c=(await f.get()).assistant;assert.equal(c.fields.phone.conflict,false);assert.equal(c.fields.phone.confirmed.value,'2145550177');assert.equal(c.fields.phone.candidates.length,2);
 await f.ops.replies.ingest(eml({id:'<later-detail@example.com>',text:'My phone is 4695550123.'}),account);assert.equal((await f.get()).assistant.fields.phone.conflict,true);
});
test('a changed-address message referencing the conversation blocks old approvals and cancellation withdraws copied-draft access',async(t)=>{
 const f=await setup(t,'I am interested.');const made=await suggest(f);await approve(f,made.draft);await f.ops.replies.ingest(eml({id:'<changed-address-review@example.com>',from:'changed-address@example.net',text:'Use this new address for me.'}),account);assert.equal((await f.get()).assistant.pendingReviewCount,1);await assert.rejects(f.desk.approved(made.draft.id),/matching/);
 const d=(await f.get()).assistant.draft;await f.desk.cancelDraft({id:d.id,expectedVersion:d.version});assert.equal((await f.get()).assistant.draft.status,'cancelled');
});
test('uncertain sends and unsupported template syntax remain explicit errors',async(t)=>{
 const f=await setup(t,'Sounds good.');f.state.history[recipient].status='Uncertain';await assert.rejects(suggest(f),/uncertain/);await assert.rejects(f.desk.saveTemplate({name:'Unclosed',category:'neutral',body:'Please confirm {{equipment'}),/Close every/);
});

test('shared opt-outs and uncertain submissions hold replies while cold-outreach deduplication alone permits a carrier response',()=>{
 assert.match(sharedReplyHold({suppression:{[recipient]:'Captured carrier opt-out'}},recipient),/Shared contact protection/);
 assert.match(sharedReplyHold({records:{[recipient]:{status:'Uncertain'}},suppression:{}},recipient),/uncertain/);
 assert.equal(sharedReplyHold({records:{[recipient]:{status:'Sent'}},suppression:{[recipient]:'Previously contacted or uncertain in workbook'}},recipient),null);
});

test('historical inbox order uses message time across backfills and header display names never confirm carrier identity',async(t)=>{
 const f=await setup(t);const second='second@example.com',tid='second-tool-send',ref='<second-tool-send@example.com>';
 f.state.history[second]={...f.state.history[recipient],trackingId:tid,recipient:second,company:'Second Fleet'};f.state.tracking.records[tid]={...f.state.tracking.records[f.trackingId],id:tid,recipient:second,messageIds:[ref]};await f.persist();await f.ops.replies.refreshHistory();
 await f.ops.replies.ingest(eml({id:'<latest-second@example.com>',from:'Maria Lopez <'+second+'>',reference:ref,text:'What are your fees? '+('More context. '.repeat(30))+'Dedicated lane questions.'}),account);
 await f.ops.replies.ingest(Buffer.from(eml({id:'<older-owner@example.com>',from:'John Smith <'+recipient+'>',text:'What lanes do you cover?'}).toString().replace('Thu, 29 Oct 2026 12:00:00 +0000','Wed, 28 Oct 2026 16:00:00 +0000')),account);
 const rows=(await f.desk.list(new URLSearchParams({work:'all'}))).rows;assert.equal(rows[0].recipient,second);assert.equal(rows[0].contactName,'Maria Lopez');const detail=await f.desk.detail(rows[0].id,'conversation');assert.equal(detail.assistant.fields.contactName.confirmed,null);assert.deepEqual(detail.assistant.fields.contactName.candidates,[]);assert.equal(detail.root.recipient,second);for(const q of ['Maria Lopez','Dedicated lane questions'])assert.deepEqual((await f.desk.list(new URLSearchParams({q}))).rows.map((r)=>r.recipient),[second]);
});
