export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function escapeHtml(value: unknown): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(value ?? '').replace(/[&<>"']/g, (character) => entities[character] ?? character);
}
/** Raw display text; React escapes it when rendering text and attributes. */
export function displayText(value: unknown): string {
  return String(value ?? '');
}
