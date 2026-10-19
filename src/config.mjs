import { randomUUID } from "node:crypto";
import { connectionSettings } from "./browser-session.mjs";
export const DEFAULTS = {
  business: {
    company: "",
    senderName: "",
    legalName: "",
    address: "",
    services:
      "load sourcing, rate negotiation, lane planning, broker paperwork, and pickup/delivery coordination",
  },
  account: {
    email: "",
    provider: "privateemail",
    browserChannel: "chrome",
    connectionMode: "saved",
    cdpEndpoint: "http://127.0.0.1:9222",
    autoReconnect: true,
    url: "https://privateemail.com/spm/mail/INBOX/",
  },
  pacing: {
    minSeconds: 180,
    maxSeconds: 360,
    hourlyCap: 20,
    dailyCap: 100,
    pauseEveryMin: 8,
    pauseEveryMax: 15,
    pauseMinSeconds: 600,
    pauseMaxSeconds: 1800,
    pollSeconds: 60,
  },
  eligibility: {
    requireActive: true,
    requireNoOutOfService: true,
    allowHidden: false,
    readyStatuses: ["", "new", "pending", "not contacted", "ready"],
    sentStatus: "Proposal Sent",
  },
  team: { url: "", workerName: "", enabled: false },
};
export function upgrade(state) {
  const legacy = !state.version && !!state.workbook;
  state.settings ||= structuredClone(DEFAULTS);
  for (const [key, value] of Object.entries(DEFAULTS))
    state.settings[key] = { ...structuredClone(value), ...state.settings[key] };
  if (legacy) {
    const previous = Object.values(state.templates || {}).find((t) =>
      /I’m .+ (?:with|at) .+\./.test(t.body || ""),
    );
    if (previous) {
      const match = previous.body.match(
        /I’m ([^\n]+?) (?:with|at) ([^\n]+?)\./,
      );
      const lines = previous.body.trim().split("\n").filter(Boolean);
      const services = previous.body.match(
        /We help carriers with (.+?), based on/,
      );
      if (match && !match[1].includes("{{")) {
        state.settings.business.senderName = match[1];
        state.settings.business.company = match[2];
        if (lines.length > 2) {
          state.settings.business.legalName = lines.at(-2);
          state.settings.business.address = lines.at(-1);
        }
        if (services) state.settings.business.services = services[1];
      }
    }
    state.settings.account.email ||=
      state.account?.email ||
      Object.values(state.history || {}).find((h) => h.accountEmail)
        ?.accountEmail ||
      "";
  }
  state.profiles ||= [
    {
      id: randomUUID(),
      name: state.settings.business.senderName || "My mailbox",
      ...state.settings.account,
      business: state.settings.business,
    },
  ];
  state.activeProfile ||= state.profiles[0].id;
  for (const p of state.profiles) Object.assign(p, connectionSettings(p));
  state.campaigns ||= state.workbook
    ? [
        {
          id: randomUUID(),
          name: state.workbook.name,
          workbook: state.workbook,
          sheets: [],
          enabled: true,
        },
      ]
    : [];
  state.activeCampaign ||= state.campaigns[0]?.id || null;
  state.workerId ||= randomUUID();
  state.automation ||= {
    enabled: false,
    status: "Stopped",
    message: "Start continuous outreach when ready.",
    nextAt: null,
    sent: 0,
    sincePause: 0,
    pauseAfter: 0,
  };
  state.history ||= {};
  state.suppression ||= {};
  state.events ||= [];
  for (const item of Object.values(state.history)) {
    if (item.status === "Sending") item.status = "Uncertain";
    if (
      !item.accountEmail &&
      state.profiles.length === 1 &&
      state.profiles[0].email
    ) {
      item.accountEmail = state.profiles[0].email;
      item.profileId = state.profiles[0].id;
      item.metadataSource = "Migrated from single mailbox history";
    }
  }
  state.version = 2;
  return state;
}
function number(value, name, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  return n;
}
export function validateSettings(input) {
  const s = structuredClone(input);
  if (!s.business || !s.pacing || !s.eligibility || !s.team)
    throw new Error("Incomplete settings.");
  for (const key of Object.keys(DEFAULTS.business)) {
    if (typeof s.business[key] !== "string" || s.business[key].length > 1500)
      throw new Error(`Invalid business ${key}.`);
    s.business[key] = s.business[key].trim();
  }
  const ranges = {
    minSeconds: [1, 86400],
    maxSeconds: [1, 86400],
    hourlyCap: [1, 10000],
    dailyCap: [1, 100000],
    pauseEveryMin: [1, 10000],
    pauseEveryMax: [1, 10000],
    pauseMinSeconds: [0, 604800],
    pauseMaxSeconds: [0, 604800],
    pollSeconds: [5, 3600],
  };
  for (const [key, [min, max]] of Object.entries(ranges))
    s.pacing[key] = number(s.pacing[key], key, min, max);
  for (const [a, b] of [
    ["minSeconds", "maxSeconds"],
    ["pauseEveryMin", "pauseEveryMax"],
    ["pauseMinSeconds", "pauseMaxSeconds"],
  ])
    if (s.pacing[a] > s.pacing[b]) throw new Error(`${a} cannot exceed ${b}.`);
  if (
    !Array.isArray(s.eligibility.readyStatuses) ||
    !s.eligibility.readyStatuses.length
  )
    throw new Error("Enter at least one ready status.");
  s.eligibility.readyStatuses = s.eligibility.readyStatuses.map((v) =>
    String(v).toLowerCase().trim(),
  );
  if (
    typeof s.eligibility.sentStatus !== "string" ||
    !s.eligibility.sentStatus.trim() ||
    s.eligibility.sentStatus.length > 200
  )
    throw new Error("Enter a sent status up to 200 characters.");
  for (const key of ["requireActive", "requireNoOutOfService", "allowHidden"])
    s.eligibility[key] = !!s.eligibility[key];
  s.team.enabled = !!s.team.enabled;
  s.team.workerName = String(s.team.workerName || "").slice(0, 100);
  s.team.url = String(s.team.url || "")
    .trim()
    .replace(/\/$/, "");
  if (s.team.url) {
    const u = new URL(s.team.url);
    if (
      !["http:", "https:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== "/"
    )
      throw new Error(
        "Use a team server origin such as https://outreach.example.com.",
      );
  }
  if (s.team.enabled && !s.team.url)
    throw new Error("Enter a shared team server URL.");
  return s;
}
