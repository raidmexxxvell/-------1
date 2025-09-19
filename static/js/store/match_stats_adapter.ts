// Адаптер для интеграции статистики матчей со стором
// Перехватывает API calls из profile-match-stats.js и обновляет MatchesStore

type MatchesStoreAPI = {
  updateMatchStats: (matchKey: string, stats: any) => void;
  getMatchStats: (matchKey: string) => any;
  findMatchByTeams: (home: string, away: string) => string | null;
  subscribe: (callback: (state: any) => void) => () => void;
  get: () => any;
};

(function(){
  if (typeof window === 'undefined') return;
  
  // Проверяем feature flag
  try { 
    if (localStorage.getItem('feature:match_ui_store') !== '1') return; 
  } catch(_) { 
    return; 
  }

  let originalFetch: typeof fetch;
  let lastStatsCache: { [key: string]: { data: any; timestamp: number; etag?: string } } = {};
  const STATS_CACHE_TTL = 30000; // 30 секунд кэш для минимизации запросов
  
  function initStatsStoreAdapter() {
    console.log('[StatsStoreAdapter] Initializing...', {
      fetchExists: !!window.fetch,
      matchesStoreAPIExists: !!(window as any).MatchesStoreAPI,
      featureFlag: localStorage.getItem('feature:match_ui_store')
    });
    
    if (!window.fetch || !(window as any).MatchesStoreAPI) return;
    
    // Если уже перехвачен, не делаем повторно
    if ((window.fetch as any).__statsStorePatched) return;
    
    originalFetch = window.fetch;
    
    // Патчим fetch для перехвата запросов статистики
    window.fetch = function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = typeof input === 'string' ? input : input.toString();
      
      // Проверяем, что это запрос статистики матча
      if (url.indexOf('/api/match/stats/get') !== -1) {
        return originalFetch.call(this, input, init).then(response => {
          // Клонируем ответ для чтения
          const clonedResponse = response.clone();
          
          if (response.ok) {
            // Асинхронно обрабатываем данные для стора
            clonedResponse.json().then(statsData => {
              try {
                // Извлекаем home и away из URL
                const urlParams = new URLSearchParams(url.split('?')[1] || '');
                const home = urlParams.get('home');
                const away = urlParams.get('away');
                
                if (home && away && (window as any).MatchesStoreAPI) {
                  const api = (window as any).MatchesStoreAPI as MatchesStoreAPI;
                  
                  // Проверяем кэш для предотвращения дублирования обновлений
                  const cacheKey = `${home.toLowerCase()}_${away.toLowerCase()}`;
                  const now = Date.now();
                  const cached = lastStatsCache[cacheKey];
                  
                  // Если данные изменились или кэш устарел
                  const statsSignature = JSON.stringify(statsData);
                  const needsUpdate = !cached || 
                    (now - cached.timestamp) > STATS_CACHE_TTL ||
                    JSON.stringify(cached.data) !== statsSignature;
                  
                  if (needsUpdate) {
                    // Находим ключ матча в сторе (предпочтительно по info), иначе используем стабильный ключ
                    let matchKey = api.findMatchByTeams(home, away) || cacheKey;
                    // Обновляем статистику в сторе, пробрасывая meta __home/__away/__date для заполнения info
                    api.updateMatchStats(matchKey, Object.assign({
                      home: extractTeamStats(statsData, 'home'),
                      away: extractTeamStats(statsData, 'away'),
                      __home: home,
                      __away: away,
                      __date: (statsData && (statsData.date || statsData.match_date)) || undefined
                    }, statsData));
                    
                    // Обновляем локальный кэш
                    lastStatsCache[cacheKey] = {
                      data: statsData,
                      timestamp: now,
                      etag: response.headers.get('ETag') || undefined
                    };
                    
                    console.log('[StatsStoreAdapter] Updated stats for match:', home, 'vs', away, { matchKey });
                  }
                }
              } catch (error) {
                console.warn('[StatsStoreAdapter] Failed to update store:', error);
              }
            }).catch(() => {
              // Игнорируем ошибки парсинга, основной ответ должен работать
            });
          }
          
          return response;
        });
      }
      
      // Для всех остальных запросов используем оригинальный fetch
      return originalFetch.call(this, input, init);
    };
    
    (window.fetch as any).__statsStorePatched = true;
    console.log('[StatsStoreAdapter] Initialized stats store integration');
  }
  
  function extractTeamStats(statsData: any, side: 'home' | 'away'): Record<string, any> {
    if (!statsData) return {};
    
    const result: Record<string, any> = {};
    const metrics = ['shots_total', 'shots_on', 'corners', 'yellows', 'reds'];
    
    for (const metric of metrics) {
      if (Array.isArray(statsData[metric]) && statsData[metric].length >= 2) {
        const index = side === 'home' ? 0 : 1;
        result[metric] = statsData[metric][index];
      }
    }
    
    return result;
  }
  
  // Слушатель WebSocket событий для мгновенного обновления статистики
  function setupWebSocketListener() {
    if (typeof document !== 'undefined') {
      // Слушаем event от realtime-updates для статистики
      document.addEventListener('matchStatsRefresh', (event: any) => {
        try {
          const { home, away } = event.detail || {};
          if (home && away && (window as any).MatchesStoreAPI) {
            // Очищаем кэш для этого матча, чтобы принудительно обновить статистику
            const cacheKey = `${home.toLowerCase()}_${away.toLowerCase()}`;
            delete lastStatsCache[cacheKey];
            console.log('[StatsStoreAdapter] Cleared cache for WebSocket update:', home, 'vs', away);
          }
        } catch (error) {
          console.warn('[StatsStoreAdapter] WebSocket listener error:', error);
        }
      });
    }
  }
  
  // Инициализируем адаптер при загрузке
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initStatsStoreAdapter();
      setupWebSocketListener();
    });
  } else {
    initStatsStoreAdapter();
    setupWebSocketListener();
  }
  
  // Также инициализируем при появлении MatchesStoreAPI (если еще не загружен)
  let checkStoreTimer: any = null;
  let attempts = 0;
  const maxAttempts = 100; // 10 секунд максимум
  
  function waitForMatchesStore() {
    attempts++;
    console.log(`[StatsStoreAdapter] Waiting for MatchesStore, attempt ${attempts}/${maxAttempts}`);
    
    if ((window as any).MatchesStoreAPI) {
      console.log('[StatsStoreAdapter] MatchesStoreAPI found, initializing...');
      initStatsStoreAdapter();
      if (checkStoreTimer) {
        clearInterval(checkStoreTimer);
        checkStoreTimer = null;
      }
    } else if (attempts >= maxAttempts) {
      console.warn('[StatsStoreAdapter] Timeout waiting for MatchesStoreAPI');
      if (checkStoreTimer) {
        clearInterval(checkStoreTimer);
        checkStoreTimer = null;
      }
    }
  }
  
  checkStoreTimer = setInterval(waitForMatchesStore, 100);
  
  // Добавляем глобальную функцию для отладки
  (window as any).debugMatchStats = function() {
    console.log('=== DEBUG MATCH STATS ===');
    console.log('MatchesStoreAPI exists:', !!(window as any).MatchesStoreAPI);
    console.log('MatchStats exists:', !!(window as any).MatchStats);
    console.log('Feature flag:', localStorage.getItem('feature:match_ui_store'));
    console.log('Fetch patched:', !!(window.fetch as any).__statsStorePatched);
    console.log('Last stats cache:', lastStatsCache);
    
    if ((window as any).MatchesStoreAPI) {
      const store = (window as any).MatchesStoreAPI.get();
      console.log('Store state:', store);
    }
    console.log('========================');
  };
  
})();