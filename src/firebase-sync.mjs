import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";
import { recordOpenHash, hash } from "./tracking.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_DATABASE_URL = "https://ea-fclogistics-default-rtdb.asia-southeast1.firebasedatabase.app";
const counters = () => ({ scanned: 0, matched: 0, synced: 0, alreadyApplied: 0, otherPc: 0, unmatched: 0, invalid: 0, pcMismatches: 0, acknowledged: 0 });

function getCredentials(env, dataDirectory) {
  if (env.FC_FIREBASE_DISABLE === "1") return { disabled: true, source: "Disabled by FC_FIREBASE_DISABLE=1" };
  // An explicit path is authoritative: a broken override must not silently use another project's key.
  const explicit = env.FC_FIREBASE_CREDENTIALS_PATH || env.GOOGLE_APPLICATION_CREDENTIALS;
  const candidates = explicit ? [explicit] : [path.join(dataDirectory, "firebase-service-account.json")];
  for (const candidate of candidates) {
    const resolved = path.resolve(ROOT, candidate);
    if (!explicit && !fs.existsSync(resolved)) continue;
    try { return { credentials: JSON.parse(fs.readFileSync(resolved, "utf8")), source: resolved }; }
    catch { return { source: resolved, error: "Cannot read or parse the Firebase credential file. Check its path and JSON format, then restart the app." }; }
  }
  const raw = env.FC_FIREBASE_SERVICE_ACCOUNT_KEY || env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    try {
      const trimmed = raw.trim();
      return { credentials: JSON.parse(trimmed.startsWith("{") ? trimmed : Buffer.from(trimmed, "base64").toString("utf8")), source: "Service account environment variable (value hidden)" };
    } catch { return { source: "Service account environment variable (value hidden)", error: "Cannot parse the Firebase service account environment variable. Fix it and restart the app." }; }
  }
  const projectId = env.FC_FIREBASE_PROJECT_ID || env.FIREBASE_PROJECT_ID;
  const clientEmail = env.FC_FIREBASE_CLIENT_EMAIL || env.FIREBASE_CLIENT_EMAIL;
  const privateKey = env.FC_FIREBASE_PRIVATE_KEY || env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) return { credentials: { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") }, source: "Individual environment variables (key hidden)" };
  return { source: path.join(dataDirectory, "firebase-service-account.json"), error: "Firebase credentials missing. Add firebase-service-account.json to the data folder or set FC_FIREBASE_CREDENTIALS_PATH, then restart the app." };
}

function safeError(error) {
  // Keep credentials, access tokens and raw event tokens out of API diagnostics.
  return String(error?.message || error).replace(/-----BEGIN[\s\S]*?-----END[^-]+-----/g, "[key hidden]").replace(/https?:\/\/[^\s)]+/g, "[service URL]").replace(/\b[\w-]{43,}\b/g, "[value hidden]").slice(0, 500);
}

export class FirebaseSync {
  constructor(options = {}, secondaryEnv = process.env) {
    this.state = options.state || {};
    this.persist = options.persist || (async () => {});
    this.env = options.env || secondaryEnv;
    this.dataDirectory = path.resolve(options.dataDirectory || this.env.FC_DATA_DIR || path.join(ROOT, "data"));
    this.pageSize = options.pageSize || 250;
    this.maxPages = options.maxPages || 20;
    this.timeoutMs = options.timeoutMs || 15000;
    this.app = null;
    this.rtdb = null;
    this.firestore = null;
    this.running = false;
    this.totalSynced = 0;
    this.lastSyncAt = this.state.tracking?.worker?.firebaseSync?.lastSyncAt || null;
    this.lastAttemptAt = this.state.tracking?.worker?.firebaseSync?.lastAttemptAt || null;
    this.lastError = null;
    this.backends = {};
    this.init();
  }

  init() {
    this.state.tracking ||= {};
    this.state.tracking.worker ||= {};
    this.credentialInfo = getCredentials(this.env, this.dataDirectory);
    this.databaseURL = this.env.FC_FIREBASE_DATABASE_URL || this.env.FIREBASE_DATABASE_URL || DEFAULT_DATABASE_URL;
    const creds = this.credentialInfo.credentials;
    if (!creds) {
      this.updateWorkerStatus(this.credentialInfo.disabled ? "Disabled" : "Needs configuration", this.credentialInfo.error || this.credentialInfo.source);
      return;
    }
    this.projectId = creds.project_id || creds.projectId;
    try {
      const appName = `fcLogisticsSync-${hash(`${this.projectId}:${creds.client_email || creds.clientEmail}:${this.databaseURL}`).slice(0, 16)}`;
      this.app = admin.apps.find((app) => app?.name === appName) || admin.initializeApp({ credential: admin.credential.cert(creds), databaseURL: this.databaseURL }, appName);
      this.rtdb = this.app.database();
      this.firestore = this.app.firestore();
      this.updateWorkerStatus("Not checked", "Credentials loaded. Connection has not been verified yet.");
    } catch (error) {
      this.lastError = safeError(error);
      this.updateWorkerStatus("Needs attention", `Firebase initialization failed: ${this.lastError}`);
    }
  }

  configuration() {
    const settings = this.state.settings?.tracking || {};
    const pcId = String(settings.pcId || this.env.FC_TRACKING_PC_ID || "1").trim();
    return {
      pcId, pcIdSource: settings.pcId ? "Settings" : this.env.FC_TRACKING_PC_ID ? "FC_TRACKING_PC_ID" : "Legacy default (1)",
      backend: settings.firebaseBackend || "both",
      publicUrl: settings.publicUrl || this.env.FC_TRACKING_PUBLIC_URL || "",
      publicUrlSource: settings.publicUrl ? "Settings" : "FC_TRACKING_PUBLIC_URL",
      mode: settings.syncMode || "auto",
    };
  }

  diagnostics() {
    const config = this.configuration();
    const warnings = [];
    if (!this.isConfigured()) warnings.push(this.credentialInfo.error || this.lastError || "Firebase sync is disabled. Enable it in the environment and restart the app.");
    if (config.pcIdSource.startsWith("Legacy")) warnings.push("PC ID is not set. Save a unique PC ID for each of the four PCs; this installation currently falls back to 1.");
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(config.pcId)) warnings.push("PC ID is invalid. Use 1–64 letters, digits, dashes or underscores.");
    if (this.env.FC_OPEN_TRACKING_ENABLED !== "1" || this.env.FC_OPEN_TRACKING_CONSENT !== "1") warnings.push("New emails will not include open tracking: FC_OPEN_TRACKING_ENABLED and FC_OPEN_TRACKING_CONSENT must both be 1. Existing cloud events can still sync.");
    if (!config.publicUrl) warnings.push("Public tracking URL is missing. Set the HTTPS cloud endpoint before sending tracked emails.");
    else {
      try {
        const url = new URL(config.publicUrl);
        if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error();
        const routedPc = /\/t\/([^/]+)\/?$/.exec(url.pathname)?.[1];
        if (routedPc && routedPc !== config.pcId) warnings.push(`Tracking URL routes to PC ${routedPc}, but this PC ID is ${config.pcId}. Correct the URL for future emails. Existing emails retain their original URL; matching local tokens can still be recovered.`);
      } catch { warnings.push("Public tracking URL must be HTTPS without credentials, a query or a fragment."); }
    }
    if (!Object.keys(this.state.tracking.openIndex || {}).length) warnings.push("No local tracking tokens found. Keep each PC's original data/state.json; a PC ID alone cannot match cloud opens to emails.");
    if (config.mode === "manual") warnings.push("Manual mode: background sync is paused. Use Sync opens now or save Automatic mode.");
    const worker = this.state.tracking.worker.firebaseSync;
    return {
      ...config, configured: this.isConfigured(), disabled: !!this.credentialInfo.disabled,
      projectId: this.projectId || null, databaseURL: this.databaseURL,
      databaseUrlSource: this.env.FC_FIREBASE_DATABASE_URL || this.env.FIREBASE_DATABASE_URL ? "Environment" : "Built-in default; confirm this is your cloud endpoint's database",
      credentialsSource: this.credentialInfo.source, dataDirectory: this.dataDirectory,
      hostname: os.hostname(), platform: process.platform, workerId: this.state.workerId || null,
      openTrackingEnabled: this.env.FC_OPEN_TRACKING_ENABLED === "1", consent: this.env.FC_OPEN_TRACKING_CONSENT === "1",
      localRecords: Object.keys(this.state.tracking.records || {}).length, localTokens: Object.keys(this.state.tracking.openIndex || {}).length,
      collection: "email_opens", pollSeconds: 15, pageSize: this.pageSize, maxPages: this.maxPages,
      status: worker.status, message: worker.message, running: this.running,
      lastAttemptAt: this.lastAttemptAt, lastSyncAt: this.lastSyncAt, lastError: this.lastError,
      totalSynced: this.totalSynced, backends: this.backends, warnings,
    };
  }

  isConfigured() { return Boolean(this.rtdb || this.firestore); }

  async bounded(promise) {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Firebase request timed out after ${this.timeoutMs / 1000}s. Check internet access, credentials and database permissions.`)), this.timeoutMs); })]);
    } finally { clearTimeout(timer); }
  }

  applyItem(backend, key, data, stats) {
    stats.scanned++;
    if (!data || typeof data !== "object") { stats.invalid++; return null; }
    const config = this.configuration();
    const ownPc = String(data.pcId ?? "") === config.pcId;
    const validToken = typeof data.token === "string" && /^[\w-]{43}$/.test(data.token);
    const digest = validToken ? hash(data.token) : data.tokenHash;
    const record = typeof digest === "string" ? this.state.tracking.records?.[this.state.tracking.openIndex?.[digest]] : null;
    if (!record) {
      if (ownPc) stats.unmatched++; else stats.otherPc++;
      return null; // Never acknowledge another PC's event, or an event with no local email.
    }
    if (!/^[a-f0-9]{64}$/.test(digest) || (data.tokenHash && data.tokenHash !== digest)) { stats.invalid++; return null; }
    const rawAt = typeof data.openedAt?.toDate === "function" ? data.openedAt.toDate() : data.openedAt;
    const date = typeof rawAt === "string" || rawAt instanceof Date ? new Date(rawAt) : null;
    if (!date || !Number.isFinite(date.getTime())) { stats.invalid++; return null; }
    if (!record.attemptedAt || (record.sendStatus === "send_attempted" && !record.confirmedAt)) { stats.unmatched++; return null; }
    stats.matched++;
    if (data.pcId != null && !ownPc) stats.pcMismatches++;
    const at = date.toISOString();
    const receipt = `${backend}:${hash(key)}`;
    const fingerprint = hash(`${digest}:${at}`);
    this.state.tracking.firebaseReceipts ||= {};
    if (this.state.tracking.firebaseReceipts[receipt] !== fingerprint) {
      if (recordOpenHash(this.state.tracking, digest, true, at)) stats.synced++;
      else stats.alreadyApplied++;
      this.state.tracking.firebaseReceipts[receipt] = fingerprint;
    } else stats.alreadyApplied++;
    // Previously mis-acknowledged events are deliberately replayed against the original local token index.
    return data.synced === true ? null : key;
  }

  async scanBackend(backend) {
    const tracking = this.state.tracking;
    const context = hash(JSON.stringify([this.configuration(), this.projectId, this.databaseURL]));
    tracking.firebaseScan ||= {};
    if (tracking.firebaseScan.context !== context) tracking.firebaseScan = { context };
    const scan = tracking.firebaseScan[backend] ||= { cursor: null, totals: counters() };
    const stats = { ...counters(), complete: false, pages: 0, error: null };
    this.backends[backend] = stats;
    for (let page = 0; page < this.maxPages; page++) {
      let rows;
      if (backend === "rtdb") {
        let query = this.rtdb.ref("email_opens").orderByKey();
        if (scan.cursor) query = query.startAfter(scan.cursor);
        const snapshot = await this.bounded(query.limitToFirst(this.pageSize).once("value"));
        rows = [];
        snapshot.forEach((child) => { rows.push({ key: child.key, data: child.val() }); });
      } else {
        let query = this.firestore.collection("email_opens").orderBy(admin.firestore.FieldPath.documentId());
        if (scan.cursor) query = query.startAfter(scan.cursor);
        const snapshot = await this.bounded(query.limit(this.pageSize).get());
        rows = snapshot.docs.map((doc) => ({ key: doc.id, data: doc.data(), ref: doc.ref }));
      }
      const before = { ...stats };
      const acknowledgements = [];
      for (const row of rows) if (this.applyItem(backend, row.key, row.data, stats)) acknowledgements.push(row);
      // The local record and receipt must be durable BEFORE the cloud acknowledgement.
      // Persist even for deduplicated rows: a previous local write may have failed.
      if (stats.matched > before.matched) await this.persist();
      if (acknowledgements.length) {
        const values = { synced: true, syncedAt: new Date().toISOString(), syncedBy: this.configuration().pcId };
        if (backend === "rtdb") {
          const updates = {};
          for (const row of acknowledgements) for (const [name, value] of Object.entries(values)) updates[`email_opens/${row.key}/${name}`] = value;
          await this.bounded(this.rtdb.ref().update(updates));
        } else {
          const batch = this.firestore.batch();
          for (const row of acknowledgements) batch.update(row.ref, values);
          await this.bounded(batch.commit());
        }
        stats.acknowledged += acknowledgements.length;
      }
      stats.pages++;
      for (const key of Object.keys(counters())) scan.totals[key] += stats[key] - before[key];
      // Advance only after local persistence and cloud acknowledgement have succeeded.
      scan.cursor = rows.at(-1)?.key || scan.cursor;
      if (rows.length < this.pageSize) {
        stats.complete = true;
        stats.sweep = { ...scan.totals };
        scan.cursor = null;
        scan.totals = counters();
      }
      await this.persist();
      this.updateWorkerStatus("Syncing", `Scanning ${backend}: ${stats.scanned} cloud records checked; ${stats.synced} new open signals.`);
      if (stats.complete) break;
    }
    return stats;
  }

  async sync(options = {}) {
    if (!this.isConfigured()) return { ok: false, message: this.state.tracking.worker.firebaseSync.message, synced: 0 };
    if (this.running) return { ok: true, complete: false, message: "Sync already in progress. Watch the live status in Settings.", synced: 0 };
    if (this.configuration().mode === "manual" && !options.force) {
      this.updateWorkerStatus("Manual mode", "Background sync paused. Use Sync opens now.");
      return { ok: true, complete: false, message: "Manual sync mode active; background sync paused", synced: 0 };
    }
    this.running = true;
    this.lastAttemptAt = new Date().toISOString();
    this.backends = {};
    this.updateWorkerStatus("Syncing", "Checking Firebase open signals…");
    const errors = [];
    try {
      for (const backend of ["rtdb", "firestore"].filter((name) => this.configuration().backend === "both" || this.configuration().backend === name)) {
        try {
          if (!this[backend]) throw new Error(`${backend} is not initialized. Check Firebase setup and restart the app.`);
          await this.scanBackend(backend);
        } catch (error) {
          const message = `${backend}: ${safeError(error)}`;
          this.backends[backend] ||= { ...counters(), complete: false };
          this.backends[backend].complete = false;
          this.backends[backend].error = message;
          errors.push(message);
        }
      }
      const results = Object.values(this.backends);
      const synced = results.reduce((sum, stats) => sum + stats.synced, 0);
      const scanned = results.reduce((sum, stats) => sum + stats.scanned, 0);
      const unresolved = results.reduce((sum, stats) => sum + (stats.sweep || stats).unmatched + (stats.sweep || stats).invalid, 0);
      const mismatches = results.reduce((sum, stats) => sum + (stats.sweep || stats).pcMismatches, 0);
      let complete = results.length > 0 && results.every((stats) => stats.complete) && !errors.length;
      this.totalSynced += synced;
      this.lastError = errors.join("; ") || null;
      if (complete) this.lastSyncAt = new Date().toISOString();
      let message = [
        `${scanned} cloud records checked; ${synced} new open signal(s).`,
        errors.length ? `Sync failed or partially completed. ${errors.join("; ")}` : !complete ? "Backlog scan continues on the next sync. Keep the app open in Automatic mode or click Sync again." : "Cloud scan complete.",
        unresolved ? `${unresolved} event(s) could not be applied. Check PC ID, original local data and event format; these were not acknowledged.` : "",
        mismatches ? `${mismatches} matched event(s) carry a different PC ID. Check the tracking URL on all PCs.` : "",
      ].filter(Boolean).join(" ");
      this.updateWorkerStatus(errors.length || unresolved || mismatches ? "Needs attention" : complete ? "Active" : "Catching up", message);
      try { await this.persist(); }
      catch (error) {
        const persistenceError = `Could not save sync status: ${safeError(error)}`;
        errors.push(persistenceError);
        this.lastError = errors.join("; ");
        complete = false;
        message += ` ${persistenceError}`;
        this.updateWorkerStatus("Needs attention", message);
      }
      return { ok: !errors.length, complete, synced, scanned, unresolved, message, backends: this.backends };
    } finally { this.running = false; }
  }

  updateWorkerStatus(status, message) {
    this.state.tracking.worker.firebaseSync = { status, message, lastSyncAt: this.lastSyncAt, lastAttemptAt: this.lastAttemptAt, lastError: this.lastError, totalSynced: this.totalSynced, backends: this.backends };
  }
}
