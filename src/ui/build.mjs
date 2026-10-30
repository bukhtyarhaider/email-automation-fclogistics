/**
 * UI Build Script
 * Concatenates modular source partials from src/ui/ into public/ output files.
 *
 * Usage:  node src/ui/build.mjs
 *
 * Output:
 *   public/index.html  — assembled from html/ partials
 *   public/style.css   — assembled from styles/ partials
 *   public/app.js      — assembled from js/ partials
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UI_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(UI_DIR, "..", "..");
const PUBLIC = path.join(ROOT, "public");

/** Read and concatenate files in order */
async function concat(dir, files) {
  const parts = [];
  for (const file of files) {
    const full = path.join(dir, file);
    try {
      parts.push(await fs.readFile(full, "utf8"));
    } catch (e) {
      console.error(`  ✗ Missing partial: ${file}`);
      throw e;
    }
  }
  return parts.join("\n");
}

// === CSS partials (order matters) ===
const CSS_FILES = [
  "_tokens.css",
  "_base.css",
  "_shell.css",
  "_components.css",
  "_stats.css",
  "_table.css",
  "_drawer.css",
  "_live-activity.css",
  "_tracking.css",
  "_templates.css",
  "_settings.css",
  "_animations.css",
  "_history-catalog.css",
  "_experiment.css",
  "_conversations.css",
  "_carrier-workspace.css",
  "_mailroom.css",
];

// === HTML partials (order matters) ===
const HTML_FILES = [
  "_head.html",
  "_titlebar.html",
  "_sidebar.html",
  "_view-dashboard.html",
  "_view-leads.html",
  "_view-campaigns.html",
  "_view-imports.html",
  "_view-conversations.html",
  "_view-templates.html",
  "_view-settings.html",
  "_view-live-activity.html",
  "_view-activity.html",
  "_view-catalog.html",
  "_view-tracking.html",
  "_view-suppression.html",
  "_foot-main.html",
  "_drawer-lead.html",
  "_drawer-tracking.html",
  "_foot.html",
];

// === JS partials (order matters) ===
const JS_FILES = [
  "_globals.js",
  "_controls.js",
  "_refresh.js",
  "_leads.js",
  "_templates.js",
  "_campaigns.js",
  "_settings.js",
  "_history.js",
  "_catalog.js",
  "_drawer.js",
  "_live-activity.js",
  "_tracking.js",
  "_suppression.js",
  "_navigation.js",
  "_experiment.js",
  "_conversations.js",
  "_carrier-workspace.js",
  "_conversation-assistant.js",
  "_mailroom.js",
  "_boot.js",
];

async function build() {
  const t0 = performance.now();
  console.log("Building UI…");

  const [css, html, js] = await Promise.all([
    concat(path.join(UI_DIR, "styles"), CSS_FILES),
    concat(path.join(UI_DIR, "html"), HTML_FILES),
    concat(path.join(UI_DIR, "js"), JS_FILES),
  ]);

  await Promise.all([
    fs.writeFile(path.join(PUBLIC, "style.css"), css),
    fs.writeFile(path.join(PUBLIC, "index.html"), html),
    fs.writeFile(path.join(PUBLIC, "app.js"), js),
    ...[
      ["html/experiment.html", "experiment.html"],
      ["styles/_experiment.css", "experiment.css"],
      ["js/_experiment.js", "experiment.js"],
      ["html/conversations.html", "conversations.html"],
      ["styles/_conversations.css", "conversations.css"],
      ["js/_conversations.js", "conversations.js"],
    ].map(async ([source, target]) => fs.writeFile(path.join(PUBLIC, target), await fs.readFile(path.join(UI_DIR, source)))),
  ]);

  const elapsed = (performance.now() - t0).toFixed(0);
  console.log(`  ✓ style.css   (${(css.length / 1024).toFixed(1)} KB)`);
  console.log(`  ✓ index.html  (${(html.length / 1024).toFixed(1)} KB)`);
  console.log(`  ✓ app.js      (${(js.length / 1024).toFixed(1)} KB)`);
  console.log(`  Done in ${elapsed}ms`);
}

build().catch((e) => {
  console.error("Build failed:", e.message);
  process.exit(1);
});
