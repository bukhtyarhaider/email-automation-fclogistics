import { Icon, Trash2 } from '../../design-system/icons';
import { Button, Input } from '../../design-system/primitives';
import { uiScope } from '../../shared/lifecycle';
import { renderRegion } from '../../shared/regions';
import { displayText } from '../../shared/utils';
import type { LeadsResponse, PreviewResponse } from '../../shared/types/api';
import { eventElement } from '../../shared/dom';
import { errorMessage } from '../../shared/utils';
import { session } from '../../shared/session';
import { $, api, notice, action } from '../../shared/runtime';
import { updateControls } from '../../app/runtime/controls';
import { switchDrawerTab, renderLeadDetails, openPreviewDrawer } from '../drawer/controller';
export async function loadLeads() {
  const sheetEl = $('sheet');
  const filterEl = $('filter');
  const searchEl = $('search');
  if (!sheetEl || !filterEl || !searchEl) return;
  const query = new URLSearchParams({
    sheet: sheetEl.value,
    filter: filterEl.value,
    q: searchEl.value,
    offset: String(session.offset),
  });
  const result = await api<LeadsResponse>(`/api/leads?${query}`);
  session.rows = result.leads;
  session.total = result.total;
  const leadRowsEl = $('leadRows');
  if (leadRowsEl) {
    renderRegion(
      leadRowsEl,
      session.rows.length ? (
        session.rows.map((l) => (
          <>
            <tr>
              <td style={{ textAlign: 'center' }}>
                <Input
                  type={'checkbox'}
                  data-select={l.id}
                  aria-label={'Select ' + displayText(l.company)}
                  {...{ disabled: !!l.blocked }}
                  {...{ defaultChecked: session.selected.has(l.id) }}
                />
              </td>
              <td>
                <strong>{displayText(l.company)}</strong>
                <small>{displayText(l.fields['owner / principal']) || 'No contact listed'}</small>
              </td>
              <td>{displayText(l.email) || '—'}</td>
              <td>
                {displayText([l.fields.city, l.fields.state].filter(Boolean).join(', ')) || '—'}
              </td>
              <td>
                <span className={'status-pill ' + (l.blocked ? 'blocked' : 'ready')}>
                  {displayText(l.blocked || 'Ready')}
                </span>
              </td>
              <td style={{ textAlign: 'right' }}>
                <div className={'row-actions'}>
                  <Button
                    className={'secondary'}
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                    data-preview={l.id}
                    title={'View lead details'}
                  >
                    {'Details'}
                  </Button>
                  <Button
                    className={'secondary danger-hover'}
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                    data-delete-lead={l.id}
                    title={'Delete lead'}
                  >
                    <Icon icon={Trash2} size={12} />
                  </Button>
                </div>
              </td>
            </tr>
          </>
        ))
      ) : (
        <>
          <tr>
            <td
              colSpan={6}
              style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}
            >
              {'No leads match these filters.'}
            </td>
          </tr>
        </>
      ),
    );
  }
  const pageInfoEl = $('pageInfo');
  if (pageInfoEl) {
    pageInfoEl.textContent = session.total
      ? `Showing ${session.offset + 1}–${Math.min(session.offset + 50, session.total)} of ${session.total.toLocaleString()} leads`
      : 'No leads found';
  }
  if ($('previous')) $('previous').disabled = session.offset === 0;
  if ($('next')) $('next').disabled = session.offset + 50 >= session.total;
  if ($('selectPage')) $('selectPage').checked = false;
  updateControls();
}

export async function preview(id: string | null | undefined) {
  session.previewId = id ?? null;
  // Always default to Lead Details tab when opening preview
  switchDrawerTab('details');
  const localLead = session.rows.find((x) => x.id === id);
  if (localLead && $('previewTitle')) {
    $('previewTitle').textContent = localLead.company || 'Lead Details';
  }
  const templateKey = $('template')?.value;
  try {
    const res = await api<PreviewResponse>(
      `/api/preview?${new URLSearchParams({ id: id || '', key: templateKey })}`,
    );
    const lead = res.lead || localLead;
    const message = res.message;
    const warnings = res.warnings || [];
    if ($('previewTitle'))
      $('previewTitle').textContent = lead && lead.company ? lead.company : 'Lead Details';
    if ($('previewTo') && message) $('previewTo').textContent = `To: ${message.to}`;
    if ($('previewBody') && message) $('previewBody').textContent = message.body;
    const warnEl = $('warnings');
    if (warnEl) {
      warnEl.hidden = !warnings.length;
      warnEl.textContent = warnings.join(' ');
    }
    renderLeadDetails(lead, message, warnings);
  } catch (err) {
    if (localLead) {
      renderLeadDetails(localLead, null, [errorMessage(err)]);
    } else {
      notice(errorMessage(err));
    }
  }
  openPreviewDrawer();
  updateControls();
}

export let searchTimer: ReturnType<typeof setTimeout> | undefined;

export function mountLeads() {
  if ($('leadRows')) {
    uiScope.handler($('leadRows'), 'onclick', (e) => {
      const previewBtn = eventElement(e).closest<HTMLElement>('[data-preview]');
      if (previewBtn) {
        preview(previewBtn.dataset.preview).catch((err) => notice(errorMessage(err)));
        return;
      }
      const delBtn = eventElement(e).closest<HTMLElement>('[data-delete-lead]');
      if (delBtn) {
        const id = delBtn.dataset.deleteLead;
        if (!confirm('Are you sure you want to permanently delete this lead from the workbook?'))
          return;
        action(delBtn, async () => {
          await api('/api/delete-leads', { ids: [id] });
          session.selected.delete(id!);
          notice('Lead deleted.');
        });
        return;
      }
    });
    uiScope.handler($('leadRows'), 'onchange', (e) => {
      const id = eventElement(e).dataset.select;
      if (id) {
        if ((eventElement(e) as HTMLInputElement).checked) session.selected.add(id);
        else session.selected.delete(id!);
        updateControls();
      }
    });
  }
  if ($('selectPage'))
    uiScope.handler($('selectPage'), 'onchange', () => {
      for (const l of session.rows)
        if (!l.blocked) {
          if ($('selectPage').checked) session.selected.add(l.id);
          else session.selected.delete(l.id);
        }
      loadLeads().catch((e) => notice(errorMessage(e)));
    });
  if ($('clearSelection'))
    uiScope.handler($('clearSelection'), 'onclick', () => {
      session.selected.clear();
      loadLeads().catch((e) => notice(errorMessage(e)));
    });
  if ($('deleteSelectedLeads'))
    uiScope.handler($('deleteSelectedLeads'), 'onclick', () => {
      if (!session.selected.size) return;
      if (
        !confirm(
          `Are you sure you want to delete ${session.selected.size} selected lead(s) permanently from the workbook?`,
        )
      )
        return;
      action($('deleteSelectedLeads'), async () => {
        await api('/api/delete-leads', { ids: [...session.selected] });
        session.selected.clear();
        notice('Selected leads deleted.');
      });
    });
  for (const id of ['sheet', 'filter']) {
    if ($(id))
      uiScope.handler($(id), 'onchange', () => {
        session.offset = 0;
        loadLeads().catch((e) => notice(errorMessage(e)));
      });
  }
  if ($('search'))
    uiScope.handler($('search'), 'oninput', () => {
      uiScope.clearTimeout(searchTimer);
      searchTimer = uiScope.timeout(() => {
        session.offset = 0;
        loadLeads().catch((e) => notice(errorMessage(e)));
      }, 250);
    });
  if ($('previous'))
    uiScope.handler($('previous'), 'onclick', () => {
      session.offset = Math.max(0, session.offset - 50);
      loadLeads().catch((e) => notice(errorMessage(e)));
    });
  if ($('next'))
    uiScope.handler($('next'), 'onclick', () => {
      session.offset += 50;
      loadLeads().catch((e) => notice(errorMessage(e)));
    });
}
