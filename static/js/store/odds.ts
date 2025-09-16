import type { StoreApi } from './core';

declare global {
  interface OddsEntry { value: number; version: number; lastUpdated: number }
  interface OddsState { map: Record<string, OddsEntry> }
  interface Window { OddsStore?: StoreApi<OddsState> }
}

(() => {
  const init: OddsState = { map: {} };
  const odds = window.Store.createStore<OddsState>('odds', init);
  window.OddsStore = odds;
})();
