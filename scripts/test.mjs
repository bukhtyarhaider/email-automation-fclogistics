import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { check } from "./doctor.mjs";
const files = fs
  .readdirSync("tests")
  .filter((f) => f.endsWith(".test.mjs"))
  .map((f) => `tests/${f}`);
const node = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...files], {
  stdio: "inherit",
  env: { ...process.env, FC_MONITOR_ENABLED: "0", FC_OPEN_TRACKING_ENABLED: "0", FC_OPEN_TRACKING_CONSENT: "0", FC_EXPERIMENT_REPLY_CAPTURE_ENABLED: "0", FC_EXPERIMENT_REPLY_AUTO: "0", FC_REPLY_CAPTURE_ENABLED: "0", FC_REPLY_AUTO: "0", FC_REPLY_MAILBOXES: "[]" },
});
if (node.status !== 0) process.exit(node.status || 1);
const python = spawnSync(
  check(),
  ["-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"],
  { stdio: "inherit" },
);
process.exit(python.status === 0 ? 0 : python.status || 1);
