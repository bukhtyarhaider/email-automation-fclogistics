import { Button } from '../../design-system/primitives';
import { uiScope } from '../../shared/lifecycle';
import { contentOr } from '../../shared/regions';
import { renderRegion } from '../../shared/regions';
import { displayText } from '../../shared/utils';
import type { Catalog } from '../../shared/types/api';
import { eventElement } from '../../shared/dom';
import { errorMessage } from '../../shared/utils';
import { session } from '../../shared/session';
import { $, api, action, notice } from '../../shared/runtime';
export let catalogData: Catalog | null = null,
  catalogEditId: string | null = null;

export async function loadCatalog() {
  $('catalogStatus').textContent = 'Loading catalog…';
  try {
    catalogData = await api<Catalog>('/api/catalog');
    if (!$('catalogNoteVersion').value)
      $('catalogNoteVersion').value = catalogData!.installedVersion;
    if (!$('catalogNoteDate').value)
      $('catalogNoteDate').value = new Date().toLocaleDateString('en-CA');
    const metrics = [
      ['Installed on this PC', `v${catalogData!.installedVersion}`],
      ['Recorded package versions', catalogData.packageVersions],
      ['Historical updates', catalogData.milestones],
      ['My local notes', catalogData.notes.length],
    ];
    renderRegion(
      $('catalogMetrics'),
      metrics.map(([label, value]) => (
        <>
          <div className={'history-metric'}>
            <span>{displayText(label)}</span>
            <strong>{displayText(value)}</strong>
          </div>
        </>
      )),
    );
    renderRegion(
      $('catalogUpgradeSteps'),
      catalogData.upgradeSteps.map((step) => (
        <>
          <li>{displayText(step)}</li>
        </>
      )),
    );
    renderCatalogEntries();
  } catch (error) {
    $('catalogStatus').textContent = `Could not load catalog: ${errorMessage(error)}`;
    throw error;
  }
}

export function renderCatalogEntries() {
  if (!catalogData) return;
  const q = $('catalogSearch').value.trim().toLowerCase(),
    kind = $('catalogType').value;
  const entries = [...catalogData.releases, ...catalogData.notes]
    .filter(
      (r) =>
        (!kind || r.kind === kind) &&
        (!q || [r.version, r.date, r.title, ...r.changes].join(' ').toLowerCase().includes(q)),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  renderRegion(
    $('catalogEntries'),
    contentOr(
      entries.map((r) => (
        <>
          <article
            className={
              'panel catalog-entry ' +
              (r.kind === 'release' && r.version === catalogData!.installedVersion
                ? 'catalog-current'
                : '')
            }
          >
            <div className={'catalog-entry-meta'}>
              <span className={'status-pill'}>
                {r.kind === 'release'
                  ? 'Package release'
                  : r.kind === 'milestone'
                    ? 'Historical update'
                    : 'Local note'}
              </span>
              <span>
                {'v'}
                {displayText(r.version)}
                {' · '}
                {displayText(r.date)}
              </span>
              {r.kind === 'release' && r.version === catalogData!.installedVersion ? (
                <>
                  <span className={'status-pill good'}>{'Installed build'}</span>
                </>
              ) : (
                ''
              )}
            </div>
            <h2>{displayText(r.title)}</h2>
            <ul>
              {r.changes.map((change) => (
                <>
                  <li>{displayText(change)}</li>
                </>
              ))}
            </ul>
            {r.evidence ? (
              <>
                <small className={'hint'}>
                  {'Source: '}
                  {displayText(r.evidence)}
                </small>
              </>
            ) : (
              <>
                <Button className={'secondary'} data-catalog-edit={displayText(r.id)}>
                  {'Edit local note'}
                </Button>
              </>
            )}
          </article>
        </>
      )),
      <>
        <div className={'panel'}>{'No catalog entries match your search.'}</div>
      </>,
    ),
  );
  $('catalogStatus').textContent =
    `${entries.length} matching catalog entries · includes this build's recorded history`;
}

export function newCatalogNote() {
  catalogEditId = null;
  $('catalogNoteHeading').textContent = 'Add a local release note';
  $('catalogNoteVersion').value = catalogData?.installedVersion || session.state?.appVersion || '';
  $('catalogNoteDate').value = new Date().toLocaleDateString('en-CA');
  $('catalogNoteTitle').value = '';
  $('catalogNoteChanges').value = '';
}

export function mountCatalog() {
  uiScope.handler($('catalogSearch'), 'oninput', renderCatalogEntries);
  uiScope.handler($('catalogType'), 'onchange', renderCatalogEntries);
  uiScope.handler($('catalogRefresh'), 'onclick', () => action($('catalogRefresh'), loadCatalog));
  uiScope.handler($('catalogNewNote'), 'onclick', newCatalogNote);
  uiScope.handler($('catalogEntries'), 'onclick', (e) => {
    const button = eventElement(e).closest<HTMLElement>('[data-catalog-edit]');
    if (!button) return;
    const note = catalogData!.notes.find((note) => note.id === button.dataset.catalogEdit);
    if (!note) return;
    catalogEditId = note.id;
    $('catalogNoteHeading').textContent = 'Edit local release note';
    $('catalogNoteVersion').value = note.version;
    $('catalogNoteDate').value = note.date;
    $('catalogNoteTitle').value = note.title;
    $('catalogNoteChanges').value = note.changes.join('\n');
    $('catalogNoteTitle').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  uiScope.handler($('catalogSaveNote'), 'onclick', () =>
    action($('catalogSaveNote'), async () => {
      await api('/api/catalog/note', {
        id: catalogEditId,
        version: $('catalogNoteVersion').value.trim(),
        date: $('catalogNoteDate').value,
        title: $('catalogNoteTitle').value,
        changes: $('catalogNoteChanges').value,
      });
      newCatalogNote();
      await loadCatalog();
      notice('Local catalog note saved.');
    }),
  );
}
