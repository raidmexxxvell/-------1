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
    rosters?: { home: any[]; away: any[] } | null; // составы команд
    ui?: MatchUIState | null; // UI состояние (scoreText, votes cache)
    lastUpdated: number | null 
  }
  interface MatchesState { map: Record<string, MatchEntry> }
}

(() => {
  const init: MatchesState = { map: {} };
  const matches = window.Store.createStore<MatchesState>('matches', init);
  (window as any).MatchesStore = matches;

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

  // API для обновления статистики матча
  function updateMatchStats(matchKey: string, stats: MatchStats & { __home?: string; __away?: string; __date?: string }) {
    matches.update(state => {
      const cur = state.map[matchKey] || { info: null, score: null, events: [], stats: null, ui: null, lastUpdated: null };
      // If adapter provided match meta, persist it into info for reliable findMatchByTeams
      const home = (stats && typeof stats.__home === 'string') ? stats.__home : (cur.info?.home || null);
      const away = (stats && typeof stats.__away === 'string') ? stats.__away : (cur.info?.away || null);
      const date = (stats && typeof stats.__date === 'string') ? stats.__date : (cur.info?.date || undefined);
      cur.info = (home || away) ? { id: matchKey, home: home || '', away: away || '', date } : cur.info;
      cur.stats = stats as MatchStats;
      cur.lastUpdated = Date.now();
      state.map[matchKey] = cur;
    });
  }

  function getMatchStats(matchKey: string): MatchStats | null {
    const state = matches.get();
    return state.map[matchKey]?.stats || null;
  }

  // Получить полную запись матча из стора
  function getMatch(matchKey: string): MatchEntry | null {
    const state = matches.get();
    return state.map[matchKey] || null;
  }

  // Универсальное обновление записи матча патчем полей
  function updateMatch(matchKey: string, fields: any) {
    matches.update(state => {
      const cur: MatchEntry = state.map[matchKey] || { info: null, score: null, events: [], stats: null, rosters: null, ui: null, lastUpdated: null } as any;
      // Обновление info (если пришли метаданные)
      try {
        const home = fields?.home ?? cur.info?.home;
        const away = fields?.away ?? cur.info?.away;
        const date = fields?.date ?? cur.info?.date;
        if (home || away || date) {
          cur.info = { id: matchKey, home: String(home||''), away: String(away||''), date: date as any };
        }
      } catch(_) {}
      // Счет
      if (fields && (fields.score_home !== undefined || fields.score_away !== undefined)) {
        const prev = cur.score || { home: 0, away: 0 } as any;
        const h = (fields.score_home !== undefined) ? Number(fields.score_home) : prev.home;
        const a = (fields.score_away !== undefined) ? Number(fields.score_away) : prev.away;
        cur.score = { home: h, away: a } as any;
        // Обновляем UI совместимость: кэшированный текст счёта, чтобы legacy MatchState.get() сразу отдавал правильное значение
        try {
          if (!cur.ui) { cur.ui = {}; }
          cur.ui.scoreText = `${Number(h)} : ${Number(a)}`;
        } catch(_) {}
      }
      // События
      try {
        if (Array.isArray(fields?.events)) {
          // Полная замена массива событий (считаем приходящим источником истины)
          cur.events = fields.events.slice();
        }
      } catch(_) {}
      // Составы
      try {
        if (fields?.rosters) {
          (cur as any).rosters = fields.rosters;
        } else if (fields?.home_roster || fields?.away_roster) {
          (cur as any).rosters = (cur as any).rosters || { home: [], away: [] };
          if (fields.home_roster) (cur as any).rosters.home = fields.home_roster;
          if (fields.away_roster) (cur as any).rosters.away = fields.away_roster;
        }
      } catch(_) {}
      // Статистика
      try {
        if (fields?.stats) {
          cur.stats = Object.assign({}, cur.stats || {}, fields.stats || {});
        }
      } catch(_) {}
      cur.lastUpdated = Date.now();
      state.map[matchKey] = cur;
    });
  }

  function findMatchByTeams(home: string, away: string): string | null {
    const state = matches.get();
    const homeNorm = home.toLowerCase().trim();
    const awayNorm = away.toLowerCase().trim();
    
    console.log('[MatchesStore] findMatchByTeams:', { home, away, homeNorm, awayNorm });
    
    for (const [key, entry] of Object.entries(state.map)) {
      const entryHome = entry.info?.home?.toLowerCase().trim() || '';
      const entryAway = entry.info?.away?.toLowerCase().trim() || '';
      console.log('[MatchesStore] Checking entry:', { key, entryHome, entryAway, match: entryHome === homeNorm && entryAway === awayNorm });
      if (entryHome === homeNorm && entryAway === awayNorm) {
        console.log('[MatchesStore] Found match:', key);
        return key;
      }
    }
    console.log('[MatchesStore] No match found');
    return null;
  }

  /** Создать запись матча если её нет; возвращает ключ */
  function addOrMergeMatch(payload: { home: string; away: string; date?: string; score?: { home:number; away:number } }): string {
    const h = (payload.home||'').toString();
    const a = (payload.away||'').toString();
    let key = findMatchByTeams(h,a);
    if (key) {
      // merge score if provided
      if (payload.score) {
        updateMatch(key, { home: h, away: a, date: payload.date, score_home: payload.score.home, score_away: payload.score.away });
      } else {
        updateMatch(key, { home: h, away: a, date: payload.date });
      }
      return key;
    }
    // создаём новый ключ (без даты — используем нормализацию)
    key = `${h.toLowerCase().trim()}__${a.toLowerCase().trim()}`;
    (window as any).MatchesStore.update((st: MatchesState) => {
      st.map[key] = {
        info: { id: key, home: h, away: a, date: payload.date },
        score: payload.score ? { home: Number(payload.score.home)||0, away: Number(payload.score.away)||0 } : null,
        events: [],
        stats: null,
        rosters: null,
        ui: { scoreText: payload.score ? `${Number(payload.score.home)} : ${Number(payload.score.away)}` : undefined },
        lastUpdated: Date.now()
      } as MatchEntry;
    });
    return key;
  }

  function ensureMatch(home: string, away: string, date?: string): string {
    return addOrMergeMatch({ home, away, date });
  }

  // Экспортируем API для использования в других модулях
  (window as any).MatchesStoreAPI = {
    updateMatchStats,
    getMatchStats, 
    getMatch,
    updateMatch,
    findMatchByTeams,
    addOrMergeMatch,
    ensureMatch,
    subscribe: matches.subscribe,
    get: matches.get
  };

  // Экспортируем legacy API для обратной совместимости
  try { 
    (window as any).MatchState = MatchStateCompat; 
  } catch(_) {}
})();
