import fs from "node:fs";
import path from "node:path";
import admin from "firebase-admin";
import { recordOpen, hash } from "./tracking.mjs";

function getCredentials(env = process.env) {
  // 1. Path to service account file
  const credPath = env.FC_FIREBASE_CREDENTIALS_PATH || env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    try {
      const resolved = path.resolve(credPath);
      if (fs.existsSync(resolved)) {
        const content = fs.readFileSync(resolved, "utf8");
        return JSON.parse(content);
      }
    } catch (err) {
      console.warn(`[FirebaseSync] Could not read credentials file at ${credPath}:`, err.message);
    }
  }

  // 2. Raw JSON or Base64 string
  const rawKey = env.FC_FIREBASE_SERVICE_ACCOUNT_KEY || env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (rawKey && typeof rawKey === "string") {
    try {
      const trimmed = rawKey.trim();
      const jsonStr = trimmed.startsWith("{") ? trimmed : Buffer.from(trimmed, "base64").toString("utf8");
      return JSON.parse(jsonStr);
    } catch (err) {
      console.warn("[FirebaseSync] Could not parse service account JSON string:", err.message);
    }
  }

  // 3. Individual variables
  const projectId = env.FC_FIREBASE_PROJECT_ID || env.FIREBASE_PROJECT_ID;
  const clientEmail = env.FC_FIREBASE_CLIENT_EMAIL || env.FIREBASE_CLIENT_EMAIL;
  const privateKey = env.FC_FIREBASE_PRIVATE_KEY || env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    return {
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

export class FirebaseSync {
  constructor({ state, persist }, env = process.env) {
    this.state = state;
    this.persist = persist;
    this.env = env;
    this.app = null;
    this.db = null;
    this.running = false;
    this.totalSynced = 0;
    this.lastSyncAt = null;
    this.lastError = null;
    this.init();
  }

  init() {
    this.state.tracking ||= {};
    this.state.tracking.worker ||= {};

    const creds = getCredentials(this.env);
    if (!creds) {
      this.state.tracking.worker.firebaseSync = {
        status: "Needs configuration",
        message: "Firebase credentials not found (set FC_FIREBASE_SERVICE_ACCOUNT_KEY or FC_FIREBASE_CREDENTIALS_PATH)",
      };
      return;
    }

    try {
      const appName = "fcLogisticsFirebaseSync";
      const existing = admin.apps.find((a) => a?.name === appName);
      this.app = existing || admin.initializeApp({ credential: admin.credential.cert(creds) }, appName);
      this.db = this.app.firestore();
      this.state.tracking.worker.firebaseSync = {
        status: "Active",
        message: "Connected to Firebase Firestore",
        lastSyncAt: null,
      };
    } catch (err) {
      this.lastError = err.message;
      this.state.tracking.worker.firebaseSync = {
        status: "Needs attention",
        message: `Firebase init error: ${err.message}`,
      };
    }
  }

  isConfigured() {
    return Boolean(this.db);
  }

  async sync() {
    if (!this.db) {
      return { ok: false, message: "Firebase not configured", synced: 0 };
    }
    if (this.running) {
      return { ok: true, message: "Sync already in progress", synced: 0 };
    }

    this.running = true;
    let syncedThisRun = 0;

    try {
      const pcId = String(this.env.FC_TRACKING_PC_ID || "1");
      const openIndex = this.state.tracking.openIndex || {};

      // Query unsynced opens, up to 100 at a time
      const snapshot = await this.db
        .collection("email_opens")
        .where("synced", "==", false)
        .limit(100)
        .get();

      if (snapshot.empty) {
        this.lastSyncAt = new Date().toISOString();
        this.updateWorkerStatus("Up to date", "All open signals synced");
        return { ok: true, synced: 0 };
      }

      const batch = this.db.batch();
      let hasBatchWrites = false;

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const docPcId = String(data.pcId || "1");
        const token = data.token;
        const openedAt = data.openedAt || new Date().toISOString();
        const tokenHash = data.tokenHash || (token ? hash(token) : null);

        // Correlate: Does this token belong to our sent messages or this PC?
        const isOurMessage = tokenHash && Boolean(openIndex[tokenHash]);
        const isOurPc = docPcId === pcId;

        if (isOurMessage || isOurPc) {
          if (token && typeof token === "string") {
            const recorded = recordOpen(
              this.state.tracking,
              token,
              true,
              openedAt
            );
            if (recorded) {
              syncedThisRun++;
            }
          }

          // Mark document synced in Firestore
          batch.update(doc.ref, {
            synced: true,
            syncedAt: new Date().toISOString(),
            syncedBy: pcId,
          });
          hasBatchWrites = true;
        }
      }

      if (hasBatchWrites) {
        await batch.commit();
      }

      if (syncedThisRun > 0) {
        this.totalSynced += syncedThisRun;
        await this.persist();
      }

      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
      this.updateWorkerStatus(
        "Active",
        `Synced ${syncedThisRun} open(s) at ${this.lastSyncAt.slice(11, 19)} UTC (Total: ${this.totalSynced})`
      );

      return { ok: true, synced: syncedThisRun };
    } catch (err) {
      this.lastError = err.message;
      this.updateWorkerStatus("Needs attention", `Sync error: ${err.message}`);
      return { ok: false, error: err.message, synced: syncedThisRun };
    } finally {
      this.running = false;
    }
  }

  updateWorkerStatus(status, message) {
    this.state.tracking ||= {};
    this.state.tracking.worker ||= {};
    this.state.tracking.worker.firebaseSync = {
      status,
      message,
      lastSyncAt: this.lastSyncAt,
      totalSynced: this.totalSynced,
    };
  }
}
