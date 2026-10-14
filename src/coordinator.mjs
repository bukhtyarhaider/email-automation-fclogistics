import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { TeamLedger } from "./team.mjs";
import { unlinkSync } from "node:fs";
const token = process.env.TEAM_TOKEN;
if (!token || token.length < 24)
  throw new Error(
    "Set TEAM_TOKEN to a random secret of at least 24 characters.",
  );
const dir = path.resolve(process.env.TEAM_DATA_DIR || "team-data");
await fs.mkdir(dir, { recursive: true, mode: 0o700 });
const lockPath = path.join(dir, "coordinator.lock");
try {
  const lock = await fs.open(lockPath, "wx", 0o600);
  await lock.writeFile(String(process.pid));
  await lock.close();
} catch (e) {
  if (e.code !== "EEXIST") throw e;
  const pid = Number(await fs.readFile(lockPath, "utf8"));
  try {
    process.kill(pid, 0);
    throw new Error("Team server already running.");
  } catch (err) {
    if (err.code !== "ESRCH") throw err;
    await fs.unlink(lockPath);
    const lock = await fs.open(lockPath, "wx", 0o600);
    await lock.writeFile(String(process.pid));
    await lock.close();
  }
}
process.once("exit", () => {
  try {
    unlinkSync(lockPath);
  } catch {}
});
const filename = path.join(dir, "ledger.json");
let state;
try {
  state = JSON.parse(await fs.readFile(filename, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  state = { records: {}, suppression: {} };
}
for (const r of Object.values(state.records))
  if (r.status === "Sending") r.status = "Uncertain";
const limits = {
  hourlyCap: Number(process.env.TEAM_HOURLY_CAP || 20),
  dailyCap: Number(process.env.TEAM_DAILY_CAP || 100),
  minSeconds: Number(process.env.TEAM_MIN_SECONDS || 180),
};
for (const n of Object.values(limits))
  if (!Number.isInteger(n) || n < 1) throw new Error("Invalid team limit.");
const ledger = new TeamLedger(state, limits);
async function save() {
  const h = await fs.open(`${filename}.tmp`, "w", 0o600);
  try {
    await h.writeFile(JSON.stringify(ledger.state, null, 2));
    await h.sync();
  } finally {
    await h.close();
  }
  await fs.rename(`${filename}.tmp`, filename);
  if (process.platform !== "win32") {
    const directory = await fs.open(dir, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
}
await save();
let tail = Promise.resolve();
const server = http.createServer((req, res) => {
  const run = async () => {
    let status = 200,
      result;
    try {
      const supplied = Buffer.from(
        (req.headers.authorization || "").replace(/^Bearer /, ""),
      );
      const expected = Buffer.from(token);
      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      ) {
        status = 401;
        throw new Error("Invalid team access token.");
      }
      if (
        req.method !== "POST" ||
        !/^\/team\/(snapshot|seed|claim|begin|finish|release|suppress|unsuppress)$/.test(
          req.url,
        )
      ) {
        status = 404;
        throw new Error("Unknown action.");
      }
      let text = "";
      for await (const chunk of req) {
        text += chunk;
        if (text.length > 20000000) throw new Error("Request too large.");
      }
      const before = structuredClone(ledger.state);
      try {
        const action = req.url.split("/").at(-1);
        result = ledger.handle(action, JSON.parse(text || "{}"));
        if (action !== "snapshot") await save();
      } catch (e) {
        ledger.state = before;
        throw e;
      }
    } catch (e) {
      result = { error: e.message };
      if (status === 200) status = 400;
    }
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(result));
  };
  tail = tail.then(run, run);
});
const port = Number(process.env.TEAM_PORT || 4318),
  host = process.env.TEAM_HOST || "127.0.0.1";
server.listen(port, host, () =>
  console.log(`Shared outreach server listening on ${host}:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close());
