// Experiment-only identities. Source-reported identifiers are not authority verification.
import { randomUUID, createHash } from 'node:crypto';
const digest = (s) => createHash('sha256').update(s).digest('hex');
const nameKey = (s) => String(s || '').normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
const field = (lead, keys) => Object.entries(lead.fields || {}).find(([k]) => keys.includes(k.toLowerCase().replace(/[^a-z0-9]/g, '')))?.[1] || '';
const number = (value, prefix) => {
  const text = String(value).trim().replace(new RegExp(`^(?:${prefix})[\\s#:-]*`, 'i'), '');
  return /^\d{1,10}$/.test(text) && Number(text) > 0 ? text.replace(/^0+(?=\d)/, '') : null;
};
const ids = (lead) => ({ dot: number(field(lead, ['usdot', 'usdotnumber', 'dot', 'dotnumber']), 'USDOT|DOT'), mc: number(field(lead, ['mcdocket', 'mcdocketnumber', 'mc', 'mcnumber']), 'MC') });
export function collectProtections(state, leads = [], existing = {}) {
  const result = structuredClone(existing);
  const add = (email, reason) => {
    const key = String(email || '').toLowerCase().trim();
    if (!key.includes('@')) return;
    result[key] = [...new Set([...(result[key] || []), String(reason).slice(0, 220)])];
  };
  for (const [email, reason] of Object.entries(state.suppression || {})) add(email, `Do not contact: ${reason}`);
  for (const [email, entry] of Object.entries(state.history || {})) add(email, `Prior attempt: ${entry.status || 'unknown outcome'}`);
  for (const lead of leads) {
    const notes = `${lead.status || ''} ${lead.fields?.['historical notes'] || ''}`;
    if (/unsubscribe|remove|do not contact|opt.?out|declined|not interested|bounc/i.test(notes)) add(lead.email, 'Source record: opt-out, declined or bounce marker');
    else if (/sent|email send|proposal|follow.?up|replied|interested|client|onboard/i.test(notes)) add(lead.email, 'Source record: previously contacted');
  }
  return result;
}
export function registerCarriers(registry, leads, context, protections) {
  registry.carriers ||= {}; registry.dots ||= {}; registry.provisional ||= {};
  const groups = new Map();
  for (const lead of leads.filter((l) => !l.layoutIssue)) {
    const { dot, mc } = ids(lead);
    if (!dot) continue;
    const group = groups.get(dot) || { names: new Set(), mcs: new Set() };
    group.names.add(nameKey(lead.company)); if (mc) group.mcs.add(mc); groups.set(dot, group);
  }
  const records = leads.map((lead) => {
    const { dot, mc } = ids(lead), key = nameKey(lead.company);
    const candidates = (registry.dots[dot] || []).map((id) => registry.carriers[id]);
    const batch = groups.get(dot);
    const conflict = !lead.layoutIssue && dot && (batch.names.size > 1 || batch.mcs.size > 1 || candidates.some((c) => c.nameKey !== key || (mc && c.mc && c.mc !== mc)));
    const status = lead.layoutIssue ? 'layout_review' : conflict ? 'identifier_conflict' : dot ? 'source_dot' : 'provisional';
    let carrier;
    if (status === 'source_dot') carrier = candidates[0];
    const provisionalKey = digest(`${context.importId}:${lead.part}:${lead.row}:${lead.email}:${key}`);
    if (!carrier && status !== 'source_dot') carrier = registry.carriers[registry.provisional[provisionalKey]];
    if (!carrier) {
      carrier = { id: randomUUID(), company: lead.company, nameKey: key, dot: status === 'source_dot' ? dot : null, mc: status === 'source_dot' ? mc : null, createdAt: context.importedAt, verification: 'source_reported' };
      registry.carriers[carrier.id] = carrier;
      if (status === 'source_dot') registry.dots[dot] = [carrier.id];
      else registry.provisional[provisionalKey] = carrier.id;
    }
    if (status === 'source_dot' && mc && !carrier.mc) carrier.mc = mc;
    return { carrierId: carrier.id, contactId: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email) ? `contact_${digest(`${carrier.id}:${lead.email}`).slice(0, 24)}` : null,
      company: lead.company, email: lead.email, dot: lead.layoutIssue ? null : dot, mc: lead.layoutIssue ? null : mc,
      identityStatus: status, protection: protections[lead.email] || [],
      provenance: { ...context, sheet: lead.sheet, row: lead.row, originalLeadId: lead.id } };
  });
  return { records, summary: { carriers: new Set(records.map((r) => r.carrierId)).size,
    sourceDotCarriers: new Set(records.filter((r) => r.identityStatus === 'source_dot').map((r) => r.carrierId)).size,
    provisionalRows: records.filter((r) => r.identityStatus === 'provisional').length,
    conflictRows: records.filter((r) => r.identityStatus === 'identifier_conflict').length,
    layoutRows: records.filter((r) => r.identityStatus === 'layout_review').length,
    protectedRows: records.filter((r) => r.protection.length).length } };
}
