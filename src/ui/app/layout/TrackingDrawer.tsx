import { Clock, CodeXml, Copy, FileText, Icon, X } from '../../design-system/icons';
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
              <Icon icon={X} size={20} />
            </Button>
          </div>

          <div className={'drawer-tabs'}>
            <Button type={'button'} className={'drawer-tab active'} id={'tabTrackingOverview'}>
              <Icon icon={Clock} size={14} />
              {'\n            Overview & Timeline\n          '}
            </Button>
            <Button type={'button'} className={'drawer-tab'} id={'tabTrackingSpecs'}>
              <Icon icon={FileText} size={14} />
              {'\n            Technical Specs\n          '}
            </Button>
            <Button type={'button'} className={'drawer-tab'} id={'tabTrackingRaw'}>
              <Icon icon={CodeXml} size={14} />
              {'\n            Raw JSON\n          '}
            </Button>
          </div>
          <div className={'drawer-body'} id={'trackingDetail'}></div>
          <div className={'drawer-footer'}>
            <Button type={'button'} className={'secondary'} id={'trackingCopyBtn'}>
              <Icon icon={Copy} size={14} />
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
