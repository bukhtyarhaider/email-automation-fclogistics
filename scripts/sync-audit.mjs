// Read-only cloud inspection: never calls sync(), writes state, or acknowledges events.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FirebaseSync } from "../src/firebase-sync.mjs";
import { hash } from "../src/tracking.mjs";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDirectory = path.resolve(process.env.FC_DATA_DIR || path.join(root, "data"));
const state = JSON.parse(fs.readFileSync(path.join(dataDirectory, "state.json"), "utf8"));
const sync = new FirebaseSync({ state, dataDirectory });
const byPc = {}, last100 = [];
const preview = new FirebaseSync({ state: structuredClone(state), env: { FC_FIREBASE_DISABLE: "1", FC_TRACKING_PC_ID: sync.configuration().pcId } });
const recoveryPreview = { scanned: 0, matched: 0, synced: 0, alreadyApplied: 0, otherPc: 0, unmatched: 0, invalid: 0, pcMismatches: 0, acknowledged: 0 };
const shapes = {};
let total = 0, cursor = null;
try {
  if (!sync.rtdb) throw new Error(sync.diagnostics().message);
  for (let page = 0; page < 100; page++) {
    let query = sync.rtdb.ref("email_opens").orderByKey();
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await sync.bounded(query.limitToFirst(500).once("value"));
    let size = 0;
    snapshot.forEach((child) => {
      size++; total++; cursor = child.key;
      const row = child.val();
      preview.applyItem("rtdb", child.key, row, recoveryPreview);
      last100.push({ pcId: String(row?.pcId ?? "(missing)"), pending: !row?.synced });
      if (last100.length > 100) last100.shift();
      const shape = `token:${typeof row?.token}, hash:${typeof row?.tokenHash}, time:${typeof row?.openedAt}`;
      shapes[shape] = (shapes[shape] || 0) + 1;
      const pc = String(row?.pcId ?? "(missing)");
      const count = byPc[pc] ||= { total: 0, pending: 0, matchingLocalToken: 0, acknowledgedWithoutLocalOpen: 0 };
      count.total++;
      if (!row?.synced) count.pending++;
      const digest = typeof row?.token === "string" ? hash(row.token) : row?.tokenHash;
      const record = state.tracking?.records?.[state.tracking?.openIndex?.[digest]];
      if (record) {
        count.matchingLocalToken++;
        if (row.synced && !record.opens?.length) count.acknowledgedWithoutLocalOpen++;
      }
    });
    if (size < 500) { cursor = null; break; }
  }
  const oldLast100ByPc = {};
  for (const row of last100) {
    const count = oldLast100ByPc[row.pcId] ||= { total: 0, pending: 0 };
    count.total++;
    if (row.pending) count.pending++;
  }
  let firestore;
  try {
    const snapshot = await sync.bounded(sync.firestore.collection("email_opens").limit(1).get());
    firestore = { accessible: true, hasEvents: !snapshot.empty };
  } catch { firestore = { accessible: false, message: "Firestore read failed. Select RTDB only if the cloud endpoint uses Realtime Database." }; }
  console.log(JSON.stringify({ readOnly: true, complete: !cursor, total, byPc, oldLast100ByPc, payloadShapes: shapes, localRecoveryPreview: recoveryPreview, firestore }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ readOnly: true, complete: false, error: error.message }));
  process.exitCode = 1;
} finally { await sync.app?.delete(); }
