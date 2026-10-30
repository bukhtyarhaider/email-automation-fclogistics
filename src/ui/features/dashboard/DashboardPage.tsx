import {
  Activity,
  Check,
  CircleAlert,
  Clock,
  Icon,
  Layers,
  Mail,
  Play,
  Send,
  Square,
  UsersRound,
} from '../../design-system/icons';
import { Button, Input, Select, Progress } from '../../design-system/primitives';
export function DashboardPage() {
  return (
    <>
      <section className={'view-page active'} id={'view-dashboard'}>
        <div className={'page-header'}>
          <div>
            <p className={'page-eyebrow'}>{'MISSION CONTROL'}</p>
            <h1 className={'page-title'}>{'Operational Desk'}</h1>
            <p className={'page-subtitle'}>
              {'Webmail submission status, queue pacing, and continuous outreach.'}
            </p>
          </div>
          <div className={'header-actions'}>
            <Button id={'start'}>
              <Icon icon={Play} size={14} />
              {'\n                  Start continuous outreach\n                '}
            </Button>
            <Button id={'stop'} className={'danger'} hidden={true}>
              <Icon icon={Square} size={14} />
              {'\n                  Stop outreach\n                '}
            </Button>
          </div>
        </div>

        <div className={'stats-grid'} aria-label={'Campaign summary'}>
          <div className={'stat-card total'}>
            <div className={'stat-label'}>
              {'\n                  Total Leads\n                  '}
              <Icon icon={UsersRound} size={14} />
            </div>
            <div className={'stat-value'} id={'total'}>
              {'0'}
            </div>
            <div className={'stat-hint'}>{'In active campaign workbook'}</div>
          </div>
          <div className={'stat-card ready'}>
            <div className={'stat-label'}>
              {'\n                  Ready For Outreach\n                  '}
              <Icon icon={Check} size={14} />
            </div>
            <div className={'stat-value'} id={'ready'}>
              {'0'}
            </div>
            <div className={'stat-hint'}>{'Active, verified & eligible'}</div>
          </div>
          <div className={'stat-card excluded'}>
            <div className={'stat-label'}>
              {'\n                  Excluded From Sending\n                  '}
              <Icon icon={CircleAlert} size={14} />
            </div>
            <div className={'stat-value'} id={'excluded'}>
              {'0'}
            </div>
            <div className={'stat-hint'}>{'Duplicates, bounces or inactive'}</div>
          </div>
          <div className={'stat-card sent'}>
            <div className={'stat-label'}>
              {'\n                  Sent By This Tool\n                  '}
              <Icon icon={Send} size={14} />
            </div>
            <div className={'stat-value'} id={'sent'}>
              {'0'}
            </div>
            <div className={'stat-hint'}>{'Confirmed webmail submissions'}</div>
          </div>
        </div>
        <section className={'panel carrier-attention'}>
          <div className={'panel-head'}>
            <h2 className={'panel-title'}>{'Carrier messages needing attention'}</h2>
            <a className={'button secondary'} href={'#conversations'}>
              {'Open carrier conversations'}
            </a>
          </div>
          <p id={'carrierAttentionStatus'} className={'hint'} role={'status'}>
            {'Loading carrier activity…'}
          </p>
          <div id={'carrierAttentionMetrics'} className={'carrier-attention-metrics'}></div>
          <div id={'carrierAttentionRows'}></div>
        </section>

        <div className={'dashboard-grid'}>
          <div>
            <div className={'runner-card'}>
              <div className={'runner-header'}>
                <div className={'runner-status-group'}>
                  <span className={'status-badge'} id={'jobStatus'}>
                    {'Idle'}
                  </span>
                  <strong style={{ color: '#fff', fontSize: '14px' }}>{'Outreach Runner'}</strong>
                </div>
                <span
                  id={'nextSend'}
                  style={{ fontSize: '12px', color: 'var(--accent-amber)', fontWeight: '500' }}
                ></span>
              </div>
              <p className={'runner-message'} id={'jobMessage'}>
                {'Ready to initiate dispatch queue.'}
              </p>
              <Progress id={'progress'} value={'0'} max={'1'}></Progress>
              <div className={'quota-banner'}>
                <Icon icon={Clock} size={16} />
                <span id={'quota'}>{'Checking rolling hour and daily allowances…'}</span>
              </div>
              <div className={'runner-meta'}>
                <span>{'Single recipient per message'}</span>
                <span>{'Direct webmail injection via Playwright'}</span>
              </div>
            </div>

            <div className={'panel'}>
              <div className={'panel-head'}>
                <h2 className={'panel-title'}>
                  <Icon icon={Layers} size={16} />
                  {'\n                      Manual Batch Dispatch\n                    '}
                </h2>
                <span className={'status-pill ready'} id={'selectedCount'}>
                  {'0 selected'}
                </span>
              </div>
              <p
                style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '14px' }}
              >
                {'\n                    Select leads from the '}
                <a
                  href={'#leads'}
                  style={{ color: 'var(--accent-red)', textDecoration: 'underline' }}
                >
                  {'Leads Workspace'}
                </a>
                {', then dispatch them here with human-paced intervals.\n                  '}
              </p>
              <div className={'form-group'}>
                <label className={'check'}>
                  <Input id={'randomTemplates'} type={'checkbox'} defaultChecked={true} />
                  {
                    '\n                      Randomly select from enabled, matching templates\n                    '
                  }
                </label>
              </div>
              <div className={'form-actions'}>
                <Button id={'batch'} className={'secondary'}>
                  <Icon icon={Send} size={14} />
                  {'\n                      Send selected leads\n                    '}
                </Button>
                <a href={'#leads'} className={'button secondary'}>
                  {'Browse leads table'}
                </a>
              </div>
            </div>
          </div>

          <div>
            <div className={'panel'}>
              <div className={'panel-head'}>
                <h2 className={'panel-title'}>
                  <Icon icon={Mail} size={16} />
                  {'\n                      Mailbox Connection\n                    '}
                </h2>
              </div>
              <div className={'form-group'}>
                <label htmlFor={'profileSelect'}>{'Active Mailbox Profile'}</label>
                <Select id={'profileSelect'}></Select>
              </div>
              <div className={'form-group'}>
                <label htmlFor={'password'}>{'Password (optional for a saved session)'}</label>
                <Input
                  id={'password'}
                  type={'password'}
                  autoComplete={'off'}
                  placeholder={'Or sign in directly in the browser'}
                />
              </div>
              <div className={'form-actions'}>
                <Button id={'connect'}>{'Connect mailbox'}</Button>
                <Button id={'resume'} className={'secondary'} hidden={true}>
                  {'Continue sign-in'}
                </Button>
                <Button id={'disconnect'} className={'danger'} hidden={true}>
                  {'Disconnect'}
                </Button>
              </div>
              <p
                className={'hint'}
                id={'browserSessionStatus'}
                role={'status'}
                aria-live={'polite'}
              >
                {'Connect your mailbox.'}
              </p>
              <p className={'hint'}>
                {
                  'Choose the connection method in Mailbox & Settings. Passwords entered here are passed only to the local tool and the mailbox login form. Browser cookies and login sessions are saved on this device. Disconnect keeps them for later.'
                }
              </p>
            </div>

            <div className={'panel'}>
              <div className={'panel-head'}>
                <h2 className={'panel-title'}>
                  <Icon icon={Activity} size={16} />
                  {'\n                      Live System Activity\n                    '}
                </h2>
                <a
                  href={'#live-activity'}
                  className={'button secondary'}
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                >
                  {'Open live page →'}
                </a>
              </div>
              <ol id={'events'} className={'events-stream'}></ol>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
