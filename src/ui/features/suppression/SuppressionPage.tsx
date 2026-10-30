import { Ban, Icon, Plus, Search, Shield } from '../../design-system/icons';
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
                <Icon icon={Ban} size={16} />
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
                <Icon icon={Plus} size={14} />
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
                  <Icon icon={Shield} size={16} />
                  {'\n                      Suppressed Records\n                    '}
                </h2>
                <span className={'status-pill blocked'} id={'suppressionCountBadge'}>
                  {'0 suppressed'}
                </span>
              </div>
              <div className={'toolbar-search'} style={{ minWidth: '180px', maxWidth: '260px' }}>
                <Icon icon={Search} />
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
