import fs from "node:fs";
import path from "node:path";
import admin from "firebase-admin";
import { recordOpen, hash } from "./tracking.mjs";

const DEFAULT_DATABASE_URL = "https://ea-fclogistics-default-rtdb.asia-southeast1.firebasedatabase.app";

function getCredentials(env = process.env) {
  if (env.FC_FIREBASE_DISABLE === "1") return null;

  // 1. Candidate paths to service account file (explicit or auto-detected in data/)
  const candidatePaths = [
    env.FC_FIREBASE_CREDENTIALS_PATH,
    env.GOOGLE_APPLICATION_CREDENTIALS,
    path.join(process.cwd(), "data", "firebase-service-account.json"),
    path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname)), "data", "firebase-service-account.json"),
    "./data/firebase-service-account.json",
  ].filter(Boolean);

  for (const credPath of candidatePaths) {
    try {
      const resolved = path.resolve(credPath);
      if (fs.existsSync(resolved)) {
        const content = fs.readFileSync(resolved, "utf8");
        return JSON.parse(content);
      }
    } catch {}
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
  constructor(options = {}, secondaryEnv = process.env) {
    this.state = options.state || {};
    this.persist = options.persist || (async () => {});
    this.env = options.env || secondaryEnv || process.env;
    this.app = null;
    this.rtdb = null;
    this.firestore = null;
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
        message: "Firebase credentials not found (auto-checks data/firebase-service-account.json)",
      };
      return;
    }

    try {
      const appName = "fcLogisticsFirebaseSync";
      const existing = admin.apps.find((a) => a?.name === appName);
      const databaseURL =
        this.env.FC_FIREBASE_DATABASE_URL ||
        this.env.FIREBASE_DATABASE_URL ||
        DEFAULT_DATABASE_URL;

      this.app =
        existing ||
        admin.initializeApp(
          {
            credential: admin.credential.cert(creds),
            databaseURL,
          },
          appName
        );

      // Initialize Realtime Database (default active DB)
      try {
        this.rtdb = this.app.database();
      } catch (e) {
        console.warn("[FirebaseSync] Realtime Database init warning:", e.message);
      }

      // Initialize Firestore if available
      try {
        this.firestore = this.app.firestore();
      } catch {}

      this.state.tracking.worker.firebaseSync = {
        status: "Active",
        message: "Connected to Firebase (Realtime Database & Firestore)",
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
    return Boolean(this.rtdb || this.firestore);
  }

  async sync(options = {}) {
    if (!this.isConfigured()) {
      return { ok: false, message: "Firebase not configured", synced: 0 };
    }
    const isManualMode = this.state.settings?.tracking?.syncMode === "manual";
    if (isManualMode && !options.force) {
      this.updateWorkerStatus(
        "Manual mode",
        "Automatic background sync paused. Click 'Sync Firebase' to fetch."
      );
      return { ok: true, message: "Manual sync mode active; background sync paused", synced: 0 };
    }
    if (this.running) {
      return { ok: true, message: "Sync already in progress", synced: 0 };
    }

    this.running = true;
    let syncedThisRun = 0;

    try {
      const pcId = String(this.env.FC_TRACKING_PC_ID || "1");
      const openIndex = this.state.tracking.openIndex || {};

      // 1. Sync from Realtime Database (Primary)
      if (this.rtdb) {
        try {
          const snapshot = await this.rtdb
            .ref("email_opens")
            .limitToLast(100)
            .once("value");

          const allOpens = snapshot.val() || {};
          const updates = {};

          for (const [key, item] of Object.entries(allOpens)) {
            if (!item || item.synced) continue;

            const docPcId = String(item.pcId || "1");
            const token = item.token;
            const openedAt = item.openedAt || new Date().toISOString();
            const tokenHash = item.tokenHash || (token ? hash(token) : null);

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
                if (recorded) syncedThisRun++;
              }

              updates[`email_opens/${key}/synced`] = true;
              updates[`email_opens/${key}/syncedAt`] = new Date().toISOString();
              updates[`email_opens/${key}/syncedBy`] = pcId;
            }
          }

          if (Object.keys(updates).length > 0) {
            await this.rtdb.ref().update(updates);
          }
        } catch (rtdbErr) {
          console.warn("[FirebaseSync] RTDB sync warning:", rtdbErr.message);
        }
      }

      // 2. Sync from Firestore (if Firestore database exists and has docs)
      if (this.firestore) {
        try {
          const snapshot = await this.firestore
            .collection("email_opens")
            .where("synced", "==", false)
            .limit(100)
            .get();

          if (!snapshot.empty) {
            const batch = this.firestore.batch();
            let hasBatchWrites = false;

            for (const doc of snapshot.docs) {
              const data = doc.data();
              const docPcId = String(data.pcId || "1");
              const token = data.token;
              const openedAt = data.openedAt || new Date().toISOString();
              const tokenHash = data.tokenHash || (token ? hash(token) : null);

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
                  if (recorded) syncedThisRun++;
                }

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
          }
        } catch {
          // Firestore database not created or unavailable; ignore gracefully
        }
      }

      if (syncedThisRun > 0) {
        this.totalSynced += syncedThisRun;
        await this.persist();
      }

      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
      this.updateWorkerStatus(
        "Active",
        syncedThisRun > 0
          ? `Synced ${syncedThisRun} open(s) at ${this.lastSyncAt.slice(11, 19)} UTC (Total: ${this.totalSynced})`
          : `Up to date (Checked ${this.lastSyncAt.slice(11, 19)} UTC, Total: ${this.totalSynced})`
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
