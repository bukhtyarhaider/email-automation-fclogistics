import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReply, freshText } from '../src/reply-parser.mjs';
import { eml, dsn } from './fixtures/replies.mjs';

test('new reply text is separated from quoted opt-outs and MIME HTML is converted without quoted blocks/resources', async () => {
  const plain = await parseReply(eml({ text:'Tell me more about your service.\n\nOn Tuesday, Dispatch wrote:\nPlease remove me from your list.' }));
  assert.equal(plain.suggestion.category, 'how_it_works'); assert(!plain.text.includes('remove'));
  const html = await parseReply(eml({ html:'<div>What are your fees?</div><img src="https://example.invalid/pixel"><blockquote>Please remove me</blockquote><div class="gmail_quote">Unsubscribe me</div>' }));
  assert.equal(html.suggestion.category,'pricing'); assert(!html.text.includes('remove')); assert(!html.text.includes('Unsubscribe')); assert(!html.text.includes('pixel'));
  assert.equal(freshText('Hello\n> please remove me\nThanks'),'Hello\nThanks');
});

test('explicit opt-out, negation, autoresponder and DSN classifications remain distinct', async () => {
  const remove = await parseReply(eml({ text:'Please remove me from your list.' }));
  assert.equal(remove.suggestion.definiteOptOut, true);
  const negation = await parseReply(eml({ text:"Don't remove me. I am interested." }));
  assert.notEqual(negation.suggestion.category, 'opt_out');
  const auto = await parseReply(eml({ text:'Pricing information is coming soon.', headers:'Auto-Submitted: auto-generated\r\n' }));
  assert.equal(auto.kind,'automated'); assert.equal(auto.suggestion.category,'automated');
  const ooo = await parseReply(eml({ subject:'Out of office', text:'Please remove me from the thread', headers:'Auto-Submitted: auto-replied\r\n' }));
  assert.equal(ooo.kind,'out_of_office'); assert(!ooo.suggestion.definiteOptOut);
  const bounce = await parseReply(dsn()); assert.equal(bounce.kind,'bounce'); assert.equal(bounce.dsn[0].recipient,'owner@example.com');
});

test('invalid reported dates remain unknown; oversized imports are rejected; Message-IDs retain case', async () => {
  const raw = eml({ id:'<Reply@Example.com>' }).toString().replace('Thu, 29 Oct 2026 12:00:00 +0000','not-a-date');
  const parsed = await parseReply(Buffer.from(raw));
  assert.equal(parsed.date,null); assert.equal(parsed.messageId,'<Reply@Example.com>');
  await assert.rejects(parseReply(Buffer.alloc(2_000_001)), /2 MB/);
});
