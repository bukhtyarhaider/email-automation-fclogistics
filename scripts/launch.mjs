import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { check } from "./doctor.mjs";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = `http://127.0.0.1:${process.env.PORT || 4317}/`;
try {
  const python = check();
  const child = spawn(process.execPath, [path.join(root, "src/server.mjs")], {
    cwd: root,
    env: { ...process.env, FC_PYTHON: python },
    stdio: ["inherit", "pipe", "inherit"],
  });
  let opened = false;
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    if (!opened && chunk.toString().includes("Outreach Desk:")) {
      opened = true;
      const command =
        process.platform === "win32"
          ? "cmd"
          : process.platform === "darwin"
            ? "open"
            : "xdg-open";
      const args =
        process.platform === "win32" ? ["/c", "start", "", url] : [url];
      const browser = spawn(command, args, { stdio: "ignore" });
      browser.on("error", () => console.log(`Open ${url} in your browser.`));
    }
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
  child.on("exit", (code) => {
    process.exitCode = code || 0;
  });
  child.on("error", (e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
