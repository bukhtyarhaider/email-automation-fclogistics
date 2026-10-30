import { Button, Input } from '../../design-system/primitives';
export function SuppressionPage() {
  return (
    <>
      {' '}
      <section className={'view-page'} id={'view-suppression'}>
        <div className={'page-header'}>
          <div>
            <p className={'page-eyebrow'}>{'COMPLIANCE & PROTECTION'}</p>
            <h1 className={'page-title'}>{'Do Not Contact'}</h1>
            <p className={'page-subtitle'}>
              {
                'Universal suppression list preventing accidental outreach to opt-outs, bounces, or competitors.'
              }
            </p>
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
                  <circle cx={'12'} cy={'12'} r={'10'}></circle>
                  <line x1={'4.93'} y1={'4.93'} x2={'19.07'} y2={'19.07'}></line>
                </svg>
                {'\n                    Add Suppressed Recipient\n                  '}
              </h2>
            </div>
            <div className={'form-group'}>
              <label htmlFor={'suppressEmail'}>{'Recipient Email Address'}</label>
              <Input id={'suppressEmail'} type={'email'} placeholder={'e.g. carrier@example.com'} />
            </div>
            <div className={'form-group'}>
              <label htmlFor={'suppressReason'}>{'Reason for Suppression'}</label>
              <Input
                id={'suppressReason'}
                placeholder={'e.g. Opt-out requested, permanent bounce, or competitor'}
              />
            </div>
            <div className={'form-actions'}>
              <Button id={'suppress'}>
                <svg
                  width={'14'}
                  height={'14'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'2'}
                >
                  <span></span>
                  <line x1={'12'} y1={'5'} x2={'12'} y2={'19'}></line>
                  <line x1={'5'} y1={'12'} x2={'19'} y2={'12'}></line>
                </svg>
                {'\n                    Add to suppression list\n                  '}
              </Button>
            </div>
            <p className={'hint'}>
              {
                'Suppression is durable across all imported workbooks and shared via the team coordinator.'
              }
            </p>
          </div>

          <div className={'panel'}>
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
                    <path d={'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'}></path>
                  </svg>
                  {'\n                      Suppressed Records\n                    '}
                </h2>
                <span className={'status-pill blocked'} id={'suppressionCountBadge'}>
                  {'0 suppressed'}
                </span>
              </div>
              <div className={'toolbar-search'} style={{ minWidth: '180px', maxWidth: '260px' }}>
                <svg viewBox={'0 0 24 24'} fill={'none'} stroke={'currentColor'} strokeWidth={'2'}>
                  <circle cx={'11'} cy={'11'} r={'8'}></circle>
                  <line x1={'21'} y1={'21'} x2={'16.65'} y2={'16.65'}></line>
                </svg>
                <Input
                  id={'suppressionSearch'}
                  type={'search'}
                  placeholder={'Filter suppressed list…'}
                />
              </div>
            </div>
            <ul id={'suppressionList'}></ul>
          </div>
        </div>
      </section>
    </>
  );
}
