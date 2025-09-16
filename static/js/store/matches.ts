import type { StoreApi } from './core';

declare global {
  interface MatchInfo { id: string; home: string; away: string; date?: string }
  interface MatchScore { home: number; away: number; status?: string }
  interface MatchEvent { t: number; kind: string; payload?: any }
  interface MatchEntry { info: MatchInfo | null; score: MatchScore | null; events: MatchEvent[]; lastUpdated: number | null }
  interface MatchesState { map: Record<string, MatchEntry> }
  interface Window { MatchesStore?: StoreApi<MatchesState> }
}

(() => {
  const init: MatchesState = { map: {} };
  const matches = window.Store.createStore<MatchesState>('matches', init);
  window.MatchesStore = matches;
})();
