import type { StoreApi } from './core';

type RTState = { connected: boolean; topics: string[]; reconnects: number };

declare global { interface Window { RealtimeStore?: StoreApi<RTState>; } }

(() => {
  // Guard: only in module-ready environments and when store exists
  const ensure = () => {
    const root = document.body || document.documentElement;
    if (!root) return null;
    let ws = document.querySelector('.rt-conn-indicator') as HTMLElement | null;
    if (!ws) {
      ws = document.createElement('div');
      ws.className = 'rt-conn-indicator rt-bad';
      ws.setAttribute('role', 'status');
      ws.setAttribute('aria-live', 'polite');
      ws.setAttribute('aria-label', 'Realtime disconnected');
      root.appendChild(ws);
    }
    // secondary dot to reflect Store availability
    let st = document.querySelector('.rt-store-indicator') as HTMLElement | null;
    if (!st) {
      st = document.createElement('div');
      st.className = 'rt-conn-indicator rt-store-indicator';
      st.style.right = '22px';
      st.setAttribute('title', 'Store status');
      st.setAttribute('aria-label', 'Store unavailable');
      root.appendChild(st);
    }
    return { ws, st };
  };

  const nodes = ensure();
  if (!nodes) return;
  const el = nodes.ws;
  const storeEl = nodes.st;

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

  // Store availability indicator (blue when store exists, black when not)
  const applyStore = () => {
    const ok = !!(window as any).Store && !!(window as any).Store._stores;
    if (!storeEl) return;
    storeEl.classList.toggle('rt-ok', ok);
    storeEl.classList.toggle('rt-bad', !ok);
    storeEl.setAttribute('aria-label', ok ? 'Store available' : 'Store unavailable');
  };
  applyStore();
  try { setInterval(applyStore, 4000); } catch {}
})();
