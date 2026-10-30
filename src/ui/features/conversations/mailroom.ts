import { uiScope } from '../../shared/lifecycle';
import { element as $ } from '../../shared/dom';

export function mountMailroom() {
  (() => {
    if (!$('mailroomWorkspace')) return;
    const open = (id: string) => {
      const dialog = $<HTMLDialogElement>(id);
      if (!dialog.open) dialog.showModal();
    };
    uiScope.handler($('mailroomToolsOpen'), 'onclick', () => open('mailroomToolsDialog'));
    uiScope.handler($('mailroomEmptyTools'), 'onclick', () => {
      open('mailroomToolsDialog');
      $('replyCaptureTools').open = true;
    });
    uiScope.handler($('mailroomFiltersOpen'), 'onclick', () => open('mailroomFiltersDialog'));
    for (const id of ['mailroomDetailsOpen', 'mailroomCarrierDetails'])
      uiScope.handler($(id), 'onclick', () => open('mailroomDetailsDialog'));
    uiScope.handler($('mailroomManageLines'), 'onclick', () => {
      open('mailroomLibraryDialog');
      document.querySelector<HTMLDetailsElement>('.reply-library')!.open = true;
    });
    uiScope.handler($('mailroomResolve'), 'onclick', () => {
      open('mailroomDetailsDialog');
      $('replyReviewNote').focus();
    });
    document.querySelectorAll<HTMLElement>('[data-close-mailroom]').forEach((b) => {
      uiScope.handler(b, 'onclick', () => $<HTMLDialogElement>(b.dataset.closeMailroom!).close());
    });
    uiScope.listen(window, 'hashchange', () => {
      if (location.hash !== '#conversations')
        document
          .querySelectorAll<HTMLDialogElement>('.mailroom-dialog[open]')
          .forEach((d) => d.close());
    });
  })();
}
