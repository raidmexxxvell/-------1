// TypeScript core for minimal reactive store (no bundler). Emits to static/js/dist via tsconfig.

type Unsubscribe = () => void;

export type StoreApi<T extends object> = {
  name: string;
  get(): T;
  set(partial: Partial<T>): void;
  update(mutator: (s: T) => void): void;
  subscribe(fn: (s: T) => void): Unsubscribe;
};

export type CreateStoreOptions = {
  persistKey?: string;
  persistPaths?: string[];
  ttlMs?: number;
};

export type StoreNamespace = {
  _stores: Record<string, StoreApi<any>>;
  createStore<T extends object>(
    name: string,
    initialState: T,
    options?: CreateStoreOptions
  ): StoreApi<T>;
  getStore<T extends object = any>(name: string): StoreApi<T> | undefined;
};

declare global {
  interface Window {
    Store: StoreNamespace;
    AppStore?: StoreApi<AppState>;
    UserStore?: StoreApi<UserState>;
    UIStore?: StoreApi<UIState> & {
      setActiveTab: (tab: string) => void;
      setTheme: (theme: string) => void;
    };
  }
  interface AppState {
    ready: boolean;
    startedAt: number;
  }
  interface UserState {
    id: string | number | null;
    name: string | null;
    role: string;
    flags: Record<string, unknown>;
  }
  interface UIState {
    activeTab: string;
    theme: string;
    modals: Record<string, { open: boolean; data?: unknown }>;
  }
}

(function () {
  const LS: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null;
  const now = () => Date.now();

  function deepGet(obj: any, path: string): any {
    return path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
  }
  function deepSet(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!o[p] || typeof o[p] !== 'object') o[p] = {};
      o = o[p];
    }
    o[parts[parts.length - 1]] = value;
  }

  function pick(obj: any, paths: string[]): any {
    const out: any = {};
    for (const p of paths) {
      const v = deepGet(obj, p);
      if (v !== undefined) deepSet(out, p, v);
    }
    return out;
  }

  function persistWrite(key: string, payload: any): void {
    if (!LS) return;
    try {
      LS.setItem(key, JSON.stringify(payload));
    } catch (_) {}
  }
  function persistRead<T = any>(
    key: string,
    ttlMs?: number | null
  ): { __ts: number; data: T } | null {
    if (!LS) return null;
    try {
      const raw = LS.getItem(key);
      if (!raw) return null;
      const j = JSON.parse(raw);
      if (ttlMs && j && j.__ts && now() - j.__ts > ttlMs) return null;
      return j;
    } catch (_) {
      return null;
    }
  }

  function createStore<T extends object>(
    name: string,
    initialState: T,
    options?: CreateStoreOptions
  ): StoreApi<T> {
    const opts = options || {};
    const subs = new Set<(s: T) => void>();
    const state: T = { ...(initialState as any) } as T;

    // hydrate from LS if allowed
    const pKey = opts.persistKey;
    if (pKey) {
      const cached = persistRead<T>(pKey, opts.ttlMs);
      if (cached && cached.data) Object.assign(state as any, cached.data as any);
    }

    function notify(): void {
      subs.forEach(fn => {
        try {
          fn(state);
        } catch (_) {}
      });
    }
    function get(): T {
      return state;
    }
    function set(next: Partial<T>): void {
      Object.assign(state as any, next as any);
      persistMaybe();
      notify();
    }
    function update(mutator: (s: T) => void): void {
      try {
        mutator(state);
      } catch (_) {}
      persistMaybe();
      notify();
    }
    function subscribe(fn: (s: T) => void): Unsubscribe {
      subs.add(fn);
      return () => subs.delete(fn);
    }

    function persistMaybe(): void {
      if (!pKey || !opts.persistPaths || !opts.persistPaths.length) return;
      const data = pick(state, opts.persistPaths);
      persistWrite(pKey, { __ts: now(), data });
    }

    const api: StoreApi<T> = { name, get, set, update, subscribe };
    if (!window.Store) window.Store = { _stores: {} } as StoreNamespace;
    window.Store._stores[name] = api as StoreApi<any>;
    return api;
  }

  // Public API
  window.Store = window.Store || ({ _stores: {} } as StoreNamespace);
  window.Store.createStore = createStore;
  window.Store.getStore = function <T extends object = any>(name: string) {
    return window.Store._stores[name] as StoreApi<T> | undefined;
  };
})();
