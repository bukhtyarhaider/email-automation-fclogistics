import { Download, Icon, RefreshCw, Search, Trash2, Upload } from '../../design-system/icons';
import { Button, Input, Select } from '../../design-system/primitives';
export function LeadsPage() {
  return (
    <>
      <section className={'view-page'} id={'view-leads'}>
        <div className={'page-header'}>
          <div>
            <p className={'page-eyebrow'}>{'DATA MANAGEMENT'}</p>
            <h1 className={'page-title'}>{'Leads Workspace'}</h1>
            <p className={'page-subtitle'}>
              {
                'Inspect contacts, verify eligibility, select targets, and preview personalized outreach.'
              }
            </p>
          </div>
          <div className={'header-actions'}>
            <Button id={'reload'} className={'secondary'}>
              <Icon icon={RefreshCw} size={14} />
              {'\n                  Reload workbook\n                '}
            </Button>
            <label className={'button secondary'} htmlFor={'upload'} style={{ cursor: 'pointer' }}>
              <Icon icon={Upload} size={14} />
              {'\n                  Add .xlsx campaign\n                '}
            </label>
            <Input id={'upload'} type={'file'} accept={'.xlsx'} hidden={true} />
            <a className={'button secondary'} href={'/api/download'} id={'download'}>
              <Icon icon={Download} size={14} />
              {'\n                  Download updated workbook\n                '}
            </a>
            <Button
              id={'deleteWorkspace'}
              className={'danger'}
              title={'Delete current leads workspace'}
            >
              <Icon icon={Trash2} size={14} />
              {'\n                  Delete workspace\n                '}
            </Button>
          </div>
        </div>

        <div className={'toolbar'}>
          <div className={'toolbar-group'}>
            <div style={{ minWidth: '170px' }}>
              <Select id={'sheet'} aria-label={'Select worksheet'}>
                <option value={''}>{'All worksheets'}</option>
              </Select>
            </div>
            <div style={{ minWidth: '160px' }}>
              <Select id={'filter'} aria-label={'Filter status'}>
                <option value={'ready'}>{'Ready for outreach'}</option>
                <option value={'all'}>{'All leads'}</option>
                <option value={'excluded'}>{'Excluded leads'}</option>
              </Select>
            </div>
            <div className={'toolbar-search'}>
              <Icon icon={Search} />
              <Input
                id={'search'}
                type={'search'}
                placeholder={'Search company, contact, or email…'}
              />
            </div>
          </div>
          <div className={'toolbar-group'}>
            <Button id={'clearSelection'} className={'secondary'} style={{ fontSize: '11.5px' }}>
              {'Clear selection'}
            </Button>
            <Button
              id={'deleteSelectedLeads'}
              className={'danger'}
              style={{ fontSize: '11.5px' }}
              disabled={true}
            >
              <Icon icon={Trash2} size={12} />
              {'\n                  Delete selected\n                '}
            </Button>
          </div>
        </div>

        <div className={'table-container'}>
          <div className={'table-wrap'}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '44px', textAlign: 'center' }}>
                    <Input
                      type={'checkbox'}
                      id={'selectPage'}
                      aria-label={'Select eligible leads on this page'}
                    />
                  </th>
                  <th>{'Company / Principal'}</th>
                  <th>{'Contact Email'}</th>
                  <th>{'Location'}</th>
                  <th>{'Status / Reason'}</th>
                  <th style={{ width: '120px', textAlign: 'right' }}>{'Action'}</th>
                </tr>
              </thead>
              <tbody id={'leadRows'}></tbody>
            </table>
          </div>
          <div className={'table-footer'}>
            <span id={'pageInfo'}>{'Loading leads…'}</span>
            <div className={'pagination-controls'}>
              <Button id={'previous'} className={'secondary'}>
                {'Previous'}
              </Button>
              <Button id={'next'} className={'secondary'}>
                {'Next'}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
