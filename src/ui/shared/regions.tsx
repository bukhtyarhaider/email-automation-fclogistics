import {
  Children,
  Fragment,
  createElement,
  cloneElement,
  isValidElement,
  useSyncExternalStore,
} from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal, flushSync } from 'react-dom';

type Region = { target: Element; content: ReactNode; revision: number; id: number };
const regions = new Map<Element, Region>();
const listeners = new Set<() => void>();
let snapshot: readonly Region[] = [];
let nextId = 0;
function publish() {
  snapshot = [...regions.values()];
  for (const listener of listeners) listener();
}
function normalize(content: ReactNode): ReactNode {
  return Children.toArray(content).map((node) =>
    isValidElement<{ children?: ReactNode }>(node)
      ? cloneElement(
          node,
          {},
          node.props.children === undefined ? undefined : normalize(node.props.children),
        )
      : node,
  );
}
/** React portals own dynamic feature regions. Replacing a region retains the original replacement/focus semantics. */
export function renderRegion(target: Element | null, content: ReactNode): void {
  if (!target?.isConnected) return;
  for (const [element] of regions)
    if (element !== target && target.contains(element)) regions.delete(element);
  const previous = regions.get(target);
  if (!previous) target.replaceChildren();
  regions.set(target, {
    target,
    content: normalize(content),
    revision: (previous?.revision ?? 0) + 1,
    id: previous?.id ?? ++nextId,
  });
  flushSync(publish);
}
export function insertRegion(target: Element, position: InsertPosition, content: ReactNode): void {
  const prior = regions.get(target)?.content ?? captureContent(target);
  renderRegion(target, position === 'afterbegin' ? [content, prior] : [prior, content]);
}
export function regionSignature(content: ReactNode): string {
  return JSON.stringify(content);
}
export function FeatureRegions() {
  const state = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => snapshot,
  );
  return state.map(({ target, content, revision, id }) =>
    createPortal(<Fragment key={revision}>{content}</Fragment>, target, String(id)),
  );
}
export function disposeRegions() {
  flushSync(() => {
    regions.clear();
    publish();
  });
}
/** Snapshot native text/icons for transient clipboard feedback without serializing HTML. */
export function captureContent(target: Element): ReactNode {
  const existing = regions.get(target);
  if (existing) return existing.content;
  function convert(node: Node): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (!(node instanceof Element)) return null;
    const props: Record<string, unknown> = {};
    for (const attribute of node.attributes) {
      const name =
        (
          {
            class: 'className',
            for: 'htmlFor',
            'stroke-width': 'strokeWidth',
            'stroke-linecap': 'strokeLinecap',
            'stroke-linejoin': 'strokeLinejoin',
          } as Record<string, string>
        )[attribute.name] ?? attribute.name;
      if (name.startsWith('on')) continue;
      if (name === 'style' && node instanceof HTMLElement) {
        const style: Record<string, string> = {};
        for (const key of node.style)
          style[key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
            node.style.getPropertyValue(key);
        props.style = style as CSSProperties;
      } else props[name] = attribute.value;
    }
    return createElement(node.localName, props, ...Array.from(node.childNodes, convert));
  }
  // createElement keeps native snapshots subject to React's normal escaping and attribute handling.
  return Array.from(target.childNodes, convert);
}
export function contentOr(content: ReactNode, fallback: ReactNode): ReactNode {
  return Children.toArray(content).length ? content : fallback;
}
export function nativeStyle(value: string): CSSProperties {
  const style: Record<string, string> = {};
  for (const declaration of value.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator < 0) continue;
    const name = declaration.slice(0, separator).trim();
    style[
      name.startsWith('--')
        ? name
        : name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
    ] = declaration.slice(separator + 1).trim();
  }
  return style as CSSProperties;
}
