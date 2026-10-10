// Reservation, confirmation and workbook writes form separate durable steps.
// A mail server and an XLSX file cannot share a transaction.
export async function deliver({state,lead,message,persist,send,syncStatus,event,onConfirmed}) {
  state.history[lead.email]={status:'Sending',at:new Date().toISOString(),leadId:lead.id,subject:message.subject,workbook:state.workbook.file};
  await persist(); // If this fails, Send is never invoked.
  try {
    const evidence=await send();
    state.history[lead.email].status='Sent';
    state.history[lead.email].evidence=evidence;
    state.history[lead.email].syncNeeded=true;
    onConfirmed?.();
    await persist();
    await syncStatus(lead,'Proposal Sent');
    state.history[lead.email].syncNeeded=false;
    event(`Sent to ${lead.company}. Workbook status updated.`);
    await persist();
  } catch(error) {
    const item=state.history[lead.email];
    if(item.status==='Sent') {
      item.syncNeeded=true;
      event(`Email sent to ${lead.company}, but workbook update failed. Use Repair workbook status.`);
    } else {
      item.status='Uncertain';
      event(`Send result uncertain for ${lead.company}. Check Sent in webmail before recording the outcome.`);
      await syncStatus(lead,'Send Uncertain').catch(()=>{});
    }
    await persist();
    throw error;
  }
}
