import { Button, Input, Textarea, Select } from '../../design-system/primitives';
export function CampaignsPage() {
  return (
    <>
      <section className={'view-page'} id={'view-campaigns'}>
        <div className={'page-header'}>
          <div>
            <p className={'page-eyebrow'}>{'DATA SCHEMA'}</p>
            <h1 className={'page-title'}>{'Campaigns & Column Mapping'}</h1>
            <p className={'page-subtitle'}>
              {'Configure campaign scopes, included worksheets, and spreadsheet column mappings.'}
            </p>
          </div>
          <div className={'header-actions'}>
            <Button id={'deleteCampaignBtn'} className={'danger'}>
              {'Delete campaign'}
            </Button>
            <Button id={'openImportReview'} className={'secondary'}>
              {'Review or repair mapping'}
            </Button>
            <Button id={'saveCampaign'}>{'Save campaign settings'}</Button>
          </div>
        </div>
        <div className={'dashboard-grid'}>
          <div className={'panel'}>
            <div className={'panel-head'}>
              <h2 className={'panel-title'}>
                <svg
                  width={'16'}
                  height={'16'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'2'}
                >
                  <path
                    d={
                      'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'
                    }
                  ></path>
                </svg>
                {'\n                    Campaign Parameters\n                  '}
              </h2>
            </div>
            <div className={'form-group'}>
              <label htmlFor={'campaignSelect'}>{'Active Campaign Selection'}</label>
              <Select id={'campaignSelect'}></Select>
            </div>
            <div className={'form-group'}>
              <label htmlFor={'campaignName'}>{'Campaign Display Name'}</label>
              <Input id={'campaignName'} placeholder={'e.g. Jessica Miller - Motus leads'} />
            </div>
            <div className={'form-group'}>
              <label className={'check'}>
                <Input id={'campaignEnabled'} type={'checkbox'} />
                {
                  '\n                    Include this campaign in continuous outreach queue\n                  '
                }
              </label>
            </div>
            <div className={'form-group'}>
              <label htmlFor={'campaignSheets'}>
                {'Included Worksheets (one exact sheet name per line; leave blank for all)'}
              </label>
              <Textarea id={'campaignSheets'} rows={4} placeholder={'Leads\nJuly Carriers'} />
              <p className={'hint'}>
                {'Continuous queue only processes worksheets matching these names.'}
              </p>
            </div>
          </div>

          <div className={'panel'}>
            <div className={'panel-head'}>
              <h2 className={'panel-title'}>
                <svg
                  width={'16'}
                  height={'16'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'2'}
                >
                  <polyline points={'16 18 22 12 16 6'}></polyline>
                  <polyline points={'8 6 2 12 8 18'}></polyline>
                </svg>
                {'\n                    Custom Column Mapping (JSON)\n                  '}
              </h2>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              {
                '\n                  Define JSON column mappings to target custom layouts. The status column mapping controls which cell is updated after confirmed send.\n                '
              }
            </p>
            <div className={'form-group'}>
              <label htmlFor={'mapping'}>{'JSON Mapping Configuration'}</label>
              <Textarea
                id={'mapping'}
                readOnly={true}
                rows={7}
                spellCheck={'false'}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
              />
            </div>
            <div className={'form-group'}>
              <label>{'Detected Sheet Headers'}</label>
              <pre
                id={'headers'}
                style={{
                  background: '#111319',
                  border: '1px solid var(--border-subtle)',
                  padding: '12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11.5px',
                  color: 'var(--text-muted)',
                  maxHeight: '160px',
                  overflowY: 'auto',
                }}
              ></pre>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
