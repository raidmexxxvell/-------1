import type { StoreApi } from './core';

type RTState = { connected: boolean; topics: string[]; reconnects: number };

declare global { interface Window { RealtimeStore?: StoreApi<RTState>; } }

(() => {
  // Guard: only in module-ready environments and when store exists
  const ensure = () => {
    const root = document.body || document.documentElement;
    if (!root) return null;
    let el = document.querySelector('.rt-conn-indicator') as HTMLElement | null;
    if (!el) {
      el = document.createElement('div');
      el.className = 'rt-conn-indicator rt-bad';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-label', 'Realtime disconnected');
      root.appendChild(el);
    }
    return el;
  };

  const el = ensure();
  if (!el) return;

  const apply = (connected: boolean) => {
    el.classList.toggle('rt-ok', connected);
    el.classList.toggle('rt-bad', !connected);
    el.setAttribute('aria-label', connected ? 'Realtime connected' : 'Realtime disconnected');
  };

  // Initial state from store, if present
  if (window.RealtimeStore) {
    try {
      const s = window.RealtimeStore.get();
      apply(!!s.connected);
      window.RealtimeStore.subscribe((ns) => apply(!!ns.connected));
    } catch {}
  }

  // Also react to ws:* in legacy path
  window.addEventListener('ws:connected', () => apply(true));
  window.addEventListener('ws:disconnected', () => apply(false));
})();
