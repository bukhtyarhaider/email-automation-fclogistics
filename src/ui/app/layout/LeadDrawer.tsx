import { Icon, Mail, Send, SquarePen, UserRound, X } from '../../design-system/icons';
import { Button } from '../../design-system/primitives';
export function LeadDrawer() {
  return (
    <>
      <div className={'drawer-backdrop'} id={'leadPreviewDrawer'}>
        <div className={'drawer-panel'}>
          <div className={'drawer-header'}>
            <div>
              <span className={'page-eyebrow'} style={{ fontSize: '9px' }} id={'leadDrawerEyebrow'}>
                {'LEAD DETAILS INSPECTOR'}
              </span>
              <h3 className={'drawer-title'} id={'previewTitle'}>
                {'Lead Details'}
              </h3>
            </div>
            <Button
              type={'button'}
              className={'drawer-close'}
              id={'closePreviewDrawer'}
              aria-label={'Close drawer'}
            >
              <Icon icon={X} size={20} />
            </Button>
          </div>

          <div className={'drawer-tabs'}>
            <Button type={'button'} className={'drawer-tab active'} id={'tabLeadDetails'}>
              <Icon icon={UserRound} size={14} />
              {'\n            Lead Details\n          '}
            </Button>
            <Button type={'button'} className={'drawer-tab'} id={'tabEmailDraft'}>
              <Icon icon={Mail} size={14} />
              {'\n            Email Preview\n          '}
            </Button>
          </div>
          <div className={'drawer-body'}>
            <div id={'leadDetailsSection'} className={'drawer-tab-pane active'}>
              <div id={'leadDetailsContainer'}>
                <p
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '13px',
                    textAlign: 'center',
                    padding: '30px',
                  }}
                >
                  {'Loading lead details...'}
                </p>
              </div>
            </div>

            <div id={'emailDraftSection'} className={'drawer-tab-pane'} style={{ display: 'none' }}>
              <p
                id={'previewTo'}
                style={{
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  marginBottom: '8px',
                  fontWeight: '500',
                }}
              ></p>
              <div id={'warnings'} className={'warning-callout'} hidden={true}></div>
              <div id={'previewBody'} className={'message-preview-box'}>
                {'\n              A personalized message will appear here.\n            '}
              </div>
              <div className={'signature-box'}>
                <span id={'signatureText'}>
                  {'Your existing webmail signature will appear below the message.'}
                </span>
              </div>
            </div>
          </div>
          <div className={'drawer-footer'}>
            <Button id={'prepare'} disabled={true}>
              <Icon icon={SquarePen} size={14} />
              {'\n            Fill webmail compose\n          '}
            </Button>
            <Button id={'sendOne'} className={'success'} disabled={true}>
              <Icon icon={Send} size={14} />
              {'\n            Send prepared message\n          '}
            </Button>
            <Button id={'release'} className={'secondary'} disabled={true}>
              {'Close compose'}
            </Button>
            <Button
              type={'button'}
              className={'secondary'}
              id={'closeDrawerBtn'}
              style={{ marginLeft: 'auto' }}
            >
              {'Close'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
