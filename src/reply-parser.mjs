import { simpleParser } from 'mailparser';
import { convert } from 'html-to-text';
import { createHash } from 'node:crypto';
import { parseDsn } from './mailbox-monitor.mjs';
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const categories = ['unclassified', 'interested', 'pricing', 'how_it_works', 'later', 'already_has_dispatcher', 'wrong_contact', 'not_fit', 'opt_out', 'out_of_office', 'automated', 'bounce'];
export const messageIds = (value) => [...new Set((Array.isArray(value) ? value : [value]).flatMap((s) => [...String(s || '').matchAll(/<[^<>\s]{1,300}@[^<>\s]{1,200}>/g)].map((m) => m[0])))].slice(-50);
const addresses = (value) => (value?.value || []).slice(0, 100).map((v) => v.address?.toLowerCase().slice(0,254)).filter(Boolean);
export function freshText(value) {
  const lines = String(value || '').replace(/\r\n/g, '\n').split('\n');
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(?:On .{0,300}wrote:|[-_]{2,}\s*(?:Original|Forwarded) Message|Begin forwarded message:)/i.test(line)) break;
    if (/^\s*From:\s*.+/i.test(line) && lines.slice(i + 1, i + 6).some((s) => /^\s*(?:Sent|Date|To|Subject):/i.test(s))) break;
    if (/^\s*>/.test(line)) continue;
    if (/^\s*--\s*$/.test(line)) break;
    result.push(line);
  }
  return result.join('\n').trim();
}
export function suggestCategory(text) {
  const t = text.trim();
  // Negated or quoted instructions must not silently create an opt-out.
  const negation = /(?:don['’]?t|do not|never|not asking.{0,15}to)\s+(?:unsubscribe|remove|stop)|not.{0,15}(?:opt.?out|unsubscribe)/i.test(t);
  if (!negation && (/^(?:remove|unsubscribe|stop)[.!]?$/i.test(t) || /\b(?:please\s+)?(?:remove (?:me|us|my (?:email|address))|unsubscribe (?:me|us)|stop (?:emailing|contacting|sending)|do not (?:email|contact)|take (?:me|us) off)\b/i.test(t))) return { category: 'opt_out', reason: 'Explicit request in newly written text', definiteOptOut: true };
  if (/\b(?:price|pricing|fees?|how much|percentage|cost)\b/i.test(t)) return { category: 'pricing', reason: 'Pricing question keywords' };
  if (/\b(?:already|have|using).{0,25}(?:dispatcher|dispatch service)\b/i.test(t)) return { category: 'already_has_dispatcher', reason: 'Existing dispatch support mentioned' };
  if (/\b(?:not interested|no thanks|not a fit)\b/i.test(t)) return { category: 'not_fit', reason: 'Disinterest wording' };
  if (/\b(?:wrong person|wrong contact|not the owner)\b/i.test(t)) return { category: 'wrong_contact', reason: 'Contact mismatch wording' };
  if (/\b(?:contact|check|try|reach).{0,20}(?:later|next (?:week|month))\b/i.test(t)) return { category: 'later', reason: 'Future contact wording; no date inferred' };
  if (/\b(?:how (?:does|do)|how it works|more about (?:your )?service)\b/i.test(t)) return { category: 'how_it_works', reason: 'Service process question' };
  if (/\b(?:interested|tell me more|send (?:me|us) (?:the )?(?:details|agreement)|let['’]?s (?:discuss|start))\b/i.test(t)) return { category: 'interested', reason: 'Interest wording; qualification not established' };
  return { category: 'unclassified', reason: negation ? 'Ambiguous or negated opt-out wording; review manually' : 'No high-confidence category rule' };
}
export async function parseReply(source) {
  const bytes = Buffer.isBuffer(source) ? source : Buffer.from(source);
  if (!bytes.length || bytes.length > 2_000_000) throw new Error('Use a non-empty EML file up to 2 MB.');
  const mail = await simpleParser(bytes, { keepDeliveryStatus: true, skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true, maxHtmlLengthToParse: 2_000_000 });
  const from = addresses(mail.from), to = [...addresses(mail.to), ...addresses(mail.cc)];
  const text = typeof mail.text === 'string' && mail.text.trim() ? mail.text : typeof mail.html === 'string' ? convert(mail.html, { wordwrap: false, selectors: [ { selector: 'blockquote', format: 'skip' }, { selector: '.gmail_quote', format: 'skip' }, { selector: '.yahoo_quoted', format: 'skip' }, { selector: 'img', format: 'skip' }, { selector: 'a', options: { ignoreHref: true } } ] }) : '';
  const fresh = freshText(text).slice(0, 24_000);
  const header = (name) => String(mail.headers.get(name) || '').trim();
  const automatic = (header('auto-submitted') && header('auto-submitted').toLowerCase() !== 'no') || header('x-autoreply') || header('x-autorespond') || /^(?:bulk|list|junk)$/i.test(header('precedence')) || header('list-id');
  const outOfOffice = /\b(?:out of (?:the )?office|vacation reply|automatic reply|auto.?reply)\b/i.test(mail.subject || '');
  const bounce = (mail.attachments || []).some((a) => a.contentType === 'message/delivery-status') || /(?:^|@)(?:mailer-daemon|postmaster)(?:@|$)/i.test(from.join(' ')) || /\b(?:undeliverable|delivery (?:failed|failure)|mail delivery subsystem|returned mail)\b/i.test(mail.subject || '');
  let kind = bounce ? 'bounce' : outOfOffice ? 'out_of_office' : automatic ? 'automated' : 'human';
  const suggestion = kind === 'human' ? suggestCategory(fresh) : { category: kind, reason: kind === 'bounce' ? 'Delivery notification; not a human reply or verified bounce suppression' : 'Autoresponder headers or subject; not counted as a human reply' };
  const id = messageIds(mail.messageId)[0] || null;
  const rawDate = mail.headerLines.find((h) => h.key === 'date')?.line.replace(/^date:\s*/i, '') || '';
  const date = rawDate && Number.isFinite(Date.parse(rawDate)) ? new Date(rawDate).toISOString() : null;
  const value = { senderName:String(mail.from?.value?.[0]?.name||'').slice(0,120), messageId: id, references: messageIds([mail.inReplyTo, ...(Array.isArray(mail.references) ? mail.references : [mail.references])]), from, to,
    deliveredTo: header('delivered-to').toLowerCase(), subject: (mail.subject || '(No subject)').slice(0, 500), date,
    text: fresh, textTruncated: freshText(text).length > 24_000, kind, suggestion, sourceHash: digest(bytes) };
  value.dsn = bounce ? await parseDsn(bytes) : [];
  value.fingerprint = digest(JSON.stringify({ messageId: id, references: value.references, from, to, subject: value.subject, text: fresh, kind }));
  return value;
}
