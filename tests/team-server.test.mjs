import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const token = "synthetic-test-team-token-123456789";
test("shared server serializes competing PC claims, persists reservations, and blocks unknown send outcomes after restart", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "outreach-team-")),
    port = 14319;
  let child;
  const call = async (action, data = {}) => {
    const r = await fetch(`http://127.0.0.1:${port}/team/${action}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error);
    return result;
  };
  const start = async () => {
    child = spawn(process.execPath, [path.join(root, "src/coordinator.mjs")], {
      cwd: root,
      env: {
        ...process.env,
        TEAM_TOKEN: token,
        TEAM_DATA_DIR: dir,
        TEAM_PORT: String(port),
        TEAM_HOST: "127.0.0.1",
        TEAM_MIN_SECONDS: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let error = "";
    child.stderr.on("data", (b) => (error += b));
    const began = Date.now();
    while (Date.now() - began < 8000) {
      if (child.exitCode !== null) throw new Error(error);
      try {
        await call("snapshot");
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    throw new Error("Coordinator startup timed out");
  };
  const stop = async () => {
    const done = once(child, "exit");
    child.kill("SIGTERM");
    await done;
  };
  t.after(async () => {
    if (child?.exitCode === null) await stop();
    await fs.rm(dir, { recursive: true, force: true });
  });
  await start();
  const claims = await Promise.all(
    ["pc-one", "pc-two"].map((workerId) =>
      call("claim", {
        email: "same@example.com",
        workerId,
        accountEmail: "mailbox@example.com",
      }),
    ),
  );
  assert.equal(claims.filter((r) => r.token).length, 1);
  assert.equal(claims.filter((r) => r.blocked).length, 1);
  const index = claims.findIndex((r) => r.token),
    workerId = ["pc-one", "pc-two"][index];
  await call("begin", {
    email: "same@example.com",
    workerId,
    token: claims[index].token,
  });
  await stop();
  await start();
  const snapshot = await call("snapshot");
  assert.equal(snapshot.records["same@example.com"].status, "Uncertain");
  assert.match(
    (
      await call("claim", {
        email: "same@example.com",
        workerId: "pc-three",
        accountEmail: "mailbox@example.com",
      })
    ).blocked,
    /Uncertain/,
  );
  const denied = await fetch(`http://127.0.0.1:${port}/team/snapshot`, {
    method: "POST",
    headers: { Authorization: "Bearer incorrect" },
    body: "{}",
  });
  assert.equal(denied.status, 401);
  await assert.rejects(call("reset-pacing", { accountEmail: "mailbox@example.com", workerId: "pc-three" }), /Confirm the warning/);
  const reset = await call("reset-pacing", { accountEmail: "mailbox@example.com", workerId: "pc-three", confirmOverride: true });
  const fresh = await call("claim", { email: "fresh@example.com", accountEmail: "mailbox@example.com", workerId: "pc-three" });
  assert(fresh.token);
  assert.equal(fresh.pacingEpoch, reset.reset.id);
  await stop();
  await start();
  const afterReset = await call("snapshot");
  assert.equal(afterReset.pacingResets["mailbox@example.com"].id, reset.reset.id);
  assert.equal(afterReset.records["same@example.com"].status, "Uncertain");
  assert.match((await call("claim", { email: "same@example.com", accountEmail: "mailbox@example.com", workerId: "pc-four" })).blocked, /Uncertain/);
});
