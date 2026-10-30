import {
  Activity,
  Ban,
  ChartLine,
  Clock,
  FileInput,
  Folder,
  Icon,
  LayoutGrid,
  MessagesSquare,
  NotebookText,
  Settings,
  SquarePen,
  Users,
} from '../../design-system/icons';
export function Sidebar() {
  return (
    <>
      <aside className={'app-sidebar'}>
        <nav className={'sidebar-nav'}>
          <div className={'nav-category'}>{'Workspace'}</div>
          <a className={'nav-link active'} href={'#dashboard'} data-view={'dashboard'}>
            <Icon icon={LayoutGrid} />
            <span>{'Dashboard'}</span>
          </a>
          <a className={'nav-link'} href={'#leads'} data-view={'leads'}>
            <Icon icon={Users} />
            <span>{'Leads Workspace'}</span>
          </a>
          <a className={'nav-link'} href={'#campaigns'} data-view={'campaigns'}>
            <Icon icon={Folder} />
            <span>{'Campaigns & Sheets'}</span>
          </a>
          <a className={'nav-link'} href={'#imports'} data-view={'imports'}>
            <Icon icon={FileInput} />
            <span>{'Import review & repairs'}</span>
          </a>
          <a className={'nav-link'} href={'#conversations'} data-view={'conversations'}>
            <Icon icon={MessagesSquare} />
            <span>{'Carrier conversations'}</span>
          </a>
          <a className={'nav-link'} href={'#templates'} data-view={'templates'}>
            <Icon icon={SquarePen} />
            <span>{'Templates Studio'}</span>
          </a>
          <div className={'nav-category'}>{'Operations'}</div>
          <a
            className={'nav-link'}
            href={'#live-activity'}
            data-view={'live-activity'}
            id={'navLiveActivity'}
          >
            <Icon icon={Activity} />
            <span>{'Live System Activity'}</span>
            <span
              className={'live-status-dot'}
              id={'liveNavDot'}
              title={'Live telemetry active'}
            ></span>
          </a>
          <a className={'nav-link'} href={'#activity'} data-view={'activity'}>
            <Icon icon={Clock} />
            <span>{'Send History & Audit'}</span>
          </a>
          <a className={'nav-link'} href={'#tracking'} data-view={'tracking'}>
            <Icon icon={ChartLine} />
            <span>{'Email Tracking'}</span>
          </a>
          <a className={'nav-link'} href={'#suppression'} data-view={'suppression'}>
            <Icon icon={Ban} />
            <span>{'Do Not Contact'}</span>
          </a>
          <a className={'nav-link'} href={'#catalog'} data-view={'catalog'}>
            <Icon icon={NotebookText} />
            <span>{'Version Catalog'}</span>
          </a>
          <a className={'nav-link'} href={'#settings'} data-view={'settings'}>
            <Icon icon={Settings} />
            <span>{'Mailbox & Settings'}</span>
          </a>
        </nav>
        <div className={'sidebar-bottom'}>
          <div className={'sidebar-foot'}>
            <div className={'profile-avatar'}>{'FC'}</div>
            <div className={'profile-info'}>
              <span className={'profile-name'} id={'profileName'}>
                {'My Mailbox'}
              </span>
              <span className={'profile-role'}>{'Private Email · Local Active'}</span>
            </div>
          </div>
          <div className={'sidebar-developer'}>
            <span className={'dev-tag'}>{'Developer'}</span>
            <span className={'dev-name'}>{'Bukhtyar Haider'}</span>
          </div>
        </div>
      </aside>
    </>
  );
}
