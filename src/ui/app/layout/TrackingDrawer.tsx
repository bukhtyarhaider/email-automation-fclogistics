import { Button } from '../../design-system/primitives';
export function TrackingDrawer() {
  return (
    <>
      <div className={'drawer-backdrop'} id={'trackingDrawer'}>
        <div className={'drawer-panel'}>
          <div className={'drawer-header'}>
            <div>
              <span
                className={'page-eyebrow'}
                style={{ fontSize: '9px' }}
                id={'trackingDrawerEyebrow'}
              >
                {'DELIVERY & EVIDENCE INSPECTOR'}
              </span>
              <h3 className={'drawer-title'} id={'trackingDrawerTitle'}>
                {'Tracking Details'}
              </h3>
            </div>
            <Button
              type={'button'}
              className={'drawer-close'}
              id={'closeTrackingDrawer'}
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
            <Button type={'button'} className={'drawer-tab active'} id={'tabTrackingOverview'}>
              <svg
                width={'14'}
                height={'14'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2'}
              >
                <circle cx={'12'} cy={'12'} r={'10'}></circle>
                <polyline points={'12 6 12 12 16 14'}></polyline>
              </svg>
              {'\n            Overview & Timeline\n          '}
            </Button>
            <Button type={'button'} className={'drawer-tab'} id={'tabTrackingSpecs'}>
              <svg
                width={'14'}
                height={'14'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2'}
              >
                <path d={'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'}></path>
                <polyline points={'14 2 14 8 20 8'}></polyline>
                <line x1={'16'} y1={'13'} x2={'8'} y2={'13'}></line>
                <line x1={'16'} y1={'17'} x2={'8'} y2={'17'}></line>
                <polyline points={'10 9 9 9 8 9'}></polyline>
              </svg>
              {'\n            Technical Specs\n          '}
            </Button>
            <Button type={'button'} className={'drawer-tab'} id={'tabTrackingRaw'}>
              <svg
                width={'14'}
                height={'14'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2'}
              >
                <polyline points={'16 18 22 12 16 6'}></polyline>
                <polyline points={'8 6 2 12 8 18'}></polyline>
              </svg>
              {'\n            Raw JSON\n          '}
            </Button>
          </div>
          <div className={'drawer-body'} id={'trackingDetail'}></div>
          <div className={'drawer-footer'}>
            <Button type={'button'} className={'secondary'} id={'trackingCopyBtn'}>
              <svg
                width={'14'}
                height={'14'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'2'}
              >
                <rect x={'9'} y={'9'} width={'13'} height={'13'} rx={'2'} ry={'2'}></rect>
                <path d={'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'}></path>
              </svg>
              {'\n            Copy Summary\n          '}
            </Button>
            <Button
              type={'button'}
              className={'secondary'}
              id={'closeTrackingDrawerBtn'}
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
