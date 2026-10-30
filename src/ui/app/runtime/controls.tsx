import { renderRegion } from '../../shared/regions';
import { session } from '../../shared/session';
import { $ } from '../../shared/runtime';
export function updateControls() {
  if (!session.state) return;
  const prep = $('prepare');
  if (prep)
    prep.disabled = Boolean(
      session.pending ||
      session.state.busy ||
      !session.state.connected ||
      !session.previewId ||
      !session.state.templates[$('template').value] ||
      !!session.state.prepared ||
      session.state.job.enabled ||
      session.rows.find((x) => x.id === session.previewId)?.blocked,
    );
  const sendOneBtn = $('sendOne');
  if (sendOneBtn)
    sendOneBtn.disabled =
      session.pending ||
      session.state.busy ||
      !session.state.prepared ||
      !session.state.connected ||
      !!session.state.attempts[session.state.prepared?.message.to];
  const rel = $('release');
  if (rel) rel.disabled = session.pending || session.state.busy || !session.state.connected;
  const batchBtn = $('batch');
  if (batchBtn)
    batchBtn.disabled =
      session.pending ||
      session.state.busy ||
      !session.state.connected ||
      session.state.job.enabled ||
      !session.selected.size ||
      !!session.state.prepared;
  const stopBtn = $('stop');
  if (stopBtn) stopBtn.hidden = !session.state.job.enabled;
  const resetWait = $('resetWait');
  if (resetWait)
    resetWait.disabled =
      session.pending ||
      session.state.busy ||
      !!session.state.prepared ||
      !(
        session.state.job.nextAt ||
        session.state.job.sincePause ||
        session.state.job.pauseAfter ||
        session.state.remaining < session.state.settings.pacing.hourlyCap ||
        session.state.dayRemaining < session.state.settings.pacing.dailyCap
      );
  const startBtn = $('start');
  if (startBtn)
    startBtn.disabled =
      session.pending ||
      session.state.busy ||
      session.state.job.enabled ||
      !!session.state.prepared ||
      !session.state.campaigns.some((c) => c.enabled);
  const saveProf = $('saveProfile');
  if (saveProf)
    saveProf.disabled = session.pending || session.state.busy || session.state.job.enabled;
  const newProf = $('newProfile');
  if (newProf)
    newProf.disabled = session.pending || session.state.busy || session.state.job.enabled;
  const relBtn = $('reload');
  if (relBtn) relBtn.disabled = session.pending || session.state.busy || !!session.state.prepared;
  const connBtn = $('connect');
  if (connBtn)
    connBtn.disabled =
      session.pending ||
      session.state.busy ||
      session.state.connected ||
      session.state.signInOpen ||
      !!session.state.prepared;
  const resBtn = $('resume');
  if (resBtn) {
    resBtn.hidden = session.state.connected || !session.state.signInOpen;
    resBtn.disabled = session.pending || session.state.busy;
  }
  const disBtn = $('disconnect');
  if (disBtn) {
    disBtn.disabled = session.pending || session.state.busy;
    disBtn.hidden = !session.state.connected && !session.state.signInOpen;
  }
  const selCount = $('selectedCount');
  if (selCount) selCount.textContent = `${session.selected.size} selected`;
  const delSelLeads = $('deleteSelectedLeads');
  if (delSelLeads) {
    delSelLeads.disabled =
      session.pending || session.state.busy || session.state.job.enabled || !session.selected.size;
    renderRegion(
      delSelLeads,
      <>
        <svg
          width={'12'}
          height={'12'}
          viewBox={'0 0 24 24'}
          fill={'none'}
          stroke={'currentColor'}
          strokeWidth={'2'}
        >
          <polyline points={'3 6 5 6 21 6'}></polyline>
          <path
            d={'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'}
          ></path>
        </svg>
        {' Delete selected'}
        {session.selected.size ? ` (${session.selected.size})` : ''}
      </>,
    );
  }
  const delWs = $('deleteWorkspace');
  if (delWs) {
    delWs.disabled =
      session.pending ||
      session.state.busy ||
      session.state.job.enabled ||
      !session.state.activeCampaign;
  }
  const delCamp = $('deleteCampaignBtn');
  if (delCamp) {
    delCamp.disabled =
      session.pending ||
      session.state.busy ||
      session.state.job.enabled ||
      !session.state.activeCampaign;
  }
  const delCurProf = $('deleteCurrentProfile');
  if (delCurProf) {
    delCurProf.style.display =
      session.profileEditId && session.state.profiles.length > 1 ? 'inline-flex' : 'none';
    delCurProf.disabled = session.pending || session.state.busy || session.state.job.enabled;
  }
  const delTmpl = $('deleteTemplate');
  if (delTmpl) {
    delTmpl.disabled =
      session.pending || session.state.busy || !session.state.templates[$('template')?.value];
  }
}
