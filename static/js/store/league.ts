import type { StoreApi } from './core';

declare global {
  interface LeagueSchedule { tours: any[]; lastUpdated: number | null; etag?: string | null }
  interface LeagueState { table: any[]; stats: any[]; schedule: LeagueSchedule }
  interface Window { LeagueStore?: StoreApi<LeagueState> }
}

(() => {
  const init: LeagueState = {
    table: [],
    stats: [],
    schedule: { tours: [], lastUpdated: null, etag: null }
  };
  const league = window.Store.createStore<LeagueState>('league', init);
  window.LeagueStore = league;
})();
