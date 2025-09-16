import type { StoreApi } from './core';

(() => {
  const init = { ready: false, startedAt: Date.now() } as AppState;
  const app: StoreApi<AppState> = window.Store.createStore<AppState>('app', init);
  window.AppStore = app;
})();
