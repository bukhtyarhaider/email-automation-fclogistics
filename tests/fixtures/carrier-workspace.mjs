import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fixture } from './replies.mjs';
import { CarrierWorkspace } from '../../src/carrier-workspace.mjs';
const run=promisify(execFile);
export async function workspace(t) {
 const f=await fixture(t),state=f.state;state.settings={team:{enabled:false}};state.automation={enabled:false};state.activeCampaign='c1';state.campaigns[0].workbook.file='leads.xlsx';state.campaigns[0].mapping={};state.campaigns[0].enabled=false;state.campaigns[0].reviewRequired=true;
 const program=`import zipfile,sys
ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
def c(r,v):return '<c r="'+r+'" t="inlineStr"><is><t>'+v+'</t></is></c>'
rows='<row r="1">'+c('A1','Company')+c('B1','Email')+c('C1','USDOT #')+c('E1','Operating Status')+c('F1','Out of service')+'</row>'
for n,email in [(2,'owner@example.com'),(3,'second@example.com')]:rows+='<row r="'+str(n)+'">'+c('A'+str(n),'Example Fleet')+c('B'+str(n),email)+c('C'+str(n),'12345')+c('E'+str(n),'Active')+c('F'+str(n),'No')+'</row>'
with zipfile.ZipFile(sys.argv[1],'w') as z:
 z.writestr('xl/workbook.xml','<workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Leads" sheetId="1" r:id="rId1"/></sheets></workbook>')
 z.writestr('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
 z.writestr('xl/worksheets/sheet1.xml','<worksheet xmlns="'+ns+'"><sheetData>'+rows+'</sheetData></worksheet>')`;
 await run(f.imports.python,['-c',program,path.join(f.dataDir,'leads.xlsx')]);
 const persist=()=>fs.writeFile(path.join(f.dataDir,'state.json'),JSON.stringify(state));await persist();
 // execFile has no stdin option; use the tested parser helper for mappings.
 const { spawn }=await import('node:child_process');
 const read=async(file,mapping)=>new Promise((resolve,reject)=>{const p=spawn(f.imports.python,[path.resolve('src/workbook.py'),'read',file],{stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',(b)=>out+=b);p.stderr.on('data',(b)=>err+=b);p.on('error',reject);p.on('exit',(code)=>code?reject(new Error(err)):resolve(JSON.parse(out)));p.stdin.end(JSON.stringify(mapping));});
 const calls=[],team={call:async(action,input)=>{calls.push({action,input});return {ok:true};}};
 const ops=new CarrierWorkspace({dataDir:f.dataDir,state,persist,readWorkbook:read,team,python:f.imports.python,env:{}});await ops.initialize();
 return {...f,state,ops,persist,read,calls,original:await fs.readFile(path.join(f.dataDir,'leads.xlsx'))};
}
