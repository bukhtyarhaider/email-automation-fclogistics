// Preloaded only by integration tests. No real browser or email network connection.
import { MailBrowser } from "../../src/browser.mjs";
import fs from "node:fs/promises";
MailBrowser.prototype.connect = async function (_, account) {
  this.account = account;
  this.authenticated = true;
  return { connected: true };
};
MailBrowser.prototype.isConnected = async function () {
  return this.authenticated;
};
MailBrowser.prototype.prepare = async function (message) {
  this.prepared = { message };
  return { signature: "Existing test signature" };
};
MailBrowser.prototype.validate = async function () {
  if (!this.prepared) throw new Error("No prepared message");
};
MailBrowser.prototype.send = async function () {
  await fs.appendFile(
    process.env.TEST_SEND_LOG,
    JSON.stringify(this.prepared.message) + "\n",
  );
  if (process.env.TEST_SEND_FAIL === "1")
    throw new Error("Injected confirmation failure");
  this.prepared = null;
  return "Message sent";
};
MailBrowser.prototype.release = async function () {
  this.prepared = null;
};
MailBrowser.prototype.close = async function () {
  this.authenticated = false;
  this.prepared = null;
};
