import { Button, Input, Textarea, Select } from '../../design-system/primitives';
export function HistoryPage() {
  return (
    <>
      {' '}
      <section className={'view-page'} id={'view-activity'}>
        <div className={'page-header'}>
          <div>
            <p className={'page-eyebrow'}>{'SEND INSIGHTS & FOLLOW-UP'}</p>
            <h1 className={'page-title'}>{'Send History & Audit'}</h1>
            <p className={'page-subtitle'}>
              {
                'Find who received each email, inspect recorded open signals, and keep your follow-up notes together.'
              }
            </p>
          </div>
          <div className={'header-actions'}>
            <Button id={'historyRefresh'} className={'secondary'}>
              {'Refresh'}
            </Button>
            <a
              className={'button secondary'}
              id={'historyExportCsv'}
              href={'/api/export-history?scope=filtered&format=csv'}
            >
              {'Filtered CSV'}
            </a>
            <a
              className={'button secondary'}
              id={'historyExportJson'}
              href={'/api/export-history?scope=filtered'}
            >
              {'Filtered JSON'}
            </a>
            <a
              className={'button secondary'}
              id={'historyExportStats'}
              href={'/api/export-history?scope=stats&format=csv'}
            >
              {'Stats CSV'}
            </a>
            <a className={'button secondary'} href={'/api/export-history'}>
              {'Full history backup'}
            </a>
          </div>
        </div>
        <div id={'recovery'}></div>
        <p className={'hint history-scope'}>
          {
            "Statistics and filtered exports cover every matching record, across all pages. This PC's history only. Dates use UTC send confirmation, or attempt date when unconfirmed; timestamps display in your local timezone."
          }
        </p>
        <div id={'historyMetrics'} className={'history-metrics'} aria-live={'polite'}></div>
        <p id={'historyTimingNote'} className={'hint'}></p>
        <p className={'history-evidence-note'}>
          {
            '“Seen” is a recorded remote image request, which can include previews or automated scanners. No signal does not prove an email was unread. Replies and reasons are recorded through your manual review below.'
          }
        </p>
        <div className={'panel history-panel'}>
          <div className={'panel-head'}>
            <h2 className={'panel-title'}>{'Recorded sends & attempts'}</h2>
            <span id={'historyLoadStatus'} className={'hint'} role={'status'}></span>
          </div>
          <div className={'history-filters'}>
            <label className={'history-search'}>
              {'Search'}
              <Input
                id={'historySearch'}
                type={'search'}
                placeholder={'Recipient, subject, mailbox or note…'}
              />
            </label>
            <label>
              {'Send outcome'}
              <Select id={'historyStatus'}>
                <option value={''}>{'All outcomes'}</option>
                <option>{'Sent'}</option>
                <option>{'Uncertain'}</option>
                <option>{'Sending'}</option>
                <option>{'Not sent — manual review'}</option>
              </Select>
            </label>
            <label>
              {'Seen status'}
              <Select id={'historySeen'}>
                <option value={''}>{'All seen states'}</option>
                <option value={'seen'}>{'Seen · image signal'}</option>
                <option value={'no_signal'}>{'Tracked · no signal'}</option>
                <option value={'untracked'}>{'Tracking not enabled'}</option>
              </Select>
            </label>
            <label>
              {'Mailbox'}
              <Select id={'historyMailbox'}>
                <option value={''}>{'All mailboxes'}</option>
              </Select>
            </label>
            <label>
              {'Campaign'}
              <Select id={'historyCampaign'}>
                <option value={''}>{'All campaigns'}</option>
              </Select>
            </label>
            <label>
              {'Template'}
              <Select id={'historyTemplate'}>
                <option value={''}>{'All templates'}</option>
              </Select>
            </label>
            <label>
              {'Reply review'}
              <Select id={'historyReply'}>
                <option value={''}>{'All reply reviews'}</option>
                <option value={'unreviewed'}>{'Not reviewed'}</option>
                <option value={'replied'}>{'Replied · manual'}</option>
                <option value={'no_reply'}>{'No reply · manual'}</option>
              </Select>
            </label>
            <label>
              {'Sent from (UTC)'}
              <Input id={'historyFrom'} type={'date'} />
            </label>
            <label>
              {'Sent through (UTC)'}
              <Input id={'historyUntil'} type={'date'} />
            </label>
            <label>
              {'Sort'}
              <Select id={'historySort'}>
                <option value={'newest'}>{'Newest sends'}</option>
                <option value={'oldest'}>{'Oldest sends'}</option>
                <option value={'first_seen'}>{'Latest first seen'}</option>
                <option value={'last_seen'}>{'Latest seen activity'}</option>
                <option value={'fastest'}>{'Fastest first seen'}</option>
                <option value={'slowest'}>{'Slowest first seen'}</option>
              </Select>
            </label>
            <Button id={'historyClearFilters'} className={'secondary'}>
              {'Clear filters'}
            </Button>
          </div>
          <div className={'table-container'}>
            <div className={'table-wrap history-table-wrap'}>
              <table>
                <thead>
                  <tr>
                    <th>{'Sent / Recipient'}</th>
                    <th>{'Mailbox / Campaign'}</th>
                    <th>{'Subject / Template'}</th>
                    <th>{'Outcome / Reply review'}</th>
                    <th>{'Seen evidence'}</th>
                    <th>{'Send → first seen'}</th>
                    <th>{'Details'}</th>
                  </tr>
                </thead>
                <tbody id={'historyRows'}></tbody>
              </table>
            </div>
            <div className={'table-footer'}>
              <span id={'historyPageInfo'}>{'Loading attempts…'}</span>
              <div className={'pagination-controls'}>
                <Button id={'historyPrev'} className={'secondary'}>
                  {'Previous'}
                </Button>
                <Button id={'historyNext'} className={'secondary'}>
                  {'Next'}
                </Button>
              </div>
            </div>
          </div>
          <section id={'historyInspector'} className={'history-detail'} hidden={true}>
            <div className={'panel-head'}>
              <h2 className={'panel-title'}>{'Message & seen evidence'}</h2>
              <Button id={'historyCloseDetail'} className={'secondary'}>
                {'Close details'}
              </Button>
            </div>
            <Button id={'historyConversations'} className={'secondary'}>
              {'View captured conversations for this contact'}
            </Button>
            <pre id={'historyMessage'} className={'history-inspector'}></pre>
            <div className={'form-group'}>
              <label htmlFor={'historyReviewStatus'}>{'Reply status · manually reviewed'}</label>
              <Select id={'historyReviewStatus'}>
                <option value={'unreviewed'}>{'Not reviewed'}</option>
                <option value={'replied'}>{'Replied'}</option>
                <option value={'no_reply'}>{'Checked mailbox · no reply'}</option>
              </Select>
            </div>
            <div className={'form-group'}>
              <label htmlFor={'historyReviewNote'}>{'Follow-up / reason notes'}</label>
              <Textarea
                id={'historyReviewNote'}
                rows={3}
                maxLength={2000}
                placeholder={
                  "Record what you checked, a recipient's stated reason, or your next step."
                }
              />
              <p className={'hint'}>
                {
                  'Only record a reason when you have evidence. The app does not infer why someone did not reply.'
                }
              </p>
            </div>
            <Button id={'historySaveReview'}>{'Save review'}</Button>
            <span id={'historyReviewSaved'} className={'hint'} role={'status'}></span>
          </section>
        </div>
      </section>
    </>
  );
}
