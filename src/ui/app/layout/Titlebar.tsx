import { CodeXml, FileText, Icon } from '../../design-system/icons';
export function Titlebar() {
  return (
    <>
      <header className={'app-titlebar'}>
        <div className={'titlebar-left'}>
          <div className={'window-dots'}>
            <span className={'window-dot close'}></span>
            <span className={'window-dot minimize'}></span>
            <span className={'window-dot maximize'}></span>
          </div>
          <a className={'titlebar-brand'} href={'#dashboard'}>
            <span className={'brand-monogram'} id={'brandMark'}>
              {'OD'}
            </span>
            <span id={'brandName'}>{'OUTREACH DESK'}</span>
            <span className={'brand-subtext'} id={'appVersion'}>
              {'Desktop'}
            </span>
          </a>
        </div>
        <div className={'titlebar-center'}>
          <div className={'titlebar-campaign-badge'}>
            <Icon icon={FileText} size={14} />
            <span id={'workbookName'}>{'No workbook imported.'}</span>
          </div>
        </div>
        <div className={'titlebar-right'}>
          <span className={'dev-pill'}>
            <Icon icon={CodeXml} size={12} />
            {'\n            Dev: Bukhtyar Haider\n          '}
          </span>
          <span className={'connection-pill'} id={'connection'}>
            <span className={'connection-dot'}></span>
            {'\n            Mailbox disconnected\n          '}
          </span>
        </div>
      </header>
    </>
  );
}
