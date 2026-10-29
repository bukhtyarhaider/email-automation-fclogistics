(() => {
  const $=(id)=>document.getElementById(id);if(!$('mailroomWorkspace'))return;
  const open=(id)=>{const dialog=$(id);if(!dialog.open)dialog.showModal();};
  $('mailroomToolsOpen').onclick=()=>open('mailroomToolsDialog');$('mailroomEmptyTools').onclick=()=>{open('mailroomToolsDialog');$('replyCaptureTools').open=true;};
  $('mailroomFiltersOpen').onclick=()=>open('mailroomFiltersDialog');
  for(const id of ['mailroomDetailsOpen','mailroomCarrierDetails'])$(id).onclick=()=>open('mailroomDetailsDialog');
  $('mailroomManageLines').onclick=()=>{open('mailroomLibraryDialog');document.querySelector('.reply-library').open=true;};
  $('mailroomResolve').onclick=()=>{open('mailroomDetailsDialog');$('replyReviewNote').focus();};
  document.querySelectorAll('[data-close-mailroom]').forEach((b)=>{b.onclick=()=>$(b.dataset.closeMailroom).close();});
  window.addEventListener('hashchange',()=>{if(location.hash!=='#conversations')document.querySelectorAll('.mailroom-dialog[open]').forEach((d)=>d.close());});
})();
