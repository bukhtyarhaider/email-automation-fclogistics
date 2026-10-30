import type { UIElements } from './dom-elements';
/** Known IDs are checked against the actual native elements in the React views. */
export function element<K extends keyof UIElements>(id: K): UIElements[K];
export function element<T extends HTMLElement = HTMLElement>(id: string): T;
export function element(id: string): HTMLElement {
  return document.getElementById(id)!;
}
export function targetElement(event: Event): HTMLElement | null {
  return event.target instanceof Element ? event.target.closest<HTMLElement>('*') : null;
}
export function eventElement(event: Event): HTMLElement {
  return (event.target instanceof Element ? event.target : event.currentTarget) as HTMLElement;
}
