import test from 'node:test';
import assert from 'node:assert/strict';
import { StateFile } from '../src/state-file.mjs';
test('queued telemetry cannot publish an older campaign pointer over activation, and later saves retain concurrent reply evidence',async()=>{
 const campaign={id:'c1',workbook:{file:'before.xlsx'},mapping:{}};
 const state={campaigns:[campaign],activeCampaign:'c1',workbook:campaign.workbook,suppression:{}};
 let unblock;const gate=new Promise((r)=>unblock=r),published=[];let first=true;
 const store=new StateFile({state,file:'unused',write:async(content,committed)=>{if(first){first=false;await gate;}published.push(JSON.parse(content));committed();}});
 const earlier=store.save();await Promise.resolve();
 const activation=store.save({campaign,next:{...campaign,workbook:{file:'reviewed.xlsx'},enabled:false}});
 state.suppression['owner@example.com']='Captured opt-out';const later=store.save();
 assert.equal(campaign.workbook.file,'before.xlsx');unblock();await Promise.all([earlier,activation,later]);
 assert.equal(published.at(-1).campaigns[0].workbook.file,'reviewed.xlsx');assert.equal(published.at(-1).suppression['owner@example.com'],'Captured opt-out');assert.equal(state.workbook.file,'reviewed.xlsx');
});
test('failed workbook publication leaves campaign memory unchanged and later saves recover without losing evidence',async()=>{
 const campaign={id:'c1',workbook:{file:'before.xlsx'}},state={campaigns:[campaign],activeCampaign:'c1',workbook:campaign.workbook,history:{keep:{status:'Sent'}}};let failing=true,last;
 const store=new StateFile({state,file:'unused',write:async(content,committed)=>{if(failing)throw new Error('Disk unavailable');last=JSON.parse(content);committed();}});
 await assert.rejects(store.save({campaign,next:{...campaign,workbook:{file:'after.xlsx'}}}),/Disk unavailable/);assert.equal(campaign.workbook.file,'before.xlsx');failing=false;await store.save();assert.equal(last.campaigns[0].workbook.file,'before.xlsx');assert.equal(last.history.keep.status,'Sent');
});
