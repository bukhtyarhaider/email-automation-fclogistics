import { Icon, Trash2 } from '../../design-system/icons';
import { Button } from '../../design-system/primitives';
import { uiScope } from '../../shared/lifecycle';
import { contentOr } from '../../shared/regions';
import { renderRegion } from '../../shared/regions';
import { displayText } from '../../shared/utils';
import { eventElement } from '../../shared/dom';
import { errorMessage } from '../../shared/utils';
import { session } from '../../shared/session';
import { $, notice, action, api, downloadJson } from '../../shared/runtime';
import { refresh } from '../../app/runtime/refresh';
import { preview } from '../leads/controller';
export function renderTemplatesTable() {
  const tbody = $('templatesTableBody');
  if (!tbody || !session.state?.templates) return;
  const q = ($('templateSearch')?.value || '').toLowerCase().trim();
  const countBadge = $('templateCountBadge');
  const entries = Object.entries(session.state.templates);
  if (countBadge) {
    countBadge.textContent = `${entries.length} Variant${entries.length === 1 ? '' : 's'}`;
  }
  const filtered = entries.filter(([_k, t]) => {
    if (!q) return true;
    return `${t.name} ${t.subject} ${(t.requiredFields || []).join(' ')}`.toLowerCase().includes(q);
  });
  renderRegion(
    tbody,
    filtered.length ? (
      filtered.map(([key, t]) => {
        const reqFields = (t.requiredFields || []).map((f: unknown) => (
          <>
            <span className={'tag-badge'}>{displayText(f)}</span>
          </>
        ));
        const isEnabled = t.enabled !== false;
        return (
          <>
            <tr>
              <td>
                <strong>{displayText(t.name)}</strong>
              </td>
              <td
                style={{
                  maxWidth: '260px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={displayText(t.subject)}
              >
                {displayText(t.subject || '—')}
              </td>
              <td style={{ textAlign: 'center' }}>
                <span className={'tag-badge'}>
                  {'×'}
                  {t.weight || 1}
                </span>
              </td>
              <td style={{ textAlign: 'center' }}>
                <span className={'status-pill ' + (isEnabled ? 'ready' : 'blocked')}>
                  {isEnabled ? 'Active' : 'Disabled'}
                </span>
              </td>
              <td>
                {contentOr(
                  reqFields,
                  <>
                    <small style={{ color: 'var(--text-muted)' }}>{'None required'}</small>
                  </>,
                )}
              </td>
              <td style={{ textAlign: 'right' }}>
                <div className={'row-actions'}>
                  <Button
                    className={'secondary'}
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                    data-edit-template={displayText(key)}
                    title={'Load into editor'}
                  >
                    {'Edit'}
                  </Button>
                  <Button
                    className={'secondary'}
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                    data-export-template={displayText(key)}
                    title={'Export this template JSON'}
                  >
                    {'Export'}
                  </Button>
                  <Button
                    className={'secondary danger-hover'}
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                    data-delete-template={displayText(key)}
                    title={'Delete template variant'}
                  >
                    <Icon icon={Trash2} size={12} />
                  </Button>
                </div>
              </td>
            </tr>
          </>
        );
      })
    ) : (
      <>
        <tr>
          <td
            colSpan={6}
            style={{ textAlign: 'center', padding: '25px', color: 'var(--text-muted)' }}
          >
            {'No template variants found.'}
          </td>
        </tr>
      </>
    ),
  );
}

export function insertOptOutInstruction() {
  const bodyEl = $('body');
  if (!bodyEl) return;
  const optOutText =
    '\n\nIf you’d prefer no further outreach, reply “remove” and I’ll take you off our list.';
  const val = bodyEl.value;
  const legalMatch = val.search(/\{\{legalName\}\}/);
  if (legalMatch !== -1) {
    bodyEl.value =
      val.substring(0, legalMatch).trimEnd() +
      optOutText +
      '\n\n' +
      val.substring(legalMatch).trimStart();
  } else {
    bodyEl.value = val.trimEnd() + optOutText;
  }
  updateTemplateLivePreview();
  notice('Opt-out instruction added to template.');
}

export function fillTemplate() {
  const isNew = $('template')?.value === '';
  const defaultNewBody = `Hi {{firstName}},\n\nI’m {{senderName}} with {{businessName}}. I wanted to see whether {{company}} could use dispatch support for your equipment.\n\nWe help with {{services}}, based on your equipment, preferred lanes, and availability. You decide which loads you accept.\n\nWould a brief overview of how we work be useful?\n\nIf you’d prefer no further outreach, reply “remove” and I’ll take you off our list.\n\n{{legalName}}\n{{address}}`;
  const defaultNewSubject = 'Dispatch support for {{company}}';
  const t = session.state.templates[$('template')?.value] || {
    name: 'New template',
    subject: isNew ? defaultNewSubject : '',
    body: isNew ? defaultNewBody : '',
    weight: 1,
    enabled: true,
    requiredFields: [],
  };
  if ($('subject')) $('subject').value = t.subject;
  if ($('body')) $('body').value = t.body;
  if ($('templateName')) $('templateName').value = t.name;
  if ($('templateEnabled')) $('templateEnabled').checked = t.enabled !== false;
  if ($('templateWeight')) $('templateWeight').value = String(t.weight || 1);
  if ($('requiredFields')) $('requiredFields').value = (t.requiredFields || []).join(', ');
  updateTemplateLivePreview();
}

export function updateTemplateLivePreview() {
  const previewBox = $('templateLivePreview');
  if (!previewBox) return;
  const p = session.state?.profiles?.find((p) => p.id === session.state.activeProfile);
  const b = p?.business || session.state?.settings?.business || {};
  const sampleData = {
    firstName: 'John',
    company: 'Apex Freight Express',
    city: 'Dallas',
    state: 'TX',
    locationPhrase: ' in Dallas, TX',
    senderName: b.senderName || $('senderName')?.value || 'Mark',
    businessName: b.company || $('businessName')?.value || 'FC Logistics',
    legalName: b.legalName || $('legalName')?.value || 'Fleet Core Logistics LLC',
    address: b.address || $('address')?.value || '132 French Creek Dr, Rochester, NY 14618',
    services:
      b.services ||
      $('services')?.value ||
      'load sourcing, rate negotiation, lane planning, broker paperwork, and pickup/delivery coordination',
  };
  let subject = $('subject')?.value || '';
  let body = $('body')?.value || '';
  for (const [k, v] of Object.entries(sampleData)) {
    subject = subject.replaceAll(`{{${k}}}`, v);
    body = body.replaceAll(`{{${k}}}`, v);
  }
  previewBox.textContent = `Subject: ${subject}\n\n${body}`;
  const rawBody = $('body')?.value || '';
  const words = rawBody.split(/\s+/).filter(Boolean).length;
  const compStatus = $('templateComplianceStatus');
  if (compStatus) {
    if (!rawBody.trim()) {
      compStatus.textContent = 'Draft';
      compStatus.className = 'status-pill';
    } else {
      compStatus.textContent = `${words} words`;
      compStatus.className = 'status-pill ready';
    }
  }
}

let lastFocusedTmplInput: HTMLInputElement | HTMLTextAreaElement | null = null;

export function mountTemplates() {
  if ($('insertOptOutChip'))
    uiScope.handler($('insertOptOutChip'), 'onclick', insertOptOutInstruction);
  if ($('saveTemplate'))
    uiScope.handler($('saveTemplate'), 'onclick', () =>
      action($('saveTemplate'), async () => {
        const saved = await api<{ key: string; warnings: string[] }>('/api/template', {
          key: $('template').value,
          name: $('templateName').value,
          subject: $('subject').value,
          body: $('body').value,
          enabled: $('templateEnabled').checked,
          weight: Number($('templateWeight').value),
          requiredFields: $('requiredFields')
            .value.split(',')
            .map((v) => v.trim())
            .filter(Boolean),
        });
        await refresh();
        $('template').value = String(saved.key);
        fillTemplate();
        if (session.previewId) await preview(session.previewId);
        if (saved.warnings && saved.warnings.length) {
          notice(`Template saved with warning: ${saved.warnings.join(' ')}`);
        } else {
          notice('Template variant saved.');
        }
      }),
    );
  if ($('template'))
    uiScope.handler($('template'), 'onchange', () => {
      fillTemplate();
      if (session.previewId) preview(session.previewId).catch((e) => notice(errorMessage(e)));
    });
  if ($('subject')) uiScope.handler($('subject'), 'oninput', updateTemplateLivePreview);
  if ($('body')) uiScope.handler($('body'), 'oninput', updateTemplateLivePreview);
  lastFocusedTmplInput = $('body');
  if ($('subject')) {
    uiScope.listen($('subject'), 'focus', () => {
      lastFocusedTmplInput = $('subject');
    });
  }
  if ($('body')) {
    uiScope.listen($('body'), 'focus', () => {
      lastFocusedTmplInput = $('body');
    });
  }
  // Token chip click helper
  document.querySelectorAll<HTMLElement>('.token-chip').forEach((chip) => {
    uiScope.handler(chip, 'onclick', () => {
      const token = chip.dataset.token;
      if (!token) return;
      const targetEl =
        lastFocusedTmplInput === $('subject') ? $('subject') : $('body') || $('subject');
      if (!targetEl) return;
      const start = targetEl.selectionStart || targetEl.value.length;
      const end = targetEl.selectionEnd || targetEl.value.length;
      const txt = targetEl.value;
      targetEl.value = txt.substring(0, start) + token + txt.substring(end);
      targetEl.selectionStart = targetEl.selectionEnd = start + token.length;
      targetEl.focus();
      updateTemplateLivePreview();
    });
  });
  if ($('newTemplate'))
    uiScope.handler($('newTemplate'), 'onclick', () => {
      const tmplSelect = $('template');
      if (tmplSelect) {
        tmplSelect.add(new Option('New template', ''));
        tmplSelect.value = '';
      }
      fillTemplate();
      if ($('templateName')) $('templateName').focus();
    });
  if ($('deleteTemplate'))
    uiScope.handler($('deleteTemplate'), 'onclick', () => {
      const key = $('template')?.value;
      const t = session.state.templates[key];
      if (!confirm(`Are you sure you want to delete template variant "${t?.name || 'variant'}"?`))
        return;
      action($('deleteTemplate'), async () => {
        await api('/api/delete-template', { key });
        if ($('template')) $('template').dataset.options = '';
        await refresh();
        fillTemplate();
        notice('Template variant deleted.');
      });
    });
  if ($('exportTemplatesBtn'))
    uiScope.handler($('exportTemplatesBtn'), 'onclick', () => {
      downloadJson(
        {
          exportedAt: new Date().toISOString(),
          templates: session.state.templates,
        },
        'outreach-templates.json',
      );
      notice('All templates exported.');
    });
  if ($('importTemplatesFile'))
    uiScope.handler($('importTemplatesFile'), 'onchange', async () => {
      const file = $('importTemplatesFile').files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const res = await api<{ imported: number; count: number }>('/api/import-templates', {
          templates: json,
        });
        await refresh();
        fillTemplate();
        notice(`Successfully imported ${res.count} template variant(s).`);
      } catch (err) {
        notice('Failed to import templates: ' + errorMessage(err));
      } finally {
        $('importTemplatesFile').value = '';
      }
    });
  if ($('templateSearch'))
    uiScope.handler($('templateSearch'), 'oninput', () => {
      renderTemplatesTable();
    });
  if ($('templatesTableBody')) {
    uiScope.handler($('templatesTableBody'), 'onclick', (e) => {
      const editBtn = eventElement(e).closest<HTMLElement>('[data-edit-template]');
      if (editBtn) {
        const key = editBtn.dataset.editTemplate;
        if ($('template')) $('template').value = String(key);
        fillTemplate();
        $('template')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        if (session.previewId) preview(session.previewId).catch((err) => notice(errorMessage(err)));
        return;
      }
      const expBtn = eventElement(e).closest<HTMLElement>('[data-export-template]');
      if (expBtn) {
        const key = expBtn.dataset.exportTemplate!;
        const t = session.state.templates[key];
        if (t) {
          downloadJson({ [key]: t }, `template-${(t.name || 'custom').replace(/\s+/g, '_')}.json`);
          notice('Template exported.');
        }
        return;
      }
      const delBtn = eventElement(e).closest<HTMLElement>('[data-delete-template]');
      if (delBtn) {
        const key = delBtn.dataset.deleteTemplate!;
        const t = session.state.templates[key];
        if (!confirm(`Are you sure you want to delete template variant "${t?.name || 'variant'}"?`))
          return;
        action(delBtn, async () => {
          await api('/api/delete-template', { key });
          if ($('template')?.value === key) {
            if ($('template')) $('template').dataset.options = '';
          }
          await refresh();
          fillTemplate();
          notice('Template variant deleted.');
        });
        return;
      }
    });
  }
}
