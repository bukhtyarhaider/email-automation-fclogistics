import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { check } from "./doctor.mjs";
const files = fs
  .readdirSync("tests")
  .filter((f) => f.endsWith(".test.mjs"))
  .map((f) => `tests/${f}`);
const node = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
});
if (node.status !== 0) process.exit(node.status || 1);
const python = spawnSync(
  check(),
  ["-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"],
  { stdio: "inherit" },
);
process.exit(python.status === 0 ? 0 : python.status || 1);
