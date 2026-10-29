import { digest } from './reply-parser.mjs';
export const DETAIL_FIELDS = ['company','phone','equipment','zip','contactName','truckCount','dot','mc','availability','lanes'];
export const REQUIRED_DETAILS = ['phone','equipment','zip'];
export const INTELLIGENCE_VERSION = 'carrier-rules-v1';
const clean = (s) => String(s || '').replace(/\s+/g,' ').trim();
export function normalizeDetail(field, value) {
  const text=clean(value);
  if (field==='phone') { const n=text.replace(/\D/g,''); return n.length===11&&n[0]==='1'?n.slice(1):n; }
  if (field==='zip') return text.replace(/\D/g,'');
  return text.toLowerCase();
}
export function validDetail(field,value) {
  const text=clean(value);if(!DETAIL_FIELDS.includes(field)||!text||text.length>240)return false;
  if(field==='phone')return /^[2-9]\d{9}$/.test(normalizeDetail(field,text));
  if(field==='zip')return /^\d{5}(?:-?\d{4})?$/.test(text);
  if(['dot','mc'].includes(field))return /^\d{1,10}$/.test(text)&&Number(text)>0;
  if(field==='truckCount')return /^\d{1,5}$/.test(text)&&Number(text)>0;
  return !/[\r\n\0]/.test(text);
}
function negativePrefix(text,offset) { return /\b(?:no|not|without|don['’]?t(?:\s+have)?|do not(?:\s+have)?)\s*(?:a|any|an)?\s*$/i.test(text.slice(Math.max(0,offset-32),offset)); }
export function extractCarrierDetails(message) {
  if(message.kind!=='human'||message.direction!=='inbound'||message.bodyUnavailable||['review','ignored'].includes(message.match))return [];
  const text=String(message.text||'').slice(0,24000),out=[];
  const add=(field,value,match,confidence='explicit')=>{value=clean(value);if(!validDetail(field,value))return;const excerpt=text.slice(Math.max(0,match.index-45),Math.min(text.length,match.index+match[0].length+65));if(out.some((v)=>v.field===field&&normalizeDetail(field,v.value)===normalizeDetail(field,value)))return;out.push({field,value,messageId:message.id,excerpt,confidence,from:message.from[0],capturedAt:message.capturedAt});};
  const patterns=[
    ['company',/\b(?:company(?: name)?|carrier(?: name)?)\s*(?:is|[:=])\s*([^.!?\n]{2,100})/gi,1],
    ['phone',/\b(?:phone|cell|mobile|call(?:\s+me)?(?:\s+at)?|reach(?:\s+me)?(?:\s+at)?)\s*[:=\-]?\s*(?:is\s+)?((?:\+?1[ .-]?)?(?:\([2-9]\d{2}\)|[2-9]\d{2})[ .-]?\d{3}[ .-]?\d{4})\b/gi,1],
    ['phone',/(?<!\d)((?:\+?1[ .-])?(?:\([2-9]\d{2}\)[ .-]?|[2-9]\d{2}[ .-])\d{3}[ .-]\d{4})(?!\d)/g,1],
    ['zip',/\b(?:zip(?:\s*code)?|postal(?:\s*code)?)\s*[:=\-]?\s*(?:is\s+)?(\d{5}(?:-\d{4})?)\b/gi,1],
    ['contactName',/\b(?:my name is|contact name\s*[:=]|contact person\s*[:=])\s*([A-Za-z][A-Za-z .'-]{1,55}?)(?=[,.!\n]|$)/gi,1],
    ['truckCount',/\b(?:we have|i have)\s*(\d{1,5})\s*(?:trucks?|power units?|units?)\b/gi,1],
    ['truckCount',/\b(?:fleet|trucks?|power units?)\s*[:=]\s*(\d{1,5})\b/gi,1],
    ['dot',/\b(?:USDOT|DOT)(?:\s*(?:number|#|no\.))?\s*[:=\-]?\s*(\d{1,10})\b/gi,1],
    ['mc',/\bMC(?:\s*(?:number|#|no\.))?\s*[:=\-]?\s*(\d{1,10})\b/gi,1],
    ['availability',/\b(?:availability|available(?:\s+from)?|ready(?:\s+from)?)\s*[:=]?\s*([^.!?\n]{2,100})/gi,1],
    ['lanes',/\b(?:preferred lanes?|lanes?|routes?)\s*[:=]\s*([^.!?\n]{2,150})/gi,1],
  ];
  for(const[field,regex,group]of patterns)for(const m of text.matchAll(regex)){if(!negativePrefix(text,m.index))add(field,m[group],m);}
  const equipment=/(?:\b\d{2}\s*(?:ft|feet|foot|'|’)\s*)?\b(?:dry[ -]?vans?|reefers?|refrigerated(?: trailers?)?|flat[ -]?beds?|step[ -]?decks?|box[ -]?trucks?|hot[ -]?shots?|power[ -]?only|sprinters?|cargo[ -]?vans?|conestogas?|tankers?|lowboys?|RGNs?)\b/gi;
  const values=[];let first;
  for(const m of text.matchAll(equipment))if(!negativePrefix(text,m.index)){first||=m;const v=m[0].toLowerCase().replace(/[- ]+/g,' ');if(!values.includes(v))values.push(v);}
  if(values.length)add('equipment',values.join(', '),first,'context');
  return out;
}
export function carrierIntent(message) {
  if(!message)return {intent:'unknown',sentiment:'unknown',confidence:'none',reason:'No captured human response. Missing capture is not proof of no reply.'};
  if(message.match==='review'||message.bodyUnavailable)return {intent:'needs_review',sentiment:'unknown',confidence:'low',reason:'Resolve message matching/body evidence before suggesting outreach.'};
  if(message.kind!=='human')return {intent:message.kind||'unknown',sentiment:'neutral',confidence:'header_rule',reason:'Automated, out-of-office or delivery evidence is separate from buying intent.'};
  const category=message.category,text=clean(message.text).toLowerCase();
  if(category==='opt_out')return {intent:'opt_out',sentiment:'negative',confidence:message.classificationSource==='manual'?'reviewed':'rule',reason:'An opt-out blocks reply/follow-up drafts; retain its protection.'};
  if(message.classificationSource==='manual'){const mapped={interested:['interested','positive'],pricing:['pricing','neutral'],how_it_works:['how_it_works','neutral'],not_fit:['negative','negative'],wrong_contact:['negative','negative'],already_has_dispatcher:['negative','negative'],later:['later','neutral']}[category];if(mapped)return {intent:mapped[0],sentiment:mapped[1],confidence:'operator_reviewed',reason:'Operator-reviewed classification; it is not proof of a signing.'};}
  const negative=/\b(?:not (?:really )?interested|no thanks|not looking|don['’]?t need|do not need|already (?:have|has|use)|have a dispatcher|wrong (?:person|contact)|not a fit)\b/.test(text)||['already_has_dispatcher','wrong_contact','not_fit'].includes(category);
  const interested=/\b(?:i am interested|i['’]?m interested|we are interested|we['’]?re interested|yes[,! ]+(?:i|we)|sign (?:me|us) up|let['’]?s (?:start|work)|want to (?:start|work)|send (?:me |us )?(?:the )?(?:agreement|contract|paperwork))\b/.test(text)||category==='interested';
  const positive=/\b(?:sounds good|sounds great|tell me more|tell us more|send (?:me |us )?(?:the )?details|would like to know|happy to discuss)\b/.test(text);
  const question=['pricing','how_it_works'].includes(category)||/\b(?:how much|what (?:are your|is the) (?:fees?|rates?|price)|how (?:does|do) .*work)\b/.test(text);
  if(negative&&(interested||positive||question))return {intent:'mixed',sentiment:'mixed',confidence:'low',reason:'Positive/questions and negative language occur together. Review the original wording.'};
  if(negative)return {intent:'negative',sentiment:'negative',confidence:'rule',reason:'Decline/wrong-contact language; no proactive follow-up is recommended.'};
  if(interested&&!/\bnot\s+(?:really\s+)?interested\b/.test(text))return {intent:'interested',sentiment:'positive',confidence:'rule',reason:'Explicit interest wording; this does not establish a signing or agreement.'};
  if(question)return {intent:category==='how_it_works'?'how_it_works':'pricing',sentiment:'neutral',confidence:'rule',reason:'A question is not confirmed buying interest.'};
  if(positive)return {intent:'positive',sentiment:'positive',confidence:'rule',reason:'Positive engagement wording; operator review is still needed.'};
  if(category==='later')return {intent:'later',sentiment:'neutral',confidence:'rule',reason:'Deferred timing; inspect the message before following up.'};
  return {intent:'neutral',sentiment:'neutral',confidence:'low',reason:'No reliable positive/negative conclusion from this wording.'};
}
export const logicalTime=(m)=>{const header=Date.parse(m.date),captured=Date.parse(m.capturedAt)||0;return Number.isFinite(header)&&header>=0&&header<=captured+300000?header:captured;};
export function conversationVersion(root,messages,profile,protection) {
  return digest(JSON.stringify({rules:INTELLIGENCE_VERSION,root:{id:root.id,account:root.account,recipient:root.recipient,sentAt:root.sentAt,subject:root.subject,company:root.company,carrierId:root.carrierId,identityReview:root.identityReview},messages:messages.map((m)=>[m.id,m.fingerprint,m.match,m.category,m.kind,m.reviewedAt]).sort(),profile,protection}));
}
