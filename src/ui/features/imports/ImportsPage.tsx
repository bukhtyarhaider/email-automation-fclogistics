import { Button, Input, Textarea, Select } from '../../design-system/primitives';
export function ImportsPage() {
  return (
    <>
      <section className={'view-page'} id={'view-imports'}>
        <div className={'page-header'}>
          <div>
            <p className={'page-eyebrow'}>{'LEAD DATA'}</p>
            <h1 className={'page-title'}>{'Review & repair imports'}</h1>
            <p className={'page-subtitle'}>
              {
                'Check original rows, correct mappings, and activate a recoverable campaign workbook.'
              }
            </p>
          </div>
        </div>{' '}
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
              <h2>{'Choose columns'}</h2>
              <p className={'hint'}>
                {
                  'Choose columns that match the original worksheet. Keep outreach Status separate from operating status. Preview before saving.'
                }
              </p>
              <div id={'reviewMappingWizard'}></div>
              <details>
                <summary>{'Advanced mapping JSON'}</summary>
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
                    'Example: {"Leads":"D"}. The column must be entirely unused. Only saved copies receive new headers; existing cells are never overwritten.'
                  }
                </p>
              </details>
              <div className={'experiment-buttons'}>
                <Button id={'reviewPreview'}>{'Preview changes'}</Button>
                <Button id={'reviewReset'} className={'secondary'}>
                  {'Restore saved mapping'}
                </Button>
              </div>
              <p className={'hint'}>
                {
                  'Mapping drafts stay temporary until you explicitly save a reviewed revision. Original files stay unchanged.'
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
              'Save the exact preview as a new reviewed revision. Each revision keeps its original workbook, repaired copy, mapping and source details. Save first, then explicitly activate the selected revision below. Activation keeps the campaign paused.'
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
            {'Save this reviewed copy without starting outreach.'}
          </label>
          <Button id={'repairApply'} disabled={true}>
            {'Save reviewed revision'}
          </Button>
          <p id={'repairPreviewNote'} className={'hint'}>
            {'Preview your proposal before saving.'}
          </p>
        </section>
        <section id={'workspacePanel'} className={'panel experiment-workspace'} hidden={true}>
          <div className={'experiment-result-heading'}>
            <h2>{'Saved revisions'}</h2>
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
            <Button id={'workspaceUndo'} className={'secondary'}>
              {'Undo last activation'}
            </Button>
            <Button id={'workspaceRestore'} className={'secondary'}>
              {'Use selected revision for campaign'}
            </Button>
          </div>
          <p className={'hint'}>
            {
              'Activation creates a separate campaign workbook. Previous workbooks, saved revisions, carrier IDs and contact protections are retained. Outreach stays paused until you enable the campaign.'
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
      </section>
    </>
  );
}
