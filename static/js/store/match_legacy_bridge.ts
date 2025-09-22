// Bridge: MatchesStore → legacy UI (rosters/events + stats) без дополнительных fetch
// УСЛОВИЯ:
//  - Всегда включается (текущая договорённость: feature:match_ui_store включён по умолчанию в шаблоне)
//  - Не создаёт новых DOM блоков, только триггерит знакомые события/рендеры
//  - Статистика обновляется напрямую из стора (без fetch) путём мягкого override MatchStats.render
//  - Debounce для пачек патчей, защита от дубликатов по сигнатуре

import type { StoreApi } from './core';

type MatchEvent = { player?: string; type?: string; team?: string; side?: 'home'|'away'; kind?: string; t?: number } & Record<string,any>;
type MatchStats = { home?: Record<string, any>; away?: Record<string, any>; [k: string]: any };
type MatchScore = { home: number; away: number } | null;
type MatchInfo = { home: string; away: string; date?: string } | null;
type MatchEntry = { info?: MatchInfo; score?: MatchScore; events?: MatchEvent[]; stats?: MatchStats|null; lastUpdated?: number|null };
type MatchesState = { map: Record<string, MatchEntry> };

declare global {
  interface Window {
    // MatchesStore likely already declared globally in other store modules; avoid redeclaration conflict
    MatchStats?: any;
    MatchRostersEvents?: any;
    MatchesStore?: StoreApi<MatchesState>;
    MatchesStoreAPI?: any;
    __WEBSOCKETS_ENABLED__?: boolean;
  }
}

(function(){
  if (typeof window === 'undefined') return;
  // Флаг теперь хотим всегда включать — но оставим мягкую проверку, чтобы можно было отключить вручную
  try { if (localStorage.getItem('feature:match_ui_store') !== '1') return; } catch(_) { /* continue silently */ }

  const detailsPane = () => document.getElementById('ufo-match-details');
  const visible = (el: HTMLElement|null) => !!el && el.style.display !== 'none';
  const homeNameEl = () => document.getElementById('md-home-name');
  const awayNameEl = () => document.getElementById('md-away-name');

  function currentNames(){
    // Сначала пробуем брать исходные имена команд из data-атрибутов (без количества в скобках)
    const hAttr = (homeNameEl() as HTMLElement | null)?.getAttribute('data-team-name') || '';
    const aAttr = (awayNameEl() as HTMLElement | null)?.getAttribute('data-team-name') || '';
    const hText = homeNameEl()?.textContent?.trim() || '';
    const aText = awayNameEl()?.textContent?.trim() || '';
    const h = (hAttr || hText).trim();
    const a = (aAttr || aText).trim();
    return { h, a };
  }

  function findMatchKey(state: MatchesState){
    const { h, a } = currentNames();
    if(!h || !a) return null;
    let bestKey: string|null = null; let bestTs = -1;
    for(const [k,v] of Object.entries(state.map||{})){
      const hi = v.info?.home || ''; const ai = v.info?.away || '';
      if(hi && ai && hi.toLowerCase() === h.toLowerCase() && ai.toLowerCase() === a.toLowerCase()){
        const ts = (v.lastUpdated||0); if(ts > bestTs){ bestTs = ts; bestKey = k; }
      }
    }
    return bestKey;
  }

  // --- Inline stats override ---
  // Legacy MatchStats.render(fetch...) → заменяем на версию, которая читает состояние стора напрямую.
  // Ждём пока подгрузится legacy модуль (он создаёт window.MatchStats).
  function installStatsOverride(){
    try {
      const orig = window.MatchStats && window.MatchStats.render;
      if(!orig || (window.MatchStats && window.MatchStats.__storeDriven)) return;
      
      // Сохраняем оригинальную функцию
      const originalRender = orig;
      
      window.MatchStats.render = function(host: HTMLElement, match: any){
        // Администратор: не перехватываем, оставляем оригинальный рендер с контролами и анимацией
        try {
          const adminId = document.body.getAttribute('data-admin');
          const isAdmin = !!(adminId && adminId.trim() !== '');
          if (isAdmin) {
            return originalRender.call(this, host, match);
          }
        } catch(_) {}

        // Если вебсокеты недоступны, используем оригинальный рендер, чтобы работал легаси-поллинг ETag
        try {
          if (!window.__WEBSOCKETS_ENABLED__) {
            return originalRender.call(this, host, match);
          }
        } catch(_) {}
        
        console.log('[Bridge] MatchStats.render called', { 
          host, 
          match,
          hostId: host?.id,
          matchInfo: match ? { home: match.home, away: match.away, date: match.date } : null
        });
        
        // Сначала пытаемся получить данные из стора
        let hasStoreData = false;
        try {
          hasStoreData = renderStatsFromStore(host, match);
          console.log('[Bridge] renderStatsFromStore result:', hasStoreData);
        } catch(e) {
          console.warn('[Bridge] renderStatsFromStore failed:', e);
        }
        
        // Если данных в сторе нет, вызываем оригинальную функцию
        if (!hasStoreData) {
          console.log('[Bridge] No store data, calling original render');
          try {
            originalRender.call(this, host, match);
          } catch(e) {
            console.error('[Bridge] Original render failed:', e);
            host.innerHTML = '<div class="stats-wrap">Нет данных</div>';
          }
        }
      };
      
      window.MatchStats.__storeDriven = true;
      console.log('[Bridge] Stats override installed successfully');
    } catch(e) {
      console.error('[Bridge] Failed to install stats override:', e);
    }
  }

  function convertEventsToStats(events: any): any {
    if (!events) return null;
    
    try {
      const homeEvents = events.home || [];
      const awayEvents = events.away || [];
      
      // Подсчитываем статистику из событий
      const stats = {
        home: {
          goals: homeEvents.filter((e: any) => e.type === 'goal').length,
          yellow_cards: homeEvents.filter((e: any) => e.type === 'yellow').length,
          red_cards: homeEvents.filter((e: any) => e.type === 'red').length,
          assists: homeEvents.filter((e: any) => e.type === 'assist').length
        },
        away: {
          goals: awayEvents.filter((e: any) => e.type === 'goal').length,
          yellow_cards: awayEvents.filter((e: any) => e.type === 'yellow').length,
          red_cards: awayEvents.filter((e: any) => e.type === 'red').length,
          assists: awayEvents.filter((e: any) => e.type === 'assist').length
        }
      };
      
      console.log('[Bridge] Converted events to stats:', stats);
      return stats;
    } catch(e) {
      console.warn('[Bridge] Failed to convert events to stats:', e);
      return null;
    }
  }

  function renderStatsFromStore(host: HTMLElement, match: any): boolean {
    console.log('[Bridge] renderStatsFromStore called', {
      matchesStoreAPIExists: !!(window as any).MatchesStoreAPI,
      matchesStoreExists: !!window.MatchesStore,
      matchEventsRegistryExists: !!(window as any).__MatchEventsRegistry,
      currentNames: currentNames(),
      match,
      matchHome: match?.home,
      matchAway: match?.away
    });
    
    if(!host) return false;
    
    // Пытаемся получить статистику через разные источники данных
    let stats: any = null;
    let hasStoreData = false;
    
    // ПРИОРИТЕТ 1: __MatchEventsRegistry (стабильный источник из коммита 9764968)
    if ((window as any).__MatchEventsRegistry && match?.home && match?.away) {
      try {
        const registry = (window as any).__MatchEventsRegistry;
        const matchKey = registry.getMatchKey(match.home, match.away);
        const cachedEvents = registry.eventsCache?.get(matchKey);
        
        if (cachedEvents && (cachedEvents.home || cachedEvents.away)) {
          console.log('[Bridge] Found data in MatchEventsRegistry:', cachedEvents);
          // Преобразуем события в статистику
          stats = convertEventsToStats(cachedEvents);
          hasStoreData = !!(stats && (stats.home || stats.away));
          console.log('[Bridge] MatchEventsRegistry stats:', { stats, hasStoreData });
        }
      } catch(e) {
        console.warn('[Bridge] MatchEventsRegistry error:', e);
      }
    }
    
    // ПРИОРИТЕТ 2: MatchesStoreAPI (если нет данных в Registry)
    if (!hasStoreData && (window as any).MatchesStoreAPI && match?.home && match?.away) {
      try {
        const matchKey = (window as any).MatchesStoreAPI.findMatchByTeams(match.home, match.away);
        console.log('[Bridge] Found match key:', matchKey);
        
        if (matchKey) {
          stats = (window as any).MatchesStoreAPI.getMatchStats(matchKey);
          hasStoreData = !!(stats && (stats.home || stats.away || stats.shots_total));
          console.log('[Bridge] MatchesStoreAPI stats:', { stats, hasStoreData });
        }
      } catch(e) {
        console.warn('[Bridge] MatchesStoreAPI error:', e);
      }
    }
    
    // ПРИОРИТЕТ 3: Legacy MatchesStore
    if (!hasStoreData && window.MatchesStore) {
      try {
        const st = window.MatchesStore.get();
        if (st) {
          const key = findMatchKey(st);
          console.log('[Bridge] Legacy store key:', key);
          if (key) {
            const entry = st.map[key];
            stats = entry?.stats || null;
            hasStoreData = !!(stats && (stats.home || stats.away));
            console.log('[Bridge] Legacy store stats:', { stats, hasStoreData });
          }
        }
      } catch(e) {
        console.warn('[Bridge] Legacy store error:', e);
      }
    }
    
    if (!hasStoreData) {
      console.log('[Bridge] No store data found, showing loading');
      host.innerHTML='<div class="stats-wrap">Загрузка статистики...</div>';
      return false;
    }
    
    // Ожидаемые метрики
    const metrics = [
      { key:'shots_total', label:'Всего ударов' },
      { key:'shots_on', label:'Удары в створ' },
      { key:'corners', label:'Угловые' },
      { key:'yellows', label:'Жёлтые карточки' },
      { key:'reds', label:'Удаления' }
    ];
    
    // Универсальная функция получения значений для метрики
    const getValPair = (metric: string): [number, number] => {
      try {
        // Формат 1: прямые массивы [home, away] (из адаптера)
        if (stats[metric] && Array.isArray(stats[metric]) && stats[metric].length >= 2) {
          return [Number(stats[metric][0]) || 0, Number(stats[metric][1]) || 0];
        }
        
        // Формат 2: структура {home: {...}, away: {...}} (старый формат)
        if (stats.home && stats.away) {
          const h = Number(stats.home[metric] ?? 0) || 0;
          const a = Number(stats.away[metric] ?? 0) || 0;
          return [h, a];
        }
        
        return [0, 0];
      } catch { 
        return [0, 0]; 
      }
    };
    
    const wrap = document.createElement('div'); wrap.className='stats-grid';
    metrics.forEach(mt => {
      const [lh,rh] = getValPair(mt.key);
      const rowWrap=document.createElement('div'); rowWrap.className='metric';
      const title=document.createElement('div'); title.className='metric-title'; title.textContent=mt.label; rowWrap.appendChild(title);
      const bar=document.createElement('div'); bar.className='stat-row';
      const leftSide=document.createElement('div'); leftSide.className='stat-side stat-left';
      const leftVal=document.createElement('div'); leftVal.className='stat-val'; leftVal.textContent=String(lh); leftSide.appendChild(leftVal);
      const mid=document.createElement('div'); mid.className='stat-bar';
      const leftFill=document.createElement('div'); leftFill.className='stat-fill-left';
      const rightFill=document.createElement('div'); rightFill.className='stat-fill-right';
  const total = lh+rh; const lp = total>0? Math.round((lh/total)*100):50;
  // Используем существующие стили: только выставляем ширины, без новых transition
  leftFill.style.width=lp+'%'; rightFill.style.width=(100-lp)+'%';
      
      // Добавляем цвета команд если доступны
      try {
        if (typeof (window as any).getTeamColor === 'function') {
          leftFill.style.backgroundColor = (window as any).getTeamColor(match.home || '');
          rightFill.style.backgroundColor = (window as any).getTeamColor(match.away || '');
        }
      } catch(_) {}
      
      mid.append(leftFill,rightFill);
      const rightSide=document.createElement('div'); rightSide.className='stat-side stat-right';
      const rightVal=document.createElement('div'); rightVal.className='stat-val'; rightVal.textContent=String(rh); rightSide.appendChild(rightVal);
      bar.append(leftSide, mid, rightSide);
      rowWrap.appendChild(bar);
      // Поддерживаем только обновление значений без новых CSS-классов
      wrap.appendChild(rowWrap);
    });
    host.innerHTML=''; host.appendChild(wrap);
    return true;
  }

  function checkStoreDataAvailable(match: any): boolean {
    if (!match?.home || !match?.away) return false;
    
    // Проверяем через MatchesStoreAPI
    if ((window as any).MatchesStoreAPI) {
      try {
        const matchKey = (window as any).MatchesStoreAPI.findMatchByTeams(match.home, match.away);
        if (matchKey) {
          const storeData = (window as any).MatchesStoreAPI.getMatch(matchKey);
          if (storeData && (storeData.rosters || storeData.events)) {
            return true;
          }
        }
      } catch(e) {
        console.warn('[Bridge] MatchesStoreAPI check error:', e);
      }
    }
    
    // Fallback на старый MatchesStore
    if ((window as any).MatchesStore) {
      try {
        const st = (window as any).MatchesStore.get();
        if (st) {
          const key = findMatchKey(st);
          if (key) {
            const entry = st.map[key];
            if (entry && (entry.rosters || entry.events || entry.score)) {
              return true;
            }
          }
        }
      } catch(e) {
        console.warn('[Bridge] Legacy store check error:', e);
      }
    }
    
    return false;
  }

  // --- Rosters/Events override ---
  // Legacy MatchRostersEvents.render(fetch...) → заменяем на версию из стора
  function installRostersOverride(){
    try {
      const orig = window.MatchRostersEvents && window.MatchRostersEvents.render;
      if(!orig || (window.MatchRostersEvents && window.MatchRostersEvents.__storeDriven)) return;
      
      // Сохраняем оригинальную функцию
      window.MatchRostersEvents.__originalRender = orig;
      
      window.MatchRostersEvents.render = function(match: any, details: any, mdPane: any, els: any){
        console.log('[Bridge] MatchRostersEvents.render called from store', { match, details, mdPane, els });
        
        // Администратор: используем оригинальный рендер, НО сохраняем/прокидываем эффективный счёт,
        // чтобы original не ставил «— : —» и не перетирал подтверждённый счёт
        try {
          const adminId = document.body.getAttribute('data-admin');
          const isAdmin = !!(adminId && adminId.trim() !== '');
          if (isAdmin) {
            console.log('[Bridge] Admin mode detected, preserving score during original render');
            // Определяем эффективный счёт из источников: state → DOM → details
            let effScore: {home:number; away:number} | null = null;
            try {
              const st: any = ((window as any).MatchLiveScore && (window as any).MatchLiveScore.state) || (mdPane && (mdPane as any).__liveScoreState) || null;
              if (st && st.currentScore && typeof st.currentScore.home === 'number' && typeof st.currentScore.away === 'number') {
                effScore = { home: st.currentScore.home, away: st.currentScore.away };
              }
            } catch(_) {}
            if (!effScore) {
              try {
                const el = document.getElementById('md-score');
                const txt = String(el?.textContent || '').trim();
                const m = txt.match(/(\d+)\s*:\s*(\d+)/);
                if (m) { effScore = { home: Number(m[1])||0, away: Number(m[2])||0 }; }
              } catch(_) {}
            }
            if (!effScore && details && typeof details === 'object' && details.score && typeof details.score.home === 'number' && typeof details.score.away === 'number') {
              effScore = { home: details.score.home, away: details.score.away };
            }
            // Вызываем оригинальный рендер, прокидывая score, если он известен
            try {
              const detailsWithScore = (effScore ? Object.assign({}, details || {}, { score: effScore }) : details);
              orig.call(this, match, detailsWithScore, mdPane, els);
            } catch(e) {
              console.warn('[Bridge] Original render (admin) failed:', e);
              return;
            }
            // После рендера восстанавливаем счёт, если он был затёрт плейсхолдером
            try {
              if (effScore) {
                const scoreEl = document.getElementById('md-score');
                const isPlaceholder = (scoreEl && typeof scoreEl.textContent === 'string') ? /[—-]\s*:\s*[—-]/.test(scoreEl.textContent!.trim()) : false;
                const desired = `${effScore.home} : ${effScore.away}`;
                if (scoreEl && (isPlaceholder || scoreEl.textContent!.trim() !== desired)) {
                  scoreEl.textContent = desired;
                }
              }
            } catch(_) {}
            return; // для админа на этом заканчиваем
          }
        } catch(_) {}
        
        // Если вебсокеты недоступны, используем оригинальный рендер
        try {
          if (!window.__WEBSOCKETS_ENABLED__) {
            console.log('[Bridge] WebSockets disabled, using original rosters render');
            return orig.call(this, match, details, mdPane, els);
          }
        } catch(_) {}
        
        // Сначала проверяем - есть ли данные в сторе
        let hasStoreData = false;
        try {
          hasStoreData = checkStoreDataAvailable(match);
        } catch(e) {
          console.warn('[Bridge] Error checking store data:', e);
        }
        
        // Если данных в сторе НЕТ - используем оригинальную функцию
        if (!hasStoreData) {
          console.log('[Bridge] No store data, using original render');
          try {
            orig.call(this, match, details, mdPane, els);
          } catch(e) {
            console.warn('[Bridge] Original render failed:', e);
          }
          return;
        }
        
        // Только если есть данные в сторе - читаем из него
        try {
          renderRostersFromStore(match, mdPane, els);
        } catch(e) {
          console.warn('[Bridge] Error rendering rosters from store:', e);
          // Fallback на оригинальную функцию если что-то пошло не так
          try {
            orig.call(this, match, details, mdPane, els);
          } catch(_) {}
        }
      };
      
      window.MatchRostersEvents.__storeDriven = true;
      console.log('[Bridge] Rosters override installed successfully');
    } catch(e) {
      console.error('[Bridge] Failed to install rosters override:', e);
    }
  }

  function renderRostersFromStore(match: any, mdPane: any, els: any) {
    if(!els.homePane || !els.awayPane) return;
    
    // Получаем данные из разных источников по приоритету
    let storeData: any = null;
    let hasStoreData = false;
    
    // ПРИОРИТЕТ 1: __MatchEventsRegistry (стабильный источник из коммита 9764968)
    if ((window as any).__MatchEventsRegistry && match?.home && match?.away) {
      try {
        const registry = (window as any).__MatchEventsRegistry;
        const matchKey = registry.getMatchKey(match.home, match.away);
        const cachedEvents = registry.eventsCache?.get(matchKey);
        
        if (cachedEvents && (cachedEvents.home || cachedEvents.away)) {
          console.log('[Bridge] Found events in MatchEventsRegistry:', cachedEvents);
          storeData = { events: cachedEvents };
          hasStoreData = true;
        }
      } catch(e) {
        console.warn('[Bridge] MatchEventsRegistry error:', e);
      }
    }
    
    // ПРИОРИТЕТ 2: MatchesStoreAPI
    if (!hasStoreData && (window as any).MatchesStoreAPI && match?.home && match?.away) {
      try {
        const matchKey = (window as any).MatchesStoreAPI.findMatchByTeams(match.home, match.away);
        if (matchKey) {
          storeData = (window as any).MatchesStoreAPI.getMatch(matchKey);
          hasStoreData = !!(storeData && (storeData.rosters || storeData.events));
        }
      } catch(e) {
        console.warn('[Bridge] MatchesStoreAPI error:', e);
      }
    }
    
    // ПРИОРИТЕТ 3: Legacy MatchesStore
    if (!hasStoreData) {
      const st = (window as any).MatchesStore?.get();
      if (st) {
        const key = findMatchKey(st);
        if (key) {
          const entry = st.map[key];
          storeData = entry || null;
          hasStoreData = !!(storeData && (storeData.rosters || storeData.events || storeData.score));
        }
      }
    }
    
    // Извлекаем данные с fallback на кэш
    const rosters = storeData?.rosters || (mdPane as any).__lastRosters || { home: [], away: [] };
    const events = storeData?.events || (mdPane as any).__lastEvents || { home: [], away: [] };
    // Вычисляем эффективный счёт, чтобы избежать мерцания «— : —» при частичных патчах
    const parseDomScore = (): { home: number; away: number } | null => {
      try {
        const el = document.getElementById('md-score');
        const t = el?.textContent?.trim() || '';
        const m = t.match(/(\d+)\s*:\s*(\d+)/);
        if (m) {
          return { home: parseInt(m[1], 10) || 0, away: parseInt(m[2], 10) || 0 };
        }
      } catch(_) {}
      return null;
    };
    const lastScore = (mdPane as any).__lastScore as { home:number; away:number } | undefined;
    let score = storeData?.score as { home:number; away:number } | undefined;
    if (!score) {
      score = lastScore || parseDomScore() || undefined;
    }
    
    // Обновляем кэш для совместимости с legacy кодом
    (mdPane as any).__lastRosters = rosters;
    (mdPane as any).__lastEvents = events;
    if (score) {
      (mdPane as any).__lastScore = score;
      // КРИТИЧНО: Обновляем счет БЕЗ МЕРЦАНИЯ (принцип из стабильного коммита)
      try {
        const scoreEl = document.getElementById('md-score');
        if (scoreEl && typeof score.home === 'number' && typeof score.away === 'number') {
          const newScoreText = `${score.home} : ${score.away}`;
          // Проверяем что счет действительно изменился (избегаем ненужных DOM операций)
          if (scoreEl.textContent?.trim() !== newScoreText) {
            scoreEl.textContent = newScoreText;
            // Добавляем анимацию обновления как в стабильном коммите
            scoreEl.classList.add('score-updated');
            setTimeout(() => { 
              try { scoreEl.classList.remove('score-updated'); } catch(_) {} 
            }, 2000);
          }
        }
      } catch(_) {}
    }
    
    // Нормализуем события в формат, который ожидает legacy код
    let eventsFormatted: { home: any[]; away: any[] } = { home: [], away: [] };
    if (Array.isArray(events)) {
      // Новый формат: массив событий с side
      for (const ev of events) {
        const bucket = (ev.side === 'away') ? eventsFormatted.away : eventsFormatted.home;
        bucket.push({
          player: ev.player || ev.team || ev.teamName || '',
          type: ev.type || ev.kind || 'event'
        });
      }
    } else if (events && typeof events === 'object') {
      // Старый формат: {home: [], away: []}
      eventsFormatted.home = (events.home ?? []).map((e: any) => ({
        player: e.player || '',
        type: e.type || 'event'
      }));
      eventsFormatted.away = (events.away ?? []).map((e: any) => ({
        player: e.player || '',
        type: e.type || 'event'
      }));
    }
    
    // Вызываем оригинальную render функцию с данными из стора
    try {
      // Получаем оригинальную функцию (до override)
      const renderFunc = window.MatchRostersEvents.__originalRender;
      if (!renderFunc) {
        console.warn('[Bridge] No original render function found, using fallback');
        if (els.homePane) els.homePane.innerHTML = `<div>Команда 1: ${rosters.home?.length || 0} игроков</div>`;
        if (els.awayPane) els.awayPane.innerHTML = `<div>Команда 2: ${rosters.away?.length || 0} игроков</div>`;
        return;
      }
      
      const detailsObj = {
        rosters: {
          home: rosters.home ?? [],
          away: rosters.away ?? []
        },
        events: eventsFormatted,
        score: score // всегда передаём эффективный счёт, чтобы оригинальный рендер не ставил «— : —»
      };
      
      renderFunc(match, detailsObj, mdPane, els);
      // Страховка: если оригинальный рендер всё равно вернул placeholder, восстановим счёт
      try {
        const scoreEl = document.getElementById('md-score');
        if (scoreEl && score && (scoreEl.textContent?.trim() === '— : —' || scoreEl.textContent?.trim() === '- : -')) {
          scoreEl.textContent = `${score.home} : ${score.away}`;
        }
      } catch(_) {}
    } catch(err) {
      console.warn('[Bridge] Error calling rosters render function:', err);
      // Минимальный fallback
      if (els.homePane) {
        els.homePane.innerHTML = `<div>Команда 1: ${rosters.home?.length || 0} игроков</div>`;
      }
      if (els.awayPane) {
        els.awayPane.innerHTML = `<div>Команда 2: ${rosters.away?.length || 0} игроков</div>`;
      }
    }
  }

  // Периодически пытаемся установить override, пока legacy модуль не прогружен
  try { 
    let tries=0; 
    const timer=setInterval(()=>{ 
      tries++; 
      installStatsOverride(); 
      installRostersOverride();
      if((window.MatchStats?.__storeDriven && window.MatchRostersEvents?.__storeDriven) || tries>40) 
        clearInterval(timer); 
    }, 250); 
  } catch(_){ }

  // --- Events / rosters bridge ---
  // Мы НЕ рендерим roster здесь — лишь инициируем тот же механизм, что и realtime-updates (matchDetailsUpdate)
  // Формируем detail: { home, away, events: {home:[], away:[]} } адаптируя массив events из стора

  function adaptEvents(list: MatchEvent[]|undefined|null){
    if(!Array.isArray(list)) return { home:[], away:[] };
    const home: any[] = []; const away: any[] = [];
    for(const ev of list){
      const bucket = (ev.side === 'away')? away: home; // default home если side не задан
      // legacy структура использует поля: player, type
      bucket.push({
        player: ev.player || ev.team || ev.teamName || '',
        type: ev.type || ev.kind || 'event'
      });
    }
    return { home, away };
  }

  let lastSig: string|null = null;
  let debounceTimer: any = null;

  // КРИТИЧНО: Подписка на обновления событий реестра для пользователей (store-driven)
  (function installEventsRegistryListener(){
    try {
      if ((window as any).__storeEventsListenerInstalled) return;
      (window as any).__storeEventsListenerInstalled = true;
      document.addEventListener('eventsRegistryUpdate', (e: any) => {
        try {
          const d = e?.detail || {};
          if (!d || !d.home || !d.away) return;
          // Не вмешиваемся в админский рендер
          let isAdmin = false;
          try { const adminId = document.body.getAttribute('data-admin'); isAdmin = !!(adminId && adminId.trim() !== ''); } catch(_) {}
          if (isAdmin) return;
          // Проверяем, открыт ли модал деталей именно этого матча
          const mdPane = document.getElementById('ufo-match-details') as HTMLElement | null;
          if (!mdPane || mdPane.style.display === 'none') return;
          const cur = (window as any).__currentMatchDetails || null;
          if (!cur || cur.home !== d.home || cur.away !== d.away) return;
          // Берём данные из реестра — это самый свежий источник
          const reg = (window as any).__MatchEventsRegistry;
          const events = reg && typeof reg.getEvents === 'function' ? reg.getEvents(d.home, d.away) : (d.events || { home: [], away: [] });
          // Обновим кэш панели и перерендерим через store-driven путь
          (mdPane as any).__lastEvents = events;
          // Найдём базовые элементы
          const els = {
            homePane: mdPane.querySelector('.home-roster') as HTMLElement | null || mdPane.querySelector('[data-team="home"]') as HTMLElement | null,
            awayPane: mdPane.querySelector('.away-roster') as HTMLElement | null || mdPane.querySelector('[data-team="away"]') as HTMLElement | null,
          };
          if (!els.homePane || !els.awayPane) return;
          // Для предотвращения частого мерцания - debounce
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            try {
              // Сформируем минимальный объект storeData для рендера
              const storeLike: any = { events };
              // Используем текущий матч из глобального контекста
              const match = cur;
              renderRostersFromStore(match, mdPane, els as any);
              console.log('[Bridge] Store-driven: UI синхронизирован по eventsRegistryUpdate');
            } catch(err) {
              console.warn('[Bridge] Store-driven events sync error:', err);
            }
          }, 120);
        } catch(err) {
          console.warn('[Bridge] eventsRegistryUpdate listener error:', err);
        }
      });
      console.log('[Bridge] Store-driven eventsRegistryUpdate listener installed');
    } catch(e){ console.warn('[Bridge] Failed to install store events listener:', e); }
  })();

  function computeSig(entry: MatchEntry|undefined){
    if(!entry) return 'empty';
    const score = entry.score? `${entry.score.home}:${entry.score.away}`:'-';
    const evCount = entry.events? entry.events.length:0;
    // Поддержка обоих форматов статистики: {home/away} и верхнеуровневые массивы (shots_total: [h,a], ...)
    const statsObj: any = entry.stats || {};
    const sigHomeAway = (()=>{ try { const h=statsObj?.home||{}; const a=statsObj?.away||{}; return Object.keys(h).sort().map(k=>k+':'+h[k]).join(',')+'|'+Object.keys(a).sort().map(k=>k+':'+a[k]).join(','); } catch { return ''; } })();
    const sigTopLevel = (()=>{
      try {
        const keys = Object.keys(statsObj).filter(k => k !== 'home' && k !== 'away').sort();
        if(keys.length===0) return '';
        const parts: string[] = [];
        for(const k of keys){
          const v = (statsObj as any)[k];
          if (Array.isArray(v)) {
            parts.push(k+':'+v.map(x=>Number(x)||0).join('-'));
          } else if (typeof v === 'number') {
            parts.push(k+':'+v);
          } else if (v && typeof v === 'object') {
            // редкий случай: вложенный объект
            parts.push(k+':'+Object.values(v).map(x=>Number(x)||0).join('-'));
          } else {
            parts.push(k+':'+String(v));
          }
        }
        return parts.join('|');
      } catch { return ''; }
    })();
    const ts = Number(entry.lastUpdated||0) || 0;
    return `${score}|${evCount}|${sigHomeAway}|${sigTopLevel}|${ts}`;
  }

  function dispatchUpdates(entry: MatchEntry){
    try {
      const info = entry.info || null; if(!info) return;
      const eventsAdapted = adaptEvents(entry.events);
      const detailsPayload: any = { home: info.home, away: info.away, events: eventsAdapted };
      // Событие для обновления вкладок Команда 1/2
      const ev = new CustomEvent('matchDetailsUpdate', { detail: detailsPayload });
      document.dispatchEvent(ev);
      // Прямое обновление статистики (если stats есть): ререндерим панель stats если открыта
      try {
        const statsPane = document.getElementById('md-pane-stats') as HTMLElement | null;
        const isStatsVisible = !!statsPane && statsPane.style.display !== 'none';
        // Не вмешиваемся в админский рендер, чтобы сохранить анимации/контролы
        let isAdmin = false;
        try {
          const adminId = document.body.getAttribute('data-admin');
          isAdmin = !!(adminId && adminId.trim() !== '');
        } catch(_) {}
        if(isStatsVisible && !isAdmin && window.MatchStats?.__storeDriven && !!window.__WEBSOCKETS_ENABLED__){
          renderStatsFromStore(statsPane as HTMLElement, { home: info.home, away: info.away });
        }
      } catch(_){}
    } catch(_) {}
  }

  function schedule(entry: MatchEntry){
    const sig = computeSig(entry);
    if(sig === lastSig) return; // нет изменений в существенных частях
    lastSig = sig;
    if(debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(()=>dispatchUpdates(entry), 120); // мягкий debounce
  }

  function onState(state: MatchesState){
    const pane = detailsPane(); if(!visible(pane as any)) return;
    const key = findMatchKey(state); if(!key) return;
    const entry = state.map[key]; if(!entry) return;
    schedule(entry);
  }

  try {
    if(window.MatchesStore){
      onState(window.MatchesStore.get());
      window.MatchesStore.subscribe(onState);
    }
  } catch(_){}
})();
