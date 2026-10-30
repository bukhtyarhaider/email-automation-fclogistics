import { Button, Input, Textarea, Select } from '../../design-system/primitives';
export function CatalogPage() {
  return (
    <>
      {' '}
      <section className={'view-page'} id={'view-catalog'}>
        <div className={'page-header'}>
          <div>
            <p className={'page-eyebrow'}>{'RELEASES & UPGRADE GUIDE'}</p>
            <h1 className={'page-title'}>{'Version Catalog'}</h1>
            <p className={'page-subtitle'}>
              {'See what changed, which version this PC is running, and how to update safely.'}
            </p>
          </div>
          <div className={'header-actions'}>
            <Button id={'catalogRefresh'} className={'secondary'}>
              {'Refresh catalog'}
            </Button>
            <a className={'button secondary'} href={'/api/export-catalog'}>
              {'Export catalog JSON'}
            </a>
          </div>
        </div>
        <div id={'catalogMetrics'} className={'history-metrics'}></div>
        <div className={'panel'}>
          <h2 className={'panel-title'}>{'How to update this PC'}</h2>
          <ol id={'catalogUpgradeSteps'} className={'catalog-upgrade'}></ol>
          <p className={'hint'}>
            {
              "Earlier fixes often shipped under package 2.0.0. Dated milestones keep that history visible without inventing patch version numbers. Local notes stay in this PC's data folder and do not install a new build."
            }
          </p>
        </div>
        <div className={'catalog-layout'}>
          <div>
            <div className={'catalog-filters'}>
              <label>
                {'Find a release or change'}
                <Input
                  id={'catalogSearch'}
                  type={'search'}
                  placeholder={'Version, feature, date or change…'}
                />
              </label>
              <label>
                {'Entry type'}
                <Select id={'catalogType'}>
                  <option value={''}>{'All entries'}</option>
                  <option value={'release'}>{'Numbered package releases'}</option>
                  <option value={'milestone'}>{'Historical updates'}</option>
                  <option value={'local'}>{'My local notes'}</option>
                </Select>
              </label>
            </div>
            <p id={'catalogStatus'} className={'hint'} role={'status'}></p>
            <div id={'catalogEntries'}></div>
          </div>
          <div className={'panel catalog-editor'}>
            <h2 className={'panel-title'} id={'catalogNoteHeading'}>
              {'Add a local release note'}
            </h2>
            <p className={'hint'}>
              {
                'Keep your own rollout notes or document changes for a version. Saved notes remain when application files are replaced.'
              }
            </p>
            <div className={'form-group'}>
              <label htmlFor={'catalogNoteVersion'}>{'Version'}</label>
              <Input id={'catalogNoteVersion'} placeholder={'2.1.0'} maxLength={80} />
            </div>
            <div className={'form-group'}>
              <label htmlFor={'catalogNoteDate'}>{'Date'}</label>
              <Input id={'catalogNoteDate'} type={'date'} />
            </div>
            <div className={'form-group'}>
              <label htmlFor={'catalogNoteTitle'}>{'Title'}</label>
              <Input
                id={'catalogNoteTitle'}
                maxLength={160}
                placeholder={'What changed or which PC was updated?'}
              />
            </div>
            <div className={'form-group'}>
              <label htmlFor={'catalogNoteChanges'}>{'Changes · one per line'}</label>
              <Textarea
                id={'catalogNoteChanges'}
                rows={7}
                maxLength={6000}
                placeholder={'Describe each change or deployment note on its own line.'}
              />
            </div>
            <div className={'header-actions'}>
              <Button id={'catalogSaveNote'}>{'Save note'}</Button>
              <Button id={'catalogNewNote'} className={'secondary'}>
                {'New note'}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
