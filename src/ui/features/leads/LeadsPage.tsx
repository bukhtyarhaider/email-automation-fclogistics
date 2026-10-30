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
              <svg
                width={'14'}
                height={'14'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2'}
              >
                <polyline points={'23 4 23 10 17 10'}></polyline>
                <polyline points={'1 20 1 14 7 14'}></polyline>
                <path
                  d={'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15'}
                ></path>
              </svg>
              {'\n                  Reload workbook\n                '}
            </Button>
            <label className={'button secondary'} htmlFor={'upload'} style={{ cursor: 'pointer' }}>
              <svg
                width={'14'}
                height={'14'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2'}
              >
                <path d={'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'}></path>
                <polyline points={'17 8 12 3 7 8'}></polyline>
                <line x1={'12'} y1={'3'} x2={'12'} y2={'15'}></line>
              </svg>
              {'\n                  Add .xlsx campaign\n                '}
            </label>
            <Input id={'upload'} type={'file'} accept={'.xlsx'} hidden={true} />
            <a className={'button secondary'} href={'/api/download'} id={'download'}>
              <svg
                width={'14'}
                height={'14'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2'}
              >
                <path d={'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'}></path>
                <polyline points={'7 10 12 15 17 10'}></polyline>
                <line x1={'12'} y1={'15'} x2={'12'} y2={'3'}></line>
              </svg>
              {'\n                  Download updated workbook\n                '}
            </a>
            <Button
              id={'deleteWorkspace'}
              className={'danger'}
              title={'Delete current leads workspace'}
            >
              <svg
                width={'14'}
                height={'14'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2'}
              >
                <polyline points={'3 6 5 6 21 6'}></polyline>
                <path
                  d={
                    'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'
                  }
                ></path>
              </svg>
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
              <svg viewBox={'0 0 24 24'} fill={'none'} stroke={'currentColor'} strokeWidth={'2'}>
                <circle cx={'11'} cy={'11'} r={'8'}></circle>
                <line x1={'21'} y1={'21'} x2={'16.65'} y2={'16.65'}></line>
              </svg>
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
                  d={
                    'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'
                  }
                ></path>
              </svg>
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
