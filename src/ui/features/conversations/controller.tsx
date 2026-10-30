import type { SourceHistoryResponse } from '../../shared/types/api';
import { Button } from '../../design-system/primitives';
import { uiScope } from '../../shared/lifecycle';
import { contentOr } from '../../shared/regions';
import { renderRegion, insertRegion } from '../../shared/regions';
import { displayText } from '../../shared/utils';
import type {
  ConversationSelection,
  ReplyMessage,
  CarrierStatusDraft,
  ReviewDraft,
} from '../../shared/types/conversations';
import type { ConversationDetail, ConversationReport } from '../../shared/types/conversations';
import type { ActionResult } from '../../shared/types/api';
import { requestJson } from '../../shared/api';
import { eventElement } from '../../shared/dom';
import { errorMessage } from '../../shared/utils';
import { element as $ } from '../../shared/dom';

export function mountConversations() {
  (() => {
    const production = !!$('view-conversations');
    const route = (url: string) =>
      production
        ? url
            .replace('/api/experiment/reply-detail', '/api/conversation-detail')
            .replace('/api/experiment/replies', '/api/conversations')
        : url;
    const labels: Record<string, string> = {
      unclassified: 'Not classified',
      interested: 'Interested',
      pricing: 'Pricing question',
      how_it_works: 'How it works',
      later: 'Later',
      already_has_dispatcher: 'Has dispatcher',
      wrong_contact: 'Wrong contact',
      not_fit: 'Not a fit',
      opt_out: 'Opt-out',
      out_of_office: 'Out of office',
      automated: 'Automated',
      bounce: 'Bounce notice',
    };
    const options = Object.entries(labels).map(([value, label]) => (
      <>
        <option value={value}>{label}</option>
      </>
    ));
    insertRegion($('replyCategory'), 'beforeend', options);
    renderRegion($('replyReviewCategory'), options);
    let busy = false,
      offset = 0,
      report: ConversationReport | null = null,
      selection: ConversationSelection | null = null,
      detail: ConversationDetail | null = null,
      selectedMessage: string | null = null,
      lastLoad = 0,
      loadSequence = 0;
    const drafts = new Map<string, ReviewDraft>();
    let deskBusy = false,
      pendingOpen: ConversationSelection | null = null;
    let captureToolsInitialized = false,
      detailSequence = 0;
    const time = (s: string | null | undefined) => (s ? new Date(s).toLocaleString() : 'unknown');
    async function request<T = ActionResult>(url: string, data?: unknown): Promise<T> {
      return requestJson<T>(route(url), data);
    }
    function error(message: string) {
      $('replyError').hidden = !message;
      $('replyError').textContent = message;
    }
    const mailroom = production && $('mailroomWorkspace');
    const threadMessages = () => detail?.carrierHistory?.messages || detail?.messages || [];
    const findMessage = (id: string | ReplyMessage | null) =>
      threadMessages().find((m) => m.id === id) || detail?.messages?.find((m) => m.id === id);
    const carrierStatusDrafts = new Map<string, CarrierStatusDraft>();
    let renderedCarrierStatus: string | null = null;
    const friendly = (value: string | undefined) =>
      (
        ({
          interested: 'Interested',
          positive: 'Positive',
          negative: 'Not interested',
          neutral: 'Needs a look',
          pricing: 'Pricing question',
          how_it_works: 'Service question',
          opt_out: 'Opt-out',
          needs_review: 'Needs match',
          unknown: 'Waiting',
          out_of_office: 'Out of office',
          automated: 'Automatic reply',
          bounce: 'Delivery notice',
          later: 'Later',
        }) as Record<string, string>
      )[value || ''] ||
      value ||
      'Waiting';
    function markSelection() {
      if (!mailroom) return;
      document.querySelectorAll<HTMLElement>('#mailroomList [data-reply]').forEach((b) => {
        const active = b.dataset.reply === selection?.id;
        b.classList.toggle('selected', active);
        b.setAttribute('aria-pressed', String(active));
      });
    }
    function renderMailroomRows() {
      const focusedRow = document.activeElement?.closest<HTMLElement>('#mailroomList [data-reply]')
        ?.dataset.reply;
      const compactTime = (value: string) => {
        if (!value) return '';
        const d = new Date(value);
        return Number.isNaN(d.getTime())
          ? ''
          : d.toDateString() === new Date().toDateString()
            ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      };
      renderRegion(
        $('mailroomList'),
        contentOr(
          report!.rows.map((r) => (
            <>
              <Button
                type={'button'}
                title={displayText(r.recipient)}
                className={'mailroom-card ' + (r.id === selection?.id ? 'selected' : '')}
                data-reply={displayText(r.id)}
                data-type={r.type}
                aria-pressed={r.id === selection?.id}
              >
                <span className={'mailroom-card-top'}>
                  <strong>{displayText(r.contactName || r.company || r.recipient)}</strong>
                  <time>{displayText(compactTime(r.lastReplyAt || r.at))}</time>
                </span>
                {r.contactName && r.company && r.company !== r.recipient ? (
                  <>
                    <span className={'mailroom-card-company'}>{displayText(r.company)}</span>
                  </>
                ) : (
                  ''
                )}
                {r.contactName || r.company !== r.recipient ? (
                  ''
                ) : (
                  <>
                    <span className={'mailroom-card-address'}>{displayText(r.recipient)}</span>
                  </>
                )}
                <span className={'mailroom-card-subject'}>{displayText(r.subject)}</span>
                <span className={'mailroom-card-excerpt'}>
                  {displayText(r.excerpt || 'No captured human reply. Check scan coverage.')}
                </span>
                <span
                  className={
                    'mailroom-badge ' +
                    (r.needsReply || r.intent?.intent === 'interested' ? 'warm' : '')
                  }
                >
                  {displayText(
                    r.type === 'review'
                      ? 'Needs match'
                      : r.needsReply
                        ? 'Needs reply'
                        : r.noReply
                          ? 'Waiting'
                          : friendly(r.intent?.intent),
                  )}
                  {r.unread ? ' · unread' : ''}
                </span>
                {r.carrierStatus ? (
                  <>
                    <span className={'carrier-stage-label'}>
                      {displayText(
                        (
                          {
                            in_review: 'In review',
                            active: 'Active conversation',
                            follow_up: 'Follow up',
                            waiting: 'Waiting',
                            signed: 'Signed',
                            closed: 'Closed',
                          } as Record<string, string>
                        )[r.carrierStatus] || r.carrierStatus,
                      )}
                      {r.followUpAt ? ' · ' + displayText(time(r.followUpAt)) : ''}
                    </span>
                  </>
                ) : (
                  ''
                )}
              </Button>
            </>
          )),
          <>
            <div className={'mailroom-list-empty'}>
              <strong>{'No conversations in this queue'}</strong>
              <p>{'Try All, change the filters, or scan your previous replies.'}</p>
            </div>
          </>,
        ),
      );
      if (focusedRow)
        Array.from($('mailroomList').querySelectorAll<HTMLElement>('[data-reply]'))
          .find((b) => b.dataset.reply === focusedRow)
          ?.focus({ preventScroll: true });
      $('mailroomActiveCount').textContent = String(report!.summary.active || 0);
      $('mailroomReviewCount').textContent = String(report!.summary.inReview || 0);
      $('mailroomNeedsCount').textContent = String(report!.summary.needsReply);
      $('mailroomAllCount').textContent = String(
        report!.group === 'carriers'
          ? report!.summary.carriers
          : report!.summary.conversations + report!.summary.needsMatch,
      );
      $('mailroomWaitingCount').textContent = String(report!.summary.noReply);
      document
        .querySelectorAll<HTMLElement>('[data-mailroom-work]')
        .forEach((b) =>
          b.setAttribute('aria-pressed', String(b.dataset.mailroomWork === $('replyWork').value)),
        );
      $('replyPage').textContent = report!.total
        ? `${offset + 1}–${Math.min(offset + report!.rows.length, report!.total)} of ${report!.total}`
        : '0 conversations';
      $('replyStopCapture').hidden = !report!.capture.running;
      $('mailroomFilterNote').hidden =
        !selection || report!.rows.some((r) => r.id === selection!.id);
      $('mailroomFilterNote').textContent =
        'This selected conversation is outside the current filters.';
    }
    function renderMailroomThread(data: ConversationDetail) {
      const c = data.assistant,
        history = data.carrierHistory,
        messages = history?.messages || data.messages,
        root = data.root,
        previousOpen = $('mailroomOlder')?.open;
      const stated = c?.fields.contactName;
      const person =
        stated?.confirmed?.value ||
        (!stated?.conflict && stated?.candidates.length === 1
          ? stated.candidates[0].value
          : null) ||
        messages.findLast((m) => m.direction === 'inbound')?.senderName ||
        root?.company ||
        root?.recipient;
      const initials = (name: string | null | undefined) =>
        String(name || '?')
          .split(/\s+/)
          .slice(0, 2)
          .map((s) => s[0])
          .join('')
          .toUpperCase();
      const message = (m: ReplyMessage) => {
        const own = m.direction === 'outbound',
          name = own ? 'You' : m.senderName || person || m.from[0] || 'Unknown sender';
        return (
          <>
            <article className={'mailroom-message ' + (own ? 'outbound' : '')}>
              <header className={'mailroom-message-heading'}>
                <span className={'profile-avatar mailroom-avatar'}>
                  {displayText(initials(name))}
                </span>
                <div className={'mailroom-sender'}>
                  <strong>{displayText(name)}</strong>
                  <span>{displayText(m.from.join(', '))}</span>
                </div>
                <time title={m.date ? 'Sender-reported date' : 'Capture time'}>
                  {displayText(time(m.date || m.capturedAt))}
                </time>
              </header>
              {!own ? (
                <>
                  <span
                    className={
                      'mailroom-badge ' + (c?.intent?.sentiment === 'positive' ? 'warm' : '')
                    }
                  >
                    {displayText(
                      m.match === 'review'
                        ? 'Contact history · thread unlinked'
                        : friendly(m.category === 'unclassified' ? c?.intent?.intent : m.category),
                    )}
                    {' · '}
                    {m.classificationSource === 'manual' ? 'reviewed' : 'suggested'}
                  </span>
                </>
              ) : (
                ''
              )}
              {history && m.id === history.latestInboundId ? (
                <>
                  <div className={'mailroom-read-actions'}>
                    <span className={'hint'} role={'status'}>
                      {history.unread ? 'Unread' : 'Read'}
                    </span>
                    <Button
                      className={'secondary'}
                      data-message-seen={m.id}
                      data-unread={!history.unread}
                      title={'Update this carrier’s read status in Outreach Desk'}
                    >
                      {history.unread ? 'Mark as read' : 'Mark as unread'}
                    </Button>
                  </div>
                </>
              ) : (
                ''
              )}
              <pre>
                {displayText(
                  m.bodyUnavailable
                    ? 'Body unavailable. Inspect the original mailbox before responding.'
                    : m.text ||
                        'No new text was extracted. Inspect the original email for full context.',
                )}
              </pre>
              <details className={'mailroom-message-evidence'}>
                <summary>{'Message details'}</summary>
                <p>
                  {'To '}
                  {displayText(m.to?.join(', ') || m.account)}
                  {' · '}
                  {displayText(m.match)}
                  {' · '}
                  {displayText(m.source.type)}
                  {m.source.folder ? ' / ' + displayText(m.source.folder) : ''}
                  {' · captured '}
                  {displayText(time(m.capturedAt))}
                </p>
                <pre>
                  {displayText(m.messageId || '(No Message-ID)')}
                  {displayText(m.references.join('\n'))}
                </pre>
                <Button className={'secondary'} data-review-message={m.id}>
                  {'Review message'}
                </Button>
              </details>
            </article>
          </>
        );
      };
      const latestCarrier = history
        ? messages.findLast((m) => m.direction === 'inbound' && m.kind === 'human') ||
          messages.findLast((m) => m.direction === 'inbound')
        : null;
      let focus = messages.findIndex((m) => m.id === (latestCarrier?.id || c?.lastMessageId));
      if (focus < 0) focus = Math.max(0, messages.length - 1);
      const earlier = messages.slice(0, focus),
        latest = messages.slice(focus);
      const original = root ? (
        <>
          <article className={'mailroom-message outbound'}>
            <strong>{'Original email · sent by this tool'}</strong>
            <p className={'hint'}>
              {displayText(root.account)}
              {' → '}
              {displayText(root.recipient)}
              {' · '}
              {displayText(time(root.sentAt))}
            </p>
            <pre>
              {displayText(
                root.bodyUnavailable
                  ? 'The original body is not retained here. Confirmed tracking history anchors this send; inspect its mailbox copy.'
                  : root.body || '(Original body not retained)',
              )}
            </pre>
          </article>
        </>
      ) : (
        ''
      );
      renderRegion($('replyThread'), [
        latest.map(message),
        !latest.length && root ? (
          <>
            <p className={'hint mailroom-waiting-note'}>
              {
                'No captured carrier reply on this thread. Check the scan coverage before following up.'
              }
            </p>
          </>
        ) : (
          ''
        ),
      ]);
      const originals = history
        ? history.roots.map((r) => (
            <>
              <article className={'mailroom-message outbound'}>
                <strong>
                  {'Tool send · '}
                  {displayText(time(r.sentAt))}
                </strong>
                <p>{displayText(r.subject)}</p>
                <pre>
                  {displayText(r.bodyUnavailable ? 'Original body is not retained.' : r.body)}
                </pre>
              </article>
            </>
          ))
        : original;
      const older = earlier.length ? (
        <>
          <details id={'mailroomOlder'} className={'mailroom-older'} {...{ open: !!previousOpen }}>
            <summary>
              {'Earlier emails with this carrier ('}
              {earlier.length}
              {')'}
            </summary>
            {earlier.map(message)}
          </details>
        </>
      ) : (
        ''
      );
      insertRegion($('replyThread'), 'afterbegin', older);
      renderRegion($('mailroomThreadHistory'), [originals, messages.map(message)]);
      $('carrierRecord').hidden = !history;
      $('carrierStatusPanel').hidden = !history;
      if (history) {
        const names: Record<string, string> = {
          in_review: 'In review',
          active: 'Active conversation',
          follow_up: 'Follow up',
          waiting: 'Waiting',
          signed: 'Signed',
          closed: 'Closed',
        };
        $('carrierRecordLabel').textContent =
          history.recipient +
          ' · ' +
          names[history.carrierStatus] +
          (history.newSinceStatus ? ' · New reply' : '');
        $('carrierHistoryNote').textContent =
          history.messages.length +
          ' captured email(s) across ' +
          history.roots.length +
          ' tool send(s). ' +
          (history.reviewRequired
            ? 'Latest email needs thread review before a reply draft.'
            : 'Earlier email chains remain available below.');
        const draft = carrierStatusDrafts.get(history.carrierInboxId),
          d = history.followUpAt && new Date(history.followUpAt);
        const fields = {
          carrierStage: draft?.stage || history.carrierStatus,
          carrierStatusNote: draft?.note ?? history.note,
          carrierFollowUpAt:
            draft?.followUpAt ??
            (d
              ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
              : ''),
        };
        for (const [id, value] of Object.entries(fields))
          if (($(id) as HTMLInputElement).value !== value)
            ($(id) as HTMLInputElement).value = value;
        $('carrierStatusReload').hidden = !draft;
        if (renderedCarrierStatus !== history.carrierInboxId)
          $('carrierStatusResult').textContent = '';
        renderedCarrierStatus = history.carrierInboxId;
        if (draft && draft.expectedVersion !== history.statusVersion)
          $('carrierStatusResult').textContent =
            'Carrier history or status changed while you were editing. Your edits are retained. Reload the saved status before making a new change.';
        $('carrierSeen').textContent = history.unread ? 'Mark history read' : 'Mark history unread';
      }
      $('mailroomHold').hidden = !c?.hold;
      $('mailroomHold').textContent = c?.hold ? 'Contact held · ' + c.hold : '';
      $('mailroomResolve').hidden = Boolean(root);
      const inbound = messages.filter(
        (m) =>
          m.direction === 'inbound' &&
          m.kind === 'human' &&
          !['review', 'ignored'].includes(m.match),
      );
      $('mailroomReplyHistory').textContent =
        `${inbound.length} matched human ${inbound.length === 1 ? 'reply' : 'replies'} · ${root?.account || messages[0]?.account || ''}. Header dates are sender-reported. Quoted text may be omitted; inspect the original mailbox for complete context.`;
      markSelection();
    }
    function controls() {
      const blocked = busy || deskBusy;
      for (const id of [
        'replyHistory',
        'replyDemo',
        'replyImport',
        'replyRefresh',
        'replyThreadRefresh',
        'replyReviewSave',
        'replyBackfill',
        'replyIgnore',
        'replyUnignore',
        ...(mailroom ? ['carrierStatusSave', 'carrierStatusReload', 'carrierSeen'] : []),
      ])
        ($(id) as HTMLInputElement).disabled = blocked;
      if (mailroom) $('carrierSeen').disabled = blocked || !detail?.carrierHistory?.latestInboundId;
      $('replyReviewSave').disabled =
        blocked || !selectedMessage || findMessage(selectedMessage!)?.match === 'ignored';
      $('replyScan').disabled = blocked || !report?.capture.enabled || report.capture.running;
      $('replyBackfill').disabled = Boolean(blocked || report?.capture.running);
      for (const id of [
        'replyReviewCategory',
        'replyReviewNote',
        'replyLink',
        'replyLinkConfirm',
        ...(mailroom ? ['carrierStage', 'carrierFollowUpAt', 'carrierStatusNote'] : []),
      ])
        ($(id) as HTMLInputElement).disabled = blocked;
      for (const id of [
        'replyMode',
        'replyMailbox',
        'replyCategory',
        'replySearch',
        ...(production ? ['replyWork', ...(mailroom ? ['replyGrouping'] : [])] : []),
      ])
        ($(id) as HTMLInputElement).disabled = blocked;
      document
        .querySelectorAll<HTMLElement>(
          '[data-reply], [data-review-message], [data-mailroom-work], [data-message-seen]',
        )
        .forEach((button) => {
          (button as HTMLInputElement).disabled = blocked;
        });
      $('replyPrev').disabled = blocked || offset === 0;
      $('replyNext').disabled = blocked || offset + 25 >= (report?.total || 0);
    }
    async function action(button: EventTarget | null, fn: () => Promise<string | void>) {
      if (!(button instanceof HTMLButtonElement)) return;
      if (busy || deskBusy) return;
      busy = true;
      if (production)
        window.dispatchEvent(new CustomEvent('fc-conversation-action-busy', { detail: true }));
      const text = button.textContent,
        queueButton = button.hasAttribute('data-mailroom-work');
      button.setAttribute('aria-busy', 'true');
      if (!queueButton) button.textContent = 'Working…';
      controls();
      error('');
      $('replyStatus').textContent = 'Processing reply evidence…';
      try {
        const note = await fn();
        await load();
        $('replyStatus').textContent = note || 'Reply action complete. No email was sent.';
      } catch (e) {
        error(errorMessage(e));
        if (mailroom && button.id.startsWith('carrier'))
          $('carrierStatusResult').textContent =
            errorMessage(e) + ' Your status draft is retained.';
        $('replyStatus').textContent =
          'Needs attention. Your review draft/file selection is retained.';
      } finally {
        busy = false;
        if (production)
          window.dispatchEvent(new CustomEvent('fc-conversation-action-busy', { detail: false }));
        button.removeAttribute('aria-busy');
        if (!queueButton && button.textContent === 'Working…') button.textContent = text;
        controls();
        if (pendingOpen && !deskBusy) {
          const next = pendingOpen;
          pendingOpen = null;
          window.dispatchEvent(new CustomEvent('fc-open-conversation', { detail: next }));
        }
      }
    }
    function syncSelect(id: string, entries: Array<{ email: string; demo: boolean }>) {
      const value = $<HTMLSelectElement>(id).value;
      renderRegion($(id), [
        id === 'replyMailbox' ? (
          <>
            <option value={''}>{'All mailboxes'}</option>
          </>
        ) : (
          <>
            <option value={''}>{'Choose a mailbox…'}</option>
          </>
        ),
        entries.map((a) => (
          <>
            <option value={displayText(a.email)}>
              {displayText(a.email)}
              {a.demo ? ' · sample' : ''}
            </option>
          </>
        )),
      ]);
      if (entries.some((a) => a.email === value) || !value) $<HTMLSelectElement>(id).value = value;
    }
    async function load() {
      const sequence = ++loadSequence;
      const params = new URLSearchParams({
        mode: $('replyMode').value,
        mailbox: $('replyMailbox').value,
        category: $('replyCategory').value,
        q: $('replySearch').value,
        work: production ? $('replyWork').value : 'all',
        ...(mailroom ? { group: $('replyGrouping').value } : {}),
        offset: String(offset),
      });
      const value = await request<ConversationReport>('/api/experiment/replies?' + params);
      if (sequence !== loadSequence) return;
      report = value;
      offset = report.offset;
      lastLoad = Date.now();
      syncSelect(
        'replyMailbox',
        report.accounts.filter(
          (a: { demo: boolean }) => a.demo === ($('replyMode').value === 'demo'),
        ),
      );
      syncSelect('replyImportAccount', report.accounts);
      const metrics = production
        ? [
            ['Contacts who replied', 'respondedContacts'],
            ['Captured human replies', 'humanMessages'],
            ['Needs my reply', 'needsReply'],
            ['Needs conversation match', 'needsMatch'],
          ]
        : [
            ['Human reply candidates', 'humanMessages'],
            ['Needs conversation match', 'needsMatch'],
            ['Automatic replies', 'automatedMessages'],
            ['Bounce notices', 'bounceNotices'],
            ['Protected opt-out contacts', 'protectedContacts'],
          ];
      renderRegion(
        $('replyMetrics'),
        metrics.map(([label, key]) => (
          <>
            <div className={'experiment-metric'}>
              <span>{label}</span>
              <strong>{report!.summary[key]}</strong>
            </div>
          </>
        )),
      );
      $('replyMetricNote').textContent = report.note;
      $('replyProtection').hidden = !report.protectionNote;
      $('replyProtection').textContent = report.protectionNote || '';
      $('replyCoverage').textContent =
        `${report.coverage.rootsWithMessageIds} of ${report.coverage.roots} loaded source conversations have outbound Message-IDs. Missing IDs need Sent reconciliation or explicit manual review.`;
      const capture = report.capture;
      if (production) {
        const scan = capture.historyScan;
        $('replyScanProgress').textContent = capture.running
          ? `${scan?.status === 'Running' ? 'Historical scan' : 'Mailbox sync'} in progress${scan?.currentFolder ? ' · ' + scan.currentMailbox + ' / ' + scan.currentFolder : ''}${scan?.scanned ? ' · ' + scan.scanned + ' message checks' : ''}${capture.progress && scan?.status === 'Running' ? ' · activity ' + time(capture.progress.at) : ''}. You can stop and resume safely.`
          : scan
            ? `Last historical scan: ${scan.status} · ${scan.scanned || 0} message checks. ${scan.status === 'Complete' ? 'Available folders checked; uncertain matches remain in review.' : 'Run the scan again to resume saved progress.'}`
            : capture.enabled
              ? 'Scan all previous replies to tool-sent emails, including available archived messages.'
              : capture.setupCandidates?.length
                ? 'Mailbox login is available, but conversation capture is off. Open Mailbox tools → capture settings to reuse it and authorize a scan.'
                : 'Conversation capture is off. Open Mailbox tools to set up authorized Inbox access; browser sign-in alone does not enable capture.';
      }
      if (production) {
        if (!captureToolsInitialized) {
          $('replyCaptureTools').open =
            report.summary.humanMessages +
              report.summary.automatedMessages +
              report.summary.bounceNotices +
              report.summary.needsMatch ===
            0;
          captureToolsInitialized = true;
        }
        $('replyCaptureSummary').textContent =
          'Capture & mailbox setup · ' +
          (capture.configurationError ||
          capture.captureError ||
          capture.mailboxes.some((m) => m.status === 'Needs attention')
            ? 'Needs attention'
            : capture.running
              ? 'Checking mailboxes…'
              : capture.enabled
                ? 'Live capture enabled'
                : 'Live capture off');
        window.dispatchEvent(new CustomEvent('fc-capture-status', { detail: capture }));
        $('replyProtectionDelivery').textContent =
          `${capture.protectionHealth}. ${capture.sharedProtection.enabled ? 'Coordinator protection updates pending: ' + capture.sharedProtection.pending + '. Shared sending protections are checked before each send.' : 'Independent PC: captured opt-outs protect this PC. Other PCs need the shared coordinator.'}`;
      }
      $('replyCaptureNote').textContent = String(
        capture.configurationError ||
          `${capture.enabled ? 'Live read-only capture enabled' : 'Live capture off'} · ${capture.auto ? 'Automatic checks enabled' : 'Manual checks only'}${capture.running ? ' · Checking mailboxes…' : ''}${capture.since ? ` · Initial backfill since ${capture.since} · ${capture.allFolders ? 'All available response folders' : 'Inbox and Sent folders'}` : ''}. ${production ? 'EML imports do not connect to a provider.' : 'Samples and EML imports do not connect to a provider.'}`,
      );
      renderRegion($('replyMonitor'), [
        capture.captureError ? (
          <>
            <div className={'reply-monitor'}>{displayText(capture.captureError.message)}</div>
          </>
        ) : (
          ''
        ),
        capture.mailboxes.map((m) => (
          <>
            <div className={'reply-monitor'}>
              <strong>
                {displayText(m.email)}
                {' · '}
                {displayText(m.status)}
              </strong>
              <p className={'hint'}>
                {'Credentials: '}
                {m.credentialsConfigured ? 'configured' : 'missing'}
                {' · Last successful check: '}
                {displayText(time(m.checkedAt))}
                {' · Next eligible check: '}
                {displayText(time(m.nextAt))}
              </p>
              {m.message ? (
                <>
                  <p>{displayText(m.message)}</p>
                </>
              ) : (
                ''
              )}
              {(m.folders || []).map((f) => (
                <>
                  <p className={'hint'}>
                    {displayText(f.folder)}
                    {' · '}
                    {f.processed}
                    {' scanned this check'}
                    {f.error ? ' · Folder failed; incomplete coverage' : ''}
                    {' · '}
                    {f.more
                      ? 'Backfill incomplete; more messages remain'
                      : 'Current search page completed'}
                    {' · UID '}
                    {f.lastUid}
                  </p>
                </>
              ))}
            </div>
          </>
        )),
      ]);
      if (mailroom) renderMailroomRows();
      else {
        renderRegion(
          $('replyRows'),
          contentOr(
            report.rows.map((r) => (
              <>
                <tr>
                  <td>
                    {r.company && r.company !== r.recipient ? (
                      <>
                        <strong>{displayText(r.company)}</strong>
                        <br />
                      </>
                    ) : (
                      ''
                    )}
                    {displayText(r.recipient)}
                  </td>
                  <td>
                    {displayText(r.subject)}
                    <br />
                    {displayText(r.account)}
                    {production && r.excerpt ? (
                      <>
                        <p className={'hint'}>{displayText(r.excerpt.slice(0, 130))}</p>
                      </>
                    ) : (
                      ''
                    )}
                  </td>
                  <td>
                    {production ? (
                      <>
                        <strong>{displayText(r.intent?.intent || 'unknown')}</strong>
                        <br />
                        {r.unread ? 'New / unread · ' : ''}
                        {r.needsReply
                          ? 'Needs your reply'
                          : r.repliedElsewhere
                            ? 'Replied in another thread'
                            : r.noReply
                              ? 'No captured reply'
                              : ''}
                        <br />
                        {displayText(r.draftStatus || '')}
                      </>
                    ) : (
                      `${r.classificationSource === 'manual' ? 'Reviewed' : 'Suggested'}: ${displayText(labels[r.category] || r.category)}`
                    )}
                  </td>
                  <td>
                    {production ? (
                      r.responded ? (
                        <>
                          <strong>
                            {r.replyCount}
                            {' human '}
                            {r.replyCount === 1 ? 'reply' : 'replies'}
                          </strong>
                          <br />
                          {'First: '}
                          {displayText(time(r.firstReplyAt))}
                          <br />
                          {'Latest: '}
                          {displayText(time(r.lastReplyAt))}
                        </>
                      ) : r.type === 'review' ? (
                        <>
                          {'Needs matching review'}
                          <br />
                          {displayText(r.reason)}
                        </>
                      ) : (
                        'No matched human reply'
                      )
                    ) : (
                      <>
                        {displayText(r.match)}
                        {r.paused ? (
                          <>
                            <br />
                            {'Experiment follow-up paused'}
                          </>
                        ) : (
                          ''
                        )}
                        <br />
                        {r.count}
                        {' captured message(s)'}
                      </>
                    )}
                  </td>
                  <td>
                    <Button
                      className={'secondary'}
                      data-reply={displayText(r.id)}
                      data-type={r.type}
                    >
                      {'View'}
                    </Button>
                  </td>
                </tr>
              </>
            )),
            production ? (
              <>
                <tr>
                  <td colSpan={5}>
                    {
                      'No matching replies yet. Run the historical scan, or choose All tool-sent conversations to see emails awaiting a captured response.'
                    }
                  </td>
                </tr>
              </>
            ) : (
              <>
                <tr>
                  <td colSpan={5}>
                    {
                      'No captured conversations match. Load samples, import EML, or configure read-only capture.'
                    }
                  </td>
                </tr>
              </>
            ),
          ),
        );
        $('replyPage').textContent =
          `${report.total ? offset + 1 : 0}–${Math.min(offset + report.rows.length, report.total)} of ${report.total} matching conversations/review items`;
      }
      controls();
      if (
        mailroom &&
        !selection &&
        report.rows.length &&
        location.hash === '#conversations' &&
        !busy &&
        !deskBusy
      ) {
        selection = { id: report.rows[0].id, type: report.rows[0].type };
        await loadDetail(false);
      }
      const selectedRow =
        production && selection && report.rows.find((r) => r.id === selection!.id);
      if (
        !deskBusy &&
        selectedRow &&
        detail &&
        !$('replyInspector').hidden &&
        (selectedRow.count !== detail.messages.length ||
          (selectedRow.carrierInboxId && selectedRow.unread !== detail.carrierHistory?.unread) ||
          (selectedRow.statusVersion &&
            selectedRow.statusVersion !== detail.carrierHistory?.statusVersion) ||
          (selectedRow.latestHistoryId &&
            selectedRow.latestHistoryId !== detail.carrierHistory?.latestHistoryId) ||
          (selectedRow.sourceMessageId &&
            !detail.messages.some((m) => m.id === selectedRow.sourceMessageId)))
      )
        await loadDetail();
    }
    if (mailroom)
      uiScope.listen(window, 'fc-conversation-detail', (event) => {
        const data = event.detail;
        if (
          selection &&
          (data.root?.id === selection.id || data.messages.some((m) => m.id === selection!.id))
        ) {
          detail = data;
          renderMailroomThread(data);
        }
      });
    function rememberDraft() {
      if (selectedMessage)
        drafts.set(selectedMessage, {
          category: $('replyReviewCategory').value,
          note: $('replyReviewNote').value,
          rootId: $('replyLink').value,
          confirm: $('replyLinkConfirm').checked,
        });
    }
    function selectReview(id: string) {
      rememberDraft();
      selectedMessage = id;
      const message = findMessage(id),
        draft = drafts.get(id);
      $('replyReviewPanel').hidden = false;
      $('replyReviewCategory').value = draft?.category || message!.category;
      $('replyReviewNote').value = draft?.note ?? message!.reviewNote;
      $('replyReviewEvidence').textContent =
        `${message!.classificationSource === 'manual' ? 'Manually reviewed' : 'Rule suggestion'} · ${message!.reason} · ${message!.suggestion.reason}`;
      $('replyMatchPanel').hidden = message!.match !== 'review';
      renderRegion(
        $('replyLink'),
        <>
          <option value={''}>{'Select a conversation…'}</option>
          {(detail!.carrierHistory?.roots || detail!.candidates).map((r) => (
            <>
              <option value={r.id}>
                {displayText(r.recipient)}
                {' · '}
                {displayText(r.subject)}
              </option>
            </>
          ))}
        </>,
      );
      $('replyLink').value = draft?.rootId || '';
      $('replyLinkConfirm').checked = draft?.confirm || false;
      $('replyIgnore').hidden = message!.match !== 'review';
      $('replyUnignore').hidden = message!.match !== 'ignored';
      controls();
    }
    async function loadDetail(preserve = true) {
      if (preserve) rememberDraft();
      const sequence = ++detailSequence,
        target = { ...selection };
      if (mailroom) {
        $('mailroomWorkspace').dataset.threadOpen = 'true';
        $('mailroomEmpty').hidden = true;
        $('mailroomLoading').hidden = false;
      }
      let next;
      try {
        next = await request<ConversationDetail>(
          '/api/experiment/reply-detail?' +
            new URLSearchParams(target as { id: string; type: string }),
        );
      } finally {
        if (mailroom && sequence === detailSequence) $('mailroomLoading').hidden = true;
      }
      if (
        sequence !== detailSequence ||
        selection?.id !== target.id ||
        selection?.type !== target.type
      )
        return;
      const sameThread =
        detail?.root?.id === next.root?.id && detail?.messages?.[0]?.id === next.messages?.[0]?.id;
      detail = next;
      $('replyInspector').hidden = false;
      $('replyThreadTitle').textContent =
        threadMessages().findLast((m) => m.direction === 'inbound')?.subject ||
        detail.root?.subject ||
        'Message needs a conversation match';
      if (mailroom) {
        renderMailroomThread(detail!);
        if (!sameThread) $('replyInspector').scrollTop = 0;
      } else {
        const initial = detail.root ? (
          <>
            <article className={'reply-message outbound'}>
              <h3>
                {detail.root.source === 'carrier_inbound'
                  ? 'Carrier-started conversation · reviewed sender'
                  : 'Original send · source history'}
              </h3>
              <p className={'hint'}>
                {displayText(detail.root.account)}
                {' → '}
                {displayText(detail.root.recipient)}
                {' · '}
                {displayText(time(detail.root.sentAt))}
              </p>
              <p className={'hint'}>
                {detail.root.carrierId
                  ? 'Source carrier ID: ' + displayText(detail.root.carrierId)
                  : 'Carrier identity unresolved / not linked'}
                {' · '}
                {detail.root.demo ? 'Sample data' : displayText(detail.root.campaignName)}
              </p>
              <pre>
                {displayText(
                  detail.root.bodyUnavailable
                    ? 'Original body is not retained here. This send is anchored by confirmed tool tracking history; inspect its original mailbox copy.'
                    : detail.root.body,
                )}
              </pre>
              {detail.root.bodyTruncated ? (
                <>
                  <p className={'hint'}>{'Source body truncated for this view.'}</p>
                </>
              ) : (
                ''
              )}
            </article>
          </>
        ) : (
          ''
        );
        renderRegion($('replyThread'), [
          initial,
          detail.messages.map((m) => (
            <>
              <article
                className={'reply-message ' + (m.direction === 'outbound' ? 'outbound' : '')}
              >
                <h3>
                  {displayText(m.from.join(', ') || 'Unknown sender')}
                  {' · '}
                  {displayText(m.kind)}
                </h3>
                <p className={'hint'}>
                  {displayText(m.subject)}
                  {' · '}
                  {displayText(m.match)}
                  {' · '}
                  {displayText(m.classificationSource === 'manual' ? 'Reviewed' : 'Suggested')}
                  {': '}
                  {displayText(labels[m.category])}
                </p>
                <p className={'hint'}>
                  {'Header date: '}
                  {displayText(time(m.date))}
                  {' · Captured: '}
                  {displayText(time(m.capturedAt))}
                  {' · '}
                  {displayText(m.source.type)}
                  {m.source.folder
                    ? ' / ' + displayText(m.source.folder) + ' / UID ' + m.source.uid
                    : ''}
                </p>
                <pre>
                  {displayText(
                    m.bodyUnavailable
                      ? 'Body unavailable. Inspect the original mailbox before linking or classifying.'
                      : m.text || '(No new text extracted; inspect the original message.)',
                  )}
                </pre>
                {m.textTruncated ? (
                  <>
                    <p className={'hint'}>{'New-text view truncated at 24,000 characters.'}</p>
                  </>
                ) : (
                  ''
                )}
                <details>
                  <summary>{'Message reference evidence'}</summary>
                  <pre>
                    {displayText(m.messageId || '(No Message-ID)')}
                    {displayText(m.references.join('\n'))}
                  </pre>
                </details>
                <Button className={'secondary'} data-review-message={m.id}>
                  {'Review message'}
                </Button>
              </article>
            </>
          )),
        ]);
      }
      if (production) window.dispatchEvent(new CustomEvent('fc-conversation-detail', { detail }));
      if (threadMessages().length)
        selectReview(
          threadMessages().some((m) => m.id === selectedMessage)
            ? selectedMessage!
            : (threadMessages().findLast((m) => m.direction === 'inbound') ||
                threadMessages().at(-1))!.id,
        );
      else {
        selectedMessage = null;
        $('replyReviewPanel').hidden = true;
        controls();
      }
    }
    uiScope.handler($(mailroom ? 'mailroomList' : 'replyRows'), 'onclick', (event) => {
      if (deskBusy) return;
      const button = eventElement(event).closest<HTMLElement>('[data-reply]');
      if (!button) return;
      rememberDraft();
      selectedMessage = null;
      $('replyInspector').hidden = true;
      $('replyReviewPanel').hidden = true;
      selection = { id: button.dataset.reply!, type: button.dataset.type! };
      action(button, () => loadDetail(false));
    });
    const reviewMessageClick = (event: Event) => {
      const read = eventElement(event).closest<HTMLElement>('[data-message-seen]');
      if (read) {
        void changeCarrierRead(read, read.dataset.messageSeen!, read.dataset.unread === 'true');
        return;
      }
      const button = eventElement(event).closest<HTMLElement>('[data-review-message]');
      if (button) {
        selectReview(button.dataset.reviewMessage!);
        if (mailroom) {
          if (!$('mailroomDetailsDialog').open) $('mailroomDetailsDialog').showModal();
          $('replyReviewNote').focus();
        } else $('replyReviewPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };
    uiScope.handler($('replyThread'), 'onclick', reviewMessageClick);
    if (mailroom) uiScope.handler($('mailroomThreadHistory'), 'onclick', reviewMessageClick);
    uiScope.handler($('replyClose'), 'onclick', () => {
      rememberDraft();
      $('replyInspector').hidden = true;
      if (mailroom) {
        $('mailroomWorkspace').dataset.threadOpen = 'false';
        $('mailroomEmpty').hidden = false;
      }
    });
    uiScope.handler($('replyThreadRefresh'), 'onclick', () =>
      action($('replyThreadRefresh'), () => loadDetail()),
    );
    uiScope.handler($('replyReviewSave'), 'onclick', () =>
      action($('replyReviewSave'), async () => {
        await request('/api/experiment/replies/review', {
          messageId: selectedMessage,
          expectedReview: findMessage(selectedMessage!)?.reviewVersion,
          category: $('replyReviewCategory').value,
          note: $('replyReviewNote').value,
          rootId: $('replyLink').value,
          confirmLink: $('replyLinkConfirm').checked,
        });
        drafts.delete(selectedMessage!);
        await loadDetail(false);
        return 'Reply review saved. Captured opt-outs protect normal outreach. No message was sent.';
      }),
    );
    for (const [id, method] of [
      ['replyIgnore', 'ignore'],
      ['replyUnignore', 'restore'],
    ])
      uiScope.handler($(id), 'onclick', () =>
        action($(id), async () => {
          await request('/api/experiment/replies/review', {
            messageId: selectedMessage,
            expectedReview: findMessage(selectedMessage!)?.reviewVersion,
            action: method,
            note: $('replyReviewNote').value,
          });
          drafts.delete(selectedMessage!);
          await loadDetail(false);
          return method === 'ignore'
            ? 'Review item ignored with history/protections retained.'
            : 'Item returned to the matching review queue.';
        }),
      );
    uiScope.handler($('replyHistory'), 'onclick', () =>
      action($('replyHistory'), async () => {
        const r = await request<SourceHistoryResponse>('/api/experiment/replies/history', {});
        return `Loaded ${r.roots} source conversations; ${r.withMessageIds} currently have Message-IDs in source history.`;
      }),
    );
    uiScope.handler($('replyDemo'), 'onclick', () =>
      action($('replyDemo'), async () => {
        await request('/api/experiment/replies/demo', {});
        $('replyMode').value = 'demo';
        $('replyMailbox').value = '';
        $('replyCategory').value = '';
        $('replySearch').value = '';
        offset = 0;
        return 'Sample inbox loaded. No real email was sent or fetched.';
      }),
    );
    uiScope.handler($('replyScan'), 'onclick', () =>
      action($('replyScan'), async () => {
        await request('/api/experiment/replies/scan', {});
        $('replyMode').value = 'real';
        $('replyMailbox').value = '';
        $('replyCategory').value = '';
        $('replySearch').value = '';
        offset = 0;
        return 'Historical scan started. All available pages are checked; monitor progress and partial errors above.';
      }),
    );
    uiScope.handler($('replyBackfill'), 'onclick', () =>
      action($('replyBackfill'), async () => {
        await request('/api/experiment/replies/backfill', {});
        return 'Reply cursors reset. Existing messages/reviews/protections retained; the next enabled check rescans the configured lookback.';
      }),
    );
    uiScope.handler($('replyImport'), 'onclick', () =>
      action($('replyImport'), async () => {
        const file = $('replyEml').files?.[0],
          mailbox = $('replyImportAccount').value;
        if (!file || !mailbox) throw new Error('Choose a mailbox and EML file.');
        if (file.size > 2000000) throw new Error('Use an EML file up to 2 MB.');
        const response = await uiScope.fetch(
          route('/api/experiment/replies/import') + '?' + new URLSearchParams({ mailbox }),
          {
            method: 'POST',
            headers: { 'X-FC-Request': '1', 'Content-Type': 'message/rfc822' },
            body: file,
          },
        );
        const r = await response.json();
        if (!response.ok) throw new Error(r.error);
        $('replyMode').value = mailbox === 'demo.dispatch@example.invalid' ? 'demo' : 'real';
        $('replyMailbox').value = '';
        $('replyCategory').value = '';
        $('replySearch').value = '';
        offset = 0;
        return r.ignored
          ? 'No known contact/reference matched. Message was not retained.'
          : r.duplicate
            ? 'This message was already captured; no duplicate added.'
            : 'EML evidence imported. Inspect its match and suggested category.';
      }),
    );
    if (mailroom) {
      uiScope.handler($('carrierManage'), 'onclick', () => {
        $('mailroomDetailsDialog').showModal();
        $('carrierStage').focus();
      });
      for (const id of ['carrierStage', 'carrierFollowUpAt', 'carrierStatusNote'])
        uiScope.handler($(id), 'oninput', () => {
          const h = detail!.carrierHistory,
            prior = carrierStatusDrafts.get(h.carrierInboxId);
          carrierStatusDrafts.set(h.carrierInboxId, {
            expectedVersion: prior?.expectedVersion || h.statusVersion,
            stage: $('carrierStage').value,
            note: $('carrierStatusNote').value,
            followUpAt: $('carrierFollowUpAt').value,
          });
          $('carrierStatusReload').hidden = false;
        });
      uiScope.handler($('carrierStatusSave'), 'onclick', () =>
        action($('carrierStatusSave'), async () => {
          const h = detail!.carrierHistory,
            draft = carrierStatusDrafts.get(h.carrierInboxId);
          await request('/api/conversations/carrier-status', {
            carrierInboxId: h.carrierInboxId,
            expectedVersion: draft?.expectedVersion || h.statusVersion,
            stage: $('carrierStage').value,
            note: $('carrierStatusNote').value,
            followUpAt: $('carrierFollowUpAt').value
              ? new Date($('carrierFollowUpAt').value).toISOString()
              : null,
          });
          carrierStatusDrafts.delete(h.carrierInboxId);
          await loadDetail();
          $('carrierStatusResult').textContent = 'Carrier status saved. No email was sent.';
          return 'Carrier status saved.';
        }),
      );
      uiScope.handler($('carrierStatusReload'), 'onclick', () =>
        action($('carrierStatusReload'), async () => {
          await loadDetail();
          carrierStatusDrafts.delete(detail!.carrierHistory.carrierInboxId);
          renderMailroomThread(detail!);
          $('carrierStatusResult').textContent =
            'Saved carrier status reloaded. Unsaved status edits discarded.';
          return 'Saved carrier status reloaded.';
        }),
      );
      uiScope.handler($('carrierSeen'), 'onclick', () =>
        changeCarrierRead(
          $('carrierSeen'),
          detail!.carrierHistory.latestInboundId,
          !detail!.carrierHistory.unread,
        ),
      );
    }
    function changeCarrierRead(
      button: HTMLElement,
      messageId: string | undefined,
      unread: boolean,
    ) {
      return action(button, async () => {
        const h = detail!.carrierHistory;
        await request('/api/conversations/carrier-seen', {
          carrierInboxId: h.carrierInboxId,
          expectedVersion: h.statusVersion,
          messageId,
          unread,
        });
        await loadDetail();
        window.dispatchEvent(new Event('fc-carrier-read-changed'));
        return unread
          ? 'Marked as unread.'
          : 'Marked as read. Reply tasks stay open until answered.';
      });
    }
    uiScope.handler($('replyRefresh'), 'onclick', () => action($('replyRefresh'), async () => {}));
    for (const id of [
      'replyMode',
      'replyMailbox',
      'replyCategory',
      ...(production ? ['replyWork', ...(mailroom ? ['replyGrouping'] : [])] : []),
    ])
      uiScope.handler($(id), 'onchange', () => {
        if (id === 'replyMode') $('replyMailbox').value = '';
        if (id === 'replyGrouping') $('replyWork').value = 'all';
        offset = 0;
        action($('replyRefresh'), async () => {});
      });
    if (mailroom) {
      let searchTimer: number | undefined;
      uiScope.handler($('replySearch'), 'oninput', () => {
        uiScope.clearTimeout(searchTimer);
        searchTimer = uiScope.timeout(() => {
          offset = 0;
          void load().catch((e) => error(errorMessage(e)));
        }, 300);
      });
      document.querySelectorAll<HTMLElement>('[data-mailroom-work]').forEach((b) => {
        uiScope.handler(b, 'onclick', () => {
          if (['active', 'in_review'].includes(b.dataset.mailroomWork || ''))
            $('replyGrouping').value = 'carriers';
          $('replyWork').value = String(b.dataset.mailroomWork);
          offset = 0;
          void action(b, async () => {});
        });
      });
    }
    uiScope.handler($('replySearch'), 'onkeydown', (e) => {
      if (e.key === 'Enter') {
        offset = 0;
        $('replyRefresh').click();
      }
    });
    uiScope.handler($('replyPrev'), 'onclick', () => {
      offset = Math.max(0, offset - 25);
      action($('replyPrev'), async () => {});
    });
    uiScope.handler($('replyNext'), 'onclick', () => {
      offset += 25;
      action($('replyNext'), async () => {});
    });
    if (production)
      uiScope.listen(window, 'fc-open-conversation', (event) => {
        if (busy || deskBusy) {
          pendingOpen = event.detail;
          return;
        }
        rememberDraft();
        selection = event.detail;
        selectedMessage = null;
        $('replyInspector').hidden = true;
        void action($('replyRefresh'), () => loadDetail(false));
      });
    if (production)
      uiScope.listen(window, 'fc-reply-desk-busy', (event) => {
        deskBusy = event.detail === true;
        controls();
        if (!deskBusy) {
          if (pendingOpen) {
            const next = pendingOpen;
            pendingOpen = null;
            window.dispatchEvent(new CustomEvent('fc-open-conversation', { detail: next }));
          } else void load().catch((e) => error(errorMessage(e)));
        }
      });
    if (production)
      uiScope.listen(window, 'fc-conversation-search', (event) => {
        $('replySearch').value = event.detail;
        offset = 0;
        void load().catch((e) => error(errorMessage(e)));
      });
    if (production)
      uiScope.listen(window, 'fc-conversation-view', () => {
        if (!busy && !deskBusy)
          void request<SourceHistoryResponse>('/api/experiment/replies/history', {})
            .then(load)
            .catch((e) => error(errorMessage(e)));
      });
    load()
      .then(() => {
        $('replyStatus').textContent = production
          ? 'Ready. Import a reply or configure authorized read-only capture.'
          : 'Ready. Choose samples, an EML import, or explicitly enabled live capture.';
      })
      .catch((e) => error(errorMessage(e)));
    uiScope.interval(() => {
      if (
        !document.hidden &&
        (!production || location.hash === '#conversations') &&
        !busy &&
        (report?.capture.running || Date.now() - lastLoad >= 15000)
      )
        void load().catch((e) => error(errorMessage(e)));
    }, 1500);
  })();
}
