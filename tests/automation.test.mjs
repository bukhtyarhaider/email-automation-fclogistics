import test from "node:test";
import assert from "node:assert/strict";
import { upgrade, DEFAULTS, validateSettings } from "../src/config.mjs";
import {
  templates,
  pickTemplate,
  render,
  assess,
  reason,
} from "../src/core.mjs";
import { quota, nextPause } from "../src/pacing.mjs";
import { TeamLedger } from "../src/team.mjs";
const lead = {
  company: "Example Fleet",
  email: "owner@example.com",
  status: "",
  statusCell: "D2",
  fields: {},
};
const business = {
  company: "Example Dispatch",
  senderName: "Alex",
  legalName: "Example LLC",
  address: "123 Example St, Example City",
  services: "load sourcing and coordination",
};
test("new workspace has no fixed customer, mailbox, leads or suppression", () => {
  const s = upgrade({});
  assert.equal(s.profiles[0].email, "");
  assert.equal(s.settings.business.company, "");
  assert.deepEqual(s.campaigns, []);
  assert.deepEqual(s.suppression, {});
  assert.equal(s.automation.enabled, false);
});
test("legacy migration preserves successful sends, suppressed recipients and workbook", () => {
  const s = upgrade({
    workbook: { file: "old.xlsx", name: "Old" },
    history: {
      "one@example.com": { status: "Sending" },
      "two@example.com": { status: "Sent" },
    },
    suppression: { "three@example.com": "Opt-out" },
  });
  assert.equal(s.history["one@example.com"].status, "Uncertain");
  assert.equal(s.history["two@example.com"].status, "Sent");
  assert.equal(s.campaigns[0].workbook.file, "old.xlsx");
  assert.equal(s.suppression["three@example.com"], "Opt-out");
});
test("16 editable variants render a different profile without old sender data", () => {
  assert.equal(Object.keys(templates).length, 16);
  for (const t of Object.values(templates)) {
    const m = render(lead, t, business);
    assert.match(m.body, /Alex with Example Dispatch/);
    assert.match(m.body, /123 Example St/);
    assert.doesNotMatch(m.body, /Mark|FC Logistics|\{\{/);
    assert.deepEqual(assess(m), []);
  }
});
test("random selection respects enabled variants, required data, weights and last template", () => {
  const ts = {
    a: { enabled: true, weight: 1 },
    b: { enabled: true, weight: 3 },
    c: { enabled: false },
    d: { requiredFields: ["city"] },
  };
  assert.equal(
    pickTemplate(ts, lead, null, () => 3),
    "b",
  );
  assert.equal(
    pickTemplate(ts, lead, "b", () => 0),
    "a",
  );
  assert.throws(
    () => pickTemplate({ a: { enabled: false } }, lead),
    /No enabled template/,
  );
});
test("random delays and longer rests stay inside configured bounds", () => {
  const p = {
    ...DEFAULTS.pacing,
    minSeconds: 5,
    maxSeconds: 9,
    pauseEveryMin: 2,
    pauseEveryMax: 2,
    pauseMinSeconds: 15,
    pauseMaxSeconds: 25,
  };
  const a = { sincePause: 0, pauseAfter: 0 };
  assert.deepEqual(
    nextPause(a, p, (_, upper) => upper - 1),
    { kind: "Waiting", seconds: 9 },
  );
  assert.deepEqual(
    nextPause(a, p, (_, upper) => upper - 1),
    { kind: "Resting", seconds: 25 },
  );
  assert.equal(a.sincePause, 0);
});
test("rolling quotas are mailbox-specific and calculate the next safe send", () => {
  const now = Date.now();
  const history = {
    a: {
      accountEmail: "a@example.com",
      at: new Date(now - 5000).toISOString(),
    },
    b: { accountEmail: "b@example.com", at: new Date(now).toISOString() },
  };
  assert.equal(
    quota(history, "a@example.com", { hourlyCap: 1, dailyCap: 2 }, now).waitMs,
    3595000,
  );
  assert.equal(
    quota(history, "c@example.com", { hourlyCap: 1, dailyCap: 2 }, now).waitMs,
    0,
  );
  assert.equal(
    quota(history, "a@example.com", { hourlyCap: 3, dailyCap: 1 }, now).waitMs,
    86395000,
  );
});
test("config validates ranges and permits generic leads by explicit rule selection", () => {
  const s = structuredClone(DEFAULTS);
  s.pacing.maxSeconds = 1;
  assert.throws(() => validateSettings(s), /cannot exceed/);
  s.pacing.maxSeconds = 500;
  assert.doesNotThrow(() => validateSettings(s));
  s.eligibility.requireActive = false;
  s.eligibility.requireNoOutOfService = false;
  assert.equal(reason(lead, { settings: s, suppression: {}, history: {} }), "");
});
function ledger() {
  let now = Date.now();
  const l = new TeamLedger(
    undefined,
    { hourlyCap: 2, dailyCap: 3, minSeconds: 1 },
    () => now,
  );
  return { l, advance: (ms) => (now += ms) };
}
const claim = (worker, email = "owner@example.com") => ({
  email,
  workerId: worker,
  accountEmail: "mailbox@example.com",
});
test("team atomically reserves a recipient across PCs and shares suppression", () => {
  const { l } = ledger();
  assert(l.handle("claim", claim("pc1")).token);
  assert.match(l.handle("claim", claim("pc2")).blocked, /Claimed/);
  l.handle("suppress", { email: "other@example.com", reason: "Opt-out" });
  assert.match(
    l.handle("claim", claim("pc2", "other@example.com")).blocked,
    /Suppressed/,
  );
});
test("team shares account quotas and pacing across different recipients and PCs", () => {
  const { l, advance } = ledger();
  l.handle("claim", claim("pc1"));
  assert(l.handle("claim", claim("pc2", "two@example.com")).waitMs > 0);
  advance(1100);
  l.handle("claim", claim("pc2", "two@example.com"));
  advance(1100);
  assert(l.handle("claim", claim("pc3", "three@example.com")).waitMs > 0);
});
test("only unattempted expired claims may be recovered; Sending never expires", () => {
  const { l, advance } = ledger();
  const first = l.handle("claim", claim("pc1"));
  l.handle("begin", { ...claim("pc1"), token: first.token });
  advance(86400000);
  assert.match(l.handle("claim", claim("pc2")).blocked, /Sending/);
  assert.throws(
    () => l.handle("release", { ...claim("pc1"), token: first.token }),
    /cannot be released/,
  );
  const second = l.handle("claim", claim("pc1", "two@example.com"));
  advance(1800001);
  assert(l.handle("claim", claim("pc2", "two@example.com")).token);
  assert.throws(
    () =>
      l.handle("begin", {
        ...claim("pc1", "two@example.com"),
        token: second.token,
      }),
    /mismatch/,
  );
});
test("team begin rejects a recipient suppressed after reservation", () => {
  const { l } = ledger();
  const r = l.handle("claim", claim("pc1"));
  l.handle("suppress", { email: "owner@example.com", reason: "Remove" });
  assert.throws(
    () => l.handle("begin", { ...claim("pc1"), token: r.token }),
    /no longer allows/,
  );
});
test("team imports existing local send history before other PCs can contact it", () => {
  const { l } = ledger();
  l.handle("seed", {
    workerId: "pc1",
    records: {
      "old@example.com": { status: "Sent", at: new Date().toISOString() },
    },
    suppression: { "stop@example.com": "Remove" },
  });
  assert.match(
    l.handle("claim", claim("pc2", "old@example.com")).blocked,
    /Sent/,
  );
  assert.match(
    l.handle("claim", claim("pc2", "stop@example.com")).blocked,
    /Suppressed/,
  );
});
