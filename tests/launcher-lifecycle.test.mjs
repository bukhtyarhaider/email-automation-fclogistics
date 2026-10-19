import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await fn();
    if (result) return result;
    await sleep(100);
  }
  throw new Error("Timed out waiting for condition");
}

function startServer(dir, port, extraArgs = [], extraEnv = {}) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      path.join(ROOT, "tests/fixtures/fake-mail.mjs"),
      path.join(ROOT, "src/server.mjs"),
      ...extraArgs,
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        FC_DATA_DIR: dir,
        PORT: String(port),
        FC_MONITOR_ENABLED: "0",
        FC_OPEN_TRACKING_ENABLED: "0",
        FC_OPEN_TRACKING_CONSENT: "0",
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d));
  child.stderr.on("data", (d) => (stderr += d));
  return {
    child,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
  };
}

test("server lock prevents duplicate instances and allows graceful restart", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fc-lock-test-"));
  const port1 = 4390;
  const port2 = 4391;

  t.after(async () => {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {}
  });

  // 1. Start server 1
  const s1 = startServer(dir, port1);
  t.after(() => {
    try {
      s1.child.kill("SIGKILL");
    } catch {}
  });

  await until(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port1}/`);
      return res.ok;
    } catch {
      return false;
    }
  });

  // Verify app.lock was created and holds s1's PID
  const lockContent = await fs.readFile(path.join(dir, "app.lock"), "utf8");
  assert.equal(Number(lockContent.trim()), s1.child.pid);

  // 2. Try starting server 2 on another port but same data dir without --restart
  const s2 = startServer(dir, port2);
  const exitCode = await new Promise((resolve) => s2.child.on("exit", resolve));
  assert.equal(exitCode, 1);
  assert.match(s2.stderr, /Another instance is using this data folder/);

  // Server 1 should still be alive and healthy
  const res1 = await fetch(`http://127.0.0.1:${port1}/`);
  assert.equal(res1.ok, true);

  // 3. Start server 3 on same data dir with --restart
  const s3 = startServer(dir, port1, ["--restart"]);
  t.after(() => {
    try {
      s3.child.kill("SIGKILL");
    } catch {}
  });

  // Server 1 should exit
  await until(() => s1.child.exitCode !== null, 6000);

  // Server 3 should acquire lock and bind port1
  await until(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port1}/`);
      return res.ok;
    } catch {
      return false;
    }
  }, 6000);

  const lockContent3 = await fs.readFile(path.join(dir, "app.lock"), "utf8");
  assert.equal(Number(lockContent3.trim()), s3.child.pid);

  // Clean shutdown s3
  s3.child.kill("SIGTERM");
  await until(() => s3.child.exitCode !== null, 6000);
});

test("launcher handles active instance, --close, and stale locks", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fc-launch-test-"));
  const port = 4392;

  t.after(async () => {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {}
  });

  // 1. Start server directly to simulate an already active instance
  const s = startServer(dir, port);
  t.after(() => {
    try {
      s.child.kill("SIGKILL");
    } catch {}
  });

  await until(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      return res.ok;
    } catch {
      return false;
    }
  });

  // 2. Run launch.mjs --open: should detect active instance and exit 0
  const launcherOpen = spawn(
    process.execPath,
    [path.join(ROOT, "scripts/launch.mjs"), "--open"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        FC_DATA_DIR: dir,
        PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let openOut = "";
  launcherOpen.stdout.on("data", (d) => (openOut += d));
  const openExit = await new Promise((r) => launcherOpen.on("exit", r));
  assert.equal(openExit, 0);
  assert.match(openOut, /Outreach Desk is already running/);

  // 3. Run launch.mjs --close: should stop running instance and exit 0
  const launcherClose = spawn(
    process.execPath,
    [path.join(ROOT, "scripts/launch.mjs"), "--close"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        FC_DATA_DIR: dir,
        PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let closeOut = "";
  launcherClose.stdout.on("data", (d) => (closeOut += d));
  const closeExit = await new Promise((r) => launcherClose.on("exit", r));
  assert.equal(closeExit, 0);
  assert.match(closeOut, /Outreach Desk stopped/);

  // Verify server s was stopped
  await until(() => s.child.exitCode !== null, 5000);

  // 4. Test stale lock cleanup: create a lock with a non-existent PID
  const fakeDeadPid = 99999999;
  await fs.writeFile(path.join(dir, "app.lock"), String(fakeDeadPid));

  // Run launch.mjs --close when not running: reports not running cleanly
  const launcherStale = spawn(
    process.execPath,
    [path.join(ROOT, "scripts/launch.mjs"), "--close"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        FC_DATA_DIR: dir,
        PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let staleOut = "";
  launcherStale.stdout.on("data", (d) => (staleOut += d));
  const staleExit = await new Promise((r) => launcherStale.on("exit", r));
  assert.equal(staleExit, 0);
  assert.match(staleOut, /not currently running/);
});
