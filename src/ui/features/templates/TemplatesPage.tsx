import { Button, Input, Textarea, Select } from '../../design-system/primitives';
export function TemplatesPage() {
  return (
    <>
      <section className={'view-page'} id={'view-templates'}>
        <div className={'page-header'}>
          <div>
            <p className={'page-eyebrow'}>{'MESSAGE PERSONALIZATION'}</p>
            <h1 className={'page-title'}>{'Templates Studio'}</h1>
            <p className={'page-subtitle'}>
              {
                'Craft deterministic, personalized outreach introductions with lead token interpolation.'
              }
            </p>
          </div>
          <div className={'header-actions'}>
            <Button id={'newTemplate'} className={'secondary'}>
              <svg
                width={'14'}
                height={'14'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2'}
              >
                <line x1={'12'} y1={'5'} x2={'12'} y2={'19'}></line>
                <line x1={'5'} y1={'12'} x2={'19'} y2={'12'}></line>
              </svg>
              {'\n                  New variant\n                '}
            </Button>
            <Button
              id={'exportTemplatesBtn'}
              className={'secondary'}
              title={'Export all templates as JSON'}
            >
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
              {'\n                  Export templates\n                '}
            </Button>
            <label
              className={'button secondary'}
              htmlFor={'importTemplatesFile'}
              style={{ cursor: 'pointer' }}
              title={'Import templates from JSON'}
            >
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
              {'\n                  Import templates\n                '}
            </label>
            <Input id={'importTemplatesFile'} type={'file'} accept={'.json'} hidden={true} />
            <Button id={'deleteTemplate'} className={'danger'}>
              {'Delete template'}
            </Button>
            <Button id={'saveTemplate'}>{'Save template'}</Button>
          </div>
        </div>
        <div className={'dashboard-grid'}>
          <div className={'panel'}>
            <div className={'form-group'}>
              <label htmlFor={'template'}>{'Select Template Variant'}</label>
              <Select id={'template'}></Select>
            </div>
            <div className={'form-grid-2'}>
              <div className={'form-group'}>
                <label htmlFor={'templateName'}>{'Template Variant Name'}</label>
                <Input id={'templateName'} />
              </div>
              <div className={'form-group'}>
                <label htmlFor={'templateWeight'}>{'Selection Weight'}</label>
                <Input
                  id={'templateWeight'}
                  type={'number'}
                  min={'1'}
                  max={'100'}
                  defaultValue={'1'}
                />
              </div>
            </div>
            <div className={'form-group'}>
              <label className={'check'}>
                <Input id={'templateEnabled'} type={'checkbox'} defaultChecked={true} />
                {'\n                    Enabled for random weighted selection\n                  '}
              </label>
            </div>
            <div className={'form-group'}>
              <label htmlFor={'requiredFields'}>{'Required Lead Fields (comma separated)'}</label>
              <Input id={'requiredFields'} placeholder={'e.g. city, state'} />
              <p className={'hint'}>
                {'Variants will be skipped if the lead is missing any required field.'}
              </p>
            </div>
            <div className={'form-group'}>
              <label htmlFor={'subject'}>{'Email Subject Line'}</label>
              <Input id={'subject'} placeholder={'e.g. Quick question regarding {{company}}'} />
            </div>
            <div className={'form-group'}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '6px',
                }}
              >
                <label style={{ marginBottom: '0' }}>
                  {'Insert Personalization Tokens (Click to insert)'}
                </label>
                <Button
                  type={'button'}
                  id={'insertOptOutChip'}
                  className={'secondary'}
                  style={{
                    fontSize: '11px',
                    padding: '3px 8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  title={'Insert compliant opt-out instruction into message body'}
                >
                  <svg
                    width={'12'}
                    height={'12'}
                    viewBox={'0 0 24 24'}
                    fill={'none'}
                    stroke={'currentColor'}
                    strokeWidth={'2'}
                  >
                    <path d={'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'}></path>
                  </svg>
                  {'\n                      + Insert Opt-Out Line\n                    '}
                </Button>
              </div>
              <div className={'token-bar'}>
                <Button type={'button'} className={'token-chip'} data-token={'{{firstName}}'}>
                  {'{{firstName}}'}
                </Button>
                <Button type={'button'} className={'token-chip'} data-token={'{{company}}'}>
                  {'{{company}}'}
                </Button>
                <Button type={'button'} className={'token-chip'} data-token={'{{city}}'}>
                  {'{{city}}'}
                </Button>
                <Button type={'button'} className={'token-chip'} data-token={'{{state}}'}>
                  {'{{state}}'}
                </Button>
                <Button type={'button'} className={'token-chip'} data-token={'{{locationPhrase}}'}>
                  {'{{locationPhrase}}'}
                </Button>
                <Button type={'button'} className={'token-chip'} data-token={'{{senderName}}'}>
                  {'{{senderName}}'}
                </Button>
                <Button type={'button'} className={'token-chip'} data-token={'{{businessName}}'}>
                  {'{{businessName}}'}
                </Button>
                <Button type={'button'} className={'token-chip'} data-token={'{{services}}'}>
                  {'{{services}}'}
                </Button>
                <Button type={'button'} className={'token-chip'} data-token={'{{legalName}}'}>
                  {'{{legalName}}'}
                </Button>
                <Button type={'button'} className={'token-chip'} data-token={'{{address}}'}>
                  {'{{address}}'}
                </Button>
              </div>
            </div>
            <div className={'form-group'}>
              <label htmlFor={'body'}>{'Message Body'}</label>
              <Textarea
                id={'body'}
                rows={11}
                style={{ fontFamily: 'var(--font-sans)', lineHeight: '1.6' }}
              />
              <p className={'hint'}>
                {'The existing webmail signature is preserved automatically by Private Email.'}
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
                  <path d={'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'}></path>
                  <circle cx={'12'} cy={'12'} r={'3'}></circle>
                </svg>
                {'\n                    Live Template Preview\n                  '}
              </h2>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span id={'templateComplianceStatus'} className={'status-pill ready'}>
                  {'✓ Compliant'}
                </span>
                <span className={'status-pill ready'}>{'Simulated Lead'}</span>
              </div>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              <strong>{'Recipient:'}</strong>
              {
                ' John Doe <johndoe@sampletrucking.com> · Sample Trucking LLC, Dallas, TX\n                '
              }
            </div>
            <div className={'message-preview-box'} id={'templateLivePreview'}>
              {'\n                  Select a template to view the live preview.\n                '}
            </div>
            <div className={'signature-box'}>
              <strong>{'Attached Signature (from Webmail):'}</strong>
              <br />
              <span>{'Mark Anthony | Fleet Core Logistics LLC | Dispatch & Carrier Services'}</span>
            </div>
          </div>
        </div>

        <div className={'panel'} style={{ marginTop: '20px' }}>
          <div className={'panel-head'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 className={'panel-title'}>
                <svg
                  width={'16'}
                  height={'16'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'2'}
                >
                  <rect x={'3'} y={'3'} width={'18'} height={'18'} rx={'2'} ry={'2'}></rect>
                  <line x1={'3'} y1={'9'} x2={'21'} y2={'9'}></line>
                  <line x1={'9'} y1={'21'} x2={'9'} y2={'9'}></line>
                </svg>
                {'\n                    Template Variants Library\n                  '}
              </h2>
              <span className={'status-pill ready'} id={'templateCountBadge'}>
                {'0 Variants'}
              </span>
            </div>
            <div className={'toolbar-search'} style={{ minWidth: '220px', maxWidth: '320px' }}>
              <svg viewBox={'0 0 24 24'} fill={'none'} stroke={'currentColor'} strokeWidth={'2'}>
                <circle cx={'11'} cy={'11'} r={'8'}></circle>
                <line x1={'21'} y1={'21'} x2={'16.65'} y2={'16.65'}></line>
              </svg>
              <Input
                id={'templateSearch'}
                type={'search'}
                placeholder={'Search template variants…'}
              />
            </div>
          </div>
          <div className={'table-container'} style={{ border: 'none', boxShadow: 'none' }}>
            <div className={'table-wrap'} style={{ maxHeight: '400px', minHeight: '200px' }}>
              <table>
                <thead>
                  <tr>
                    <th>{'Variant Name'}</th>
                    <th>{'Subject Line'}</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>{'Weight'}</th>
                    <th style={{ width: '100px', textAlign: 'center' }}>{'Status'}</th>
                    <th>{'Required Fields'}</th>
                    <th style={{ width: '170px', textAlign: 'right' }}>{'Actions'}</th>
                  </tr>
                </thead>
                <tbody id={'templatesTableBody'}></tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
