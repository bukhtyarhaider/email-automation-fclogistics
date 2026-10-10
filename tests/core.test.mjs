import test from 'node:test';
import assert from 'node:assert/strict';
import {templates,render,reason,assess} from '../src/core.mjs';
const lead=(overrides={})=>({id:'one',company:'Example Trucking',email:'owner@example.com',status:'',statusCell:'G2',fields:{'owner / principal':'JESSICA MILLER','operating status':'Active','out of service':'No',city:'Austin',state:'TX'},...overrides});
const state=()=>({suppression:{},history:{}});
test('template personalizes only available fields and includes opt-out',()=>{
  const m=render(lead(),templates.dispatch);assert.match(m.body,/Hi Jessica,/);assert.match(m.body,/Example Trucking in Austin, TX/);assert.match(m.body,/remove/);assert.equal(assess(m).length,0);
});
test('absent identity and location use truthful fallbacks',()=>{
  const m=render(lead({fields:{}}),templates.dispatch);assert.match(m.body,/Hi there/);assert.doesNotMatch(m.body,/undefined|null| in ,/);
});
test('unknown tokens fail instead of entering email',()=>assert.throws(()=>render(lead(),{subject:'{{equipment}}',body:'Hello'}),/Unknown template/));
test('sheet content is rendered as text, never evaluated as instructions',()=>{
  const m=render(lead({company:'<img src=x onerror=alert(1)> {{firstName}}'}),templates.dispatch);assert.match(m.subject,/<img/);assert.match(m.subject,/\{\{firstName\}\}/);
});
test('duplicate and historical outreach protections',()=>{
  const seen=new Set();assert.equal(reason(lead(),state(),seen),'');assert.equal(reason(lead({id:'two'}),state(),seen),'Duplicate email in workbook');
  assert.equal(reason(lead({status:'Proposal Sent'}),state()),'Already contacted');
  assert.equal(reason(lead({fields:{'historical notes':'Email Send'}}),state()),'Already contacted');
});
test('opt-outs, uncertain sends and suppressed recipients cannot retry',()=>{
  const s=state();s.history['owner@example.com']={status:'Uncertain'};assert.match(reason(lead(),s),/Previously attempted/);
  s.suppression['owner@example.com']='Opt-out';assert.match(reason(lead(),s),/Suppressed/);
  assert.match(reason(lead({status:'Declined'}),state()),/Opt-out/);
});
test('unmapped, shifted, inactive, and invalid rows cannot send',()=>{
  assert.match(reason(lead({statusCell:null}),state()),/no Status/);
  assert.match(reason(lead({layoutIssue:'Shifted columns'}),state()),/Shifted/);
  assert.match(reason(lead({email:'a@example.com,b@example.com'}),state()),/invalid/);
  assert.match(reason(lead({hidden:true}),state()),/Hidden/);
  assert.match(reason(lead({fields:{'operating status':'Inactive','out of service':'No'}}),state()),/not Active/);
});
