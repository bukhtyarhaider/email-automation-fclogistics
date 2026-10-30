import { Button } from '../../design-system/primitives';
import { uiScope } from '../../shared/lifecycle';
import { renderRegion } from '../../shared/regions';
import { displayText } from '../../shared/utils';
import { eventElement } from '../../shared/dom';
import { session } from '../../shared/session';
import { $, action, api, notice } from '../../shared/runtime';
export function renderSuppressionList() {
  const supList = $('suppressionList');
  if (!supList || !session.state?.suppression) return;
  const q = ($('suppressionSearch')?.value || '').toLowerCase().trim();
  const countBadge = $('suppressionCountBadge');
  const entries = Object.entries(session.state.suppression);
  if (countBadge) {
    countBadge.textContent = `${entries.length} Suppressed`;
  }
  const filtered = entries.filter(([e, r]) => {
    if (!q) return true;
    return `${e} ${r}`.toLowerCase().includes(q);
  });
  renderRegion(
    supList,
    filtered.length ? (
      filtered.map(([e, r]) => (
        <>
          <li>
            <div>
              <strong>{displayText(e)}</strong>
              <div className={'hint'} style={{ margin: '2px 0 0 0' }}>
                {displayText(
                  String(r).replace(
                    /Captured carrier opt-out: [a-f0-9]{64}/g,
                    'Captured carrier opt-out — review in Carrier conversations',
                  ),
                )}
              </div>
            </div>
            <Button
              className={'secondary danger-hover'}
              style={{ fontSize: '11px', padding: '4px 10px' }}
              data-unsuppress={displayText(e)}
              title={'Remove from Do Not Contact list'}
            >
              {'Remove'}
            </Button>
          </li>
        </>
      ))
    ) : (
      <>
        <li style={{ justifyContent: 'center', color: 'var(--text-muted)', padding: '20px' }}>
          {'No suppressed records matching filter.'}
        </li>
      </>
    ),
  );
}

export function mountSuppression() {
  if ($('suppress'))
    uiScope.handler($('suppress'), 'onclick', () =>
      action($('suppress'), async () => {
        await api('/api/suppress', {
          email: $('suppressEmail').value,
          reason: $('suppressReason').value,
        });
        $('suppressEmail').value = '';
        $('suppressReason').value = '';
        notice('Recipient added to suppression list.');
      }),
    );
  if ($('suppressionSearch'))
    uiScope.handler($('suppressionSearch'), 'oninput', () => {
      renderSuppressionList();
    });
  if ($('suppressionList'))
    uiScope.handler($('suppressionList'), 'onclick', (e) => {
      const unsuppBtn = eventElement(e).closest<HTMLElement>('[data-unsuppress]');
      if (unsuppBtn) {
        const email = unsuppBtn.dataset.unsuppress;
        if (!confirm(`Remove ${email} from Do Not Contact list?`)) return;
        action(unsuppBtn, async () => {
          await api('/api/unsuppress', { email });
          notice(`Removed ${email} from suppression list.`);
        });
      }
    });
}
