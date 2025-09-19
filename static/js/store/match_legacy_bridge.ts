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
    const h = homeNameEl()?.textContent?.trim() || '';
    const a = awayNameEl()?.textContent?.trim() || '';
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
        // Администратор: не перехватываем, оставляем оригинальный рендер с контролами редактирования
        try {
          const adminId = document.body.getAttribute('data-admin');
          const currentId = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id ? String((window as any).Telegram.WebApp.initDataUnsafe.user.id) : '';
          const isAdmin = !!(adminId && currentId && String(adminId) === currentId);
          if (isAdmin) {
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

  function renderStatsFromStore(host: HTMLElement, match: any): boolean {
    console.log('[Bridge] renderStatsFromStore called', {
      matchesStoreAPIExists: !!(window as any).MatchesStoreAPI,
      matchesStoreExists: !!window.MatchesStore,
      currentNames: currentNames(),
      match,
      matchHome: match?.home,
      matchAway: match?.away
    });
    
    if(!host) return false;
    
    // Пытаемся получить статистику через новый API
    let stats: any = null;
    let hasStoreData = false;
    
    if ((window as any).MatchesStoreAPI && match?.home && match?.away) {
      try {
        // Используем данные из объекта match, а не currentNames (которые могут не совпадать)
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
    
    // Fallback на старый MatchesStore
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
      const total = lh+rh; const lp = total>0? Math.round((lh/total)*100):50; leftFill.style.width=lp+'%'; rightFill.style.width=(100-lp)+'%';
      
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
      wrap.appendChild(rowWrap);
    });
    host.innerHTML=''; host.appendChild(wrap);
    return true;
  }

  // Периодически пытаемся установить override, пока legacy модуль не прогружен
  try { let tries=0; const timer=setInterval(()=>{ tries++; installStatsOverride(); if(window.MatchStats?.__storeDriven || tries>40) clearInterval(timer); }, 250); } catch(_){ }

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

  function computeSig(entry: MatchEntry|undefined){
    if(!entry) return 'empty';
    const score = entry.score? `${entry.score.home}:${entry.score.away}`:'-';
    const evCount = entry.events? entry.events.length:0;
    const statsSig = (()=>{ try { const h=entry.stats?.home||{}; const a=entry.stats?.away||{}; return Object.keys(h).sort().map(k=>k+':'+h[k]).join(',')+'|'+Object.keys(a).sort().map(k=>k+':'+a[k]).join(','); } catch { return ''; } })();
    return `${score}|${evCount}|${statsSig}`;
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
        const statsPane = document.getElementById('md-pane-stats');
        if(statsPane && window.MatchStats?.__storeDriven){
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
