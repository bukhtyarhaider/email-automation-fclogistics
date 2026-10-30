import { Button, Input, Textarea, Select, Dialog } from '../../design-system/primitives';
export function ConversationsPage() {
  return (
    <>
      <section className={'view-page mailroom-page'} id={'view-conversations'}>
        <header className={'page-header mailroom-header'}>
          <div>
            <p className={'page-eyebrow'}>{'CARRIER EMAIL'}</p>
            <h1 className={'page-title'}>{'Conversations'}</h1>
          </div>
          <label className={'mailroom-mailbox'}>
            <span className={'sr-only'}>{'Mailbox'}</span>
            <Select id={'replyMailbox'}>
              <option value={''}>{'All mailboxes'}</option>
            </Select>
          </label>
          <label className={'mailroom-search'}>
            <span className={'sr-only'}>{'Search conversations'}</span>
            <Input
              id={'replySearch'}
              type={'search'}
              placeholder={'Search conversations, senders, or keywords…'}
            />
          </label>
        </header>
        <div className={'mailroom-toolbar'}>
          <nav className={'mailroom-tabs'} aria-label={'Conversation queues'}>
            <Button type={'button'} data-mailroom-work={'active'} aria-pressed={'false'}>
              {'Active '}
              <span id={'mailroomActiveCount'}>{'0'}</span>
            </Button>
            <Button type={'button'} data-mailroom-work={'needs_reply'} aria-pressed={'true'}>
              {'Needs reply '}
              <span id={'mailroomNeedsCount'}>{'0'}</span>
            </Button>
            <Button type={'button'} data-mailroom-work={'all'} aria-pressed={'false'}>
              {'All '}
              <span id={'mailroomAllCount'}>{'0'}</span>
            </Button>
            <Button type={'button'} data-mailroom-work={'no_reply'} aria-pressed={'false'}>
              {'Waiting '}
              <span id={'mailroomWaitingCount'}>{'0'}</span>
            </Button>
            <Button type={'button'} data-mailroom-work={'in_review'} aria-pressed={'false'}>
              {'In review '}
              <span id={'mailroomReviewCount'}>{'0'}</span>
            </Button>
          </nav>
          <div className={'mailroom-tools'}>
            <Button id={'replyScan'} className={'secondary'} disabled={true}>
              {'Scan previous replies'}
            </Button>
            <Button id={'replyStopCapture'} className={'secondary'} disabled={true} hidden={true}>
              {'Stop scan'}
            </Button>
            <Button id={'mailroomFiltersOpen'} className={'secondary'}>
              {'Filters'}
            </Button>
            <Button id={'mailroomToolsOpen'} className={'secondary'}>
              {'Mailbox tools'}
            </Button>
          </div>
        </div>
        <p
          id={'replyScanProgress'}
          className={'mailroom-scan-note'}
          role={'status'}
          aria-live={'polite'}
        ></p>
        <p id={'replyError'} className={'experiment-error'} role={'alert'} hidden={true}></p>
        <div className={'mailroom-workspace'} id={'mailroomWorkspace'} data-thread-open={'false'}>
          <aside className={'mailroom-list-pane'} aria-label={'Carrier conversations'}>
            <div
              id={'mailroomList'}
              className={'mailroom-list'}
              aria-label={'Conversation results'}
            ></div>
            <div className={'mailroom-pagination'}>
              <span id={'replyPage'} className={'hint'}></span>
              <Button id={'replyPrev'} className={'secondary'} aria-label={'Previous page'}>
                {'Previous'}
              </Button>
              <Button id={'replyNext'} className={'secondary'} aria-label={'Next page'}>
                {'Next'}
              </Button>
            </div>
          </aside>
          <div className={'mailroom-reader-stage'}>
            <div id={'mailroomEmpty'} className={'mailroom-empty'}>
              <h2>{'Choose a conversation'}</h2>
              <p>{'Read a carrier’s message and write your reply here.'}</p>
              <Button className={'secondary'} id={'mailroomEmptyTools'}>
                {'Set up mailbox capture'}
              </Button>
            </div>
            <p id={'mailroomLoading'} className={'mailroom-empty'} role={'status'} hidden={true}>
              {'Opening conversation…'}
            </p>
            <section id={'replyInspector'} className={'mailroom-reader'} hidden={true}>
              <header className={'mailroom-subject-bar'}>
                <Button id={'replyClose'} className={'secondary mailroom-back'}>
                  {'Back to inbox'}
                </Button>
                <h2 id={'replyThreadTitle'}>{'Conversation'}</h2>
                <Button id={'replyThreadRefresh'} className={'secondary'}>
                  {'Refresh'}
                </Button>
                <Button id={'mailroomDetailsOpen'} className={'secondary'}>
                  {'Details'}
                </Button>
              </header>
              <div id={'carrierRecord'} className={'carrier-record'} hidden={true}>
                <div>
                  <strong id={'carrierRecordLabel'}></strong>
                  <p id={'carrierHistoryNote'} className={'hint'}></p>
                </div>
                <Button id={'carrierManage'} className={'secondary'}>
                  {'Carrier status'}
                </Button>
              </div>
              <p id={'mailroomFilterNote'} className={'hint'} hidden={true}></p>
              <div id={'replyThread'} className={'mailroom-thread'}></div>
              <p id={'mailroomHold'} className={'mailroom-hold'} role={'status'} hidden={true}></p>
              <Button id={'mailroomResolve'} className={'secondary'} hidden={true}>
                {'Review conversation match'}
              </Button>
              <section id={'replyAssistant'} className={'reply-assistant'} hidden={true}>
                <p id={'assistantStatus'} className={'hint'} role={'status'}></p>
                <p
                  id={'assistantError'}
                  className={'experiment-error'}
                  role={'alert'}
                  hidden={true}
                ></p>
                <div className={'assistant-draft'}>
                  <div className={'mailroom-compose-heading'}>
                    <h3>
                      {'Your reply '}
                      <span>{'(draft)'}</span>
                    </h3>
                    <p id={'assistantDraftBasis'} className={'hint'}></p>
                    <Button id={'mailroomCarrierDetails'} className={'secondary'}>
                      {'Details'}
                    </Button>
                  </div>
                  <label htmlFor={'assistantBody'}>
                    <span className={'sr-only'}>{'Write in your own words'}</span>
                    <Textarea
                      id={'assistantBody'}
                      rows={7}
                      maxLength={12000}
                      placeholder={'Write a reply in your own words…'}
                    />
                  </label>
                  <p
                    id={'assistantDraftState'}
                    className={'hint'}
                    role={'status'}
                    aria-live={'polite'}
                  ></p>
                  <div className={'experiment-buttons mailroom-compose-actions'}>
                    <Button id={'assistantSaveDraft'} className={'secondary'}>
                      {'Save draft'}
                    </Button>
                    <Button id={'assistantSuggest'} className={'secondary'}>
                      {'Help with wording'}
                    </Button>{' '}
                    <details id={'assistantSavedReplies'} className={'mailroom-saved-lines'}>
                      <summary>{'Saved lines'}</summary>
                      <div className={'mailroom-lines-popover'}>
                        <label htmlFor={'assistantSavedSearch'}>
                          {'Find saved replies'}
                          <Input
                            id={'assistantSavedSearch'}
                            type={'search'}
                            placeholder={'Search name, purpose or wording'}
                          />
                        </label>
                        <div id={'assistantSavedCards'} className={'saved-reply-list'}></div>
                        <Button id={'mailroomManageLines'} className={'secondary'}>
                          {'Manage saved replies'}
                        </Button>
                      </div>
                    </details>
                    <Button
                      id={'assistantReviewOpen'}
                      className={'primary mailroom-review-primary'}
                    >
                      {'Review reply'}
                    </Button>
                  </div>
                  <Select
                    id={'assistantTemplate'}
                    hidden={true}
                    aria-hidden={'true'}
                    tabIndex={-1}
                  ></Select>
                  <section
                    id={'assistantWordingPreview'}
                    className={'wording-preview'}
                    hidden={true}
                  >
                    <h4 id={'assistantWordingName'}></h4>
                    <pre id={'assistantWordingText'}></pre>
                    <p className={'hint'}>
                      {'Preview only. Choose where to put it, then edit it freely.'}
                    </p>
                    <div className={'experiment-buttons'}>
                      <Button id={'assistantInsertWording'} className={'secondary'}>
                        {'Insert at cursor'}
                      </Button>
                      <Button id={'assistantReplaceWording'} className={'secondary'}>
                        {'Replace reply'}
                      </Button>
                      <Button id={'assistantDismissWording'} className={'secondary'}>
                        {'Close preview'}
                      </Button>
                    </div>
                  </section>
                  <div
                    id={'mailroomApprovedActions'}
                    className={'experiment-buttons'}
                    hidden={true}
                  >
                    <Button id={'assistantCopy'} className={'secondary'}>
                      {'Copy approved reply'}
                    </Button>
                    <a
                      id={'assistantMailbox'}
                      className={'button secondary'}
                      target={'_blank'}
                      rel={'noopener noreferrer'}
                      hidden={true}
                    >
                      {'Open my mailbox'}
                    </a>
                  </div>
                  <p className={'hint'}>
                    {
                      'You send from your existing mailbox. Use native Reply and paste above your signature.'
                    }
                  </p>
                  <details id={'mailroomSentReport'} hidden={true}>
                    <summary>{'After sending in your mailbox'}</summary>
                    <label>
                      {'Mailbox action evidence'}
                      <Input
                        id={'assistantSentNote'}
                        maxLength={2000}
                        placeholder={'Record what you checked in your mailbox'}
                      />
                    </label>
                    <label className={'check'}>
                      <Input id={'assistantSentConfirm'} type={'checkbox'} />
                      {'I sent this approved reply myself in the correct mailbox/thread.'}
                    </label>
                    <Button id={'assistantReportSent'} className={'secondary'}>
                      {'Record my mailbox action'}
                    </Button>
                    <p className={'hint'}>
                      {'Your report, a matching Sent copy and delivery evidence remain separate.'}
                    </p>
                  </details>
                  <details>
                    <summary>{'Draft options & history'}</summary>
                    <div className={'experiment-buttons'}>
                      <Button id={'assistantNewDraft'} className={'secondary'}>
                        {'New draft'}
                      </Button>
                      <Button id={'assistantCancelDraft'} className={'secondary'}>
                        {'Cancel saved draft / approval'}
                      </Button>
                      <Button id={'assistantSaveAsWording'} className={'secondary'}>
                        {'Save this wording for reuse'}
                      </Button>
                    </div>
                    <div id={'assistantHistory'}></div>
                  </details>
                </div>
              </section>
            </section>
          </div>
        </div>
        <Dialog
          id={'mailroomFiltersDialog'}
          className={'mailroom-dialog'}
          aria-label={'Conversation filters'}
        >
          <div className={'mailroom-dialog-heading'}>
            <h2>{'Conversation filters'}</h2>
            <Button className={'secondary'} data-close-mailroom={'mailroomFiltersDialog'}>
              {'Close filters'}
            </Button>
          </div>
          <div className={'reply-filters'}>
            <label>
              {'View'}
              <Select id={'replyGrouping'}>
                <option value={'carriers'}>{'Carriers with full email history'}</option>
                <option value={'threads'}>{'Individual tool threads'}</option>
              </Select>
            </label>
            <label hidden={true} htmlFor={'replyMode'}>
              {'Data'}
              <Select id={'replyMode'}>
                <option value={'real'}>{'Real replies'}</option>
                <option value={'demo'}>{'Sample replies'}</option>
              </Select>
            </label>
            <label htmlFor={'replyWork'}>
              {'Work queue'}
              <Select id={'replyWork'} defaultValue={'needs_reply'}>
                <option value={'active'}>{'Active conversations'}</option>
                <option value={'in_review'}>{'Carriers in review'}</option>
                <option value={'signed'}>{'Signed carriers'}</option>
                <option value={'closed'}>{'Closed carriers'}</option>
                <option value={'needs_reply'}>{'Needs my reply'}</option>
                <option value={'all'}>{'All tool-sent conversations'}</option>
                <option value={'replied'}>{'Carriers who replied'}</option>
                <option value={'no_reply'}>{'No captured carrier reply'}</option>
                <option value={'follow_up'}>{'Follow-up eligible'}</option>
                <option value={'unread'}>{'New / unread'}</option>
                <option value={'approval'}>{'Needs draft approval'}</option>
                <option value={'interested'}>{'Interested'}</option>
                <option value={'positive'}>{'Positive engagement'}</option>
                <option value={'negative'}>{'Negative / opt-out'}</option>
                <option value={'missing_details'}>{'Missing carrier details'}</option>
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
            <Button id={'replyRefresh'} className={'secondary'}>
              {'Refresh inbox'}
            </Button>
          </div>
          <p className={'hint'}>
            {
              'Queues use captured local evidence. Waiting means no captured human reply, rather than proof of silence.'
            }
          </p>
        </Dialog>
        <Dialog
          id={'mailroomToolsDialog'}
          className={'mailroom-dialog mailroom-wide'}
          aria-label={'Mailbox tools'}
        >
          <div className={'mailroom-dialog-heading'}>
            <h2>{'Mailbox tools'}</h2>
            <Button className={'secondary'} data-close-mailroom={'mailroomToolsDialog'}>
              {'Close mailbox tools'}
            </Button>
          </div>
          <p id={'replyStatus'} className={'hint'} role={'status'} aria-live={'polite'}>
            {'Loading…'}
          </p>{' '}
          <details id={'replyCaptureTools'} className={'panel reply-tools'}>
            <summary id={'replyCaptureSummary'}>{'Capture & mailbox setup'}</summary>
            <div className={'experiment-result-heading'}>
              <h2>{'Capture replies'}</h2>
              <div className={'experiment-buttons'}>
                <Button id={'replyHistory'} className={'secondary'}>
                  {'Load local sent history'}
                </Button>
                <Button hidden={true} id={'replyDemo'} className={'secondary'}>
                  {'Load sample inbox'}
                </Button>
              </div>
            </div>
            <p id={'replyCaptureNote'} className={'hint'}></p>
            <p id={'replyCoverage'} className={'hint'}></p>
            <div id={'replyMonitor'}></div>
            <details id={'replyConfigPanel'}>
              <summary>{'Read-only mailbox capture settings'}</summary>
              <p className={'hint'}>
                {
                  'Choose mailboxes you are authorized to read. Passwords/tokens stay in this PC’s .env file; enter their environment-variable names here. TLS is required. Captured coverage and errors remain visible below.'
                }
              </p>
              <div className={'reply-config-grid'}>
                <label>
                  {'Capture enabled'}
                  <Input id={'replyConfigEnabled'} type={'checkbox'} />
                </label>
                <label>
                  {'Check automatically'}
                  <Input id={'replyConfigAuto'} type={'checkbox'} />
                </label>
                <label className={'check'}>
                  <Input id={'replyConfigAll'} type={'checkbox'} />
                  {'Read all available history'}
                </label>
                <label className={'check'}>
                  <Input id={'replyConfigAllFolders'} type={'checkbox'} />
                  {'Include archive and other available folders (excluding Drafts)'}
                </label>
                <label>
                  {'Automatic pages per folder/check'}
                  <Input
                    id={'replyConfigPages'}
                    type={'number'}
                    min={'1'}
                    max={'10'}
                    defaultValue={'5'}
                  />
                </label>
                <label>
                  {'Automatic sync from'}
                  <Input id={'replyConfigSince'} type={'date'} />
                </label>
                <label>
                  {'Messages per page'}
                  <Input
                    id={'replyConfigBatch'}
                    type={'number'}
                    min={'1'}
                    max={'100'}
                    defaultValue={'50'}
                  />
                </label>
              </div>
              <div className={'reply-config-reuse'}>
                <label>
                  {'Existing mailbox credentials'}
                  <Select id={'replyExistingMailbox'}>
                    <option value={''}>{'Choose a saved mailbox setup…'}</option>
                  </Select>
                </label>
                <Button id={'replyUseExistingMailbox'} className={'secondary'} type={'button'}>
                  {'Use existing mailbox setup'}
                </Button>
                <p id={'replyExistingMailboxNote'} className={'hint'}>
                  {
                    'Reuses environment-variable references only. Save and authorize read-only capture separately.'
                  }
                </p>
              </div>
              <div id={'replyConfigMailboxes'}></div>
              <Button id={'replyConfigAdd'} className={'secondary'}>
                {'Add mailbox'}
              </Button>
              <label className={'check'}>
                <Input id={'replyConfigConfirm'} type={'checkbox'} />
                {'I authorize read-only access to these configured mailboxes.'}
              </label>
              <Button id={'replyConfigSave'}>{'Save capture settings'}</Button>
              <p id={'replyConfigNote'} className={'hint'}></p>
              <Button id={'replyBackfill'} className={'secondary'}>
                {'Restart reply backfill'}
              </Button>
              <p className={'hint'}>
                {
                  'Retains captured messages, reviews and opt-out protections. Folder cursors are restarted only.'
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
                  'Use an authorized exported message, up to 2 MB. The mailbox needs a confirmed tool-sent email; imported contacts alone are excluded. Unknown contacts/references are not retained. Imported messages receive the same matching and review rules as IMAP capture.'
                }
              </p>
            </details>
          </details>
          <p
            id={'replyProtection'}
            className={'reply-protection'}
            role={'status'}
            hidden={true}
          ></p>
          <p id={'replyProtectionDelivery'} className={'hint'} role={'status'}></p>
          <div id={'replyMetrics'} className={'experiment-metrics'}></div>
          <p id={'replyMetricNote'} className={'hint'}></p>
        </Dialog>
        <Dialog
          id={'mailroomDetailsDialog'}
          className={'mailroom-dialog mailroom-wide'}
          aria-label={'Conversation details'}
        >
          <div className={'mailroom-dialog-heading'}>
            <h2>{'Conversation details'}</h2>
            <Button className={'secondary'} data-close-mailroom={'mailroomDetailsDialog'}>
              {'Close details'}
            </Button>
          </div>
          <section id={'carrierStatusPanel'} className={'carrier-status-panel'} hidden={true}>
            <h3>{'Carrier workflow'}</h3>
            <label>
              {'Status'}
              <Select id={'carrierStage'}>
                <option value={'waiting'}>{'Waiting for a response'}</option>
                <option value={'in_review'}>{'In review'}</option>
                <option value={'active'}>{'Active conversation'}</option>
                <option value={'follow_up'}>{'Follow up'}</option>
                <option value={'signed'}>{'Signed'}</option>
                <option value={'closed'}>{'Closed'}</option>
              </Select>
            </label>
            <label>
              {'Follow-up date'}
              <Input id={'carrierFollowUpAt'} type={'datetime-local'} />
            </label>
            <label>
              {'Status / follow-up note'}
              <Textarea id={'carrierStatusNote'} maxLength={2000} rows={2} />
            </label>
            <div className={'experiment-buttons'}>
              <Button id={'carrierStatusSave'} className={'secondary'}>
                {'Save carrier status'}
              </Button>
              <Button id={'carrierStatusReload'} className={'secondary'} hidden={true}>
                {'Reload saved status'}
              </Button>
              <Button id={'carrierSeen'} className={'secondary'}>
                {'Mark history read'}
              </Button>
            </div>
            <p id={'carrierStatusResult'} className={'hint'} role={'status'}></p>
            <p className={'hint'}>
              {
                'Status labels and dates are for your workflow. They do not send email or clear opt-outs, uncertain sends or thread review requirements.'
              }
            </p>
          </section>
          <p id={'mailroomReplyHistory'} className={'hint'}></p>
          <details>
            <summary>{'Full thread & message evidence'}</summary>
            <div id={'mailroomThreadHistory'}></div>
          </details>
          <div className={'experiment-buttons'}>
            <Button id={'replyMarkRead'} className={'secondary'}>
              {'Mark read'}
            </Button>
            <Button id={'replyMarkUnread'} className={'secondary'}>
              {'Mark unread'}
            </Button>
            <Button id={'replyStartThread'} className={'secondary'} hidden={true}>
              {'Create conversation'}
            </Button>
          </div>
          <div id={'assistantIntent'} className={'carrier-evidence'}></div>{' '}
          <details id={'assistantCarrierDetails'}>
            <summary>{'Carrier details & source evidence'}</summary>
            <p className={'hint'}>
              {
                'Extracted values are suggestions. Confirm each value against its matched carrier message. A reviewed email statement does not verify phone ownership or carrier authority.'
              }
            </p>
            <div id={'assistantDetails'}></div>
            <label className={'check'}>
              <Input id={'assistantDetailsConfirm'} type={'checkbox'} />
              {'I reviewed the carrier-stated values and their source messages.'}
            </label>
            <label>
              {'Detail review note'}
              <Input id={'assistantDetailsNote'} maxLength={2000} />
            </label>
            <Button id={'assistantConfirmDetails'} className={'secondary'}>
              {'Confirm selected details'}
            </Button>
            <details>
              <summary>{'Confirm a value the extractor missed'}</summary>
              <label>
                {'Field'}
                <Select id={'assistantManualField'}></Select>
              </label>
              <label>
                {'Carrier-stated value'}
                <Input id={'assistantManualValue'} maxLength={240} />
              </label>
              <label>
                {'Source carrier message'}
                <Select id={'assistantManualSource'}></Select>
              </label>
              <label>
                {'Exact quote containing the value'}
                <Textarea id={'assistantManualQuote'} rows={2} maxLength={1000} />
              </label>
              <Button id={'assistantManualConfirm'} className={'secondary'}>
                {'Confirm cited value'}
              </Button>
            </details>
          </details>{' '}
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
        </Dialog>
        <Dialog
          id={'mailroomLibraryDialog'}
          className={'mailroom-dialog mailroom-wide'}
          aria-label={'Saved replies'}
        >
          <div className={'mailroom-dialog-heading'}>
            <h2>{'Saved replies'}</h2>
            <Button className={'secondary'} data-close-mailroom={'mailroomLibraryDialog'}>
              {'Close saved replies'}
            </Button>
          </div>{' '}
          <details className={'panel reply-library'}>
            <summary>{'Manage saved replies & follow-up rules'}</summary>
            <p className={'hint'}>
              {
                'Saved wording is optional. Preview it inside a conversation before using it. Initial outreach templates are separate.'
              }
            </p>
            <div className={'reply-library-grid'}>
              <div>
                <label htmlFor={'replyLibrarySearch'}>
                  {'Find saved replies'}
                  <Input
                    id={'replyLibrarySearch'}
                    type={'search'}
                    placeholder={'Search name or wording'}
                  />
                </label>
                <div id={'replyLibraryCards'} className={'saved-reply-list'}></div>
              </div>
              <div>
                <label>
                  {'Saved reply'}
                  <Select id={'replyLibrarySelect'}></Select>
                </label>
                <Button id={'replyLibraryNew'} className={'secondary'}>
                  {'New template'}
                </Button>
                <label>
                  {'Name'}
                  <Input id={'replyLibraryName'} maxLength={100} />
                </label>
                <label>
                  {'Use for'}
                  <Select id={'replyLibraryCategory'}>
                    <option value={'interested'}>{'Interested'}</option>
                    <option value={'positive'}>{'Positive response'}</option>
                    <option value={'pricing'}>{'Pricing question'}</option>
                    <option value={'how_it_works'}>{'How it works'}</option>
                    <option value={'neutral'}>{'Clarify / neutral'}</option>
                    <option value={'negative'}>{'Acknowledge decline'}</option>
                    <option value={'follow_up'}>{'No-response follow-up'}</option>
                  </Select>
                </label>
                <label>
                  {'Body'}
                  <Textarea id={'replyLibraryBody'} rows={8} maxLength={12000} />
                </label>
                <p id={'replyLibraryVariables'} className={'hint'}></p>
                <label className={'check'}>
                  <Input id={'replyLibraryActive'} type={'checkbox'} defaultChecked={true} />
                  {'Active template'}
                </label>
                <div id={'replyLibraryFields'} className={'template-field-buttons'}></div>
                <div className={'experiment-buttons'}>
                  <Button id={'replyLibrarySave'}>{'Save wording'}</Button>
                  <Button id={'replyLibraryCopy'} className={'secondary'}>
                    {'Save as new copy'}
                  </Button>
                </div>
                <p id={'replyLibraryVersion'} className={'hint'}></p>
              </div>
            </div>
            <div className={'reply-config-grid'}>
              <label>
                {'Wait days before suggesting a follow-up'}
                <Input
                  id={'replyFollowDays'}
                  type={'number'}
                  min={'1'}
                  max={'30'}
                  defaultValue={'3'}
                />
              </label>
              <label>
                {'Maximum reviewed follow-ups'}
                <Input
                  id={'replyFollowMax'}
                  type={'number'}
                  min={'1'}
                  max={'3'}
                  defaultValue={'1'}
                />
              </label>
              <Button id={'replyFollowSave'} className={'secondary'}>
                {'Save follow-up rules'}
              </Button>
            </div>
            <p
              id={'replyLibraryStatus'}
              className={'hint'}
              role={'status'}
              aria-live={'polite'}
            ></p>
          </details>
        </Dialog>
        <Dialog
          id={'mailroomApprovalDialog'}
          className={'mailroom-dialog'}
          aria-label={'Review and approve reply'}
        >
          <div className={'mailroom-dialog-heading'}>
            <h2>{'Review this reply'}</h2>
            <Button className={'secondary'} data-close-mailroom={'mailroomApprovalDialog'}>
              {'Close review'}
            </Button>
          </div>
          <p id={'mailroomApprovalRecipient'} className={'hint'}></p>
          <pre id={'mailroomApprovalBody'}></pre>
          <p
            id={'mailroomApprovalError'}
            className={'experiment-error'}
            role={'alert'}
            hidden={true}
          ></p>{' '}
          <details id={'assistantReview'}>
            <summary>{'Review & approve this reply'}</summary>
            <p className={'hint'}>
              {
                'Check the exact text above and the sending account/recipient. Changes require fresh approval.'
              }
            </p>
            <label htmlFor={'assistantApprovalNote'}>
              {'Approval note'}
              <Input
                id={'assistantApprovalNote'}
                maxLength={2000}
                placeholder={'What you reviewed'}
              />
            </label>
            <label className={'check'}>
              <Input id={'assistantApproveConfirm'} type={'checkbox'} />
              {'I reviewed this exact text, recipient, sending account and message evidence.'}
            </label>
            <Button id={'assistantApprove'}>{'Approve this exact draft'}</Button>
          </details>
        </Dialog>
      </section>
    </>
  );
}
