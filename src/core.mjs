import { randomInt } from "node:crypto";
export const EMAIL =
  /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i;
const variants = [
  [
    "dispatch",
    "Dispatch introduction",
    "Dispatch support for {{company}}",
    "I’m reaching out to {{company}}{{locationPhrase}} to see whether dispatch support would be useful for your operation.",
    "What equipment are you running, and which lanes would you like to focus on?",
  ],
  [
    "fleet",
    "Fleet coordination",
    "A dispatch contact for {{company}}",
    "Would {{company}} benefit from an extra hand with load searches and the coordination around each trip?",
    "Are you the right person to discuss support, or is there someone else I should contact?",
  ],
  [
    "lanes",
    "Preferred lanes",
    "Your preferred lanes at {{company}}",
    "I wanted to ask how {{company}} handles planning around preferred lanes and availability.",
    "Which lanes do you prefer, and where would an extra hand be useful?",
  ],
  [
    "availability",
    "Availability check",
    "Planning your next available truck",
    "I’m checking whether {{company}} is looking for help coordinating its next available truck.",
    "When is your next truck available, and what equipment is it?",
  ],
  [
    "paperwork",
    "Paperwork support",
    "Less coordination work for {{company}}",
    "The calls and paperwork around a trip can take time away from running the operation. I wanted to see whether {{company}} would find additional support useful.",
    "Which part of the coordination takes the most time for your team?",
  ],
  [
    "right_person",
    "Right contact",
    "Dispatch contact at {{company}}",
    "I’m looking for the person who handles dispatch decisions at {{company}}.",
    "Would you be the right person for a brief conversation?",
  ],
  [
    "capacity",
    "Capacity planning",
    "A capacity question for {{company}}",
    "I wanted to learn whether {{company}} is planning any upcoming truck availability that needs dispatch support.",
    "Do you have capacity coming available that you’d like to discuss?",
  ],
  [
    "schedule",
    "Schedule preferences",
    "Working around your schedule",
    "I’m reaching out to learn what dispatch support would look like for {{company}} around your actual schedule.",
    "What days and routes work best for your operation?",
  ],
  [
    "equipment",
    "Equipment preferences",
    "Equipment and lanes at {{company}}",
    "I’d like to understand the equipment {{company}} operates before suggesting any support.",
    "What equipment do you run, and do you have any lane restrictions?",
  ],
  [
    "coordination",
    "Trip coordination",
    "Coordination support for {{company}}",
    "I wanted to see whether {{company}} needs another contact to help with coordination around upcoming trips.",
    "Where could additional coordination help your team most?",
  ],
  [
    "workflow",
    "Current workflow",
    "How {{company}} handles dispatch",
    "I’m interested in how {{company}} currently handles dispatch and whether there are gaps we could help with.",
    "Do you handle dispatch in house or work with outside support?",
  ],
  [
    "backup",
    "Backup support",
    "An additional contact for {{company}}",
    "I’m introducing myself as a contact if {{company}} needs additional dispatch support when the team is busy.",
    "Would it be useful to discuss your requirements for backup support?",
  ],
  [
    "planning",
    "Planning ahead",
    "Upcoming plans at {{company}}",
    "I wanted to ask whether {{company}} has upcoming dispatch needs we could discuss.",
    "What does your availability look like over the next few weeks?",
  ],
  [
    "preferences",
    "Operating preferences",
    "Support built around your preferences",
    "I’m reaching out to understand {{company}}’s operating preferences before we discuss a fit.",
    "Which lanes, schedules, and equipment details should we keep in mind?",
  ],
  [
    "local",
    "Location introduction",
    "A dispatch introduction to {{company}}",
    "I wanted to introduce our team to {{company}}{{locationPhrase}} and learn about your current dispatch needs.",
    "Are you open to a short conversation about your operation?",
  ],
  [
    "simple",
    "Short introduction",
    "Quick question for {{company}}",
    "I wanted to see if {{company}} is considering additional dispatch support.",
    "Would a brief overview of how we work be useful?",
  ],
];
export const templates = Object.fromEntries(
  variants.map(([id, name, subject, intro, question]) => [
    id,
    {
      name,
      enabled: true,
      weight: 1,
      requiredFields: [],
      subject,
      body: `Hi {{firstName}},\n\nI’m {{senderName}} with {{businessName}}. ${intro}\n\nWe help with {{services}}, based on your equipment, preferred lanes, and availability. You decide which loads you accept.\n\n${question}\n\nIf you’d prefer no further outreach, reply “remove” and I’ll take you off our list.\n\n{{legalName}}\n{{address}}`,
    },
  ]),
);
export function render(lead, template, business = {}) {
  const person = lead.fields["owner / principal"]?.trim().split(/\s+/)[0];
  const firstName = person
    ? person === person.toUpperCase()
      ? person[0] + person.slice(1).toLowerCase()
      : person
    : "there";
  const city = lead.layoutIssue ? "" : lead.fields.city;
  const state = lead.layoutIssue ? "" : lead.fields.state;
  const values = {
    company: lead.company,
    firstName,
    city: city || "",
    state: state || "",
    locationPhrase: city && state ? ` in ${city}, ${state}` : "",
    senderName: business.senderName || "the dispatch team",
    businessName: business.company || "our dispatch service",
    services:
      business.services ||
      "load sourcing, rate negotiation, lane planning, broker paperwork, and pickup/delivery coordination",
    legalName: business.legalName || "",
    address: business.address || "",
  };
  const expand = (text) =>
    text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      if (!(key in values)) throw new Error(`Unknown template field: ${key}`);
      return values[key];
    });
  if (typeof template.subject !== "string" || typeof template.body !== "string")
    throw new Error("Invalid template text.");
  const subject = expand(template.subject)
    .replace(/[\r\n]/g, " ")
    .trim();
  const body = expand(template.body).trim();
  if (!subject || subject.length > 200 || !body || body.length > 12000)
    throw new Error(
      "Use a subject up to 200 characters and a body up to 12,000 characters.",
    );
  return { to: lead.email, subject, body };
}
export function pickTemplate(library, lead, lastKey = null, rng = randomInt) {
  let options = Object.entries(library).filter(
    ([, t]) =>
      t.enabled !== false &&
      (t.requiredFields || []).every((field) => !!lead.fields[field]),
  );
  if (options.length > 1) options = options.filter(([key]) => key !== lastKey);
  if (!options.length)
    throw new Error("No enabled template matches this lead.");
  const total = options.reduce((n, [, t]) => n + (t.weight || 1), 0);
  let point = rng(0, total);
  for (const [key, t] of options) {
    point -= t.weight || 1;
    if (point < 0) return key;
  }
}
export function reason(lead, state, seen = new Set()) {
  if (!EMAIL.test(lead.email) || lead.email.length > 254)
    return "Missing or invalid email";
  if (state.suppression[lead.email])
    return `Suppressed: ${state.suppression[lead.email]}`;
  if (state.history[lead.email])
    return `Previously attempted: ${state.history[lead.email].status}`;
  const notes =
    `${lead.status} ${lead.fields["historical notes"] || ""}`.toLowerCase();
  if (
    /unsubscribe|remove|do not contact|opt.?out|declined|not interested|bounc/.test(
      notes,
    )
  )
    return "Opt-out, declined, or bounced";
  if (
    /sent|email send|proposal|follow.?up|replied|interested|client|onboard/.test(
      notes,
    )
  )
    return "Already contacted";
  if (lead.layoutIssue) return lead.layoutIssue;
  const rules = state.settings?.eligibility || {};
  if (
    !(
      rules.readyStatuses || ["", "new", "pending", "not contacted", "ready"]
    ).includes(lead.status.toLowerCase().trim())
  )
    return "Status needs review";
  if (
    rules.requireActive !== false &&
    (lead.fields["operating status"] || "").toLowerCase() !== "active"
  )
    return "Operating status is not Active";
  if (
    rules.requireNoOutOfService !== false &&
    (lead.fields["out of service"] || "").toLowerCase() !== "no"
  )
    return "Out-of-service status needs review";
  if (lead.hidden && !rules.allowHidden) return "Hidden worksheet";
  if (!lead.statusCell) return "Worksheet has no Status column";
  if (seen.has(lead.email)) return "Duplicate email in workbook";
  seen.add(lead.email);
  return "";
}
export function assessChecks(message, checks = {}) {
  const warnings = [];
  const blockers = [];
  if (checks.enabled === false) return { warnings, blockers };
  const add = (key, text) => {
    const mode = checks[key] ?? "warn";
    if (mode === "off") return;
    warnings.push(text);
    if (mode === "block") blockers.push(text);
  };
  if (
    /guarantee|guaranteed|\$\d|\d+%|direct shipper|exclusive|urgent|act now|free money/i.test(
      message.subject + " " + message.body,
    )
  )
    add("promotionalClaims", "Review pricing, guarantees, and promotional claims.");
  if (message.body.split(/\s+/).length > 180)
    add("messageLength", "Consider keeping the introduction under 180 words.");
  return { warnings, blockers };
}
export function assess(message, checks) {
  return assessChecks(message, checks).warnings;
}
