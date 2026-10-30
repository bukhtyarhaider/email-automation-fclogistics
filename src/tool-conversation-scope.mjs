import { digest } from './reply-parser.mjs';
const email = (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const isToolConversation = (root) => Boolean(root && !root.demo && root.source === 'local_sent_history' && email(root.account) && email(root.recipient));
export function toolReferenceIndex(state, account) {
  const roots = Object.values(state.roots).filter((root) => isToolConversation(root) && (!account || root.account === account));
  const ids = new Set(roots.map((root) => root.id)), references = new Map();
  const add = (id, rootId) => { if (!id) return; const values = references.get(id) || new Set(); values.add(rootId); references.set(id, values); };
  for (const root of roots) for (const id of root.messageIds) add(id, root.id);
  for (const message of Object.values(state.messages)) if (ids.has(message.rootId) && !['review', 'ignored'].includes(message.match)) add(message.messageId, message.rootId);
  return { roots, ids, references };
}
export function relatedToolRoots(state, mail, account, index = toolReferenceIndex(state, account)) {
  const refs = [...(mail.references || []), ...(mail.dsn || []).flatMap((d) => d.messageIds || [])];
  const candidates = new Set(refs.flatMap((id) => [...(index.references.get(id) || [])]));
  for (const root of index.roots) if (((mail.from || []).includes(root.recipient)) || ((mail.from || [])[0] === account && (mail.to || []).includes(root.recipient))) candidates.add(root.id);
  return [...candidates];
}
export function captureScopeSignature(state, account, includeReferences = true) {
  const index = toolReferenceIndex(state, account);
  return digest(JSON.stringify({ version: 'tool-conversation-v3', roots: index.roots.map((r) => [r.id, r.account, r.recipient]).sort(), references: includeReferences==='anchors'?[...new Set(index.roots.flatMap((r)=>r.anchorMessageIds||r.messageIds))].sort():includeReferences?[...index.references.keys()].sort():[] }));
}
export function confirmedToolSend(item, legacy = false) {
  if (!item || item.seedId || ['Uncertain', 'Sending', 'Not sent — manual review'].includes(item.status)) return false;
  if (item.sendStatus) return item.sendStatus === 'webmail_sent';
  return legacy && item.status === 'Sent';
}
