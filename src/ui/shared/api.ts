import { uiScope } from './lifecycle';
import type { ActionResult } from './types/api';
/** DTOs describe the existing local HTTP boundary. Business validation remains on the server. */
export async function requestJson<T = ActionResult>(url: string, data?: unknown): Promise<T> {
  const response = await uiScope.fetch(
    url,
    data === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-FC-Request': '1' },
          body: JSON.stringify(data),
        },
  );
  const value: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      value && typeof value === 'object' && 'error' in value
        ? String(value.error)
        : 'Request failed.',
    );
  return value as T;
}
