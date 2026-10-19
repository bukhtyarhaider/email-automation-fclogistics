import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { check } from "./doctor.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT || 4317);
const url = process.env.FC_URL || `http://127.0.0.1:${port}/`;
const dataDir = path.resolve(process.env.FC_DATA_DIR || path.join(root, "data"));
const lockPath = path.join(dataDir, "app.lock");

function openBrowser(targetUrl) {
  const command =
    process.platform === "win32"
      ? "cmd"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  const args =
    process.platform === "win32" ? ["/c", "start", "", targetUrl] : [targetUrl];
  try {
    const browser = spawn(command, args, { stdio: "ignore", detached: true });
    browser.unref();
    browser.on("error", () => console.log(`Open ${targetUrl} in your browser.`));
  } catch {
    console.log(`Open ${targetUrl} in your browser.`);
  }
}

async function checkDeskHealth(targetUrl) {
  try {
    const res = await fetch(targetUrl, { signal: AbortSignal.timeout(1200) });
    const text = await res.text();
    return text.includes("Outreach Desk");
  } catch {
    return false;
  }
}

function getLockPid(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const content = fs.readFileSync(file, "utf8").trim();
    const pid = Number(content);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopPid(pid, file) {
  if (!pid) return;
  try {
    process.kill(pid, 0);
  } catch {
    if (file && fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch {}
    }
    return;
  }

  try {
    if (process.platform === "win32") {
      try {
        spawnSync("taskkill", ["/PID", String(pid), "/F", "/T"], {
          stdio: "ignore",
        });
      } catch {
        try {
          process.kill(pid);
        } catch {}
      }
    } else {
      process.kill(pid, "SIGTERM");
    }
  } catch (e) {
    if (e.code === "ESRCH") return;
  }

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      process.kill(pid, 0);
    } catch {
      break;
    }
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {}

  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      process.kill(pid, 0);
    } catch {
      break;
    }
  }

  if (file && fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
    } catch {}
  }
}

async function run() {
  const isRestartFlag =
    process.argv.includes("--restart") ||
    process.argv.includes("-r") ||
    process.argv.includes("restart") ||
    process.env.FC_RESTART === "1";

  const isCloseFlag =
    process.argv.includes("--close") ||
    process.argv.includes("--stop") ||
    process.argv.includes("close") ||
    process.argv.includes("stop");

  const isOpenOnly =
    process.argv.includes("--open") ||
    process.argv.includes("-o") ||
    process.argv.includes("open");

  const lockPid = getLockPid(lockPath);
  const liveLock = lockPid && isPidAlive(lockPid);
  const isDeskActive = await checkDeskHealth(url);

  if (isDeskActive) {
    if (isCloseFlag) {
      console.log(`Stopping Outreach Desk (PID ${lockPid || "unknown"})...`);
      if (lockPid) await stopPid(lockPid, lockPath);
      console.log("✓ Outreach Desk stopped.");
      return;
    }

    if (isRestartFlag) {
      console.log(
        `Restarting Outreach Desk (stopping PID ${lockPid || "unknown"})...`,
      );
      if (lockPid) await stopPid(lockPid, lockPath);
      console.log("✓ Existing instance stopped. Launching fresh server...\n");
      return launchServer();
    }

    console.log("\n============================================================");
    console.log(" Outreach Desk is already running!");
    console.log(` URL:        ${url}`);
    if (lockPid) console.log(` Process ID: ${lockPid}`);
    console.log(" Status:     Active & responsive");
    console.log("============================================================\n");
    openBrowser(url);
    console.log("✓ Opened active Outreach Desk in your default browser.");

    if (isOpenOnly || !process.stdin.isTTY) {
      return;
    }

    console.log("\nOptions:");
    console.log("  [Enter] Keep active instance running (default)");
    console.log("  [R]     Close existing instance and restart fresh");
    console.log("  [C]     Close active instance and exit");

    const rl = readline.createInterface({ input, output });
    try {
      const answer = (
        await rl.question("\nChoose an option [Enter/R/C]: ")
      )
        .trim()
        .toLowerCase();
      rl.close();

      if (answer === "r" || answer === "restart") {
        console.log(
          `\nStopping existing instance (PID ${lockPid || "unknown"})...`,
        );
        if (lockPid) await stopPid(lockPid, lockPath);
        console.log("✓ Existing instance stopped. Starting fresh server...\n");
        return launchServer();
      } else if (
        answer === "c" ||
        answer === "close" ||
        answer === "q" ||
        answer === "quit"
      ) {
        console.log(
          `\nStopping running instance (PID ${lockPid || "unknown"})...`,
        );
        if (lockPid) await stopPid(lockPid, lockPath);
        console.log("✓ Outreach Desk stopped.\n");
        return;
      } else {
        console.log("✓ Keeping active instance running.\n");
        return;
      }
    } catch {
      rl.close();
      return;
    }
  }

  if (liveLock) {
    console.log(
      `\nNotice: An instance (PID ${lockPid}) holds data/app.lock but is not responding at ${url}.`,
    );
    console.log("Terminating unresponsive process and starting fresh server...\n");
    await stopPid(lockPid, lockPath);
  } else if (lockPid) {
    try {
      fs.unlinkSync(lockPath);
    } catch {}
  }

  if (isCloseFlag) {
    console.log("Outreach Desk is not currently running.");
    return;
  }

  return launchServer();
}

function launchServer() {
  const python = check();
  const child = spawn(process.execPath, [path.join(root, "src/server.mjs")], {
    cwd: root,
    env: { ...process.env, FC_PYTHON: python },
    stdio: ["inherit", "pipe", "pipe"],
  });

  let opened = false;
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    if (!opened && chunk.toString().includes("Outreach Desk:")) {
      opened = true;
      openBrowser(url);
    }
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    if (text.includes("Another instance is using this data folder")) {
      console.log("\nNotice: Another instance is already active.");
      openBrowser(url);
    } else {
      process.stderr.write(chunk);
    }
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      child.kill(signal);
    });
  }

  child.on("exit", (code) => {
    process.exitCode = code || 0;
  });

  child.on("error", (e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}

try {
  await run();
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
