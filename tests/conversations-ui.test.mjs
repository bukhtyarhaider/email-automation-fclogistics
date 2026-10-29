import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { fixture, eml, account } from './fixtures/replies.mjs';
import { createExperimentServer } from '../scripts/experiment.mjs';
import { loadPlaywright } from '../src/browser.mjs';
async function serverFixture(t) {
  const f=await fixture(t);const server=createExperimentServer({dataDir:f.dataDir,workspaceDir:f.workspaceDir,env:{}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise((resolve)=>server.close(resolve));});
  const url=`http://127.0.0.1:${server.address().port}`;
  const raw=(route,data,headers={})=>fetch(url+route,data===undefined?{headers}:{method:'POST',headers:{'Content-Type':'application/json','X-FC-Request':'1',...headers},body:JSON.stringify(data)});
  return {...f,url,raw};
}

test('conversation HTTP routes remain isolated: samples/import/review/backfill work, live capture is opt-in, and source secrets stay private',async(t)=>{
  const f=await serverFixture(t);
  const initial=await(await f.raw('/api/experiment/replies')).json();assert.equal(initial.capture.enabled,false);assert.equal(initial.total,0);
  assert.equal((await f.raw('/api/experiment/replies/scan',{})).status,400);
  assert.equal((await f.raw('/api/experiment/replies/demo',{})).status,200);
  const samples=await(await f.raw('/api/experiment/replies?mode=demo')).json();assert.equal(samples.total,8);assert.equal(samples.summary.humanMessages,4);assert.equal(samples.summary.automatedMessages,2);assert.equal(samples.summary.bounceNotices,1);
  const postEml=(headers={})=>fetch(f.url+'/api/experiment/replies/import?mailbox='+encodeURIComponent(account),{method:'POST',headers:{'X-FC-Request':'1',...headers},body:eml()});
  assert.equal((await postEml({Origin:'https://untrusted.example'})).status,403);
  const accepted=await(await postEml()).json();assert.equal(accepted.match,'exact');
  assert.equal((await(await postEml()).json()).duplicate,true);
  const list=await(await f.raw('/api/experiment/replies')).json();assert.equal(list.total,1);assert.equal(list.summary.humanMessages,1);
  assert(!JSON.stringify(list).includes('PRIVATE_TEAM_SECRET'));assert(!JSON.stringify(list).includes('PRIVATE_TOKEN_HASH'));
  const view=await(await f.raw('/api/experiment/reply-detail?id='+list.rows[0].id+'&type=conversation')).json();assert.equal(view.messages[0].category,'pricing');
  assert.equal((await f.raw('/api/experiment/replies/review',{messageId:view.messages[0].id,category:'interested',note:'Inspected mailbox'})).status,200);
  assert.equal((await f.raw('/api/experiment/replies/backfill',{})).status,200);
  assert.equal((await f.raw('/api/experiment/reply-detail?id=constructor&type=conversation')).status,400);
  assert.equal((await f.raw('/replies.json')).status,404);assert.equal((await f.raw('/api/send',{})).status,404);
  assert.equal(await fs.readFile(path.join(f.dataDir,'state.json'),'utf8'),f.before);
});

test('conversation browser supports samples, filters, drafts, manual matching, EML import and safe plain-text desktop/mobile viewing', {skip:process.env.FC_BROWSER_TESTS!=='1'},async(t)=>{
  const f=await serverFixture(t), browser=await loadPlaywright().chromium.launch({channel:process.env.FC_TEST_BROWSER_CHANNEL||'chrome',headless:true});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1440,height:1100}}), errors=[], external=[];
  page.on('pageerror',(e)=>errors.push(e.message));page.on('request',(r)=>{if(!r.url().startsWith(f.url))external.push(r.url());});
  await page.goto(f.url+'/conversations');
  await page.locator('#replyDemo').click();
  await page.waitForFunction(()=>document.querySelector('#replyRows').querySelectorAll('tr').length===8);
  assert.equal(await page.locator('#replyMode').inputValue(),'demo');assert(await page.locator('#replyScan').isDisabled());
  const pricingRow=page.locator('#replyRows tr').filter({hasText:'owner-pricing@example.invalid'});
  await pricingRow.locator('button[data-type="conversation"]').click();
  await page.locator('#replyReviewPanel').waitFor();
  await page.locator('#replyReviewNote').fill('Unsaved note stays during refresh');
  await page.locator('#replyRefresh').click();
  await page.waitForFunction(()=>!document.querySelector('#replyRefresh').disabled);
  assert.equal(await page.locator('#replyReviewNote').inputValue(),'Unsaved note stays during refresh');
  await page.locator('#replyReviewCategory').selectOption('interested');await page.locator('#replyReviewSave').click();
  await page.waitForFunction(()=>document.querySelector('#replyStatus').textContent.includes('review saved'));
  await page.locator('#replyCategory').selectOption('needs_match');
  await page.waitForFunction(()=>document.querySelector('#replyRows').querySelectorAll('tr').length===1 && document.querySelector('#replyRows').querySelectorAll('button[data-type="review"]').length===1 && !document.querySelector('#replyRefresh').disabled);
  await page.locator('#replyRows button').click();await page.locator('#replyMatchPanel').waitFor();
  await page.locator('#replyReviewNote').fill('Inspected original mailbox; same carrier thread');
  const candidates=await page.locator('#replyLink option').evaluateAll((options)=>options.filter((o)=>o.value).map((o)=>({value:o.value,text:o.textContent})));
  await page.locator('#replyLink').selectOption(candidates.find((o)=>o.text.includes('owner-pricing@example.invalid')).value);
  await page.locator('#replyLinkConfirm').check();await page.locator('#replyReviewSave').click();
  await page.waitForFunction(()=>document.querySelector('#replyStatus').textContent.includes('review saved'));
  assert.equal(await page.locator('#replyMatchPanel').isVisible(),false);
  await page.locator('summary').filter({hasText:'Import one exported reply'}).click();
  await page.locator('#replyImportAccount').selectOption(account);
  await page.locator('#replyEml').setInputFiles({name:'reply.eml',mimeType:'message/rfc822',buffer:eml({text:'What are your fees? <script>window.pwned=true</script>',html:null})});
  await page.locator('#replyImport').click();
  await page.waitForFunction(()=>document.querySelector('#replyMode').value==='real'&&document.querySelector('#replyRows').querySelectorAll('button').length===1);
  await page.locator('#replyRows button').click();await page.locator('#replyReviewPanel').waitFor();
  assert.match(await page.locator('#replyThread').innerText(),/<script>/);
  assert.equal(await page.evaluate(()=>window.pwned),undefined);
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1100});await page.locator('#replyInspector').scrollIntoViewIfNeeded();
    assert(await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)<=innerWidth+1));
    if(process.env.FC_UI_SCREENSHOT_DIR){await fs.mkdir(process.env.FC_UI_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.FC_UI_SCREENSHOT_DIR,`conversations-${width}.png`),fullPage:true});}
  }
  await page.reload();await page.locator('#replyRows button').waitFor();assert.equal(await page.locator('#replyRows button').count(),1);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  assert.equal(await fs.readFile(path.join(f.dataDir,'state.json'),'utf8'),f.before);
});
