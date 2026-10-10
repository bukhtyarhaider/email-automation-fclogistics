import test from 'node:test';
import assert from 'node:assert/strict';
import {deliver} from '../src/delivery.mjs';
import {reason} from '../src/core.mjs';
function harness() {
  const calls=[];
  const state={history:{},suppression:{},workbook:{file:'leads.xlsx'}};
  const lead={id:'row1',email:'owner@example.com',company:'Carrier',status:'',statusCell:'G2',fields:{'operating status':'Active','out of service':'No'}};
  return {state,lead,message:{subject:'Dispatch support'},calls,persist:async()=>{calls.push(['persist',state.history[lead.email].status]);},send:async()=>{calls.push(['send']);return 'Message sent';},syncStatus:async(_,status)=>calls.push(['sheet',status]),event:message=>calls.push(['event',message])};
}
test('Send is invoked only after a durable reservation; status changes after confirmation',async()=>{
  const h=harness();await deliver(h);
  assert.deepEqual(h.calls.slice(0,4),[['persist','Sending'],['send'],['persist','Sent'],['sheet','Proposal Sent']]);
  assert.equal(h.state.history[h.lead.email].status,'Sent');
  assert.equal(h.state.history[h.lead.email].syncNeeded,false);
  assert.match(reason(h.lead,h.state),/Previously attempted/);
});
test('failed reservation never sends',async()=>{
  const h=harness();h.persist=async()=>{throw new Error('Disk full');};
  await assert.rejects(deliver(h),/Disk full/);assert.equal(h.calls.length,0);
});
test('confirmation timeout records uncertainty and prevents automatic retries',async()=>{
  const h=harness();h.send=async()=>{throw new Error('No confirmation');};
  await assert.rejects(deliver(h),/No confirmation/);
  assert.equal(h.state.history[h.lead.email].status,'Uncertain');
  assert(h.calls.some(c=>c[0]==='sheet'&&c[1]==='Send Uncertain'));
  assert.match(reason(h.lead,h.state),/Previously attempted: Uncertain/);
});
test('workbook failure after confirmation records repair need without losing Sent',async()=>{
  const h=harness();h.syncStatus=async()=>{throw new Error('Workbook locked');};
  await assert.rejects(deliver(h),/Workbook locked/);
  assert.equal(h.state.history[h.lead.email].status,'Sent');
  assert.equal(h.state.history[h.lead.email].syncNeeded,true);
  assert.equal(h.calls.filter(c=>c[0]==='send').length,1);
});
test('uncertain send still blocks retry even if workbook cannot be written',async()=>{
  const h=harness();h.send=async()=>{throw new Error('Connection lost');};h.syncStatus=async()=>{throw new Error('Disk full');};
  await assert.rejects(deliver(h),/Connection lost/);
  assert.equal(h.calls.at(-1)[1],'Uncertain');
});
