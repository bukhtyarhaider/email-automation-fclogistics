import fs from 'node:fs/promises';
import path from 'node:path';

// One writer for normal saves and campaign publication. Read the latest state when
// a queued write begins; an older queued snapshot must not undo a publication.
export class StateFile {
  constructor({ state, file, write = null }) {
    Object.assign(this, { state, file });
    this.tail = Promise.resolve();
    this.write = write || ((content, committed) => this.atomicWrite(content, committed));
  }
  async atomicWrite(content, committed) {
    const tmp = this.file + '.tmp';
    const file = await fs.open(tmp, 'w', 0o600);
    try { await file.writeFile(content); await file.sync(); }
    finally { await file.close(); }
    await fs.rename(tmp, this.file);
    committed(); // Keep memory aligned even if the later directory flush fails.
    if (process.platform !== 'win32') {
      const directory = await fs.open(path.dirname(this.file), 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    }
  }
  save(change = null) {
    const run = async () => {
      const snapshot = change ? { ...this.state,
        campaigns: this.state.campaigns.map((c) => c === change.campaign ? change.next : c),
        workbook: this.state.activeCampaign === change.campaign.id ? change.next.workbook : this.state.workbook,
      } : this.state;
      const committed = () => {
        if (!change) return;
        Object.keys(change.campaign).forEach((key) => delete change.campaign[key]);
        Object.assign(change.campaign, change.next);
        if (this.state.activeCampaign === change.campaign.id) this.state.workbook = change.campaign.workbook;
      };
      await this.write(JSON.stringify(snapshot, null, 2), committed);
    };
    const task = this.tail.then(run, run); this.tail = task.catch(() => {}); return task;
  }
}
