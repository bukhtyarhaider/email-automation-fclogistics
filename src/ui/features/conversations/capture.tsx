import { Button, Input, Select } from '../../design-system/primitives';
import { uiScope } from '../../shared/lifecycle';
import { contentOr } from '../../shared/regions';
import { renderRegion } from '../../shared/regions';
import { displayText } from '../../shared/utils';
import type { CaptureMailbox, SetupCandidate } from '../../shared/types/conversations';
import { eventElement } from '../../shared/dom';
import { errorMessage } from '../../shared/utils';
import { element as $ } from '../../shared/dom';
import { session } from '../../shared/session';
import { notice, api } from '../../shared/runtime';
import { refresh } from '../../app/runtime/refresh';
import { fillCampaign } from '../campaigns/controller';
import { loadLeads } from '../leads/controller';
import { closePreviewDrawer } from '../drawer/controller';

export function mountCarrierWorkspace() {
  (() => {
    if (!$('view-conversations')) return;
    let loaded = false,
      dirty = false,
      saving = false,
      mailboxes: CaptureMailbox[] = [],
      setupCandidates: SetupCandidate[] = [];
    const field = (key: string, label: string, value: string | number = '', type = 'text') => (
      <>
        <label>
          {label}
          <Input
            data-config-field={key}
            type={type}
            defaultValue={displayText(value)}
            {...{ min: key === 'port' ? 1 : undefined, max: key === 'port' ? 65535 : undefined }}
          />
        </label>
      </>
    );
    function renderMailboxes() {
      renderRegion(
        $('replyConfigMailboxes'),
        contentOr(
          mailboxes.map((c, index) => (
            <>
              <article className={'reply-config-mailbox'} data-config-index={index}>
                <h3>
                  {'Mailbox '}
                  {index + 1}
                </h3>
                <div className={'reply-config-grid'}>
                  {field('id', 'Unique mailbox ID', c.id)}
                  {field('email', 'Sending identity / email', c.email, 'email')}
                  {field('host', 'IMAP host', c.host)}
                  {field('user', 'Login user (blank uses email)', c.user)}
                  {field('port', 'TLS port', c.port || 993, 'number')}
                  {field('inboxFolder', 'Inbox folder', c.inboxFolder || 'INBOX')}
                  {field('sentFolder', 'Sent folder (blank auto-detects)', c.sentFolder)}
                  {field('passwordEnv', 'Password environment variable', c.passwordEnv)}
                  {field('accessTokenEnv', 'OAuth token environment variable', c.accessTokenEnv)}
                  <label>
                    {'Provider'}
                    <Select data-config-field={'provider'}>
                      {[
                        ['custom', 'Private Email / other'],
                        ['gmail', 'Gmail'],
                        ['yahoo', 'Yahoo'],
                        ['outlook', 'Outlook'],
                      ].map(([v, l]) => (
                        <>
                          <option value={v} {...{ selected: (c.provider || 'custom') === v }}>
                            {l}
                          </option>
                        </>
                      ))}
                    </Select>
                  </label>
                  <label>
                    {'Authentication'}
                    <Select data-config-field={'authMode'}>
                      {[
                        ['password', 'Provider password'],
                        ['app_password', 'Provider app password'],
                        ['oauth', 'OAuth token'],
                      ].map(([v, l]) => (
                        <>
                          <option value={v} {...{ selected: (c.authMode || 'password') === v }}>
                            {l}
                          </option>
                        </>
                      ))}
                    </Select>
                  </label>
                </div>
                <Button type={'button'} className={'secondary'} data-config-remove={index}>
                  {'Remove from capture configuration'}
                </Button>
                <p className={'hint'}>
                  {
                    'Removing configuration retains captured messages and opt-outs. Gmail/Yahoo password access requires an approved app password; Outlook requires OAuth. Tokens must be enrolled/refreshed through the provider.'
                  }
                </p>
              </article>
            </>
          )),
          <>
            <p className={'hint'}>
              {'No live mailboxes configured. You can still import an authorized EML export.'}
            </p>
          </>,
        ),
      );
    }
    function readMailboxes() {
      return Array.from(
        document.querySelectorAll<HTMLElement>('[data-config-index]'),
        (element) => {
          const config: Record<string, string | number> = { id: '' };
          for (const input of element.querySelectorAll<HTMLElement>('[data-config-field]')) {
            const value = (input as HTMLInputElement).value.trim();
            if (value)
              config[input.dataset.configField!] =
                input.dataset.configField === 'port' ? Number(value) : value;
          }
          return config as unknown as CaptureMailbox;
        },
      );
    }
    uiScope.listen(window, 'fc-capture-status', ({ detail }) => {
      const shared = detail.sharedProtection;
      setupCandidates = detail.setupCandidates || [];
      const selected = $('replyExistingMailbox').value;
      renderRegion(
        $('replyExistingMailbox'),
        <>
          <option value={''}>{'Choose a saved mailbox setup…'}</option>
          {setupCandidates.map((c) => (
            <>
              <option value={displayText(c.id)}>
                {displayText(c.name + ' · ' + c.email)}
                {c.credentialsConfigured ? ' · login available' : ' · credential missing'}
              </option>
            </>
          ))}
        </>,
      );
      $('replyExistingMailbox').value = selected;
      $('replyUseExistingMailbox').disabled = !setupCandidates.length;
      $('replyExistingMailboxNote').textContent = setupCandidates.length
        ? 'Existing delivery-monitor setup is available. Reuse it, enable capture, authorize read-only access and save.'
        : 'No matching delivery-monitor setup found. Add the mailbox and its credential environment-variable name below.';
      $('replyStopCapture').disabled = !detail.running;
      $('replyConfigNote').textContent =
        `${detail.configurationSource || ''} · ${detail.protectionHealth || ''}. ${shared?.enabled ? `${shared.pending} opt-out(s) awaiting coordinator sync.` : 'Independent PC: opt-outs are local. Configure the team coordinator for shared sending protection.'}`;
      if (loaded || dirty || !detail.configuration) return;
      loaded = true;
      const c = detail.configuration;
      mailboxes = c.mailboxes;
      $('replyConfigEnabled').checked = c.enabled;
      $('replyConfigAuto').checked = c.auto;
      $('replyConfigSince').value = c.since;
      $('replyConfigBatch').value = String(c.batch);
      $('replyConfigAll').checked = c.allHistory === true;
      $('replyConfigAllFolders').checked = c.allFolders === true;
      $('replyConfigPages').value = String(c.pages || 5);
      $('replyConfigSince').disabled = c.allHistory === true;
      renderMailboxes();
    });
    uiScope.handler($('replyUseExistingMailbox'), 'onclick', () => {
      const c = setupCandidates.find((c) => c.id === $('replyExistingMailbox').value);
      if (!c) {
        notice('Choose an existing mailbox setup first.');
        return;
      }
      mailboxes = readMailboxes();
      if (mailboxes.some((m) => m.email?.toLowerCase() === c.email)) {
        notice('That mailbox is already in the capture settings.');
        return;
      }
      const { name, credentialsConfigured, ...config } = c;
      mailboxes.push(config);
      dirty = true;
      renderMailboxes();
      notice(
        'Mailbox setup added to your settings draft. Enable capture, authorize read-only access and save.',
      );
    });
    uiScope.handler($('replyConfigAll'), 'onchange', () => {
      $('replyConfigSince').disabled = $('replyConfigAll').checked;
      dirty = true;
    });
    uiScope.handler($('replyStopCapture'), 'onclick', async () => {
      try {
        await api('/api/conversations/stop-capture', {});
        notice('Stopping capture. Saved messages and cursors are retained.');
      } catch (e) {
        notice(errorMessage(e));
      }
    });
    uiScope.handler($('replyConfigPanel'), 'oninput', () => {
      dirty = true;
    });
    uiScope.handler($('replyConfigAdd'), 'onclick', () => {
      if (saving) return;
      mailboxes = readMailboxes();
      if (mailboxes.length >= 20) {
        notice('Up to 20 mailboxes are supported.');
        return;
      }
      mailboxes.push({ id: 'mailbox' + (mailboxes.length + 1) });
      dirty = true;
      renderMailboxes();
    });
    uiScope.handler($('replyConfigMailboxes'), 'onclick', (event) => {
      const b = eventElement(event).closest<HTMLElement>('[data-config-remove]');
      if (!b || saving) return;
      mailboxes = readMailboxes();
      mailboxes.splice(Number(b.dataset.configRemove), 1);
      dirty = true;
      renderMailboxes();
    });
    uiScope.handler($('replyConfigSave'), 'onclick', async () => {
      if (saving) return;
      saving = true;
      const b = $('replyConfigSave');
      b.textContent = 'Saving…';
      b.disabled = true;
      try {
        await api('/api/conversations/config', {
          enabled: $('replyConfigEnabled').checked,
          auto: $('replyConfigAuto').checked,
          since: $('replyConfigSince').value,
          batch: Number($('replyConfigBatch').value),
          allHistory: $('replyConfigAll').checked,
          allFolders: $('replyConfigAllFolders').checked,
          pages: Number($('replyConfigPages').value),
          mailboxes: readMailboxes(),
          confirmReadOnly: $('replyConfigConfirm').checked,
        });
        loaded = false;
        dirty = false;
        $('replyConfigConfirm').checked = false;
        window.dispatchEvent(new Event('fc-conversation-view'));
        notice('Read-only capture configuration saved. Secret values were not stored.');
      } catch (e) {
        notice(errorMessage(e));
        $('replyConfigNote').textContent = errorMessage(e) + ' Your settings draft is retained.';
      } finally {
        saving = false;
        b.textContent = 'Save capture settings';
        b.disabled = false;
      }
    });
    uiScope.handler($('openImportReview'), 'onclick', () => {
      location.hash = 'imports';
      window.dispatchEvent(
        new CustomEvent('fc-import-view', { detail: session.state.activeCampaign }),
      );
    });
    uiScope.listen(window, 'fc-import-activated', async () => {
      session.selected.clear();
      session.previewId = null;
      session.offset = 0;
      await refresh();
      fillCampaign();
      await loadLeads();
    });
    uiScope.listen(document, 'click', (event) => {
      const button = eventElement(event).closest<HTMLElement>('[data-conversation-email]');
      if (!button) return;
      closePreviewDrawer();
      location.hash = 'conversations';
      window.dispatchEvent(
        new CustomEvent('fc-conversation-search', { detail: button.dataset.conversationEmail }),
      );
    });
  })();
}
