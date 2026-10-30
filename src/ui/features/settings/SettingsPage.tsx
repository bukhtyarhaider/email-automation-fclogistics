import { Button, Input, Textarea, Select } from '../../design-system/primitives';
export function SettingsPage() {
  return (
    <>
      <section className={'view-page'} id={'view-settings'}>
        <div className={'page-header'}>
          <div>
            <p className={'page-eyebrow'}>{'CONFIGURATION'}</p>
            <h1 className={'page-title'}>{'Mailbox & Settings'}</h1>
            <p className={'page-subtitle'}>
              {
                'Manage sender profiles, human-like pacing bounds, carrier eligibility, and shared coordinator.'
              }
            </p>
          </div>
          <div className={'header-actions'}>
            <Button id={'saveSettings'}>{'Save sending settings'}</Button>
          </div>
        </div>
        <div className={'settings-grid'}>
          <div className={'panel settings-profiles-panel'}>
            <div className={'panel-head'}>
              <div className={'settings-panel-heading'}>
                <h2 className={'panel-title'}>
                  <svg
                    width={'16'}
                    height={'16'}
                    viewBox={'0 0 24 24'}
                    fill={'none'}
                    stroke={'currentColor'}
                    strokeWidth={'2'}
                  >
                    <path
                      d={
                        'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z'
                      }
                    ></path>
                    <polyline points={'22,6 12,13 2,6'}></polyline>
                  </svg>
                  {'\n                        Configured Mailbox Profiles\n                      '}
                </h2>
                <span className={'status-pill ready'} id={'profilesCountBadge'}>
                  {'1 Active'}
                </span>
              </div>
              <Button
                id={'newProfileBtn'}
                className={'secondary'}
                style={{ fontSize: '11px', padding: '4px 8px' }}
              >
                {'+ New profile'}
              </Button>
            </div>
            <div className={'table-container'} style={{ border: 'none', boxShadow: 'none' }}>
              <div className={'table-wrap'} style={{ maxHeight: '280px', minHeight: '120px' }}>
                <table>
                  <thead>
                    <tr>
                      <th>{'Profile Label'}</th>
                      <th>{'Email'}</th>
                      <th>{'Browser'}</th>
                      <th style={{ width: '80px', textAlign: 'center' }}>{'Status'}</th>
                      <th style={{ width: '150px', textAlign: 'right' }}>{'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody id={'profilesTableBody'}></tbody>
                </table>
              </div>
            </div>
          </div>
          <div className={'panel'}>
            <div className={'panel-head'}>
              <h2 className={'panel-title'} id={'profileSetupTitle'}>
                <svg
                  width={'16'}
                  height={'16'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'2'}
                >
                  <circle cx={'12'} cy={'7'} r={'4'}></circle>
                  <path d={'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'}></path>
                </svg>
                {'\n                      Mailbox Profile Setup\n                    '}
              </h2>
              <Button
                id={'newProfile'}
                className={'secondary'}
                style={{ fontSize: '11px', padding: '4px 8px' }}
              >
                {'New profile'}
              </Button>
            </div>
            <div className={'form-grid-2'}>
              <div className={'form-group'}>
                <label htmlFor={'accountName'}>{'Profile Label'}</label>
                <Input id={'accountName'} placeholder={'e.g. Mark Anthony'} />
              </div>
              <div className={'form-group'}>
                <label htmlFor={'accountEmail'}>{'Email Address'}</label>
                <Input id={'accountEmail'} type={'email'} autoComplete={'username'} />
              </div>
            </div>
            <div className={'form-grid-2 settings-provider-fields'}>
              <div className={'form-group'}>
                <label htmlFor={'provider'}>{'Provider'}</label>
                <Select id={'provider'}>
                  <option value={'privateemail'}>{'Private Email Webmail'}</option>
                </Select>
              </div>
              <div className={'form-group'}>
                <label htmlFor={'browserChannel'}>{'Browser'}</label>
                <Select id={'browserChannel'}>
                  <option value={'chrome'}>{'Google Chrome'}</option>
                  <option value={'msedge'}>{'Microsoft Edge'}</option>
                </Select>
              </div>
              <div className={'form-group'}>
                <label htmlFor={'senderName'}>{'Sender First Name'}</label>
                <Input id={'senderName'} placeholder={'Mark'} />
              </div>
            </div>
            <div className={'form-group'}>
              <label htmlFor={'accountUrl'}>{'Webmail Interface URL'}</label>
              <Input id={'accountUrl'} type={'url'} />
            </div>
            <div className={'form-group'}>
              <label htmlFor={'connectionMode'}>{'Browser Connection Method'}</label>
              <Select id={'connectionMode'}>
                <option value={'saved'}>{'Saved Browser Profile'}</option>
                <option value={'cdp'}>{'Connect to Existing Browser (CDP)'}</option>
              </Select>
              <p className={'hint'}>
                {
                  'Saved profiles keep the login on this device, separately for each mailbox and browser. Passwords entered here are not stored.'
                }
              </p>
            </div>
            <div id={'cdpSettings'} hidden={true}>
              <div className={'form-group'}>
                <label htmlFor={'cdpEndpoint'}>{'Local Browser Debugging Address'}</label>
                <Input id={'cdpEndpoint'} type={'url'} placeholder={'http://127.0.0.1:9222'} />
              </div>
              <Button id={'discoverBrowsers'} type={'button'} className={'secondary'}>
                {'Find local debugging browsers'}
              </Button>
              <div className={'form-group'}>
                <label htmlFor={'availableBrowsers'}>{'Available Browsers'}</label>
                <Select id={'availableBrowsers'}>
                  <option value={''}>{'Run discovery or enter an address above'}</option>
                </Select>
              </div>
              <p className={'hint'} id={'browserGuideMessage'}></p>
              <pre
                id={'browserDebugCommand'}
                style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', userSelect: 'text' }}
              ></pre>
              <p className={'hint'}>
                {
                  'Run the command in Terminal on macOS or PowerShell on Windows. This starts a separate persistent debug profile. Sign in there once and reuse it. Keep debugging accessible only from this device.'
                }
              </p>
            </div>
            <label className={'check hint'}>
              <Input id={'autoReconnect'} type={'checkbox'} defaultChecked={true} />
              {' Restore this connection when the application starts'}
            </label>
            <div className={'form-grid-2'}>
              <div className={'form-group'}>
                <label htmlFor={'businessName'}>{'Display Brand Name'}</label>
                <Input id={'businessName'} placeholder={'FC Logistics'} />
              </div>
              <div className={'form-group'}>
                <label htmlFor={'legalName'}>{'Legal Registered Entity'}</label>
                <Input id={'legalName'} placeholder={'Fleet Core Logistics LLC'} />
              </div>
            </div>
            <div className={'form-group'}>
              <label htmlFor={'address'}>{'Postal Business Address'}</label>
              <Input id={'address'} placeholder={'132 French Creek Dr, Rochester, NY 14618'} />
            </div>
            <div className={'form-group'}>
              <label htmlFor={'services'}>{'Services Offered (used in templates)'}</label>
              <Textarea id={'services'} rows={2} />
            </div>
            <div className={'form-actions'} style={{ display: 'flex', gap: '10px' }}>
              <Button id={'saveProfile'}>{'Save mailbox profile'}</Button>
              <Button
                type={'button'}
                id={'deleteCurrentProfile'}
                className={'danger'}
                style={{ display: 'none' }}
              >
                {'Delete profile'}
              </Button>
            </div>
          </div>
          <div className={'panel'}>
            <div className={'panel-head'}>
              <h2 className={'panel-title'}>
                <svg
                  width={'16'}
                  height={'16'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'2'}
                >
                  <circle cx={'12'} cy={'12'} r={'10'}></circle>
                  <polyline points={'12 6 12 12 16 14'}></polyline>
                </svg>
                {'\n                      Sending Pace & Quotas\n                    '}
              </h2>
            </div>

            <div className={'pacing-presets-section'}>
              <div className={'pacing-presets-header'}>
                <div className={'pacing-presets-title'}>
                  <svg
                    width={'14'}
                    height={'14'}
                    viewBox={'0 0 24 24'}
                    fill={'none'}
                    stroke={'currentColor'}
                    strokeWidth={'2'}
                  >
                    <path d={'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'}></path>
                  </svg>
                  {
                    '\n                        Recommended Anti-Spam Deliverability Presets\n                      '
                  }
                </div>
                <span className={'pacing-presets-subtext'}>
                  {'Click any preset to apply safe human thresholds'}
                </span>
              </div>
              <div className={'pacing-presets-grid'} id={'pacingPresetsGrid'}>
                <div className={'pacing-preset-card'} data-preset={'warmup'}>
                  <div className={'preset-card-top'}>
                    <span className={'preset-badge warmup'}>{'Safe Warmup'}</span>
                    <span className={'preset-stat'}>{'40 / day'}</span>
                  </div>
                  <div className={'preset-card-name'}>{'New Mailbox Warmup'}</div>
                  <p className={'preset-card-desc'}>
                    {
                      'High delays (4–8 min) & small batches with long rests. Protects new domains against early reputation burn.'
                    }
                  </p>
                  <div className={'preset-specs'}>
                    <span>{'4–8m gaps'}</span>
                    {' • '}
                    <span>{'10/hr'}</span>
                    {' • '}
                    <span>{'15–30m rest'}</span>
                  </div>
                  <Button type={'button'} className={'preset-apply-btn'}>
                    {'Apply Warmup'}
                  </Button>
                </div>

                <div className={'pacing-preset-card'} data-preset={'balanced'}>
                  <div className={'preset-card-top'}>
                    <span className={'preset-badge recommended'}>{'Recommended'}</span>
                    <span className={'preset-stat'}>{'80 / day'}</span>
                  </div>
                  <div className={'preset-card-name'}>{'Balanced Human Pace'}</div>
                  <p className={'preset-card-desc'}>
                    {
                      'Realistic sales rep pacing (2.5–5 min) with irregular intervals & 10–20 min rests. Standard for daily outreach.'
                    }
                  </p>
                  <div className={'preset-specs'}>
                    <span>{'2.5–5m gaps'}</span>
                    {' • '}
                    <span>{'18/hr'}</span>
                    {' • '}
                    <span>{'10–20m rest'}</span>
                  </div>
                  <Button type={'button'} className={'preset-apply-btn'}>
                    {'Apply Balanced'}
                  </Button>
                </div>

                <div className={'pacing-preset-card'} data-preset={'established'}>
                  <div className={'preset-card-top'}>
                    <span className={'preset-badge established'}>{'High Volume'}</span>
                    <span className={'preset-stat'}>{'120 / day'}</span>
                  </div>
                  <div className={'preset-card-name'}>{'Aged / Established Domain'}</div>
                  <p className={'preset-card-desc'}>
                    {
                      'Faster pace (1.5–3 min) for warmed mailboxes with strong SPF/DKIM/DMARC and seasoned sender score.'
                    }
                  </p>
                  <div className={'preset-specs'}>
                    <span>{'1.5–3m gaps'}</span>
                    {' • '}
                    <span>{'25/hr'}</span>
                    {' • '}
                    <span>{'8–15m rest'}</span>
                  </div>
                  <Button type={'button'} className={'preset-apply-btn'}>
                    {'Apply High Volume'}
                  </Button>
                </div>

                <div className={'pacing-preset-card'} data-preset={'stealth'}>
                  <div className={'preset-card-top'}>
                    <span className={'preset-badge stealth'}>{'All-Day Trickle'}</span>
                    <span className={'preset-stat'}>{'50 / day'}</span>
                  </div>
                  <div className={'preset-card-name'}>{'Stealth Background'}</div>
                  <p className={'preset-card-desc'}>
                    {
                      'Ultra-gentle trickle (5–10 min) running quietly across an 8–10 hour workday without triggering rate spikes.'
                    }
                  </p>
                  <div className={'preset-specs'}>
                    <span>{'5–10m gaps'}</span>
                    {' • '}
                    <span>{'8/hr'}</span>
                    {' • '}
                    <span>{'15–25m rest'}</span>
                  </div>
                  <Button type={'button'} className={'preset-apply-btn'}>
                    {'Apply Stealth'}
                  </Button>
                </div>
              </div>

              <div className={'pacing-info-banner'}>
                <svg
                  width={'15'}
                  height={'15'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'2'}
                >
                  <circle cx={'12'} cy={'12'} r={'10'}></circle>
                  <line x1={'12'} y1={'16'} x2={'12'} y2={'12'}></line>
                  <line x1={'12'} y1={'8'} x2={'12.01'} y2={'8'}></line>
                </svg>
                <div>
                  <strong>{'Spam & Rate-Limit Protections:'}</strong>
                  {
                    ' Randomized gaps prevent ESP bot-fingerprinting. Rolling hourly & daily caps protect domain reputation from blacklists. Periodic rest pauses simulate natural human breaks.\n                      '
                  }
                </div>
              </div>
            </div>
            <div className={'form-grid-2'}>
              <div className={'form-group'}>
                <label htmlFor={'minSeconds'}>{'Gap Minimum (seconds)'}</label>
                <Input id={'minSeconds'} type={'number'} min={'1'} />
              </div>
              <div className={'form-group'}>
                <label htmlFor={'maxSeconds'}>{'Gap Maximum (seconds)'}</label>
                <Input id={'maxSeconds'} type={'number'} min={'1'} />
              </div>
            </div>
            <div className={'form-grid-2'}>
              <div className={'form-group'}>
                <label htmlFor={'hourlyCap'}>{'Rolling Hourly Cap'}</label>
                <Input id={'hourlyCap'} type={'number'} min={'1'} />
              </div>
              <div className={'form-group'}>
                <label htmlFor={'dailyCap'}>{'Rolling 24-Hour Cap'}</label>
                <Input id={'dailyCap'} type={'number'} min={'1'} />
              </div>
            </div>
            <div className={'form-grid-2'}>
              <div className={'form-group'}>
                <label htmlFor={'pauseEveryMin'}>{'Rest After At Least N Sends'}</label>
                <Input id={'pauseEveryMin'} type={'number'} min={'1'} />
              </div>
              <div className={'form-group'}>
                <label htmlFor={'pauseEveryMax'}>{'Rest After At Most N Sends'}</label>
                <Input id={'pauseEveryMax'} type={'number'} min={'1'} />
              </div>
            </div>
            <div className={'form-grid-2'}>
              <div className={'form-group'}>
                <label htmlFor={'pauseMinSeconds'}>{'Rest Minimum (seconds)'}</label>
                <Input id={'pauseMinSeconds'} type={'number'} min={'0'} />
              </div>
              <div className={'form-group'}>
                <label htmlFor={'pauseMaxSeconds'}>{'Rest Maximum (seconds)'}</label>
                <Input id={'pauseMaxSeconds'} type={'number'} min={'0'} />
              </div>
            </div>
            <div className={'form-group'}>
              <label htmlFor={'pollSeconds'}>{'Empty Queue Check Interval (seconds)'}</label>
              <Input id={'pollSeconds'} type={'number'} min={'5'} />
            </div>
            <div className={'form-group'}>
              <label>{'Current queue wait'}</label>
              <p id={'settingsWaitStatus'} className={'hint'} role={'status'}>
                {'No scheduled wait.'}
              </p>
              <p className={'hint'}>
                {
                  'Override the current wait and restart this mailbox’s app-tracked minimum interval, hourly/24-hour quota counters, and rest counter. The queue can send immediately after confirmation. New sends count toward the configured limits again. A stopped queue stays stopped.'
                }
              </p>
              <Button id={'resetWait'} type={'button'} className={'secondary'} disabled={true}>
                {'Hard reset wait & quotas'}
              </Button>
            </div>
          </div>
          <div className={'panel'}>
            <div className={'panel-head'}>
              <h2 className={'panel-title'}>{'Template checks'}</h2>
              <span className={'status-pill ready'}>{'Advisory by default'}</span>
            </div>
            <p className={'hint'}>
              {
                'Choose how wording checks behave for all templates in previews, manual sends, selected batches, and continuous outreach. Warn only adds a review note and lets outreach continue.'
              }
            </p>
            <div className={'form-group'}>
              <label className={'check'}>
                <Input id={'templateChecksEnabled'} type={'checkbox'} defaultChecked={true} />
                {'\n                      Enable template checks\n                    '}
              </label>
            </div>
            <fieldset id={'templateCheckOptions'} className={'template-check-options'}>
              <div className={'form-group'}>
                <label htmlFor={'promotionalClaimsCheck'}>
                  {'Pricing, guarantees & promotional claims'}
                </label>
                <Select id={'promotionalClaimsCheck'}>
                  <option value={'warn'}>{'Warn only — continue outreach'}</option>
                  <option value={'block'}>{'Stop before sending'}</option>
                  <option value={'off'}>{'Off'}</option>
                </Select>
                <p className={'hint'}>
                  {'Flags wording such as guarantees, prices, percentages, and urgency for review.'}
                </p>
              </div>
              <div className={'form-group'}>
                <label htmlFor={'messageLengthCheck'}>{'Introduction over 180 words'}</label>
                <Select id={'messageLengthCheck'}>
                  <option value={'warn'}>{'Warn only — continue outreach'}</option>
                  <option value={'block'}>{'Stop before sending'}</option>
                  <option value={'off'}>{'Off'}</option>
                </Select>
              </div>
            </fieldset>
            <p className={'hint'}>
              {
                'Turning template checks off keeps your individual choices for when you enable them again. Save sending settings to apply changes. A stopped queue must be started again.'
              }
            </p>
            <p className={'hint'}>
              {
                'Lead eligibility checks are below. Recipient validity, duplicate and opt-out protection, mailbox identity, signature verification, send confirmation, and sending allowances stay active.'
              }
            </p>
          </div>

          <div className={'panel'}>
            <div className={'panel-head'}>
              <h2 className={'panel-title'}>
                <svg
                  width={'16'}
                  height={'16'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'2'}
                >
                  <polyline points={'9 11 12 14 22 4'}></polyline>
                  <path d={'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'}></path>
                </svg>
                {'\n                      Lead Eligibility Rules\n                    '}
              </h2>
            </div>
            <div className={'form-group'}>
              <label className={'check'}>
                <Input id={'requireActive'} type={'checkbox'} />
                {
                  '\n                      Require Active operating status (FMCSA)\n                    '
                }
              </label>
              <label className={'check'}>
                <Input id={'requireNoOutOfService'} type={'checkbox'} />
                {'\n                      Require No out-of-service flag\n                    '}
              </label>
              <label className={'check'}>
                <Input id={'allowHidden'} type={'checkbox'} />
                {
                  '\n                      Allow reading from hidden worksheets\n                    '
                }
              </label>
            </div>
            <div className={'form-group'}>
              <label htmlFor={'readyStatuses'}>
                {'Ready Statuses (comma separated; use blank for empty cells)'}
              </label>
              <Input id={'readyStatuses'} />
            </div>
            <div className={'form-group'}>
              <label htmlFor={'sentStatus'}>{'Status Written After Send'}</label>
              <Input id={'sentStatus'} placeholder={'e.g. Proposal Sent'} />
            </div>
          </div>

          <div className={'panel'}>
            <div className={'panel-head'}>
              <div className={'settings-panel-heading'}>
                <h2 className={'panel-title'}>
                  <svg
                    width={'16'}
                    height={'16'}
                    viewBox={'0 0 24 24'}
                    fill={'none'}
                    stroke={'currentColor'}
                    strokeWidth={'2'}
                  >
                    <path
                      d={
                        'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83'
                      }
                    ></path>
                  </svg>
                  {'\n                        Firebase Open Telemetry Sync\n                      '}
                </h2>
                <span className={'status-pill'} id={'settingsFirebaseStatusBadge'}>
                  {'Not checked'}
                </span>
              </div>
            </div>
            <p className={'hint'}>
              {
                'Give each PC its own ID and keep its original data folder. Cloud opens are matched to the tracking tokens saved on that PC.'
              }
            </p>
            <div
              id={'firebaseWarnings'}
              className={'firebase-warnings'}
              role={'status'}
              aria-live={'polite'}
            ></div>
            <div className={'form-group'}>
              <label htmlFor={'trackingPcId'}>{"This PC's tracking ID"}</label>
              <Input
                id={'trackingPcId'}
                maxLength={64}
                placeholder={'e.g. 1, 2, 3 or 4'}
                autoComplete={'off'}
              />
              <p className={'hint'} id={'trackingPcIdHint'}>
                {
                  'Save a unique ID for each PC. Blank uses FC_TRACKING_PC_ID, then the legacy default 1.'
                }
              </p>
            </div>
            <div className={'form-group'}>
              <label htmlFor={'trackingPublicUrl'}>{'Public tracking URL'}</label>
              <Input
                id={'trackingPublicUrl'}
                type={'url'}
                placeholder={'https://www.fclogistics.us/t/1'}
              />
              <p className={'hint'}>
                {
                  'Use the cloud endpoint for this PC (for example /t/2 for PC 2). Blank uses FC_TRACKING_PUBLIC_URL. Changes apply to future emails; old emails keep their original URL.'
                }
              </p>
            </div>
            <div className={'form-group'}>
              <label htmlFor={'firebaseBackend'}>{'Cloud database to sync'}</label>
              <Select id={'firebaseBackend'}>
                <option value={'both'}>{'Realtime Database + Firestore'}</option>
                <option value={'rtdb'}>{'Realtime Database only'}</option>
                <option value={'firestore'}>{'Cloud Firestore only'}</option>
              </Select>
              <p className={'hint'}>
                {
                  'Select the database your cloud endpoint writes to. Errors from any selected database are shown below.'
                }
              </p>
            </div>
            <div className={'form-group'}>
              <label htmlFor={'firebaseSyncMode'}>{'Sync Mode'}</label>
              <Select id={'firebaseSyncMode'}>
                <option value={'auto'}>
                  {'Automatic (Background polling every 15s + startup sync)'}
                </option>
                <option value={'manual'}>{'Manual (Sync only on demand / button click)'}</option>
              </Select>
              <p className={'hint'} id={'firebaseSyncModeHint'}>
                {
                  'In automatic mode, open signals from recipients are fetched seamlessly in the background while the app is running.'
                }
              </p>
            </div>
            <div className={'settings-sync-actions'}>
              <small
                id={'settingsFirebaseDiag'}
                className={'hint'}
                role={'status'}
                aria-live={'polite'}
              >
                {'Checking sync configuration…'}
              </small>
              <Button
                id={'settingsFirebaseSyncBtn'}
                type={'button'}
                className={'secondary'}
                style={{ fontSize: '11px', padding: '4px 10px' }}
              >
                {'Sync opens now'}
              </Button>
            </div>
          </div>
          <div className={'panel firebase-diagnostics-panel'}>
            <div className={'panel-head'}>
              <h2 className={'panel-title'}>{'PC & Firebase diagnostics'}</h2>
            </div>
            <p className={'hint'}>
              {
                'Live values from this running app. Credential keys are hidden. Environment and credential file changes require a restart.'
              }
            </p>
            <dl id={'firebaseDiagnostics'} className={'firebase-diagnostics'}></dl>
            <div
              id={'firebaseBackendDiagnostics'}
              className={'firebase-backend-diagnostics'}
              aria-live={'polite'}
            ></div>
            <p className={'hint'}>
              {
                'Open signals are image requests; they do not prove a person read the email. Team coordination uses a separate worker ID and does not synchronize open history.'
              }
            </p>
          </div>

          <div className={'panel'}>
            <div className={'panel-head'}>
              <h2 className={'panel-title'}>
                <svg
                  width={'16'}
                  height={'16'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'2'}
                >
                  <path d={'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'}></path>
                  <circle cx={'9'} cy={'7'} r={'4'}></circle>
                  <path d={'M23 21v-2a4 4 0 0 0-3-3.87'}></path>
                  <path d={'M16 3.13a4 4 0 0 1 0 7.75'}></path>
                </svg>
                {'\n                      Shared Team Coordination\n                    '}
              </h2>
            </div>
            <div className={'form-group'}>
              <label className={'check'}>
                <Input id={'teamEnabled'} type={'checkbox'} />
                {
                  '\n                      Enable shared team coordination server\n                    '
                }
              </label>
            </div>
            <div className={'form-group'}>
              <label htmlFor={'teamUrl'}>{'Coordinator Server URL'}</label>
              <Input id={'teamUrl'} type={'url'} placeholder={'http://192.168.1.50:4318'} />
            </div>
            <div className={'form-grid-2'}>
              <div className={'form-group'}>
                <label htmlFor={'workerName'}>{'Local PC Identifier'}</label>
                <Input id={'workerName'} placeholder={'PC-01'} />
              </div>
              <div className={'form-group'}>
                <label htmlFor={'teamToken'}>{'Access Token'}</label>
                <Input
                  id={'teamToken'}
                  type={'password'}
                  autoComplete={'off'}
                  placeholder={'Coordinator token'}
                />
              </div>
            </div>
            <p id={'teamStatus'} className={'hint'}></p>
          </div>

          <div className={'panel'}>
            <div className={'panel-head'}>
              <h2 className={'panel-title'}>
                <svg
                  width={'16'}
                  height={'16'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'2'}
                >
                  <polyline points={'16 18 22 12 16 6'}></polyline>
                  <polyline points={'8 6 2 12 8 18'}></polyline>
                </svg>
                {'\n                      Developer & System Info\n                    '}
              </h2>
              <span className={'status-pill ready'}>{'v1.0.0'}</span>
            </div>
            <div className={'settings-system-info'}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>{'Lead Engineer / Developer'}</span>
                <strong style={{ color: '#fff' }}>{'Bukhtyar Haider'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>{'Application'}</span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {'Outreach Desk (Desktop Edition)'}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>{'Architecture'}</span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {'Playwright Webmail Automation & Queue Coordinator'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
