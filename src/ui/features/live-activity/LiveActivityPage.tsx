import {
  Activity,
  CircleAlert,
  Download,
  Icon,
  LayoutGrid,
  Pause,
  Search,
  Terminal,
  Trash2,
} from '../../design-system/icons';
import { Button, Input } from '../../design-system/primitives';
export function LiveActivityPage() {
  return (
    <>
      <section className={'view-page'} id={'view-live-activity'}>
        <div className={'page-header'}>
          <div>
            <p className={'page-eyebrow'}>{'SYSTEM TELEMETRY & OPERATIONS'}</p>
            <h1 className={'page-title'}>{'Live System Activity'}</h1>
            <p className={'page-subtitle'}>
              {
                'Real-time operational stream, automation telemetry, mailbox pacing logs, and diagnostics.'
              }
            </p>
          </div>
          <div className={'header-actions'}>
            <span className={'live-stream-badge'} id={'liveStreamStatusBadge'}>
              <span className={'live-beacon'}></span>
              <span id={'liveStreamStatusText'}>{'STREAMING LIVE'}</span>
            </span>
            <Button
              id={'livePauseToggleBtn'}
              className={'secondary'}
              title={'Freeze or resume incoming event auto-updates'}
            >
              <Icon icon={Pause} size={14} />
              <span id={'livePauseBtnText'}>{'Pause Feed'}</span>
            </Button>
            <a
              className={'button secondary'}
              href={'/api/export-events?format=json'}
              id={'liveExportJsonBtn'}
              download={'system-activity.json'}
              title={'Download entire event log as JSON'}
            >
              <Icon icon={Download} size={14} />
              {'\n                  Export Log (JSON)\n                '}
            </a>
            <a
              className={'button secondary'}
              href={'/api/export-events?format=txt'}
              id={'liveExportTxtBtn'}
              download={'system-activity.log'}
              title={'Download text log'}
            >
              {'\n                  .TXT\n                '}
            </a>
            <Button
              id={'liveClearEventsBtn'}
              className={'secondary'}
              title={'Clear events console view'}
            >
              <Icon icon={Trash2} size={14} />
              {'\n                  Clear Screen\n                '}
            </Button>
          </div>
        </div>

        <div className={'live-telemetry-grid'}>
          <div className={'stat-card live-card live-card-engine'} id={'liveEngineCard'}>
            <div className={'stat-label'}>
              <span>{'Queue Engine'}</span>
              <span className={'status-badge'} id={'liveRunnerBadge'}>
                {'Stopped'}
              </span>
            </div>
            <div className={'live-card-body'}>
              <div className={'live-card-value'} id={'liveRunnerStateText'}>
                {'Idle'}
              </div>
              <div className={'live-card-subtext'} id={'liveRunnerMsgText'}>
                {'No active outreach loop.'}
              </div>
            </div>
            <div id={'liveCountdownWrapper'} className={'live-countdown-box'} hidden={true}>
              <div className={'live-countdown-header'}>
                <span id={'liveCountdownLabel'}>{'Next send check in'}</span>
                <strong id={'liveCountdownTimer'}>{'--:--'}</strong>
              </div>
              <div className={'live-countdown-bar-wrap'}>
                <div className={'live-countdown-bar'} id={'liveCountdownBar'}></div>
              </div>
            </div>
          </div>

          <div className={'stat-card live-card live-card-session'}>
            <div className={'stat-label'}>
              <span>{'Mailbox Session'}</span>
              <span className={'connection-pill'} id={'liveMailboxPill'}>
                <span className={'connection-dot'}></span>
                <span id={'liveMailboxStatusText'}>{'Disconnected'}</span>
              </span>
            </div>
            <div className={'live-card-body'}>
              <div className={'live-card-value mono-truncate'} id={'liveMailboxAccountText'}>
                {'--'}
              </div>
              <div className={'live-card-subtext'} id={'liveCoordinatorStatusText'}>
                {'Coordinator: Standalone'}
              </div>
            </div>
          </div>

          <div className={'stat-card live-card live-card-quota'}>
            <div className={'stat-label'}>
              <span>{'Pacing Quotas'}</span>
              <span className={'live-quota-pill'} id={'liveQuotaPill'}>
                {'Paced'}
              </span>
            </div>
            <div className={'live-card-body'}>
              <div className={'live-quota-rows'}>
                <div className={'live-quota-row'}>
                  <div className={'live-quota-header'}>
                    <span>{'Rolling 1 Hour:'}</span>
                    <strong id={'liveHourQuotaText'}>{'-- / --'}</strong>
                  </div>
                  <div className={'quota-progress-track'}>
                    <div
                      className={'quota-progress-fill'}
                      id={'liveHourQuotaFill'}
                      style={{ width: '100%' }}
                    ></div>
                  </div>
                </div>
                <div className={'live-quota-row'}>
                  <div className={'live-quota-header'}>
                    <span>{'Rolling 24 Hours:'}</span>
                    <strong id={'liveDayQuotaText'}>{'-- / --'}</strong>
                  </div>
                  <div className={'quota-progress-track'}>
                    <div
                      className={'quota-progress-fill'}
                      id={'liveDayQuotaFill'}
                      style={{ width: '100%' }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={'stat-card live-card live-card-counts'}>
            <div className={'stat-label'}>
              <span>{'Activity Metrics'}</span>
              <span id={'liveTotalCountBadge'} className={'count-chip total'}>
                {'0 events'}
              </span>
            </div>
            <div className={'live-card-body'}>
              <div className={'live-metrics-row'}>
                <div className={'mini-metric'}>
                  <span className={'mini-label'}>{'Dispatches'}</span>
                  <strong className={'mini-val text-green'} id={'liveMetricSent'}>
                    {'0'}
                  </strong>
                </div>
                <div className={'mini-metric'}>
                  <span className={'mini-label'}>{'Pacing Delays'}</span>
                  <strong className={'mini-val text-blue'} id={'liveMetricPacing'}>
                    {'0'}
                  </strong>
                </div>
                <div className={'mini-metric'}>
                  <span className={'mini-label'}>{'System / Config'}</span>
                  <strong className={'mini-val text-purple'} id={'liveMetricSystem'}>
                    {'0'}
                  </strong>
                </div>
                <div className={'mini-metric'}>
                  <span className={'mini-label'}>{'Alerts / Errors'}</span>
                  <strong className={'mini-val text-red'} id={'liveMetricError'}>
                    {'0'}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={'panel live-activity-panel'}>
          <div className={'panel-head'} style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <h2 className={'panel-title'}>
                <Icon icon={Activity} size={16} />
                {'\n                    Live Operations Stream\n                  '}
              </h2>
              <span className={'live-indicator-chip'} id={'liveStreamCounter'}>
                {'0 events'}
              </span>
            </div>
            <div className={'stream-view-toggle-group'}>
              <Button
                type={'button'}
                className={'view-mode-btn active'}
                id={'btnModeVisual'}
                title={'Formatted Visual Cards'}
              >
                <Icon icon={LayoutGrid} size={13} />
                {'\n                    Visual\n                  '}
              </Button>
              <Button
                type={'button'}
                className={'view-mode-btn'}
                id={'btnModeTerminal'}
                title={'Monospace Terminal Console'}
              >
                <Icon icon={Terminal} size={13} />
                {'\n                    Terminal\n                  '}
              </Button>
            </div>
          </div>

          <div className={'live-stream-toolbar'}>
            <div className={'live-category-tabs'} id={'liveCategoryTabs'} role={'tablist'}>
              <Button
                type={'button'}
                className={'cat-tab active'}
                data-kind={'all'}
                role={'tab'}
                aria-selected={true}
              >
                {'All Events '}
                <span className={'tab-chip'} id={'tabChipAll'}>
                  {'0'}
                </span>
              </Button>
              <Button
                type={'button'}
                className={'cat-tab'}
                data-kind={'send'}
                role={'tab'}
                aria-selected={false}
              >
                {'Sends '}
                <span className={'tab-chip green'} id={'tabChipSend'}>
                  {'0'}
                </span>
              </Button>
              <Button
                type={'button'}
                className={'cat-tab'}
                data-kind={'pause'}
                role={'tab'}
                aria-selected={false}
              >
                {'Pacing '}
                <span className={'tab-chip blue'} id={'tabChipPause'}>
                  {'0'}
                </span>
              </Button>
              <Button
                type={'button'}
                className={'cat-tab'}
                data-kind={'system'}
                role={'tab'}
                aria-selected={false}
              >
                {'System '}
                <span className={'tab-chip purple'} id={'tabChipSystem'}>
                  {'0'}
                </span>
              </Button>
              <Button
                type={'button'}
                className={'cat-tab'}
                data-kind={'error'}
                role={'tab'}
                aria-selected={false}
              >
                {'Errors '}
                <span className={'tab-chip red'} id={'tabChipError'}>
                  {'0'}
                </span>
              </Button>
            </div>
            <div className={'live-toolbar-right'}>
              <div className={'toolbar-search live-search-box'}>
                <Icon icon={Search} />
                <Input
                  id={'liveSearchInput'}
                  type={'search'}
                  placeholder={'Search live events by keyword or company…'}
                />
              </div>
              <label
                className={'live-autoscroll-toggle'}
                title={'Automatically keep the stream scrolled to the newest event'}
              >
                <Input type={'checkbox'} id={'liveAutoScrollCheck'} defaultChecked={true} />
                <span className={'toggle-slider'}></span>
                <span className={'toggle-label'}>{'Auto-scroll'}</span>
              </label>
            </div>
          </div>

          <div id={'liveVisualFeedContainer'} className={'live-visual-feed-wrap'}>
            <ol id={'liveVisualEventsList'} className={'live-visual-events'}></ol>
            <div id={'liveVisualEmptyState'} className={'live-empty-state'} hidden={true}>
              <Icon icon={CircleAlert} size={32} />
              <p>{'No activity events match your current filter or search criteria.'}</p>
            </div>
          </div>

          <div id={'liveTerminalContainer'} className={'live-terminal-wrap'} hidden={true}>
            <div className={'terminal-titlebar'}>
              <div className={'terminal-dots'}>
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span className={'terminal-title'}>
                {'fc-logistics telemetry terminal · live output'}
              </span>
              <Button
                id={'liveTerminalCopyBtn'}
                className={'terminal-copy-btn'}
                title={'Copy raw console output'}
              >
                {'Copy all'}
              </Button>
            </div>
            <pre className={'terminal-output'} id={'liveTerminalOutput'}></pre>
          </div>

          <div className={'live-console-footer'}>
            <div className={'console-footer-left'}>
              <span className={'pulse-indicator'}></span>
              <span id={'liveConsoleStatusText'}>{'Live telemetry · polling local state'}</span>
            </div>
            <div className={'console-footer-right'}>
              <span id={'liveFilteredCountText'}>{'Showing all events'}</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
