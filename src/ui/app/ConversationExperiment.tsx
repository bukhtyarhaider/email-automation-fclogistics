import { Button, Input, Textarea, Select } from '../design-system/primitives';
export function ConversationExperiment() {
  return (
    <>
      <main className={'experiment-shell'}>
        <header className={'experiment-header'}>
          <div>
            <p className={'page-eyebrow'}>{'OUTREACH DESK / EXPERIMENT 03'}</p>
            <h1>{'Carrier conversations'}</h1>
          </div>
          <span className={'experiment-badge'}>{'Read-only mailbox access'}</span>
        </header>
        <nav className={'reply-nav'}>
          <a href={'/'}>{'Import review & repairs'}</a>
          <a href={'/conversations'} aria-current={'page'}>
            {'Conversations'}
          </a>
        </nav>
        <p className={'experiment-intro'}>
          {
            'Bring replies from your configured mailboxes into one experiment inbox. Match exact threads, review uncertain messages, and keep opt-outs visible. This experiment cannot send email.'
          }
        </p>
        <p id={'replyStatus'} className={'hint'} role={'status'} aria-live={'polite'}>
          {'Loading conversations…'}
        </p>
        <p id={'replyError'} className={'experiment-error'} role={'alert'} hidden={true}></p>
        <section className={'panel reply-tools'}>
          <div className={'experiment-result-heading'}>
            <h2>{'Capture replies'}</h2>
            <div className={'experiment-buttons'}>
              <Button id={'replyHistory'} className={'secondary'}>
                {'Load local sent history'}
              </Button>
              <Button id={'replyScan'} disabled={true}>
                {'Check configured mailboxes'}
              </Button>
              <Button id={'replyDemo'} className={'secondary'}>
                {'Load sample inbox'}
              </Button>
            </div>
          </div>
          <p id={'replyCaptureNote'} className={'hint'}></p>
          <p id={'replyCoverage'} className={'hint'}></p>
          <div id={'replyMonitor'}></div>
          <details>
            <summary>{'Connect live mailboxes'}</summary>
            <p className={'hint'}>
              {
                'Live access is off by default. Configure the separate experiment flags and credential references using .env.experiment.example, then restart with that environment file. This inbox reads Inbox/Sent without marking, moving or deleting messages. Backfill and storage coverage are shown for each account. A shared inbox across multiple PCs and salesperson ownership are later experiments.'
              }
            </p>
            <Button id={'replyBackfill'} className={'secondary'}>
              {'Restart reply backfill'}
            </Button>
            <p className={'hint'}>
              {
                'Restarts reply cursors only. Captured messages, reviews and opt-out protections are retained.'
              }
            </p>
          </details>
          <details>
            <summary>{'Import one exported reply (.eml)'}</summary>
            <div className={'reply-import-form'}>
              <label htmlFor={'replyImportAccount'}>
                {'Receiving/sending mailbox'}
                <Select id={'replyImportAccount'}></Select>
              </label>
              <label htmlFor={'replyEml'}>
                {'Exported message'}
                <Input id={'replyEml'} type={'file'} accept={'.eml,message/rfc822'} />
              </label>
              <Button id={'replyImport'} className={'secondary'}>
                {'Import EML'}
              </Button>
            </div>
            <p className={'hint'}>
              {
                'Use an authorized exported message, up to 2 MB. The mailbox must have confirmed local sent history. Unknown contacts/references are not retained. Imported messages receive the same matching and review rules as IMAP capture.'
              }
            </p>
          </details>
        </section>
        <p id={'replyProtection'} className={'reply-protection'} role={'status'} hidden={true}></p>
        <div id={'replyMetrics'} className={'experiment-metrics'}></div>
        <p id={'replyMetricNote'} className={'hint'}></p>
        <section className={'panel'}>
          <div className={'reply-filters'}>
            <label htmlFor={'replyMode'}>
              {'Data'}
              <Select id={'replyMode'}>
                <option value={'real'}>{'Real / imported replies'}</option>
                <option value={'demo'}>{'Sample replies only'}</option>
              </Select>
            </label>
            <label htmlFor={'replyMailbox'}>
              {'Mailbox'}
              <Select id={'replyMailbox'}>
                <option value={''}>{'All mailboxes'}</option>
              </Select>
            </label>
            <label htmlFor={'replyCategory'}>
              {'Category'}
              <Select id={'replyCategory'}>
                <option value={''}>{'All categories'}</option>
                <option value={'needs_match'}>{'Needs conversation match'}</option>
                <option value={'ignored'}>{'Ignored review items'}</option>
              </Select>
            </label>
            <label htmlFor={'replySearch'}>
              {'Search'}
              <Input
                id={'replySearch'}
                type={'search'}
                placeholder={'Contact, subject or mailbox'}
              />
            </label>
            <Button id={'replyRefresh'} className={'secondary'}>
              {'Refresh inbox'}
            </Button>
          </div>
          <div className={'experiment-scroll'}>
            <table>
              <thead>
                <tr>
                  <th>{'Carrier / contact'}</th>
                  <th>{'Subject / mailbox'}</th>
                  <th>{'Category'}</th>
                  <th>{'Matching / evidence'}</th>
                  <th>{'Open'}</th>
                </tr>
              </thead>
              <tbody id={'replyRows'}></tbody>
            </table>
          </div>
          <div className={'experiment-result-heading'}>
            <p id={'replyPage'} className={'hint'}></p>
            <div className={'experiment-buttons'}>
              <Button id={'replyPrev'} className={'secondary'}>
                {'Previous'}
              </Button>
              <Button id={'replyNext'} className={'secondary'}>
                {'Next'}
              </Button>
            </div>
          </div>
        </section>
        <section id={'replyInspector'} className={'panel'} hidden={true}>
          <div className={'experiment-result-heading'}>
            <h2 id={'replyThreadTitle'}>{'Conversation'}</h2>
            <div className={'experiment-buttons'}>
              <Button id={'replyThreadRefresh'} className={'secondary'}>
                {'Refresh thread'}
              </Button>
              <Button id={'replyClose'} className={'secondary'}>
                {'Close thread'}
              </Button>
            </div>
          </div>
          <p className={'hint'}>
            {
              'Bodies are shown as plain text. Quoted content is omitted where recognized; inspect the original mailbox for complete context. Header dates are sender-reported; capture times are separate evidence.'
            }
          </p>
          <div id={'replyThread'}></div>
          <section id={'replyReviewPanel'} className={'reply-review'} hidden={true}>
            <h3>{'Review selected message'}</h3>
            <p id={'replyReviewEvidence'} className={'hint'}></p>
            <label htmlFor={'replyReviewCategory'}>
              {'Category'}
              <Select id={'replyReviewCategory'}></Select>
            </label>
            <div id={'replyMatchPanel'} hidden={true}>
              <label htmlFor={'replyLink'}>
                {'Choose conversation'}
                <Select id={'replyLink'}></Select>
              </label>
              <label className={'check'}>
                <Input id={'replyLinkConfirm'} type={'checkbox'} />
                {'I checked the original evidence and confirm this manual link.'}
              </label>
              <p className={'hint'}>
                {
                  'A manual link requires a note explaining the evidence. Subject similarity alone is insufficient.'
                }
              </p>
            </div>
            <label htmlFor={'replyReviewNote'}>
              {'Review / evidence note'}
              <Textarea id={'replyReviewNote'} rows={4} maxLength={2000} />
            </label>
            <div className={'experiment-buttons'}>
              <Button id={'replyReviewSave'}>{'Save reply review'}</Button>
              <Button id={'replyIgnore'} className={'secondary'} hidden={true}>
                {'Ignore review item'}
              </Button>
              <Button id={'replyUnignore'} className={'secondary'} hidden={true}>
                {'Return to review'}
              </Button>
            </div>
            <p className={'hint'}>
              {
                'Drafts stay while navigating this page. Reload discards unsaved drafts. Changing a category or ignoring a review item never clears an existing opt-out protection.'
              }
            </p>
          </section>
        </section>
      </main>
    </>
  );
}
