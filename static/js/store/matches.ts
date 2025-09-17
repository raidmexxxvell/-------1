import type { StoreApi } from './core';

declare global {
  interface MatchInfo { id: string; home: string; away: string; date?: string }
  interface MatchScore { home: number; away: number; status?: string }
  interface MatchEvent { t: number; kind: string; payload?: any; team?: string; side?: 'home'|'away'; teamName?: string }
  interface MatchStats { home?: Record<string, any>; away?: Record<string, any>; [k: string]: any }
  interface MatchEntry { info: MatchInfo | null; score: MatchScore | null; events: MatchEvent[]; stats?: MatchStats | null; lastUpdated: number | null }
  interface MatchesState { map: Record<string, MatchEntry> }
  interface Window { MatchesStore?: StoreApi<MatchesState> }
}

(() => {
  const init: MatchesState = { map: {} };
  const matches = window.Store.createStore<MatchesState>('matches', init);
  window.MatchesStore = matches;
})();
