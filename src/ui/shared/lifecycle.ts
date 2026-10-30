/** All feature resources belong to the mounted UI, including standalone workspaces. */
export class UIScope {
  private cleanups: Array<() => void> = [];
  private timers = new Set<number>();
  private controller = new AbortController();
  private epoch = 0;
  get generation() {
    return this.epoch;
  }
  get signal() {
    return this.controller.signal;
  }
  begin() {
    this.dispose();
    this.controller = new AbortController();
  }
  isCurrent(generation: number) {
    return generation === this.epoch && !this.signal.aborted;
  }
  dispose() {
    this.epoch++;
    this.controller.abort();
    for (const timer of this.timers) {
      window.clearTimeout(timer);
      window.clearInterval(timer);
    }
    this.timers.clear();
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
  }
  handler<K extends Extract<keyof GlobalEventHandlers, `on${string}`>>(
    element: GlobalEventHandlers,
    key: K,
    handler: GlobalEventHandlers[K],
  ) {
    const reference = new WeakRef(element);
    const previous = element[key] ? new WeakRef(element[key]) : null;
    const current = handler ? new WeakRef(handler) : null;
    element[key] = handler;
    this.cleanups.push(() => {
      const target = reference.deref();
      if (target && target[key] === (current?.deref() ?? null))
        target[key] = (previous?.deref() ?? null) as GlobalEventHandlers[K];
    });
  }
  listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (event: WindowEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  listen<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    listener: (event: DocumentEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  listen(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void;
  listen(
    target: EventTarget,
    type: string,
    listener: unknown,
    options?: boolean | AddEventListenerOptions,
  ) {
    const callback = listener as EventListenerOrEventListenerObject;
    target.addEventListener(type, callback, options);
    this.cleanups.push(() => target.removeEventListener(type, callback, options));
  }
  timeout(callback: () => void, milliseconds: number) {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, milliseconds);
    this.timers.add(timer);
    return timer;
  }
  clearTimeout(timer: number | null | undefined) {
    if (timer == null) return;
    window.clearTimeout(timer);
    this.timers.delete(timer);
  }
  interval(callback: () => void | Promise<void>, milliseconds: number) {
    const timer = window.setInterval(callback, milliseconds);
    this.timers.add(timer);
    return timer;
  }
  fetch(input: RequestInfo | URL, init?: RequestInit) {
    return window.fetch(input, { ...init, signal: this.signal });
  }
}
export const uiScope = new UIScope();
