// static/js/store/league_ui_bindings.ts
// UI bindings for League components to subscribe to LeagueStore changes
// Provides automatic UI updates when store state changes

// Импортируем стора лиги (браузерный ESM требует явного расширения .js)
import './league.js';
import type { StoreApi } from './core';

// Дополнительные глобальные объявления для League API
declare global {
  interface Window {
    LeagueStore?: StoreApi<LeagueState>;
    League?: {
      renderLeagueTable: (table: HTMLElement, updatedText: HTMLElement | null, data: any) => void;
      renderSchedule: (pane: HTMLElement, data: any) => void;
      renderStatsTable: (table: HTMLElement, updatedEl: HTMLElement | null, data: any) => void;
    };
    fetchEtag?: (url: string, options: any) => Promise<any>;
  }
}

(function(){
  if (!window.Store || typeof window === 'undefined') return;

  // Feature flag проверка
  const isEnabled = () => {
    try {
      return localStorage.getItem('feature:league_ui_store') === '1';
    } catch(_) {
      return false;
    }
  };

  // Selectors for DOM elements
  const getLeagueTable = () => document.getElementById('league-table') as HTMLElement | null;
  const getLeagueUpdatedText = () => document.getElementById('league-updated-text') as HTMLElement | null;
  // Вёрстка использует id "ufo-schedule" для панели расписания
  const getSchedulePane = () => document.getElementById('ufo-schedule') as HTMLElement | null;
  const getStatsTable = () => document.getElementById('stats-table') as HTMLElement | null;
  // Вёрстка использует id "stats-table-updated" для текста обновления статистики
  const getStatsUpdated = () => document.getElementById('stats-table-updated') as HTMLElement | null;

  // State tracking to prevent unnecessary re-renders
  let lastTableRender = 0;
  let lastScheduleRender = 0;
  let lastStatsRender = 0;

  function renderLeagueTableFromStore(state: LeagueState): void {
    if (!isEnabled()) return;
    
    const table = getLeagueTable();
    const updatedText = getLeagueUpdatedText();
    if (!table || !window.League?.renderLeagueTable) return;

    // Skip if no new data
    if (state.table.length === 0) return;

    try {
      // Guard: если сигнатура первых 10 строк совпадает с уже отрисованной —
      // пропускаем перерисовку (исключаем мерцание при повторном показе вкладки)
      const currentSig = (() => {
        try { return JSON.stringify(state.table.slice(0, 10)); } catch { return null; }
      })();
      const prevSig = (table as any)?.dataset?.sig || null;
      if (currentSig && prevSig && currentSig === prevSig) {
        return; // DOM уже соответствует данным
      }

      // Transform store data to expected format for legacy renderLeagueTable
      // ВАЖНО: не генерируем новый updated_at, чтобы не сбивать защиту от лишних рендеров
      const prevIso = updatedText?.getAttribute('data-updated-iso') || undefined;
      const data = {
        values: state.table,
        ...(prevIso ? { updated_at: prevIso } : {})
      } as any;
      window.League.renderLeagueTable(table, updatedText, data);
      lastTableRender = Date.now();
      
      console.log('[LeagueStore] Table UI updated from store');
    } catch(error) {
      console.warn('[LeagueStore] Failed to render table:', error);
    }
  }

  function renderScheduleFromStore(state: LeagueState): void {
    if (!isEnabled()) return;
    
    const pane = getSchedulePane();
    if (!pane || !window.League?.renderSchedule) return;

    // Skip if no new data or same timestamp
    if (state.schedule.tours.length === 0 || 
        (state.schedule.lastUpdated && state.schedule.lastUpdated <= lastScheduleRender)) {
      return;
    }

    try {
      // Transform store data to expected format
      const data = {
        tours: state.schedule.tours,
        updated_at: state.schedule.lastUpdated ? new Date(state.schedule.lastUpdated).toISOString() : new Date().toISOString()
      };
      
      window.League.renderSchedule(pane, data);
      lastScheduleRender = state.schedule.lastUpdated || Date.now();
      
      console.log('[LeagueStore] Schedule UI updated from store');
    } catch(error) {
      console.warn('[LeagueStore] Failed to render schedule:', error);
    }
  }

  function renderStatsFromStore(state: LeagueState): void {
    if (!isEnabled()) return;
    
    const table = getStatsTable();
    const updatedEl = getStatsUpdated();
    if (!table || !window.League?.renderStatsTable) return;

  // Не пропускаем пустое состояние — отрисуем скелет, чтобы таблица не выглядела пустой

    try {
      // Guard: если сигнатура совпадает — не перерисовываем (устраняем мерцание)
      const currentSig = (() => {
        try { return JSON.stringify(state.stats.slice(0, 10)); } catch { return null; }
      })();
      const prevSig = (table as any)?.dataset?.sig || null;
      if (currentSig && prevSig && currentSig === prevSig) {
        return;
      }
      // Не обновляем сигнатуру напрямую здесь — это сделает legacy renderer внутри renderStatsTable

      // Transform store data to expected format (сохраняем формат legacy)
      const data = {
        values: state.stats,
        // Обновим метку дружелюбно: если уже есть актуальная — оставим её; иначе текущее время
        updated_at: (updatedEl?.getAttribute('data-updated-iso') || new Date().toISOString())
      };
      
  window.League.renderStatsTable(table, updatedEl, data);
  try { (table as any).dataset.sig = currentSig || ''; } catch(_) {}
      lastStatsRender = Date.now();
      
      console.log('[LeagueStore] Stats UI updated from store');
    } catch(error) {
      console.warn('[LeagueStore] Failed to render stats:', error);
    }
  }

  function handleStoreUpdate(state: LeagueState): void {
    // Batch UI updates using requestAnimationFrame
    requestAnimationFrame(() => {
      renderLeagueTableFromStore(state);
      renderScheduleFromStore(state);
      renderStatsFromStore(state);
    });
  }

  // Enhanced load functions that trigger store updates instead of direct fetch
  function loadLeagueTableViaStore(): Promise<void> {
    if (!isEnabled() || !window.fetchEtag) {
      // Fallback to original implementation
      return Promise.resolve((window as any).loadLeagueTable?.() || undefined);
    }

    return window.fetchEtag('/api/league-table', {
      cacheKey: 'league:table',
      swrMs: 30000,
      extract: (j: any) => j
    }).then(({ data }: any) => {
      // Store will be automatically updated via ETL listeners
      console.log('[LeagueStore] League table loaded via store');
    }).catch((error: any) => {
      console.warn('[LeagueStore] Failed to load league table:', error);
      // Fallback to original
      return (window as any).loadLeagueTable?.() || undefined;
    });
  }

  function loadScheduleViaStore(): Promise<void> {
    if (!isEnabled() || !window.fetchEtag) {
      // Fallback to original implementation
      return Promise.resolve((window as any).loadSchedule?.() || undefined);
    }

    return window.fetchEtag('/api/schedule', {
      cacheKey: 'league:schedule',
      swrMs: 30000,
      extract: (j: any) => j
    }).then(({ data }: any) => {
      // Store will be automatically updated via ETL listeners
      console.log('[LeagueStore] Schedule loaded via store');
    }).catch((error: any) => {
      console.warn('[LeagueStore] Failed to load schedule:', error);
      // Fallback to original
      return (window as any).loadSchedule?.() || undefined;
    });
  }

  function loadStatsViaStore(): Promise<void> {
    if (!isEnabled() || !window.fetchEtag) {
      // Fallback to original implementation
      return Promise.resolve((window as any).loadStatsTable?.() || undefined);
    }

    // Используем тот же источник, что и legacy: goal+assist leaderboard
    return window.fetchEtag('/api/leaderboard/goal-assist', {
      cacheKey: 'league:stats',
      swrMs: 60000,
      params: { limit: 50 },
      // Преобразуем ответ в legacy-формат values (массив строк)
      extract: (json: any) => {
        try {
          let items = Array.isArray(json?.items) ? json.items.slice() : [];
          // Сортировка: Г+П desc, И asc, Г desc, П desc (совпадает с legacy profile.js)
          items.sort((a: any,b: any)=>{
            const at = (a.goal_plus_assist ?? ((a.goals||0)+(a.assists||0)));
            const bt = (b.goal_plus_assist ?? ((b.goals||0)+(b.assists||0)));
            if (bt !== at) return bt - at;
            const am = a.matches_played||0, bm = b.matches_played||0;
            if (am !== bm) return am - bm;
            const ag = a.goals||0, bg = b.goals||0;
            if (bg !== ag) return bg - ag;
            const aa = a.assists||0, ba = b.assists||0;
            if (ba !== aa) return ba - aa;
            return 0;
          });
          items = items.slice(0,10);
          const values = items.map((it: any) => {
            const name = `${it.first_name||''} ${it.last_name||''}`.trim() || (it.player_id?`#${it.player_id}`:'');
            const matches = it.matches_played||0;
            const goals = it.goals||0;
            const assists = it.assists||0;
            const total = it.goal_plus_assist || (goals + assists);
            return [ String(name), String(matches), String(goals), String(assists), String(total) ];
          });
          return values;
        } catch {
          return [];
        }
      }
    }).then(({ data }: any) => {
      // Store will be automatically updated via ETL listeners
      console.log('[LeagueStore] Stats loaded via store');
    }).catch((error: any) => {
      console.warn('[LeagueStore] Failed to load stats:', error);
      // Fallback to original
      return (window as any).loadStatsTable?.() || undefined;
    });
  }

  // Initialize store subscription when LeagueStore becomes available
  function initializeStoreBindings(): void {
    if (!window.LeagueStore || !isEnabled()) return;

    try {
      // Subscribe to store changes
      window.LeagueStore.subscribe(handleStoreUpdate);
      
      // Apply initial state if available
      const currentState = window.LeagueStore.get();
      if (currentState) {
        handleStoreUpdate(currentState);
      }

      // Export enhanced load functions to global scope (with feature flag check)
      (window as any).loadLeagueTableViaStore = loadLeagueTableViaStore;
      (window as any).loadScheduleViaStore = loadScheduleViaStore;
      (window as any).loadStatsViaStore = loadStatsViaStore;

      console.log('[LeagueStore] UI bindings initialized');
    } catch(error) {
      console.warn('[LeagueStore] Failed to initialize UI bindings:', error);
    }
  }

  // Auto-enable feature flag for gradual rollout
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    
    // Enable by default unless explicitly disabled
    const hardDisable = /(?:[?&]|#)(?:ff|feature:league_ui_store)=0\b/.test(window.location.search) || 
                       /(?:[?&]|#)(?:ff|feature:league_ui_store)=0\b/.test(window.location.hash);
    
    if (!hardDisable && !localStorage.getItem('feature:league_ui_store')) {
      localStorage.setItem('feature:league_ui_store', '1');
    } else if (hardDisable) {
      localStorage.removeItem('feature:league_ui_store');
    }
  } catch(_) {}

  // Initialize when stores are ready
  if (window.LeagueStore) {
    initializeStoreBindings();
  } else {
    // Wait for store to be available
    const checkStore = () => {
      if (window.LeagueStore) {
        initializeStoreBindings();
      } else {
        setTimeout(checkStore, 100);
      }
    };
    checkStore();
  }

  // Export for debugging
  (window as any).LeagueUIBindings = {
    isEnabled,
    renderLeagueTableFromStore,
    renderScheduleFromStore,
    renderStatsFromStore,
    loadLeagueTableViaStore,
    loadScheduleViaStore,
    loadStatsViaStore
  };

})();