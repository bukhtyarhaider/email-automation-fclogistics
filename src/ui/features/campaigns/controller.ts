import { uiScope } from '../../shared/lifecycle';
import { session } from '../../shared/session';
import { $, action, notice, api } from '../../shared/runtime';
import { refresh } from '../../app/runtime/refresh';
import { loadLeads } from '../leads/controller';
export async function deleteActiveCampaign(btn: HTMLButtonElement) {
  if (!session.state.activeCampaign) return;
  const c = session.state.campaigns.find((c) => c.id === session.state.activeCampaign);
  if (
    !confirm(
      `Are you sure you want to delete workspace "${c?.name || 'Current'}" and all its leads?`,
    )
  )
    return;
  action(btn, async () => {
    await api('/api/delete-campaign', { id: session.state.activeCampaign });
    session.selected.clear();
    session.previewId = null;
    session.offset = 0;
    await refresh();
    fillCampaign();
    await loadLeads();
    notice('Workspace deleted.');
  });
}

export function fillCampaign() {
  const c = session.state.campaigns.find((c) => c.id === session.state.activeCampaign);
  if ($('campaignName')) $('campaignName').value = c?.name || '';
  if ($('campaignEnabled')) $('campaignEnabled').checked = c?.enabled !== false;
  if ($('campaignSheets')) $('campaignSheets').value = (c?.sheets || []).join('\n');
  if ($('mapping')) $('mapping').value = JSON.stringify(c?.mapping || {}, null, 2);
  if ($('headers')) {
    $('headers').textContent = session.state.sheets
      .map(
        (s) =>
          `${s.name}: ${Object.entries(s.headers || {})
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')}`,
      )
      .join('\n');
  }
}

export function mountCampaigns() {
  if ($('upload'))
    uiScope.handler($('upload'), 'onchange', () =>
      action($('reload'), async () => {
        const file = $('upload').files?.[0];
        if (!file) return;
        const r = await uiScope.fetch('/api/upload', {
          method: 'POST',
          headers: {
            'X-FC-Request': '1',
            'X-Filename': encodeURIComponent(file.name),
          },
          body: file,
        });
        const result = await r.json();
        if (!r.ok) throw new Error(result.error);
        session.selected.clear();
        session.offset = 0;
        session.previewId = null;
        await refresh();
        fillCampaign();
        $('upload').value = '';
        window.dispatchEvent(
          new CustomEvent('fc-import-view', { detail: session.state.activeCampaign }),
        );
        location.hash = 'imports';
        notice(
          'Workbook uploaded. Review the mapping, save a revision and activate it before enabling outreach.',
        );
      }),
    );
  if ($('deleteWorkspace'))
    uiScope.handler($('deleteWorkspace'), 'onclick', () =>
      deleteActiveCampaign($('deleteWorkspace')),
    );
  if ($('deleteCampaignBtn'))
    uiScope.handler($('deleteCampaignBtn'), 'onclick', () =>
      deleteActiveCampaign($('deleteCampaignBtn')),
    );
  if ($('campaignSelect'))
    uiScope.handler($('campaignSelect'), 'onchange', () =>
      action($('reload'), async () => {
        await api('/api/select-campaign', { id: $('campaignSelect').value });
        session.selected.clear();
        session.previewId = null;
        session.offset = 0;
        await refresh();
        fillCampaign();
      }),
    );
  if ($('saveCampaign'))
    uiScope.handler($('saveCampaign'), 'onclick', () =>
      action($('saveCampaign'), () =>
        api('/api/campaign', {
          id: session.state.activeCampaign,
          name: $('campaignName').value,
          enabled: $('campaignEnabled').checked,
          sheets: $('campaignSheets').value.split('\n').filter(Boolean),
          mapping: JSON.parse($('mapping').value || '{}'),
        }),
      ),
    );
}
