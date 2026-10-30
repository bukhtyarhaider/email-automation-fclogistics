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
              <svg
                width={'20'}
                height={'20'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2'}
              >
                <line x1={'18'} y1={'6'} x2={'6'} y2={'18'}></line>
                <line x1={'6'} y1={'6'} x2={'18'} y2={'18'}></line>
              </svg>
            </Button>
          </div>

          <div className={'drawer-tabs'}>
            <Button type={'button'} className={'drawer-tab active'} id={'tabLeadDetails'}>
              <svg
                width={'14'}
                height={'14'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2'}
              >
                <path d={'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'}></path>
                <circle cx={'12'} cy={'7'} r={'4'}></circle>
              </svg>
              {'\n            Lead Details\n          '}
            </Button>
            <Button type={'button'} className={'drawer-tab'} id={'tabEmailDraft'}>
              <svg
                width={'14'}
                height={'14'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2'}
              >
                <path
                  d={'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z'}
                ></path>
                <polyline points={'22,6 12,13 2,6'}></polyline>
              </svg>
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
              <svg
                width={'14'}
                height={'14'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2'}
              >
                <path d={'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'}></path>
                <path d={'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'}></path>
              </svg>
              {'\n            Fill webmail compose\n          '}
            </Button>
            <Button id={'sendOne'} className={'success'} disabled={true}>
              <svg
                width={'14'}
                height={'14'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2'}
              >
                <line x1={'22'} y1={'2'} x2={'11'} y2={'13'}></line>
                <polygon points={'22 2 15 22 11 13 2 9 22 2'}></polygon>
              </svg>
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
