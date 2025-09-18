import type { StoreApi } from './core';

declare global {
  interface MatchInfo { id: string; home: string; away: string; date?: string }
  interface MatchScore { home: number; away: number; status?: string }
  interface MatchEvent { t: number; kind: string; payload?: any; team?: string; side?: 'home'|'away'; teamName?: string }
  interface MatchStats { home?: Record<string, any>; away?: Record<string, any>; [k: string]: any }
  interface MatchVotes { h: number; d: number; a: number; total: number; lastAggTs: number }
  interface MatchUIState { 
    scoreText?: string; // кэшированный текст счёта "X : Y"
    votes?: MatchVotes; // локальные голоса 
  }
  interface MatchEntry { 
    info: MatchInfo | null; 
    score: MatchScore | null; 
    events: MatchEvent[]; 
    stats?: MatchStats | null; 
    ui?: MatchUIState | null; // UI состояние (scoreText, votes cache)
    lastUpdated: number | null 
  }
  interface MatchesState { map: Record<string, MatchEntry> }
  interface Window { MatchesStore?: StoreApi<MatchesState> }
}

(() => {
  const init: MatchesState = { map: {} };
  const matches = window.Store.createStore<MatchesState>('matches', init);
  window.MatchesStore = matches;

  // Совместимость с legacy MatchState API
  const MatchStateCompat = {
    get(key: string) {
      const state = matches.get();
      const entry = state.map[key];
      if (!entry || !entry.ui) return null;
      
      // Возвращаем объект в формате, ожидаемом league.js
      return {
        score: entry.ui.scoreText,
        votes: entry.ui.votes ? {
          h: entry.ui.votes.h,
          d: entry.ui.votes.d, 
          a: entry.ui.votes.a,
          total: entry.ui.votes.total
        } : undefined,
        lastAggTs: entry.ui.votes?.lastAggTs
      };
    },
    
    set(key: string, patch: any) {
      matches.update(state => {
        if (!state.map[key]) {
          state.map[key] = { info: null, score: null, events: [], ui: null, lastUpdated: null };
        }
        if (!state.map[key].ui) {
          state.map[key].ui = {};
        }
        
        // Применяем патч к UI состоянию
        if (patch.score) {
          state.map[key].ui!.scoreText = patch.score;
        }
        if (patch.votes) {
          state.map[key].ui!.votes = {
            h: patch.votes.h || 0,
            d: patch.votes.d || 0,
            a: patch.votes.a || 0,
            total: patch.votes.total || 0,
            lastAggTs: patch.lastAggTs || Date.now()
          };
        }
      });
    }
  };

  // Экспортируем legacy API для обратной совместимости
  try { 
    (window as any).MatchState = MatchStateCompat; 
  } catch(_) {}
})();
