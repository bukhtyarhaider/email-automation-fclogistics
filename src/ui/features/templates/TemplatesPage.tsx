import {
  Check,
  Download,
  Eye,
  Icon,
  PanelsTopLeft,
  Plus,
  Search,
  Shield,
  Upload,
} from '../../design-system/icons';
import { Button, Input, Textarea, Select } from '../../design-system/primitives';
export function TemplatesPage() {
  return (
    <>
      <section className={'view-page'} id={'view-templates'}>
        <div className={'page-header'}>
          <div>
            <p className={'page-eyebrow'}>{'MESSAGE PERSONALIZATION'}</p>
            <h1 className={'page-title'}>{'Templates Studio'}</h1>
            <p className={'page-subtitle'}>
              {
                'Craft deterministic, personalized outreach introductions with lead token interpolation.'
              }
            </p>
          </div>
          <div className={'header-actions'}>
            <Button id={'newTemplate'} className={'secondary'}>
              <Icon icon={Plus} size={14} />
              {'\n                  New variant\n                '}
            </Button>
            <Button
              id={'exportTemplatesBtn'}
              className={'secondary'}
              title={'Export all templates as JSON'}
            >
              <Icon icon={Download} size={14} />
              {'\n                  Export templates\n                '}
            </Button>
            <label
              className={'button secondary'}
              htmlFor={'importTemplatesFile'}
              style={{ cursor: 'pointer' }}
              title={'Import templates from JSON'}
            >
              <Icon icon={Upload} size={14} />
              {'\n                  Import templates\n                '}
            </label>
            <Input id={'importTemplatesFile'} type={'file'} accept={'.json'} hidden={true} />
            <Button id={'deleteTemplate'} className={'danger'}>
              {'Delete template'}
            </Button>
            <Button id={'saveTemplate'}>{'Save template'}</Button>
          </div>
        </div>
        <div className={'dashboard-grid'}>
          <div className={'panel'}>
            <div className={'form-group'}>
              <label htmlFor={'template'}>{'Select Template Variant'}</label>
              <Select id={'template'}></Select>
            </div>
            <div className={'form-grid-2'}>
              <div className={'form-group'}>
                <label htmlFor={'templateName'}>{'Template Variant Name'}</label>
                <Input id={'templateName'} />
              </div>
              <div className={'form-group'}>
                <label htmlFor={'templateWeight'}>{'Selection Weight'}</label>
                <Input
                  id={'templateWeight'}
                  type={'number'}
                  min={'1'}
                  max={'100'}
                  defaultValue={'1'}
                />
              </div>
            </div>
            <div className={'form-group'}>
              <label className={'check'}>
                <Input id={'templateEnabled'} type={'checkbox'} defaultChecked={true} />
                {'\n                    Enabled for random weighted selection\n                  '}
              </label>
            </div>
            <div className={'form-group'}>
              <label htmlFor={'requiredFields'}>{'Required Lead Fields (comma separated)'}</label>
              <Input id={'requiredFields'} placeholder={'e.g. city, state'} />
              <p className={'hint'}>
                {'Variants will be skipped if the lead is missing any required field.'}
              </p>
            </div>
            <div className={'form-group'}>
              <label htmlFor={'subject'}>{'Email Subject Line'}</label>
              <Input id={'subject'} placeholder={'e.g. Quick question regarding {{company}}'} />
            </div>
            <div className={'form-group'}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '6px',
                }}
              >
                <label style={{ marginBottom: '0' }}>
                  {'Insert Personalization Tokens (Click to insert)'}
                </label>
                <Button
                  type={'button'}
                  id={'insertOptOutChip'}
                  className={'secondary'}
                  style={{
                    fontSize: '11px',
                    padding: '3px 8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  title={'Insert compliant opt-out instruction into message body'}
                >
                  <Icon icon={Shield} size={12} />
                  {'\n                      + Insert Opt-Out Line\n                    '}
                </Button>
              </div>
              <div className={'token-bar'}>
                <Button type={'button'} className={'token-chip'} data-token={'{{firstName}}'}>
                  {'{{firstName}}'}
                </Button>
                <Button type={'button'} className={'token-chip'} data-token={'{{company}}'}>
                  {'{{company}}'}
                </Button>
                <Button type={'button'} className={'token-chip'} data-token={'{{city}}'}>
                  {'{{city}}'}
                </Button>
                <Button type={'button'} className={'token-chip'} data-token={'{{state}}'}>
                  {'{{state}}'}
                </Button>
                <Button type={'button'} className={'token-chip'} data-token={'{{locationPhrase}}'}>
                  {'{{locationPhrase}}'}
                </Button>
                <Button type={'button'} className={'token-chip'} data-token={'{{senderName}}'}>
                  {'{{senderName}}'}
                </Button>
                <Button type={'button'} className={'token-chip'} data-token={'{{businessName}}'}>
                  {'{{businessName}}'}
                </Button>
                <Button type={'button'} className={'token-chip'} data-token={'{{services}}'}>
                  {'{{services}}'}
                </Button>
                <Button type={'button'} className={'token-chip'} data-token={'{{legalName}}'}>
                  {'{{legalName}}'}
                </Button>
                <Button type={'button'} className={'token-chip'} data-token={'{{address}}'}>
                  {'{{address}}'}
                </Button>
              </div>
            </div>
            <div className={'form-group'}>
              <label htmlFor={'body'}>{'Message Body'}</label>
              <Textarea
                id={'body'}
                rows={11}
                style={{ fontFamily: 'var(--font-sans)', lineHeight: '1.6' }}
              />
              <p className={'hint'}>
                {'The existing webmail signature is preserved automatically by Private Email.'}
              </p>
            </div>
          </div>

          <div className={'panel'}>
            <div className={'panel-head'}>
              <h2 className={'panel-title'}>
                <Icon icon={Eye} size={16} />
                {'\n                    Live Template Preview\n                  '}
              </h2>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span id={'templateComplianceStatus'} className={'status-pill ready'}>
                  <Icon icon={Check} size={12} />
                  {'Compliant'}
                </span>
                <span className={'status-pill ready'}>{'Simulated Lead'}</span>
              </div>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              <strong>{'Recipient:'}</strong>
              {
                ' John Doe <johndoe@sampletrucking.com> · Sample Trucking LLC, Dallas, TX\n                '
              }
            </div>
            <div className={'message-preview-box'} id={'templateLivePreview'}>
              {'\n                  Select a template to view the live preview.\n                '}
            </div>
            <div className={'signature-box'}>
              <strong>{'Attached Signature (from Webmail):'}</strong>
              <br />
              <span>{'Mark Anthony | Fleet Core Logistics LLC | Dispatch & Carrier Services'}</span>
            </div>
          </div>
        </div>

        <div className={'panel'} style={{ marginTop: '20px' }}>
          <div className={'panel-head'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 className={'panel-title'}>
                <Icon icon={PanelsTopLeft} size={16} />
                {'\n                    Template Variants Library\n                  '}
              </h2>
              <span className={'status-pill ready'} id={'templateCountBadge'}>
                {'0 Variants'}
              </span>
            </div>
            <div className={'toolbar-search'} style={{ minWidth: '220px', maxWidth: '320px' }}>
              <Icon icon={Search} />
              <Input
                id={'templateSearch'}
                type={'search'}
                placeholder={'Search template variants…'}
              />
            </div>
          </div>
          <div className={'table-container'} style={{ border: 'none', boxShadow: 'none' }}>
            <div className={'table-wrap'} style={{ maxHeight: '400px', minHeight: '200px' }}>
              <table>
                <thead>
                  <tr>
                    <th>{'Variant Name'}</th>
                    <th>{'Subject Line'}</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>{'Weight'}</th>
                    <th style={{ width: '100px', textAlign: 'center' }}>{'Status'}</th>
                    <th>{'Required Fields'}</th>
                    <th style={{ width: '170px', textAlign: 'right' }}>{'Actions'}</th>
                  </tr>
                </thead>
                <tbody id={'templatesTableBody'}></tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
