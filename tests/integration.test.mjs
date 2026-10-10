import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await fn();
    if (result) return result;
    await sleep(100);
  }
  throw new Error("Timed out");
}
async function start(dir, port, extra = {}) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      path.join(ROOT, "tests/fixtures/fake-mail.mjs"),
      path.join(ROOT, "src/server.mjs"),
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        FC_DATA_DIR: dir,
        PORT: String(port),
        TEST_SEND_LOG: path.join(dir, "sends.jsonl"),
        ...extra,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let err = "";
  child.stderr.on("data", (b) => (err += b));
  await until(async () => {
    if (child.exitCode !== null) throw new Error(err);
    try {
      return (await fetch(`http://127.0.0.1:${port}/api/state`)).ok;
    } catch {
      return false;
    }
  });
  return child;
}
async function stop(child) {
  const done = once(child, "exit");
  child.kill("SIGTERM");
  await done;
}
test("continuous queue sends all leads, waits, accepts another campaign, stops, and preserves restart history", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "outreach-test-"));
  let child;
  const port = 14317;
  t.after(async () => {
    if (child?.exitCode === null) await stop(child);
    await fs.rm(dir, { recursive: true, force: true });
  });
  const workbook = path.join(dir, "sample.xlsx");
  execFileSync(process.platform === "win32" ? "python" : "python3", [
    path.join(ROOT, "tests/fixtures/workbook.py"),
    workbook,
  ]);
  child = await start(dir, port);
  async function api(route, data) {
    const r = await fetch(
      `http://127.0.0.1:${port}/api/${route}`,
      data
        ? {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-FC-Request": "1",
            },
            body: JSON.stringify(data),
          }
        : {},
    );
    const value = await r.json();
    if (!r.ok) throw new Error(value.error);
    return value;
  }
  let s = await api("state");
  assert.equal(Object.keys(s.templates).length, 16);
  const b = {
    company: "Example Dispatch",
    senderName: "Alex",
    legalName: "Example LLC",
    address: "123 Example Street",
    services: "load sourcing and coordination",
  };
  await api("profile", {
    id: s.activeProfile,
    name: "Alex",
    email: "alex@example.com",
    provider: "privateemail",
    url: "https://privateemail.com/spm/mail/INBOX/",
    business: b,
  });
  s = await api("state");
  const settings = s.settings;
  settings.business = b;
  settings.eligibility.requireActive = false;
  settings.eligibility.requireNoOutOfService = false;
  Object.assign(settings.pacing, {
    minSeconds: 1,
    maxSeconds: 1,
    pauseEveryMin: 100,
    pauseEveryMax: 100,
    pollSeconds: 5,
  });
  await api("settings", { settings });
  await api("import", { path: workbook });
  await api("connect", { password: "test-not-a-real-password" });
  await api("start", { randomTemplates: true });
  s = await until(async () => {
    const x = await api("state");
    return x.job.status === "Waiting for leads" ? x : false;
  });
  assert.equal(s.counts.sent, 3);
  assert.equal(s.counts.ready, 0);
  assert.equal(s.job.enabled, true);
  const log = (await fs.readFile(path.join(dir, "sends.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.equal(log.length, 3);
  assert.equal(new Set(log.map((m) => m.to)).size, 3);
  assert.match(log[0].body, /Alex with Example Dispatch/);
  await api("delete-template", { key: "simple" });
  await stop(child);
  child = await start(dir, port);
  s = await api("state");
  assert.equal(Object.keys(s.templates).length, 15);
  assert.equal(s.job.enabled, true);
  assert.equal(s.job.status, "Waiting for mailbox");
  assert.equal(s.connected, false);
  await api("connect", { password: "test-not-a-real-password" });
  await api("import", { path: workbook });
  s = await api("state");
  assert.equal(s.campaigns.length, 2);
  assert.equal(s.counts.ready, 0);
  await api("stop", {});
  await until(async () => !(await api("state")).job.enabled);
  await stop(child);
  child = await start(dir, port);
  s = await api("state");
  assert.equal(s.job.enabled, false);
  assert.equal(s.counts.sent, 3);
  assert.equal(s.counts.ready, 0);
  assert.equal(s.connected, false);
  const disk = await fs.readFile(path.join(dir, "state.json"), "utf8");
  assert(!disk.includes("test-not-a-real-password"));
  assert(
    (await api("history")).records.every(
      (r) => r.body && r.templateKey && r.accountEmail && r.signature,
    ),
  );
});
test("lost send confirmation stops continuous outreach and blocks every retry after restart", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "outreach-uncertain-"));
  let child;
  const port = 14318;
  t.after(async () => {
    if (child?.exitCode === null) await stop(child);
    await fs.rm(dir, { recursive: true, force: true });
  });
  const workbook = path.join(dir, "sample.xlsx");
  execFileSync(process.platform === "win32" ? "python" : "python3", [
    path.join(ROOT, "tests/fixtures/workbook.py"),
    workbook,
  ]);
  child = await start(dir, port, { TEST_SEND_FAIL: "1" });
  const api = async (route, data) => {
    const r = await fetch(
      `http://127.0.0.1:${port}/api/${route}`,
      data
        ? {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-FC-Request": "1",
            },
            body: JSON.stringify(data),
          }
        : {},
    );
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    return v;
  };
  let s = await api("state");
  const b = {
    company: "Example",
    senderName: "Alex",
    legalName: "Example LLC",
    address: "123 Example St",
    services: "coordination",
  };
  await api("profile", {
    id: s.activeProfile,
    email: "alex@example.com",
    provider: "privateemail",
    business: b,
  });
  s = await api("state");
  s.settings.eligibility.requireActive = false;
  s.settings.eligibility.requireNoOutOfService = false;
  await api("settings", { settings: s.settings });
  await api("import", { path: workbook });
  await api("connect", { password: "test" });
  await api("start", { randomTemplates: true });
  s = await until(async () => {
    const x = await api("state");
    return x.job.status === "Needs attention" ? x : false;
  });
  assert.equal(Object.values(s.attempts)[0].status, "Uncertain");
  assert.equal(Object.keys(s.attempts).length, 1);
  await stop(child);
  child = await start(dir, port);
  s = await api("state");
  assert.equal(s.job.enabled, false);
  assert.equal(Object.values(s.attempts)[0].status, "Uncertain");
  assert.equal(
    (await fs.readFile(path.join(dir, "sends.jsonl"), "utf8"))
      .trim()
      .split("\n").length,
    1,
  );
});

test("two independent PC workers use one coordinator without duplicate emails or private credential sharing", async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "outreach-workers-"));
  const dirs = [path.join(base, "pc-one"), path.join(base, "pc-two")];
  for (const dir of dirs) await fs.mkdir(dir);
  const token = "synthetic-coordinator-token-for-worker-test";
  const teamPort = 14323,
    ports = [14321, 14322];
  let coordinator;
  const workers = [];
  t.after(async () => {
    for (const worker of workers)
      if (worker.exitCode === null) await stop(worker);
    if (coordinator?.exitCode === null) await stop(coordinator);
    await fs.rm(base, { recursive: true, force: true });
  });
  coordinator = spawn(
    process.execPath,
    [path.join(ROOT, "src/coordinator.mjs")],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        TEAM_TOKEN: token,
        TEAM_DATA_DIR: path.join(base, "team"),
        TEAM_PORT: String(teamPort),
        TEAM_HOST: "127.0.0.1",
        TEAM_MIN_SECONDS: "1",
        TEAM_HOURLY_CAP: "10",
        TEAM_DAILY_CAP: "20",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let error = "";
  coordinator.stderr.on("data", (b) => (error += b));
  await until(async () => {
    if (coordinator.exitCode !== null) throw new Error(error);
    try {
      return (
        await fetch(`http://127.0.0.1:${teamPort}/team/snapshot`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: "{}",
        })
      ).ok;
    } catch {
      return false;
    }
  });
  const workbook = path.join(base, "leads.xlsx");
  execFileSync(process.platform === "win32" ? "python" : "python3", [
    path.join(ROOT, "tests/fixtures/workbook.py"),
    workbook,
  ]);
  const apis = [];
  for (let i = 0; i < dirs.length; i++) {
    workers.push(await start(dirs[i], ports[i]));
    const api = async (route, data) => {
      const response = await fetch(
        `http://127.0.0.1:${ports[i]}/api/${route}`,
        data
          ? {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-FC-Request": "1",
              },
              body: JSON.stringify(data),
            }
          : {},
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      return result;
    };
    apis.push(api);
    let s = await api("state");
    const b = {
      company: "Example",
      senderName: `Agent ${i}`,
      legalName: "Example LLC",
      address: "123 Example Street",
      services: "coordination",
    };
    await api("profile", {
      id: s.activeProfile,
      email: `agent${i}@example.com`,
      provider: "privateemail",
      business: b,
    });
    s = await api("state");
    s.settings.eligibility.requireActive = false;
    s.settings.eligibility.requireNoOutOfService = false;
    Object.assign(s.settings.pacing, {
      minSeconds: 1,
      maxSeconds: 1,
      pauseEveryMin: 100,
      pauseEveryMax: 100,
      pollSeconds: 5,
    });
    s.settings.team = {
      enabled: true,
      url: `http://127.0.0.1:${teamPort}`,
      workerName: `PC ${i}`,
    };
    await api("settings", { settings: s.settings, teamToken: token });
    await api("import", { path: workbook });
    await api("connect", { password: "synthetic-worker-password" });
  }
  await Promise.all(apis.map((api) => api("start", { randomTemplates: true })));
  await until(async () => {
    const snapshots = await Promise.all(apis.map((api) => api("state")));
    return snapshots.reduce((sum, s) => sum + s.counts.sent, 0) === 3;
  }, 20000);
  await Promise.all(apis.map((api) => api("stop", {})));
  const all = [];
  for (const dir of dirs) {
    try {
      all.push(
        ...(await fs.readFile(path.join(dir, "sends.jsonl"), "utf8"))
          .trim()
          .split("\n")
          .map(JSON.parse),
      );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  assert.equal(all.length, 3);
  assert.equal(new Set(all.map((m) => m.to)).size, 3);
  const ledger = JSON.parse(
    await fs.readFile(path.join(base, "team", "ledger.json"), "utf8"),
  );
  assert.equal(
    Object.values(ledger.records).filter((r) => r.status === "Sent").length,
    3,
  );
  assert(
    !(
      await fs.readFile(path.join(base, "team", "ledger.json"), "utf8")
    ).includes("synthetic-worker-password"),
  );
});
