import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ExperimentImports } from '../../src/experiment-imports.mjs';
import { ExperimentReplies } from '../../src/experiment-replies.mjs';
import { check } from '../../scripts/doctor.mjs';
export const account = 'sender@example.com', recipient = 'owner@example.com', originalId = '<sent-one@example.com>';
export function eml({ id = '<reply-one@example.com>', from = recipient, to = account, reference = originalId, subject = 'Re: Dispatch support', text = 'What are your fees?', headers = '', html = null } = {}) {
  return Buffer.from(`Message-ID: ${id}\r\nFrom: ${from}\r\nTo: ${to}\r\n${reference ? `In-Reply-To: ${reference}\r\nReferences: ${reference}\r\n` : ''}Subject: ${subject}\r\nDate: Thu, 29 Oct 2026 12:00:00 +0000\r\n${headers}${html === null ? 'Content-Type: text/plain; charset=utf-8' : 'Content-Type: text/html; charset=utf-8'}\r\n\r\n${html ?? text}`);
}
export function dsn() {
  return Buffer.from(`Message-ID: <dsn@example.com>\r\nFrom: mailer-daemon@example.com\r\nTo: ${account}\r\nSubject: Delivery failed\r\nMIME-Version: 1.0\r\nContent-Type: multipart/report; report-type=delivery-status; boundary="b"\r\n\r\n--b\r\nContent-Type: text/plain\r\n\r\nFailure report\r\n--b\r\nContent-Type: message/delivery-status\r\n\r\nReporting-MTA: dns; example.com\r\nOriginal-Message-ID: ${originalId}\r\n\r\nFinal-Recipient: rfc822; ${recipient}\r\nAction: failed\r\nStatus: 5.1.1\r\nDiagnostic-Code: smtp; 550 unknown mailbox\r\n\r\n--b--\r\n`);
}
export async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-reply-experiment-'));
  const dataDir = path.join(directory, 'source'), workspaceDir = path.join(directory, 'workspace');
  await fs.mkdir(dataDir);
  const trackingId = '12345678-1234-1234-1234-123456789abc';
  const state = { profiles: [{ email: account }], campaigns: [{ id: 'c1', name: 'Example', workbook: { file: 'missing.xlsx' } }],
    history: { [recipient]: { trackingId, recipient, accountEmail: account, status: 'Sent', sendStatus:'webmail_sent', subject:'Dispatch support', body:'Original introduction. Reply remove to opt out.', confirmedAt:'2026-10-28T12:00:00.000Z', campaignId:'c1', teamToken:'PRIVATE_TEAM_SECRET' } },
    tracking: { records: { [trackingId]: { id:trackingId, sender:account, recipient, subject:'Dispatch support', messageIds:[originalId], attemptedAt:'2026-10-28T12:00:00.000Z', confirmedAt:'2026-10-28T12:00:00.000Z', events:[], openTokenHash:'PRIVATE_TOKEN_HASH' } } }, suppression: {} };
  const before = JSON.stringify(state);
  await fs.writeFile(path.join(dataDir, 'state.json'), before);
  const imports = new ExperimentImports({ dataDir, workspaceDir, python:check() });
  const replies = new ExperimentReplies({ imports });
  t.after(() => fs.rm(directory, { recursive:true, force:true }));
  return { directory, dataDir, workspaceDir, state, before, trackingId, imports, replies };
}
