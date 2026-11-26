/** Minimal typed event emitter (keeps the core dependency-free). */
export class Emitter<Events extends Record<string, unknown[]>> {
  private handlers: { [K in keyof Events]?: Set<(...args: Events[K]) => void> } = {};

  on<K extends keyof Events>(event: K, handler: (...args: Events[K]) => void): () => void {
    const set = (this.handlers[event] ??= new Set());
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    const set = this.handlers[event];
    if (!set) return;
    for (const handler of set) {
      try {
        handler(...args);
      } catch (error) {
        console.error(`[tetherkit] "${String(event)}" handler failed`, error);
      }
    }
  }

  clear(): void {
    this.handlers = {};
  }
}

/** Observable state container compatible with React's useSyncExternalStore. */
export class Store<S extends object> {
  private listeners = new Set<() => void>();

  constructor(private state: S) {}

  get = (): S => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  set(patch: Partial<S>): void {
    let changed = false;
    for (const key in patch) {
      if (!Object.is(this.state[key], patch[key])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}
