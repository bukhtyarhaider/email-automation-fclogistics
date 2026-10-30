import {digest} from './reply-parser.mjs';
import {isToolConversation,toolReferenceIndex,relatedToolRoots} from './tool-conversation-scope.mjs';
import {logicalTime,carrierIntent} from './carrier-intelligence.mjs';
import {replyReviewVersion} from './experiment-replies.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export const CARRIER_STAGES=['waiting','in_review','active','follow_up','signed','closed'];
export const carrierInboxId=(account,email)=>digest(`carrier-inbox-v1\n${account.toLowerCase()}\n${email.toLowerCase()}`);
const sorted=(messages)=>messages.slice().sort((a,b)=>logicalTime(a)-logicalTime(b)||String(a.capturedAt).localeCompare(String(b.capturedAt)));
const paired=(m,account,email)=>m.from?.length===1&&((m.from[0]===email&&(m.to?.includes(account)||m.deliveredTo===account))||(m.from[0]===account&&m.to?.includes(email)));
export class CarrierInbox {
 constructor({replies,assistant,state,clock=Date.now}){Object.assign(this,{replies,assistant,state,clock});}
 groups(s){
  const groups=new Map(),rootGroups=new Map(),byPair=new Map(),refIndexes=new Map();
  for(const root of Object.values(s.roots).filter(isToolConversation)){
   const id=carrierInboxId(root.account,root.recipient);let g=groups.get(id);
   if(!g){g={id,account:root.account,recipient:root.recipient,roots:[],messages:[]};groups.set(id,g);byPair.set(root.account+'\n'+root.recipient,g);}
   g.roots.push(root);rootGroups.set(root.id,g);
  }
  for(const m of Object.values(s.messages)){
   if(m.demo||m.match==='ignored')continue;
   const targets=new Set();if(rootGroups.get(m.rootId)?.account===m.account)targets.add(rootGroups.get(m.rootId));
   if(m.from?.length===1){if(m.from[0]===m.account){for(const to of m.to||[])if(byPair.has(m.account+'\n'+to))targets.add(byPair.get(m.account+'\n'+to));}else if(m.to?.includes(m.account)||m.deliveredTo===m.account){const g=byPair.get(m.account+'\n'+m.from[0]);if(g)targets.add(g);}}
   if(m.match==='review'){if(!refIndexes.has(m.account))refIndexes.set(m.account,toolReferenceIndex(s,m.account));for(const id of relatedToolRoots(s,m,m.account,refIndexes.get(m.account)))if(rootGroups.has(id))targets.add(rootGroups.get(id));}
   for(const g of targets)g.messages.push({...m,direction:m.direction||(paired(m,g.account,g.recipient)?m.from[0]===g.account?'outbound':'inbound':null),contactHistoryOnly:m.match==='review',reviewVersion:replyReviewVersion(m)});
  }
  const index=this.assistant.index(s);
  for(const g of groups.values()){
   g.roots.sort((a,b)=>(Date.parse(a.sentAt)||0)-(Date.parse(b.sentAt)||0));g.messages=sorted(g.messages);
   const human=g.messages.filter(m=>m.kind==='human'&&m.direction==='inbound'&&paired(m,g.account,g.recipient));
   const lastHuman=human.at(-1),lastInbound=g.messages.filter(m=>m.direction==='inbound'||(m.match==='review'&&m.direction!=='outbound')).at(-1),last=g.messages.at(-1),out=g.messages.filter(m=>m.direction==='outbound').at(-1);
   const primary=g.roots.find(r=>r.id===lastHuman?.rootId)||g.roots.find(r=>r.id===last?.rootId)||g.roots.at(-1),c=this.assistant.context(s,primary.id,index),saved=s.carrierInbox?.records?.[g.id]||{};
   const pending=g.messages.filter(m=>m.match==='review'),intent=carrierIntent(lastHuman||lastInbound),hold=c.hold||null;
   const reviewRequired=Boolean(lastInbound&&(lastInbound.match==='review'||lastInbound.bodyUnavailable));
   const automatic=hold?'closed':reviewRequired?'in_review':human.length?'active':'waiting';
   const stage=saved.stage||automatic,newSinceStatus=Boolean(saved.stage&&lastInbound&&saved.lastInboundId!==lastInbound.id);
   const latestUnanswered=Boolean(lastHuman&&(!out||g.messages.indexOf(lastHuman)>g.messages.indexOf(out))&&!(lastHuman.id===c.last?.id&&c.reportedForLast));
   const finished=['closed','signed'].includes(stage)&&!newSinceStatus;
   const needsReply=latestUnanswered&&!finished&&!hold&&!['negative','opt_out','later'].includes(intent.intent),unread=Boolean(lastInbound&&(Object.hasOwn(s.carrierInbox?.seen||{},g.id)?s.carrierInbox.seen[g.id]:s.assistant?.seen?.[primary.id])!==lastInbound.id);
   const version=digest(JSON.stringify([g.id,saved.version||0,g.messages.map(m=>[m.id,m.reviewVersion]),g.roots.map(r=>r.id).sort()]));
   g.row={id:primary.id,type:'conversation',carrierInboxId:g.id,account:g.account,recipient:g.recipient,company:primary.company,contactName:lastHuman?.senderName||c.fields.contactName.confirmed?.value||null,subject:lastInbound?.subject||primary.subject,excerpt:(lastHuman?.text||lastInbound?.text||'').slice(0,220),at:last?new Date(logicalTime(last)).toISOString():primary.sentAt,count:c.messages.length,historyCount:g.messages.length,sourceMessageId:c.last?.id||null,latestHistoryId:last?.id||null,responded:human.length>0,replyCount:human.length,lastReplyAt:lastHuman?new Date(logicalTime(lastHuman)).toISOString():null,firstReplyAt:human[0]?new Date(logicalTime(human[0])).toISOString():null,needsReply,noReply:!human.length,followUpReady:!finished&&c.followUpReady&&!pending.length,intent,category:lastInbound?.category||'unclassified',match:pending.length?'review':lastInbound?.match||'source',unread,hold,missing:c.missing,draftStatus:c.draft?(c.draftCurrent?c.draft.status:'stale'):null,carrierStatus:stage,statusAutomatic:!saved.stage,statusVersion:version,followUpAt:saved.followUpAt||null,note:saved.note||'',pendingReviewCount:pending.length,reviewRequired,active:Boolean(human.length&&!hold&&(!['closed','signed'].includes(stage)||newSinceStatus)),newSinceStatus,latestInboundId:lastInbound?.id||null};
  }
  return {groups,rootGroups};
 }
 async list(params=new URLSearchParams()){
  const s=await this.replies.load(),{groups}=this.groups(s),q=(params.get('q')||'').toLowerCase(),mailbox=params.get('mailbox')||'',work=params.get('work')||'all',category=params.get('category')||'';
  const scoped=[...groups.values()].filter(g=>(!mailbox||g.account===mailbox)&&(!q||[g.row.recipient,g.row.company,g.row.contactName,g.row.note,...g.messages.flatMap(m=>[m.text,m.subject,m.senderName]),...g.roots.map(r=>r.subject)].some(v=>String(v||'').toLowerCase().includes(q))));
  const rows=scoped.map(g=>g.row),messages=[...new Map(scoped.flatMap(g=>g.messages).map(m=>[m.id,m])).values()];
  const summary={carriers:rows.length,conversations:rows.length,active:rows.filter(r=>r.active).length,inReview:rows.filter(r=>r.carrierStatus==='in_review'||r.reviewRequired).length,respondedContacts:rows.filter(r=>r.responded).length,repliedConversations:rows.filter(r=>r.responded).length,humanMessages:messages.filter(m=>m.kind==='human'&&m.direction==='inbound'&&m.match!=='review').length,contactHistoryMessages:messages.length,needsMatch:messages.filter(m=>m.match==='review').length,automatedMessages:messages.filter(m=>['automated','out_of_office'].includes(m.kind)&&m.direction==='inbound').length,bounceNotices:messages.filter(m=>m.kind==='bounce').length,protectedContacts:rows.filter(r=>r.hold).length,needsReply:rows.filter(r=>r.needsReply).length,noReply:rows.filter(r=>r.noReply).length,followUpReady:rows.filter(r=>r.followUpReady||r.carrierStatus==='follow_up').length,interested:rows.filter(r=>r.intent.intent==='interested').length,unread:rows.filter(r=>r.unread).length,awaitingApproval:rows.filter(r=>['draft','stale'].includes(r.draftStatus)).length,missingDetails:rows.filter(r=>r.missing.length).length};
  const filtered=rows.filter(r=>(!category||(category==='needs_match'?r.pendingReviewCount>0:category==='ignored'?false:r.category===category))&&(work==='all'||work==='attention'&&(r.unread||r.needsReply||r.followUpReady||r.reviewRequired||['follow_up','in_review'].includes(r.carrierStatus))||work==='active'&&r.active||work==='in_review'&&(r.carrierStatus==='in_review'||r.reviewRequired)||work==='replied'&&r.responded||work==='needs_reply'&&r.needsReply||work==='no_reply'&&r.noReply||work==='follow_up'&&(r.followUpReady||r.carrierStatus==='follow_up')||work==='unread'&&r.unread||work==='approval'&&['draft','stale'].includes(r.draftStatus)||work==='interested'&&r.intent.intent==='interested'||work==='negative'&&r.intent.sentiment==='negative'||work==='positive'&&r.intent.sentiment==='positive'||work==='missing_details'&&r.missing.length||['waiting','signed','closed'].includes(work)&&work===r.carrierStatus));
  filtered.sort((a,b)=>Number(b.unread)-Number(a.unread)||Number(b.needsReply)-Number(a.needsReply)||String(b.at||'').localeCompare(String(a.at||'')));
  const offset=Math.min(Math.max(0,Math.floor(Number(params.get('offset'))||0)),Math.max(0,Math.floor((filtered.length-1)/25)*25));
  return {group:'carriers',scope:'tool_contact_history',mode:'real',rows:filtered.slice(offset,offset+25),total:filtered.length,offset,pageSize:25,summary,coverage:{roots:scoped.reduce((n,g)=>n+g.roots.length,0),rootsWithMessageIds:scoped.reduce((n,g)=>n+g.roots.filter(r=>r.messageIds.length).length,0)},protectionNote:summary.protectedContacts?'Captured opt-outs and other contact holds continue to block outreach. Workflow statuses do not clear protections.':null,note:'One carrier per mailbox/email, anchored by a confirmed tool send. Earlier Inbox/Sent chains are contact context, not proof the tool started every chain. Unlinked threads stay in review before drafting. Status and follow-up dates never send mail.'};
 }
 async historyForRoot(rootId){const s=await this.replies.load(),{rootGroups}=this.groups(s),g=rootGroups.get(rootId);return g?{...g.row,messages:g.messages,roots:g.roots,scopeNote:'Complete captured contact history across tool threads and unlinked email chains; matching evidence remains separate.'}:null;}
 async update(input){
  return this.replies.transaction(s=>{const g=this.groups(s).groups.get(input.carrierInboxId);if(!g)throw fail('Choose a carrier contacted by this tool.');if(input.expectedVersion!==g.row.statusVersion)throw fail('Carrier history or status changed. Refresh before saving.',409);if(!CARRIER_STAGES.includes(input.stage))throw fail('Choose a supported carrier status.');const note=String(input.note||'').trim();if(note.length>2000)throw fail('Use a status note up to 2,000 characters.');let followUpAt=null;if(input.followUpAt){const at=Date.parse(input.followUpAt);if(!Number.isFinite(at)||at>Date.parse('2100-01-01'))throw fail('Choose a valid follow-up date.');followUpAt=new Date(at).toISOString();}if(input.stage==='follow_up'&&!followUpAt)throw fail('Choose when to follow up.');
   s.carrierInbox||={records:{},seen:{}};s.carrierInbox.records||={};const previous=s.carrierInbox.records[g.id]||null,at=new Date(this.clock()).toISOString();s.carrierInbox.records[g.id]={stage:input.stage,note,followUpAt,version:(previous?.version||0)+1,updatedAt:at,lastInboundId:g.row.latestInboundId};s.events.push({kind:'carrier_workflow_updated',carrierInboxId:g.id,at,previous,stage:input.stage,note,followUpAt});return {ok:true};
  });
 }
 syncLegacySeen(s,root,input){const g=this.groups(s).rootGroups.get(root.id);if(!g)return;if(input.unread||g.row.latestInboundId===input.messageId){s.carrierInbox||={records:{},seen:{}};s.carrierInbox.seen||={};s.carrierInbox.seen[g.id]=input.unread?null:input.messageId;}}
 async seen(input){return this.replies.transaction(s=>{const g=this.groups(s).groups.get(input.carrierInboxId);if(!g||input.expectedVersion!==g.row.statusVersion||input.messageId!==g.row.latestInboundId)throw fail('New carrier evidence needs review before marking read.',409);s.carrierInbox||={records:{},seen:{}};s.carrierInbox.seen||={};s.carrierInbox.seen[g.id]=input.unread?null:g.row.latestInboundId;for(const root of g.roots){const latest=g.messages.filter(m=>m.rootId===root.id&&m.direction==='inbound'&&m.match!=='review').at(-1);if(latest)s.assistant.seen[root.id]=input.unread?null:latest.id;}return {ok:true};});}
}
