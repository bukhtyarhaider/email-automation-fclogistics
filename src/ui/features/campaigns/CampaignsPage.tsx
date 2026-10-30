import { CodeXml, Folder, Icon } from '../../design-system/icons';
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
                <Icon icon={Folder} size={16} />
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
                <Icon icon={CodeXml} size={16} />
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
