import { randomUUID } from "node:crypto";
import { EMAIL } from "./core.mjs";
import { quota } from "./pacing.mjs";
export class TeamLedger {
  constructor(
    state = { records: {}, suppression: {} },
    limits = { hourlyCap: 20, dailyCap: 100, minSeconds: 180 },
    now = () => Date.now(),
  ) {
    this.state = state;
    this.limits = limits;
    this.now = now;
  }
  handle(action, input) {
    const now = this.now(),
      s = this.state;
    if (action === "snapshot")
      return { records: s.records, suppression: s.suppression };
    if (action === "seed") {
      for (const [address, record] of Object.entries(input.records || {})) {
        if (
          !EMAIL.test(address) ||
          ![
            "Sent",
            "Uncertain",
            "Not sent — manual review",
            "Sending",
          ].includes(record.status)
        )
          continue;
        if (!s.records[address])
          s.records[address] = {
            email: address,
            status: record.status === "Sending" ? "Uncertain" : record.status,
            at: record.at,
            accountEmail: record.accountEmail || "",
            workerId: input.workerId,
            source: "Imported local history",
          };
      }
      for (const [address, reason] of Object.entries(input.suppression || {}))
        if (EMAIL.test(address))
          s.suppression[address] = String(reason).slice(0, 200);
      return { ok: true };
    }
    const email = String(input.email || "")
      .toLowerCase()
      .trim();
    if (!EMAIL.test(email)) throw new Error("Invalid recipient email.");
    if (action === "suppress") {
      s.suppression[email] = String(input.reason || "Do not contact").slice(
        0,
        200,
      );
      return { ok: true };
    }
    if (action === "claim") {
      if (!EMAIL.test(input.accountEmail || "") || !input.workerId)
        throw new Error("Mailbox and worker required.");
      if (s.suppression[email]) return { blocked: "Suppressed by team" };
      const existing = s.records[email];
      if (
        existing &&
        !(
          existing.status === "Claimed" &&
          Date.parse(existing.at) + 1800000 < now
        )
      )
        return { blocked: `Team record: ${existing.status}` };
      const q = quota(s.records, input.accountEmail, this.limits, now);
      const last = Object.values(s.records)
        .filter((r) => r.accountEmail === input.accountEmail)
        .reduce((n, r) => Math.max(n, Date.parse(r.at) || 0), 0);
      const waitMs = Math.max(
        q.waitMs,
        last ? last + this.limits.minSeconds * 1000 - now : 0,
      );
      if (waitMs > 0) return { waitMs };
      const record = {
        ...input,
        email,
        token: randomUUID(),
        at: new Date(now).toISOString(),
        status: "Claimed",
      };
      s.records[email] = record;
      return { token: record.token };
    }
    const record = s.records[email];
    if (
      !record ||
      record.token !== input.token ||
      record.workerId !== input.workerId
    )
      throw new Error("Team reservation mismatch.");
    if (action === "release") {
      if (record.status !== "Claimed")
        throw new Error("An attempted send cannot be released.");
      delete s.records[email];
      return { ok: true };
    }
    if (action === "begin") {
      if (record.status !== "Claimed" || s.suppression[email])
        throw new Error("Team reservation no longer allows sending.");
      record.status = "Sending";
      return { ok: true };
    }
    if (action === "finish") {
      if (
        !["Sending", "Uncertain", "Sent"].includes(record.status) ||
        !["Sent", "Uncertain"].includes(input.status)
      )
        throw new Error("Invalid team outcome.");
      if (record.status === "Sent" && input.status !== "Sent")
        throw new Error("A confirmed send cannot be downgraded.");
      record.status = input.status;
      record.evidence = String(input.evidence || "").slice(0, 500);
      return { ok: true };
    }
    throw new Error("Unknown team action.");
  }
}
export class TeamClient {
  constructor(getConfig) {
    this.getConfig = getConfig;
    this.token = process.env.TEAM_TOKEN || "";
  }
  async call(action, input = {}) {
    const config = this.getConfig();
    if (!config.enabled) return null;
    if (!this.token)
      throw new Error("Connect the shared team server with its access token.");
    const response = await fetch(`${config.url}/team/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Team server request failed.");
    return data;
  }
}
