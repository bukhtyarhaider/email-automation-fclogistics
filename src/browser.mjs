import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { connectionSettings, profileDirectory, inspectEndpoint } from "./browser-session.mjs";
const require = createRequire(import.meta.url);
export function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    return require(
      path.join(
        os.homedir(),
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
      ),
    );
  }
}
export class MailBrowser {
  constructor({ dataDirectory = path.resolve("data"), chromium, headless = false } = {}) {
    this.dataDirectory = dataDirectory;
    this.chromium = chromium;
    this.headless = headless;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.prepared = null;
    this.authenticated = false;
    this.attached = false;
    this.session = { status: "disconnected", message: "Connect your mailbox." };
  }
  setSession(status, message) {
    this.session = { status, message, mode: this.account?.connectionMode || "saved" };
    if (status !== "connected") this.authenticated = false;
    return { connected: this.authenticated, ...this.session };
  }
  async hasSavedProfile(account) {
    if (!account?.email || connectionSettings(account).connectionMode !== "saved") return false;
    return fs.access(path.join(profileDirectory(this.dataDirectory, account), "Default")).then(() => true, () => false);
  }
  async connect(password = "", account) {
    await this.close();
    this.account = { ...account, ...connectionSettings(account) };
    this.setSession("connecting", "Opening the mailbox browser…");
    const chromium = this.chromium || loadPlaywright().chromium;
    try {
      if (this.account.connectionMode === "cdp") {
        this.attached = true;
        const endpoint = await inspectEndpoint(this.account.cdpEndpoint);
        this.browser = await chromium.connectOverCDP(endpoint.websocket, { timeout: 15000 });
        this.context = this.browser.contexts()[0];
        if (!this.context) throw new Error("No default browser context is available.");
        const origin = new URL(account.url).origin;
        const pages = this.context.pages().filter((p) => {
          try { return !p.isClosed() && new URL(p.url()).origin === origin; } catch { return false; }
        });
        if (pages.length > 1) {
          // Choose only an unambiguous tab with visible account evidence. Never navigate other tabs.
          const matches = [];
          for (const p of pages) {
            if (await p.getByRole("button", { name: account.email, exact: true }).isVisible().catch(() => false)) matches.push(p);
          }
          if (matches.length !== 1) {
            const error = new Error("Several webmail tabs are open. Keep only the intended mailbox tab in this debugging browser, then reconnect.");
            error.code = "BROWSER_TABS_AMBIGUOUS";
            throw error;
          }
          this.page = matches[0];
        } else this.page = pages[0] || await this.context.newPage();
      } else {
        const directory = profileDirectory(this.dataDirectory, account);
        await fs.mkdir(directory, { recursive: true, mode: 0o700 });
        if (process.platform !== "win32") await fs.chmod(directory, 0o700);
        this.context = await chromium.launchPersistentContext(directory, {
          channel: account.browserChannel || "chrome", headless: this.headless,
          chromiumSandbox: true,
          viewport: null, timeout: 30000,
        });
        this.browser = this.context.browser();
        this.page = this.context.pages()[0] || await this.context.newPage();
      }
      this.page.setDefaultTimeout(15000);
      this.pixelRoute = (route) => route.abort();
      // Only our mailbox tab is affected; unrelated attached tabs keep their own routing.
      await this.page.route(/\/o\/[\w-]+\.gif/, this.pixelRoute);
      if (this.account.connectionMode !== "cdp" || this.page.url() === "about:blank") {
        try { await this.page.goto(account.url, { waitUntil: "domcontentloaded", timeout: 20000 }); }
        catch {
          return this.setSession("navigation_error", "Mailbox navigation did not finish. Check the network or complete verification in the browser, then choose Continue sign-in. The browser is still open.");
        }
      }
      // Give the webmail SPA time to mount, without waiting through a human challenge.
      await this.page.waitForFunction(() =>
        [...document.querySelectorAll('button')].some((b) => /^(Log in|Compose)$/.test(b.textContent.trim())) ||
        /just a moment|verify (?:that )?you are human|checking your browser/i.test(document.title + ' ' + (document.body?.innerText || '')) ||
        !!document.querySelector('#challenge-running, #challenge-stage, #challenge-form, iframe[src*="challenges.cloudflare.com"]'),
      null, { timeout: 5000 }).catch(() => {});
      const state = await this.probe();
      if (state.status === "login_required" && password) {
        // Check the origin immediately before filling credentials. Never submit to a redirect host.
        if (new URL(this.page.url()).origin !== new URL(account.url).origin)
          return this.setSession("login_required", "Sign in manually in the browser after checking the address.");
        try {
          await this.page.getByLabel("Email", { exact: true }).fill(account.email);
          await this.page.getByLabel("Password", { exact: true }).fill(password);
          await this.page.getByRole("button", { name: "Log in", exact: true }).click({ timeout: 5000 });
        } catch {
          return this.setSession("login_required", "Sign-in changed or requires attention. Complete it in the open browser, then choose Continue sign-in.");
        }
      }
      return await this.resume();
    } catch (error) {
      const attached = this.attached;
      await this.close();
      const message = error.code === "BROWSER_TABS_AMBIGUOUS" ? error.message : attached
        ? "Could not attach to the local browser. Start Chrome or Edge with the debugging command, check the port, then retry or choose Saved Browser Profile."
        : /Singleton|ProcessSingleton|in use|lock/i.test(error.message)
          ? "This saved profile is already open in another browser. Close that browser and retry. Its profile has been preserved."
          : "Could not open the saved browser. Check that the selected Chrome or Edge is installed and the data folder is writable, then retry. Its profile has been preserved.";
      this.setSession("connection_error", message);
      // Do not expose browser logs, cookie data, or local WebSocket identifiers.
      throw new Error(message);
    } finally { password = ""; }
  }
  async probe() {
    if (!this.page || this.page.isClosed() || !this.browser?.isConnected())
      return this.setSession("disconnected", "The mailbox tab or browser was closed. Connect again to reuse the saved session.");
    try {
      const evidence = await this.page.evaluate(() => ({
        title: document.title,
        text: (document.body?.innerText || "").slice(0, 20000),
        challenge: !!document.querySelector('#challenge-running, #challenge-stage, #challenge-form') ||
          [...document.querySelectorAll('iframe[src*="challenges.cloudflare.com"]')].some((e) => e.getBoundingClientRect().height > 0),
      }));
      const composeVisible = await this.page.getByRole("button", { name: "Compose", exact: true }).isVisible();
      const verification = /just a moment|verify (?:that )?you are human|checking your browser|performing security verification/i;
      if (evidence.challenge || verification.test(evidence.title) || (!composeVisible && verification.test(evidence.text)))
        return this.setSession("verification_required", "Complete Cloudflare or security verification in the open browser, then choose Continue sign-in. If it keeps looping, check browser updates, cookies, extensions and your network, or contact the mail provider.");
      if (new URL(this.page.url()).origin !== new URL(this.account.url).origin)
        return this.setSession("login_required", "The browser left the configured mailbox site. Check the address and sign in manually, then return to the inbox and choose Continue sign-in.");
      if (await this.page.getByRole("button", { name: "Log in", exact: true }).isVisible())
        return this.setSession("login_required", "Sign in in the open browser, then choose Continue sign-in. Your session may have expired; saved cookies are kept.");
      if (composeVisible)
        return { status: "inbox" };
      return this.setSession("waiting_for_inbox", "Waiting for the inbox. Complete sign-in or check the browser, then choose Continue sign-in.");
    } catch {
      return this.setSession("waiting_for_inbox", "The mailbox is loading or navigating. Wait for the inbox, then choose Continue sign-in.");
    }
  }
  async resume() {
    const state = await this.probe();
    if (state.status !== "inbox") return { connected: false, ...this.session };
    // Verify the actual sender via the existing adapter, without editing an existing draft.
    let temporary = false;
    try {
      const composer = this.page.locator('[id^="composer_window_"]');
      if (await composer.count() === 0) {
        await this.page.getByRole("button", { name: "Compose", exact: true }).click();
        temporary = true;
        await composer.waitFor({ timeout: 5000 });
      }
      if (await composer.count() !== 1) throw new Error("Ambiguous composer");
      await composer.getByRole("button", { name: this.account.email, exact: true }).waitFor({ timeout: 3000 });
      this.authenticated = true;
      this.setSession("connected", `Connected to ${this.account.email}. Sessions are reused until the provider expires them.`);
    } catch {
      return this.setSession("account_mismatch", "The signed-in sender could not be verified against this mailbox profile. Switch to the correct account in the browser, close extra compose windows, then choose Continue sign-in.");
    } finally {
      if (temporary) {
        try { await this.page.locator('[id^="composer_window_"]').getByRole("button", { name: "Close", exact: true }).click({ timeout: 3000 }); }
        catch { this.setSession("waiting_for_inbox", "Close the blank verification compose window in the browser, then choose Continue sign-in."); }
      }
    }
    return { connected: this.authenticated, ...this.session };
  }
  async close() {
    if (this.page && this.pixelRoute) await this.page.unroute(/\/o\/[\w-]+\.gif/, this.pixelRoute).catch(() => {});
    // Browser.close() on a CDP connection disconnects Playwright; it leaves the user's browser running.
    if (this.attached) await this.browser?.close().catch(() => {});
    else if (this.context) await this.context.close().catch(() => {});
    else await this.browser?.close().catch(() => {});
    this.browser = null;
    this.context = null;
    this.page = null;
    this.pixelRoute = null;
    this.prepared = null;
    this.attached = false;
    this.setSession("disconnected", "Mailbox disconnected. Saved browser profiles are kept on this device.");
  }
  async isConnected() {
    if (!this.authenticated) {
      if (this.page) await this.probe();
      return false;
    }
    return (await this.probe()).status === "inbox" && this.authenticated;
  }
  authenticationError() {
    const error = new Error(this.session.message || "Reconnect your mailbox.");
    error.authenticationRequired = true;
    error.sendNotAttempted = true;
    return error;
  }
  async prepare(message) {
    if (!(await this.isConnected()))
      throw this.authenticationError();
    if (
      this.prepared ||
      (await this.page.locator('[id^="composer_window_"]').count())
    )
      throw new Error(
        "A compose window is already open. Close it in your browser before preparing another message.",
      );
    await this.page
      .getByRole("button", { name: "Compose", exact: true })
      .click();
    const composer = this.page.locator('[id^="composer_window_"]');
    await composer.waitFor();
    if ((await composer.count()) !== 1)
      throw new Error("Expected one compose window.");
    const from = composer.getByRole("button", {
      name: this.account.email,
      exact: true,
    });
    try { await from.waitFor({ timeout: 3000 }); }
    catch {
      this.setSession("account_mismatch", "The sender does not match this mailbox profile, or the session expired. Check the account and close the compose window, then choose Continue sign-in.");
      throw this.authenticationError();
    }
    const subject = composer.locator("input#subject");
    // The inspected compose DOM has two text inputs: recipient and #subject.
    const to = composer.locator(
      'input[type="text"]:not(#subject):not(:disabled)',
    );
    if ((await to.count()) !== 1)
      throw new Error("Recipient field changed. Review the mail adapter.");
    await to.fill(message.to);
    await to.press("Enter");
    await subject.fill(message.subject);
    const editor = composer
      .frameLocator('iframe[title="Composer iframe"]')
      .locator("#htmlEditorIframeEditor");
    await editor.waitFor();
    // Some mailboxes have no configured signature. Snapshot the complete list
    // without waiting for an optional node; preserve both presence and absence.
    const signatures = editor.locator(".spm-signature-block");
    const signature = await signatures.evaluateAll((els) => els.map((el) => el.outerHTML));
    // Prepend escaped plain text nodes. Never replace editor.innerHTML or the signature.
    await editor.evaluate((el, body) => {
      if (el.querySelector("[data-fc-outreach]"))
        throw new Error("Message is already inserted");
      const wrapper = el.ownerDocument.createElement("div");
      wrapper.dataset.fcOutreach = "true";
      for (const line of body.split("\n")) {
        const paragraph = el.ownerDocument.createElement("div");
        paragraph.style.fontFamily = "Arial, Helvetica, sans-serif";
        paragraph.style.fontSize = "10.5pt";
        if (line) paragraph.textContent = line;
        else paragraph.appendChild(el.ownerDocument.createElement("br"));
        wrapper.appendChild(paragraph);
      }
      wrapper.appendChild(el.ownerDocument.createElement("br"));
      el.prepend(wrapper);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, message.body);
    if (message.trackingId) {
      await editor.locator("[data-fc-outreach]").evaluate((el, tracking) => {
        el.dataset.fcTracking = tracking.id;
        if (tracking.pixelUrl) {
          const image = el.ownerDocument.createElement("img");
          image.src = tracking.pixelUrl;
          image.width = 1; image.height = 1; image.alt = "";
          image.style.border = "0";
          image.dataset.fcPixel = "true";
          el.appendChild(image);
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }, { id: message.trackingId, pixelUrl: message.pixelUrl });
    }
    if (
      JSON.stringify(await signatures.evaluateAll((els) => els.map((el) => el.outerHTML))) !== JSON.stringify(signature)
    )
      throw new Error("Signature changed during insertion. Sending blocked.");
    const bodyNode = editor.locator("[data-fc-outreach]");
    const insertedText = await bodyNode.evaluate((el) =>
      Array.from(el.children)
        .filter((child) => child.tagName === "DIV")
        .map((child) => child.textContent)
        .join("\n"),
    );
    if (insertedText !== message.body)
      throw new Error("Inserted body does not match the preview.");
    const bodyHtml = await bodyNode.evaluate((el) => el.innerHTML);
    this.prepared = { message, composer, editor, signature, bodyHtml };
    await this.validate();
    return {
      signature: (await signatures.allInnerTexts()).join("\n"),
    };
  }
  async validate() {
    const p = this.prepared;
    if (!(await this.isConnected())) throw this.authenticationError();
    if (!p) throw new Error("No prepared message.");
    if (
      (await p.composer.locator("#subject").inputValue()) !== p.message.subject
    )
      throw new Error("Subject changed. Prepare the message again.");
    if (
      (await p.editor
        .locator("[data-fc-outreach]")
        .evaluate((el) => el.innerHTML)) !== p.bodyHtml
    )
      throw new Error(
        "Body changed in your browser. Prepare the message again.",
      );
    if (
      JSON.stringify(await p.editor
        .locator(".spm-signature-block")
        .evaluateAll((els) => els.map((el) => el.outerHTML))) !== JSON.stringify(p.signature)
    )
      throw new Error("Signature changed. Sending blocked.");
    if (p.message.trackingId && (await p.editor.locator("[data-fc-outreach]").getAttribute("data-fc-tracking")) !== p.message.trackingId)
      throw new Error("Tracking marker changed. Prepare the message again.");
    const text = await p.composer.innerText();
    if (
      !text.includes(this.account.email) ||
      !text.toLowerCase().includes(p.message.to)
    )
      throw new Error("Sender or recipient changed. Sending blocked.");
    const entry = p.composer.locator(
      'input[type="text"]:not(#subject):not(:disabled)',
    );
    if ((await entry.count()) !== 1)
      throw new Error("Unexpected recipient fields. Sending blocked.");
    const recipients = await entry.inputValue();
    if (recipients.trim())
      throw new Error("An uncommitted recipient is present. Sending blocked.");
    // The committed recipient chip has a disabled Edit input in this UI.
    const addresses = await p.composer
      .locator('input[type="text"]:disabled')
      .evaluateAll((es) => es.map((el) => el.value.toLowerCase()));
    if (addresses.length !== 1 || addresses[0] !== p.message.to)
      throw new Error("Unexpected recipient list. Sending blocked.");
  }
  async send() {
    try { await this.validate(); }
    catch (error) { error.sendNotAttempted = true; throw error; }
    const { composer } = this.prepared;
    // A fresh visible success notice is required. Window closure alone is not proof.
    const confirmation = this.page.getByText(
      /^(message|email)( was)? sent( successfully)?[.!]?$/i,
    );
    if (await confirmation.isVisible().catch(() => false)) {
      const error = new Error("A previous send notice is still visible. Wait before continuing.");
      error.sendNotAttempted = true;
      throw error;
    }
    await composer.getByRole("button", { name: "Send", exact: true }).click();
    await confirmation.waitFor({ state: "visible", timeout: 20000 });
    const evidence = await confirmation.innerText();
    this.prepared = null;
    return evidence;
  }
  async release() {
    const composer =
      this.prepared?.composer || this.page?.locator('[id^="composer_window_"]');
    if (composer && (await composer.count()) === 1) {
      await composer
        .getByRole("button", { name: "Close", exact: true })
        .click();
      this.prepared = null;
    }
  }
}
