import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
export function loadPlaywright() {
  try { return require('playwright'); }
  catch {
    return require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
  }
}
export class MailBrowser {
  constructor() { this.browser = null; this.page = null; this.prepared = null; this.authenticated = false; }
  async connect(password) {
    await this.close();
    const {chromium} = loadPlaywright();
    this.browser = await chromium.launch({channel: 'chrome', headless: false});
    const context = await this.browser.newContext(); // Ephemeral: no saved auth state or password.
    this.page = await context.newPage();
    this.page.setDefaultTimeout(15000);
    await this.page.goto('https://privateemail.com/spm/mail/INBOX/', {waitUntil:'domcontentloaded'});
    const login = this.page.getByRole('button', {name: 'Log in', exact: true});
    const compose = this.page.getByRole('button', {name: 'Compose', exact: true});
    await login.or(compose).first().waitFor({timeout:45000});
    if (await login.isVisible()) {
      await this.page.getByLabel('Email', {exact: true}).fill('markanthony@fclogistics.us');
      await this.page.getByLabel('Password', {exact: true}).fill(password);
      await this.page.getByRole('button', {name:'Log in', exact:true}).click();
    }
    return this.resume();
  }
  async resume() {
    if (!this.page || this.page.isClosed()) throw new Error('Connect the mailbox first.');
    try { await this.page.getByRole('button', {name:'Compose', exact:true}).waitFor({timeout:45000}); }
    catch { throw new Error('Sign-in needs attention in Chrome. Check the credentials or complete verification there, then choose Continue sign-in.'); }
    this.authenticated = true;
    return {connected:true};
  }
  async close() {
    if (this.browser) await this.browser.close().catch(()=>{});
    this.browser = null; this.page = null; this.prepared = null; this.authenticated = false;
  }
  async isConnected() {
    return this.authenticated && !!this.page && !this.page.isClosed() && this.browser.isConnected();
  }
  async prepare(message) {
    if (!await this.isConnected()) throw new Error('Connect the mailbox first.');
    if (this.prepared || await this.page.locator('[id^="composer_window_"]').count()) throw new Error('A compose window is already open. Close it in Chrome before preparing another message.');
    await this.page.getByRole('button', {name:'Compose', exact:true}).click();
    const composer = this.page.locator('[id^="composer_window_"]');
    await composer.waitFor();
    if (await composer.count() !== 1) throw new Error('Expected one compose window.');
    const from = composer.getByRole('button', {name:'markanthony@fclogistics.us', exact:true});
    await from.waitFor();
    const subject = composer.locator('input#subject');
    // The inspected compose DOM has two text inputs: recipient and #subject.
    const to = composer.locator('input[type="text"]:not(#subject):not(:disabled)');
    if (await to.count() !== 1) throw new Error('Recipient field changed. Review the mail adapter.');
    await to.fill(message.to); await to.press('Enter');
    await subject.fill(message.subject);
    const editor = composer.frameLocator('iframe[title="Composer iframe"]').locator('#htmlEditorIframeEditor');
    await editor.waitFor();
    const signature = await editor.locator('.spm-signature-block').evaluate(el=>el.outerHTML);
    if (!signature || !await editor.locator('.spm-signature-block').innerText()) throw new Error('Existing signature not found. Configure the mailbox signature before sending.');
    // Prepend escaped plain text nodes. Never replace editor.innerHTML or the signature.
    await editor.evaluate((el, body) => {
      if (el.querySelector('[data-fc-outreach]')) throw new Error('Message is already inserted');
      const wrapper = el.ownerDocument.createElement('div');
      wrapper.dataset.fcOutreach = 'true';
      for (const line of body.split('\n')) {
        const paragraph = el.ownerDocument.createElement('div');
        paragraph.style.fontFamily='Arial, Helvetica, sans-serif';
        paragraph.style.fontSize='10.5pt';
        if (line) paragraph.textContent=line; else paragraph.appendChild(el.ownerDocument.createElement('br'));
        wrapper.appendChild(paragraph);
      }
      wrapper.appendChild(el.ownerDocument.createElement('br'));
      el.prepend(wrapper);
      el.dispatchEvent(new Event('input', {bubbles:true}));
    }, message.body);
    if (await editor.locator('.spm-signature-block').evaluate(el=>el.outerHTML) !== signature) throw new Error('Signature changed during insertion. Sending blocked.');
    const bodyNode=editor.locator('[data-fc-outreach]');
    const insertedText=await bodyNode.evaluate(el=>Array.from(el.children).filter(child=>child.tagName==='DIV').map(child=>child.textContent).join('\n'));
    if(insertedText!==message.body) throw new Error('Inserted body does not match the preview.');
    const bodyHtml=await bodyNode.evaluate(el=>el.innerHTML);
    this.prepared = {message, composer, editor, signature, bodyHtml};
    await this.validate();
    return {signature: await editor.locator('.spm-signature-block').innerText()};
  }
  async validate() {
    const p = this.prepared;
    if (!p || !await this.isConnected()) throw new Error('No prepared message.');
    if (await p.composer.locator('#subject').inputValue() !== p.message.subject) throw new Error('Subject changed. Prepare the message again.');
    if (await p.editor.locator('[data-fc-outreach]').evaluate(el=>el.innerHTML) !== p.bodyHtml) throw new Error('Body changed in Chrome. Prepare the message again.');
    if (await p.editor.locator('.spm-signature-block').evaluate(el=>el.outerHTML) !== p.signature) throw new Error('Signature changed. Sending blocked.');
    const text = await p.composer.innerText();
    if (!text.includes('markanthony@fclogistics.us') || !text.toLowerCase().includes(p.message.to)) throw new Error('Sender or recipient changed. Sending blocked.');
    const entry=p.composer.locator('input[type="text"]:not(#subject):not(:disabled)');
    if(await entry.count()!==1) throw new Error('Unexpected recipient fields. Sending blocked.');
    const recipients = await entry.inputValue();
    if (recipients.trim()) throw new Error('An uncommitted recipient is present. Sending blocked.');
    // The committed recipient chip has a disabled Edit input in this UI.
    const addresses=await p.composer.locator('input[type="text"]:disabled').evaluateAll(es=>es.map(el=>el.value.toLowerCase()));
    if(addresses.length!==1||addresses[0]!==p.message.to) throw new Error('Unexpected recipient list. Sending blocked.');
  }
  async send() {
    await this.validate();
    const {composer} = this.prepared;
    // A fresh visible success notice is required. Window closure alone is not proof.
    const confirmation = this.page.getByText(/^(message|email)( was)? sent( successfully)?[.!]?$/i);
    if (await confirmation.isVisible().catch(()=>false)) throw new Error('A previous send notice is still visible. Wait before continuing.');
    await composer.getByRole('button', {name:'Send', exact:true}).click();
    await confirmation.waitFor({state:'visible', timeout:20000});
    const evidence = await confirmation.innerText();
    this.prepared = null;
    return evidence;
  }
  async release() {
    const composer = this.prepared?.composer || this.page?.locator('[id^="composer_window_"]');
    if (composer && await composer.count()===1) {
      await composer.getByRole('button',{name:'Close',exact:true}).click();
      this.prepared = null;
    }
  }
}
