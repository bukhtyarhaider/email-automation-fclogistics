export const EMAIL = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i;
export const templates = {
  dispatch: {name: 'Dispatch introduction', subject: 'Dispatch support for {{company}}', body: 'Hi {{firstName}},\n\nI’m Mark with FC Logistics. I’m reaching out to {{company}}{{locationPhrase}} to see whether dispatch support would be useful for your operation.\n\nWe help carriers with load sourcing, rate negotiation, lane planning, broker paperwork, and pickup/delivery coordination, based on their equipment, preferred lanes, and availability. You stay in control of which loads you accept.\n\nWhat equipment are you running, and which lanes would you like to focus on? If there’s a fit, I can outline how our dispatch support works.\n\nIf you’d prefer no further outreach, reply “remove” and I’ll take you off our list.\n\nFleet Core Logistics LLC\n132 French Creek Dr, Rochester, NY 14618'},
  fleet: {name: 'Fleet coordination', subject: 'A dispatch contact for {{company}}', body: 'Hi {{firstName}},\n\nI’m Mark at FC Logistics. Would {{company}} benefit from an extra hand with load searches, broker coordination, and the paperwork around each trip?\n\nOur dispatch support works around your equipment, preferred lanes, and schedule. You decide which loads work for your operation.\n\nAre you the right person to discuss dispatch support, or is there someone else I should contact?\n\nIf you’d prefer no further outreach, reply “remove” and I’ll take you off our list.\n\nFleet Core Logistics LLC\n132 French Creek Dr, Rochester, NY 14618'}
};
export function render(lead, template) {
  const person = lead.fields['owner / principal']?.trim().split(/\s+/)[0];
  const firstName = person ? (person === person.toUpperCase() ? person[0] + person.slice(1).toLowerCase() : person) : 'there';
  const city = lead.layoutIssue ? '' : lead.fields.city;
  const state = lead.layoutIssue ? '' : lead.fields.state;
  const values = {company: lead.company, firstName, city: city || '', state: state || '', locationPhrase: city && state ? ` in ${city}, ${state}` : ''};
  const expand = text => text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`Unknown template field: ${key}`);
    return values[key];
  });
  const subject = expand(template.subject).replace(/[\r\n]/g, ' ').trim();
  const body = expand(template.body).trim();
  if (!subject || subject.length > 200 || !body || body.length > 12000) throw new Error('Use a subject up to 200 characters and a body up to 12,000 characters.');
  return {to: lead.email, subject, body};
}
export function reason(lead, state, seen = new Set()) {
  if (!EMAIL.test(lead.email) || lead.email.length > 254) return 'Missing or invalid email';
  if (state.suppression[lead.email]) return `Suppressed: ${state.suppression[lead.email]}`;
  if (state.history[lead.email]) return `Previously attempted: ${state.history[lead.email].status}`;
  const notes = `${lead.status} ${lead.fields['historical notes'] || ''}`.toLowerCase();
  if (/unsubscribe|remove|do not contact|opt.?out|declined|not interested|bounc/.test(notes)) return 'Opt-out, declined, or bounced';
  if (/sent|email send|proposal|follow.?up|replied|interested|client|onboard/.test(notes)) return 'Already contacted';
  if (lead.layoutIssue) return lead.layoutIssue;
  if (!['', 'new', 'pending', 'not contacted', 'ready'].includes(lead.status.toLowerCase().trim())) return 'Status needs review';
  if ((lead.fields['operating status'] || '').toLowerCase() !== 'active') return 'Operating status is not Active';
  if ((lead.fields['out of service'] || '').toLowerCase() !== 'no') return 'Out-of-service status needs review';
  if (lead.hidden) return 'Hidden worksheet';
  if (!lead.statusCell) return 'Worksheet has no Status column';
  if (seen.has(lead.email)) return 'Duplicate email in workbook';
  seen.add(lead.email);
  return '';
}
export function assess(message) {
  const warnings = [];
  if (/guarantee|guaranteed|\$\d|\d+%|direct shipper|exclusive|urgent|act now|free money/i.test(message.subject + ' ' + message.body)) warnings.push('Review pricing, guarantees, and promotional claims.');
  if (!/remove|unsubscribe|no further outreach/i.test(message.body)) warnings.push('Include a clear opt-out instruction.');
  if (/https?:\/\//g.test(message.body)) warnings.push('Keep links relevant and minimal.');
  if (message.body.split(/\s+/).length > 180) warnings.push('Consider keeping the introduction under 180 words.');
  return warnings;
}
