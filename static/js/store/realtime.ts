import type { StoreApi } from './core';

declare global {
  interface RealtimeState {
    connected: boolean;
    topics: string[];
    reconnects: number;
  }
  interface Window {
    RealtimeStore?: StoreApi<RealtimeState>;
  }
}

(() => {
  const init: RealtimeState = { connected: false, topics: [], reconnects: 0 };
  const realtime = window.Store.createStore<RealtimeState>('realtime', init);
  window.RealtimeStore = realtime;
})();
