import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FirebaseSync } from "../src/firebase-sync.mjs";
import { initTracking, createRecord, hash } from "../src/tracking.mjs";
import { upgrade, validateSettings } from "../src/config.mjs";

function fixture(options = {}) {
  const state = upgrade({});
  initTracking(state);
  state.settings.tracking = { ...state.settings.tracking, pcId: "1", firebaseBackend: options.backend || "rtdb" };
  const sync = new FirebaseSync({ state, env: { FC_FIREBASE_DISABLE: "1" }, ...options });
  const message = () => {
    const { record, pixelUrl } = createRecord(state.tracking, { to: "synthetic@example.com", subject: "Synthetic open" }, { sender: "sender@example.com" }, { openEnabled: true, consent: true, publicUrl: "https://track.example.com/t/1" });
    record.attemptedAt = "2026-10-20T01:00:00.000Z";
    record.confirmedAt = record.attemptedAt;
    record.sendStatus = "webmail_sent";
    const token = /\/o\/(.+)\.gif/.exec(pixelUrl)[1];
    return { record, row: { pcId: "1", token, tokenHash: hash(token), openedAt: "2026-10-20T22:35:00.000Z", synced: false } };
  };
  return { state, sync, message };
}

// Query doubles actually sort, limit and advance, so pagination regressions cannot pass on a single canned page.
function rtdb(rows, hooks = {}) {
  const writes = [], queries = [];
  return { writes, queries, ref(location = "") {
    let cursor = null, limit;
    const query = {
      orderByKey() { return query; },
      startAfter(value) { cursor = value; return query; },
      limitToFirst(value) { limit = value; return query; },
      async once() {
        if (hooks.read) await hooks.read();
        const keys = Object.keys(rows).sort().filter((key) => !cursor || key > cursor).slice(0, limit);
        queries.push(keys);
        return { forEach(fn) { for (const key of keys) fn({ key, val: () => rows[key] }); } };
      },
      async update(updates) {
        assert.equal(location, "");
        if (hooks.write) await hooks.write(updates);
        writes.push(updates);
        for (const [key, row] of Object.entries(rows)) if (updates[`email_opens/${key}/synced`]) row.synced = true;
      },
    };
    return query;
  } };
}
function firestore(rows, hooks = {}) {
  const writes = [], queries = [];
  return { writes, queries, collection(name) {
    assert.equal(name, "email_opens");
    let cursor = null, limit;
    const query = {
      orderBy() { return query; }, startAfter(value) { cursor = value; return query; }, limit(value) { limit = value; return query; },
      async get() {
        if (hooks.read) await hooks.read();
        const keys = Object.keys(rows).sort().filter((key) => !cursor || key > cursor).slice(0, limit);
        queries.push(keys);
        return { docs: keys.map((key) => ({ id: key, ref: { id: key }, data: () => rows[key] })) };
      },
    };
    return query;
  }, batch() {
    const updates = [];
    return { update(ref, data) { updates.push({ ref, data }); }, async commit() {
      if (hooks.write) await hooks.write();
      writes.push(updates);
      for (const update of updates) Object.assign(rows[update.ref.id], update.data);
    } };
  } };
}

test("missing or disabled credentials never report up to date", async () => {
  const { sync, state } = fixture();
  assert.equal(sync.isConfigured(), false);
  assert.equal(state.tracking.worker.firebaseSync.status, "Disabled");
  const result = await sync.sync();
  assert.equal(result.ok, false);
  assert.equal(result.synced, 0);
  assert.match(result.message, /Disabled/);
});

for (const backend of ["rtdb", "firestore"]) {
  test(`${backend}: scans past 100 unrelated or acknowledged events and recovers previously acknowledged local events`, async () => {
    let persisted = 0;
    const { sync, message, state } = fixture({ backend, pageSize: 50, persist: async () => { persisted++; } });
    const { record, row } = message();
    const rows = Object.fromEntries(Array.from({ length: 215 }, (_, i) => [`a${String(i).padStart(3,"0")}`, { pcId: "3", synced: i % 2 === 0 }]));
    rows.z1 = row;
    const second = message();
    rows.z2 = { ...second.row, synced: true, syncedBy: "3" };
    sync[backend] = backend === "rtdb" ? rtdb(rows) : firestore(rows);
    const result = await sync.sync();
    assert.equal(result.ok, true);
    assert.equal(result.complete, true);
    assert.equal(result.scanned, 217);
    assert.equal(result.synced, 2);
    assert.equal(record.opens.length, 1);
    assert.equal(second.record.opens.length, 1);
    assert.equal(sync[backend].writes.length, 1);
    assert(persisted >= 2);
    assert.equal(rows.z1.synced, true);
    assert.equal(result.backends[backend].otherPc, 215);
    assert.equal(state.tracking.worker.firebaseSync.status, "Active");
    const again = await sync.sync();
    assert.equal(again.synced, 0);
    assert.equal(record.opens.length, 1);
  });

  test(`${backend}: bounded scans resume across runs and restarts without starvation`, async () => {
    const { sync, message, state } = fixture({ backend, pageSize: 2, maxPages: 1 });
    const { record, row } = message();
    const rows = { a: { pcId: "3" }, b: { pcId: "3" }, c: row };
    const db = backend === "rtdb" ? rtdb(rows) : firestore(rows);
    sync[backend] = db;
    const first = await sync.sync();
    assert.equal(first.complete, false);
    assert.match(first.message, /continues/);
    assert.equal(state.tracking.firebaseScan[backend].cursor, "b");
    const restarted = new FirebaseSync({ state: structuredClone(state), env: { FC_FIREBASE_DISABLE: "1" }, pageSize: 2, maxPages: 1 });
    restarted[backend] = db;
    const second = await restarted.sync();
    assert.equal(second.complete, true);
    assert.equal(second.synced, 1);
    assert.equal(restarted.state.tracking.records[record.id].opens.length, 1);
    assert.equal(restarted.state.tracking.firebaseScan[backend].cursor, null);
    // New IDs may sort before the previous cursor: the next sweep must revisit the beginning.
    const newMessage = message();
    restarted.state.tracking.records[newMessage.record.id] = newMessage.record;
    restarted.state.tracking.openIndex[newMessage.row.tokenHash] = newMessage.record.id;
    rows.aa = newMessage.row;
    const third = await restarted.sync();
    assert.equal(third.synced, 1);
  });

  test(`${backend}: local persistence precedes acknowledgement; failed writes remain retryable`, async () => {
    let durable = false, failSave = true, failAck = true;
    const { sync, message } = fixture({ backend, persist: async () => { if (failSave) throw new Error("disk full"); durable = true; } });
    const { row, record } = message();
    const rows = { a: row };
    const hooks = { write: async () => { assert(durable); if (failAck) throw new Error("permission denied"); } };
    const db = backend === "rtdb" ? rtdb(rows, hooks) : firestore(rows, hooks);
    sync[backend] = db;
    const failedSave = await sync.sync();
    assert.equal(failedSave.ok, false);
    assert.match(failedSave.message, /disk full/);
    assert.equal(db.writes.length, 0);
    assert.equal(row.synced, false);
    failSave = false;
    const failedAck = await sync.sync();
    assert.equal(failedAck.ok, false);
    assert.match(failedAck.message, /permission denied/);
    assert.equal(row.synced, false);
    failAck = false;
    assert.equal((await sync.sync()).ok, true);
    assert.equal(row.synced, true);
    assert.equal(record.opens.length, 1);
  });
}

test("PC ID alone never acknowledges unmatched, malformed, or unattempted local opens", async () => {
  const { sync, message } = fixture();
  const known = message();
  const unsent = message(); delete unsent.record.attemptedAt;
  const rows = {
    unknown: { ...known.row, token: "a".repeat(43), tokenHash: hash("a".repeat(43)) },
    malformed: { ...known.row, openedAt: "not-a-date" },
    inconsistentHash: { ...known.row, tokenHash: "f".repeat(64) },
    unsent: unsent.row,
    otherPc: { pcId: "3" },
  };
  sync.rtdb = rtdb(rows);
  const result = await sync.sync();
  assert.equal(result.ok, true);
  assert.equal(result.synced, 0);
  assert.equal(result.unresolved, 4);
  assert.equal(sync.rtdb.writes.length, 0);
  assert.equal(sync.state.tracking.worker.firebaseSync.status, "Needs attention");
  assert.match(result.message, /could not be applied/);
});

test("matching tokens recover wrong-PC and hash-only payloads, without exposing secrets", async () => {
  const { sync, message, state } = fixture();
  const { row, record } = message();
  const rows = { a: { ...row, pcId: "3" } };
  delete rows.a.token;
  sync.rtdb = rtdb(rows);
  const result = await sync.sync();
  assert.equal(result.synced, 1);
  assert.equal(record.opens.length, 1);
  assert.equal(result.backends.rtdb.pcMismatches, 1);
  assert.match(result.message, /different PC ID/);
  assert.equal(state.tracking.worker.firebaseSync.status, "Needs attention");
  const publicInfo = JSON.stringify(sync.diagnostics());
  assert(!publicInfo.includes(row.token));
  assert(!publicInfo.includes(row.tokenHash));
});

test("cloud errors and partial backend success never report up to date", async () => {
  const { sync, message, state } = fixture({ backend: "both" });
  sync.rtdb = rtdb({ a: message().row });
  sync.firestore = firestore({}, { read: () => { throw new Error("Firestore permission denied"); } });
  const result = await sync.sync();
  assert.equal(result.ok, false);
  assert.equal(result.complete, false);
  assert.equal(result.synced, 1);
  assert.match(result.message, /permission denied/);
  assert.equal(state.tracking.worker.firebaseSync.status, "Needs attention");
  assert.equal(sync.lastSyncAt, null);
});

test("timeouts, overlapping requests, and manual background polling give truthful status", async () => {
  const { sync, state } = fixture({ timeoutMs: 15 });
  state.settings.tracking.syncMode = "manual";
  sync.rtdb = rtdb({}, { read: () => new Promise(() => {}) });
  assert.match((await sync.sync()).message, /Manual sync mode/);
  const first = sync.sync({ force: true });
  assert.equal(sync.running, true);
  assert.match((await sync.sync({ force: true })).message, /already in progress/);
  const result = await first;
  assert.equal(result.ok, false);
  assert.match(result.message, /timed out/);
  assert.equal(sync.running, false);
});

test("receipts prevent replay of more hourly buckets than the bounded local timeline retains", async () => {
  const { sync, message } = fixture();
  const { row, record } = message();
  const rows = Object.fromEntries(Array.from({length: 120}, (_, i) => [String(i).padStart(3,"0"), { ...row, openedAt: new Date(Date.UTC(2026, 9, 1, i)).toISOString() }]));
  sync.rtdb = rtdb(rows);
  assert.equal((await sync.sync()).synced, 120);
  assert.equal(record.opens.length, 96);
  assert.equal((await sync.sync()).synced, 0);
  assert.equal(record.opens.length, 96);
});

test("configuration warns about missing PC ID, routing mismatches, disabled telemetry, manual mode, and empty local data", () => {
  const { sync, state } = fixture();
  state.settings.tracking = { syncMode: "manual", pcId: "2", publicUrl: "https://track.example.com/t/3" };
  const d = sync.diagnostics();
  assert.equal(d.pcId, "2");
  assert.equal(d.pcIdSource, "Settings");
  assert(d.warnings.some((v) => /routes to PC 3/.test(v)));
  assert(d.warnings.some((v) => /New emails will not include/.test(v)));
  assert(d.warnings.some((v) => /No local tracking tokens/.test(v)));
  assert(d.warnings.some((v) => /Manual mode/.test(v)));
  state.settings.tracking.pcId = "";
  assert(sync.diagnostics().warnings.some((v) => /PC ID is not set/.test(v)));
});

test("credential discovery uses the app data directory, honors explicit path errors, and hides malformed JSON", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fc-firebase-credentials-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(path.join(dir, "firebase-service-account.json"), "SECRET_INVALID_JSON");
  const sync = new FirebaseSync({ state: {}, dataDirectory: dir, env: {} });
  assert.equal(sync.isConfigured(), false);
  assert.equal(sync.diagnostics().credentialsSource, path.join(dir, "firebase-service-account.json"));
  assert(!JSON.stringify(sync.diagnostics()).includes("SECRET_INVALID_JSON"));
  const explicit = new FirebaseSync({ state: {}, dataDirectory: dir, env: { FC_FIREBASE_CREDENTIALS_PATH: path.join(dir, "missing.json") } });
  assert.match(explicit.diagnostics().message, /Cannot read or parse/);
});

test("settings validate PC ID, tracking URL and selected Firebase backend while upgrading old installations", () => {
  const state = upgrade({ settings: { tracking: { syncMode: "manual" } } });
  assert.equal(state.settings.tracking.firebaseBackend, "both");
  const settings = state.settings;
  settings.tracking.pcId = "pc/2";
  assert.throws(() => validateSettings(settings), /PC ID/);
  settings.tracking.pcId = "4";
  settings.tracking.publicUrl = "http://track.example.com/t/4";
  assert.throws(() => validateSettings(settings), /HTTPS/);
  settings.tracking.publicUrl = "https://track.example.com/t/4";
  settings.tracking.firebaseBackend = "unknown";
  assert.throws(() => validateSettings(settings), /Realtime Database/);
  settings.tracking.firebaseBackend = "rtdb";
  const validated = validateSettings(settings);
  assert.equal(validated.tracking.pcId, "4");
});
