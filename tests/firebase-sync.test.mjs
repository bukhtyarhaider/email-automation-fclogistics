import test from "node:test";
import assert from "node:assert/strict";
import { FirebaseSync } from "../src/firebase-sync.mjs";
import { initTracking, createRecord, hash } from "../src/tracking.mjs";

test("FirebaseSync handles unconfigured environment gracefully", async () => {
  const state = { tracking: {} };
  initTracking(state);
  const persist = async () => {};

  const sync = new FirebaseSync({ state, persist }, {});
  assert.equal(sync.isConfigured(), false);
  assert.equal(state.tracking.worker.firebaseSync.status, "Needs configuration");

  const result = await sync.sync();
  assert.equal(result.ok, false);
  assert.equal(result.synced, 0);
});

test("FirebaseSync syncs open signals and marks Firestore documents as synced", async () => {
  const state = { tracking: {} };
  initTracking(state);
  let persisted = false;
  const persist = async () => { persisted = true; };

  // Create a record with a known open token
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

  // Mock Firestore data
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
    {
      id: "2_unrelatedToken_2026-10-20T22",
      ref: { id: "doc2" },
      data: () => ({
        pcId: "2",
        token: "abcdefghijklmnopqrstuvwxyz0123456789-_ABCDE",
        tokenHash: "unrelatedHash",
        openedAt: "2026-10-20T22:31:00.000Z",
        synced: false,
      }),
    },
  ];

  const committedBatches = [];
  const mockDb = {
    collection: (name) => {
      assert.equal(name, "email_opens");
      return {
        where: (field, op, val) => {
          assert.equal(field, "synced");
          assert.equal(val, false);
          return {
            limit: (n) => ({
              get: async () => ({
                empty: false,
                docs: mockDocs,
              }),
            }),
          };
        },
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

  const sync = new FirebaseSync({ state, persist }, { FC_TRACKING_PC_ID: "1" });
  sync.db = mockDb; // Inject mock db

  const result = await sync.sync();
  assert.equal(result.ok, true);
  assert.equal(result.synced, 1);
  assert.equal(persisted, true);

  // Verify open was recorded in tracking state
  assert.equal(record.opens.length, 1);
  assert.equal(record.firstOpenAt, "2026-10-20T22:30:00.000Z");
  assert.equal(record.events.some((e) => e.type === "open_detected"), true);

  // Verify doc was marked synced in Firestore batch
  assert.equal(committedBatches.length, 1);
  assert.equal(committedBatches[0][0].ref.id, "doc1");
  assert.equal(committedBatches[0][0].data.synced, true);
  assert.equal(committedBatches[0][0].data.syncedBy, "1");

  // Verify tracking worker status
  assert.equal(state.tracking.worker.firebaseSync.status, "Active");
  assert.equal(state.tracking.worker.firebaseSync.totalSynced, 1);
});
