import test from 'node:test';
import assert from 'node:assert/strict';
import { MailBrowser, loadPlaywright } from '../src/browser.mjs';
test('real browser composer retains signature/text, inserts marker/pixel, and requires a fresh send notice', { skip: process.env.FC_BROWSER_TESTS !== '1' }, async (t) => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ channel: process.env.FC_TEST_BROWSER_CHANNEL || 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://tracking.example.invalid/**', (route) => route.fulfill({ status: 200, contentType: 'image/gif', body: '' }));
  const editor = '<div id="htmlEditorIframeEditor" contenteditable="true"><div class="spm-signature-block"><b>Existing Signature</b><br>Example LLC</div></div>';
  await page.setContent(`<button id="compose">Compose</button><div id="mount"></div><div id="notice"></div><script>
    document.querySelector('#compose').onclick=()=>{
      const composer=document.createElement('div'); composer.id='composer_window_1';
      composer.innerHTML='<button>sender@example.com</button><input type="text" id="recipient"><input id="subject" type="text"><iframe title="Composer iframe"></iframe><button id="send">Send</button><button>Close</button>';
      composer.querySelector('iframe').srcdoc=${JSON.stringify(editor)};
      composer.querySelector('#recipient').onkeydown=(e)=>{ if(e.key==='Enter') { const chip=document.createElement('input'); chip.type='text';chip.disabled=true;chip.value=e.target.value;composer.append(chip); const label=document.createElement('span'); label.textContent=e.target.value; composer.append(label); e.target.value=''; } };
      composer.querySelector('#send').onclick=()=>{document.querySelector('#notice').textContent='Message sent'; composer.remove();};
      document.querySelector('#mount').append(composer);
    };
    </script>`);
  const mail = new MailBrowser();
  Object.assign(mail, { browser, page, authenticated: true, account: { email: 'sender@example.com' } });
  const message = { to: 'controlled@example.com', subject: 'Synthetic test', body: 'Hi there,\n\nA plain text introduction.\nThanks.',
    trackingId: '11111111-1111-4111-8111-111111111111', pixelUrl: `https://tracking.example.invalid/o/${'a'.repeat(43)}.gif` };
  const proof = await mail.prepare(message);
  assert.match(proof.signature, /Existing Signature/);
  const node = mail.prepared.editor.locator('[data-fc-outreach]');
  assert.equal(await node.getAttribute('data-fc-tracking'), message.trackingId);
  assert.equal(await node.locator('img').getAttribute('src'), message.pixelUrl);
  await mail.validate();
  assert.equal(await mail.send(), 'Message sent');
  assert.equal(mail.prepared, null);
  await mail.prepare({ ...message, pixelUrl: undefined });
  await assert.rejects(mail.send(), (e) => e.sendNotAttempted === true);
  await page.locator('#notice').evaluate((el) => { el.textContent = ''; });
  await node.locator('div').first().evaluate((el) => { el.textContent = 'Altered message'; });
  await assert.rejects(mail.send(), /Body changed/);
});
