import { Button, Input, Textarea, Select } from '../design-system/primitives';
export function ImportExperiment() {
  return (
    <>
      <main className={'experiment-shell'}>
        <header className={'experiment-header'}>
          <div>
            <p className={'page-eyebrow'}>{'OUTREACH DESK / EXPERIMENT 02'}</p>
            <h1>{'Repair and trace your lead imports'}</h1>
          </div>
          <span className={'experiment-badge'}>{'Isolated experiment'}</span>
        </header>
        <p className={'experiment-intro'}>
          {
            'Review mappings, save repairs to experiment copies, and inspect carrier identities and source history. Original data and sending settings stay unchanged.'
          }
        </p>
        <p className={'hint'}>
          <a href={'/conversations'}>{'Open experiment 03: carrier conversations →'}</a>
        </p>
        <section className={'panel'}>
          <div className={'experiment-form'}>
            <label htmlFor={'reviewCampaign'}>
              {'Campaign'}
              <Select id={'reviewCampaign'}>
                <option value={''}>{'Loading campaigns…'}</option>
              </Select>
            </label>
            <Button id={'reviewLoad'} disabled={true}>
              {'Review saved mapping'}
            </Button>
          </div>
          <p id={'reviewStatus'} className={'hint'} role={'status'} aria-live={'polite'}>
            {'Loading campaigns…'}
          </p>
          <p id={'reviewError'} className={'experiment-error'} role={'alert'} hidden={true}></p>
        </section>
        <section id={'reviewResults'} hidden={true}>
          <div className={'experiment-result-heading'}>
            <h2 id={'reviewHeading'}>{'Saved mapping'}</h2>
            <span id={'reviewChange'} className={'hint'}></span>
          </div>
          <div id={'reviewMetrics'} className={'experiment-metrics'}></div>
          <p id={'reviewBasis'} className={'hint'}></p>
          <p id={'reviewIdentity'} className={'hint'}></p>
          <div className={'experiment-layout'}>
            <section className={'panel experiment-mapping'}>
              <h2>{'Try a mapping'}</h2>
              <p className={'hint'}>
                {
                  'Use exact sheet names, field names and Excel columns. Example: {"Leads":{"email":"B","status":"C"}}. Status must point to the actual outreach status column.'
                }
              </p>
              <label htmlFor={'reviewMapping'}>{'Proposed mapping (JSON)'}</label>
              <Textarea id={'reviewMapping'} rows={10} spellCheck={'false'} />
              <label htmlFor={'reviewStatusColumns'}>{'Add missing Status headers (JSON)'}</label>
              <Textarea
                id={'reviewStatusColumns'}
                rows={3}
                spellCheck={'false'}
                defaultValue={'{}'}
              />
              <p className={'hint'}>
                {
                  'Example: {"Leads":"D"}. The column must be entirely unused. Only experiment copies receive new headers; existing cells are never overwritten.'
                }
              </p>
              <div className={'experiment-buttons'}>
                <Button id={'reviewPreview'}>{'Preview changes'}</Button>
                <Button id={'reviewReset'} className={'secondary'}>
                  {'Restore saved mapping'}
                </Button>
              </div>
              <p className={'hint'}>
                {
                  'Mapping drafts stay temporary until you explicitly save an experiment revision. Original files stay unchanged.'
                }
              </p>
            </section>
            <section className={'experiment-sheets'}>
              <h2>{'Worksheet evidence'}</h2>
              <p className={'hint'}>
                {
                  'Email-column candidates are syntax counts, not verified addresses. Mixed layouts may need separate source sheets. Counts alone are not a safe reason to remap a whole worksheet.'
                }
              </p>
              <div id={'reviewSheets'}></div>
            </section>
          </div>
        </section>
        <section id={'repairPanel'} className={'panel experiment-repair'} hidden={true}>
          <h2>{'Save this reviewed repair'}</h2>
          <p className={'hint'}>
            {
              'Save the exact preview as a new experiment revision. Each revision keeps its original workbook, repaired copy, mapping and source details. This does not update the normal app.'
            }
          </p>
          <div className={'experiment-source-fields'}>
            <label htmlFor={'repairSource'}>
              {'Where did these leads come from?'}
              <Input
                id={'repairSource'}
                maxLength={200}
                placeholder={'Export, supplier, or existing contact list'}
              />
            </label>
            <label htmlFor={'repairAcquired'}>
              {'Source acquisition date (optional)'}
              <Input id={'repairAcquired'} type={'date'} />
            </label>
            <label htmlFor={'repairPermission'}>
              {'Contact permission stated by operator'}
              <Select id={'repairPermission'}>
                <option value={'unknown'}>{'Unknown / not established'}</option>
                <option value={'requested_contact'}>{'Carrier requested contact'}</option>
                <option value={'existing_relationship'}>{'Existing relationship'}</option>
              </Select>
            </label>
          </div>
          <label className={'check'}>
            <Input id={'repairConfirm'} type={'checkbox'} />
            {'Save to the experiment workspace only.'}
          </label>
          <Button id={'repairApply'} disabled={true}>
            {'Save experiment revision'}
          </Button>
          <p id={'repairPreviewNote'} className={'hint'}>
            {'Preview your proposal before saving.'}
          </p>
        </section>
        <section id={'workspacePanel'} className={'panel experiment-workspace'} hidden={true}>
          <div className={'experiment-result-heading'}>
            <h2>{'Saved experiment revisions'}</h2>
            <Button id={'workspaceRefresh'} className={'secondary'}>
              {'Refresh revisions'}
            </Button>
          </div>
          <p id={'workspaceNote'} className={'hint'} role={'status'}></p>
          <div className={'experiment-form'}>
            <label htmlFor={'workspaceRevision'}>
              {'Revision'}
              <Select id={'workspaceRevision'}></Select>
            </label>
            <Button id={'workspaceDraft'} className={'secondary'}>
              {'Use revision as draft'}
            </Button>
            <Button id={'workspaceRestore'} className={'secondary'}>
              {'Restore selected revision'}
            </Button>
          </div>
          <p className={'hint'}>
            {
              'Restore changes the active experiment revision. Newer revisions, carrier IDs and contact protections are retained.'
            }
          </p>
          <div id={'workspaceDownloads'} className={'experiment-buttons'} hidden={true}>
            <a id={'workspaceWorking'} className={'button secondary'}>
              {'Download workbook copy'}
            </a>
            <a id={'workspaceOriginal'} className={'button secondary'}>
              {'Download original snapshot'}
            </a>
            <a id={'workspaceMapping'} className={'button secondary'}>
              {'Download mapping & provenance'}
            </a>
          </div>
          <p className={'hint'}>
            {
              'Workbook copies retain the source field layout. The saved mapping controls how rows are read; only explicitly added Status headers change workbook cells.'
            }
          </p>
          <div id={'workspaceIdentity'} className={'experiment-identity-summary'}></div>
          <p className={'hint'}>
            {
              'USDOT grouping is based on source data and has not been verified with FMCSA. Conflicts and layout issues stay in review. No sending eligibility is granted here.'
            }
          </p>
          <div className={'experiment-form'}>
            <label htmlFor={'workspaceSearch'}>
              {'Find a carrier, email, USDOT, or carrier ID'}
              <Input id={'workspaceSearch'} type={'search'} />
            </label>
            <Button id={'workspaceFind'} className={'secondary'}>
              {'Find records'}
            </Button>
          </div>
          <div className={'experiment-scroll'}>
            <table>
              <thead>
                <tr>
                  <th>{'Carrier / contact'}</th>
                  <th>{'Identity'}</th>
                  <th>{'Source evidence'}</th>
                  <th>{'Contact protections'}</th>
                </tr>
              </thead>
              <tbody id={'workspaceRows'}></tbody>
            </table>
          </div>
          <div className={'experiment-result-heading'}>
            <p id={'workspacePage'} className={'hint'}></p>
            <div className={'experiment-buttons'}>
              <Button id={'workspacePrev'} className={'secondary'}>
                {'Previous'}
              </Button>
              <Button id={'workspaceNext'} className={'secondary'}>
                {'Next'}
              </Button>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
