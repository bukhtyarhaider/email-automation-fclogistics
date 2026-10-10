import { spawnSync } from "node:child_process";
import { check } from "./doctor.mjs";
try {
  check();
  const r = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["ci"],
    { stdio: "inherit", shell: process.platform === "win32" },
  );
  if (r.status !== 0)
    throw new Error(
      "Dependency installation failed. Check your connection and rerun Setup.",
    );
  console.log(
    "Setup complete. Open Start-Windows.cmd or Start-Mac.command to use Outreach Desk.",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
