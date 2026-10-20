import test from "node:test";
import assert from "node:assert/strict";
import { FirebaseSync } from "../src/firebase-sync.mjs";
import { initTracking, createRecord, hash } from "../src/tracking.mjs";

test("FirebaseSync handles unconfigured environment gracefully", async () => {
  const state = { tracking: {} };
  initTracking(state);
  const persist = async () => {};

  const sync = new FirebaseSync({ state, persist }, { FC_FIREBASE_DISABLE: "1" });
  assert.equal(sync.isConfigured(), false);
  assert.equal(state.tracking.worker.firebaseSync.status, "Needs configuration");

  const result = await sync.sync();
  assert.equal(result.ok, false);
  assert.equal(result.synced, 0);
});

test("FirebaseSync syncs open signals from Realtime Database", async () => {
  const state = { tracking: {} };
  initTracking(state);
  let persisted = false;
  const persist = async () => { persisted = true; };

  const { record, pixelUrl } = createRecord(
    state.tracking,
    { to: "rtdb-lead@example.com", subject: "RTDB Subject" },
    { sender: "sender@example.com" },
    { openEnabled: true, consent: true, publicUrl: "https://www.fclogistics.us/t/1" }
  );
  record.attemptedAt = new Date().toISOString();
  record.confirmedAt = new Date().toISOString();
  record.sendStatus = "webmail_sent";

  const token = pixelUrl.split("/o/")[1].replace(".gif", "");
  const tokenHash = hash(token);

  let updatedUpdates = null;
  const mockRtdb = {
    ref: (path = "") => ({
      limitToLast: () => ({
        once: async () => ({
          val: () => ({
            [`1_${token}_bucket`]: {
              pcId: "1",
              token,
              tokenHash,
              openedAt: "2026-10-20T22:35:00.000Z",
              synced: false,
            },
          }),
        }),
      }),
      update: async (data) => {
        updatedUpdates = data;
      },
    }),
  };

  const sync = new FirebaseSync({ state, persist }, { FC_FIREBASE_DISABLE: "1", FC_TRACKING_PC_ID: "1" });
  sync.rtdb = mockRtdb;
  sync.firestore = null;

  const result = await sync.sync();
  assert.equal(result.ok, true);
  assert.equal(result.synced, 1);
  assert.equal(persisted, true);
  assert.equal(record.opens.length, 1);
  assert.equal(record.firstOpenAt, "2026-10-20T22:35:00.000Z");
  assert.equal(updatedUpdates[`email_opens/1_${token}_bucket/synced`], true);
});

test("FirebaseSync syncs open signals from Cloud Firestore", async () => {
  const state = { tracking: {} };
  initTracking(state);
  let persisted = false;
  const persist = async () => { persisted = true; };

  const { record, pixelUrl } = createRecord(
    state.tracking,
    { to: "lead@example.com", subject: "Test Subject" },
    { sender: "sender@example.com" },
    {
      openEnabled: true,
      consent: true,
      publicUrl: "https://www.fclogistics.us/t/1",
    }
  );
  record.attemptedAt = new Date().toISOString();
  record.confirmedAt = new Date().toISOString();
  record.sendStatus = "webmail_sent";

  const token = pixelUrl.split("/o/")[1].replace(".gif", "");
  const tokenHash = hash(token);

  const mockDocs = [
    {
      id: `1_${token}_2026-10-20T22`,
      ref: { id: "doc1" },
      data: () => ({
        pcId: "1",
        token,
        tokenHash,
        openedAt: "2026-10-20T22:30:00.000Z",
        synced: false,
      }),
    },
  ];

  const committedBatches = [];
  const mockDb = {
    collection: (name) => {
      assert.equal(name, "email_opens");
      return {
        where: () => ({
          limit: () => ({
            get: async () => ({
              empty: false,
              docs: mockDocs,
            }),
          }),
        }),
      };
    },
    batch: () => {
      const updates = [];
      return {
        update: (ref, data) => updates.push({ ref, data }),
        commit: async () => committedBatches.push(updates),
      };
    },
  };

  const sync = new FirebaseSync({ state, persist }, { FC_FIREBASE_DISABLE: "1", FC_TRACKING_PC_ID: "1" });
  sync.rtdb = null;
  sync.firestore = mockDb;

  const result = await sync.sync();
  assert.equal(result.ok, true);
  assert.equal(result.synced, 1);
  assert.equal(persisted, true);

  assert.equal(record.opens.length, 1);
  assert.equal(record.firstOpenAt, "2026-10-20T22:30:00.000Z");
  assert.equal(committedBatches.length, 1);
  assert.equal(committedBatches[0][0].data.synced, true);
  assert.equal(state.tracking.worker.firebaseSync.status, "Active");
});

test("FirebaseSync respects settings.tracking.syncMode = 'manual'", async () => {
  const state = {
    tracking: {},
    settings: {
      tracking: { syncMode: "manual" },
    },
  };
  initTracking(state);
  const persist = async () => {};

  const sync = new FirebaseSync({ state, persist }, { FC_FIREBASE_DISABLE: "1" });
  sync.rtdb = { ref: () => ({ limitToLast: () => ({ once: async () => ({ val: () => ({}) }) }) }) };

  // 1. Background sync (without force: true) should pause
  const bgResult = await sync.sync();
  assert.equal(bgResult.ok, true);
  assert.equal(bgResult.synced, 0);
  assert.match(bgResult.message, /Manual sync mode active/);
  assert.equal(state.tracking.worker.firebaseSync.status, "Manual mode");

  // 2. Manual button click (with force: true) should proceed
  const manualResult = await sync.sync({ force: true });
  assert.equal(manualResult.ok, true);
  assert.equal(state.tracking.worker.firebaseSync.status, "Active");
});
