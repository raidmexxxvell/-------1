// LeaderboardsStore: хранит расширенные статистические таблицы (goals+assists, goals, assists)
// TTL + ETag + optional WebSocket patch merge
(function(){
  try {
    if(!window.Store || !window.Store.createStore) return; // core store не загружен
    if(window.LeaderboardsStore) return; // уже инициализировано

    // Feature flag removed: always enabled now

    const TTL = 90_000; // 90s (SWR окно)
    const LS_KEY = 'leaderboards:cache:v1';

    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(LS_KEY)||'null'); } catch(_) { cached = null; }

    const initial = {
      activeTab: 'ga', // ga | goals | assists
      data: {
        goals_assists: cached?.data?.goals_assists || null,
        goals: cached?.data?.goals || null,
        assists: cached?.data?.assists || null
      },
      updatedAt: cached?.updatedAt || null,
      etag: cached?.etag || null,
      lastUpdated: cached?.ts || 0,
      loading: false,
      error: null,
      fallbackTried: false
    };

    const store = window.Store.createStore('leaderboards', initial);
    window.LeaderboardsStore = store;

    function persist(state){
      try { localStorage.setItem(LS_KEY, JSON.stringify({ etag: state.etag, ts: state.lastUpdated, data: state.data, updatedAt: state.updatedAt })); } catch(_) {}
    }

    // Sorting helpers (replicate server logic for patch merges)
    function sortLists(data){
      if(Array.isArray(data.goals_assists)) data.goals_assists.sort((a,b)=> (b.total - a.total) || (a.games - b.games) || (a.player.localeCompare(b.player)) );
      if(Array.isArray(data.goals)) data.goals.sort((a,b)=> (b.goals - a.goals) || (a.games - b.games) || (a.player.localeCompare(b.player)) );
      if(Array.isArray(data.assists)) data.assists.sort((a,b)=> (b.assists - a.assists) || (a.games - b.games) || (a.player.localeCompare(b.player)) );
    }

    function applyPatch(patch){
      if(!patch || typeof patch !== 'object') return;
      const before = store.get();
      const prevSig = JSON.stringify({
        ga: before.data.goals_assists?.map(r=>r.player+':'+r.total).join('|'),
        g: before.data.goals?.map(r=>r.player+':'+r.goals).join('|'),
        a: before.data.assists?.map(r=>r.player+':'+r.assists).join('|')
      });
      store.update(s => {
        ['goals_assists','goals','assists'].forEach(key => {
          if(!patch[key]) return;
          if(!Array.isArray(s.data[key])) s.data[key] = [];
          const list = s.data[key];
          patch[key].forEach(entry => {
            if(!entry) return;
            // patch может приходить без player_id => сравниваем по имени
            const pid = entry.player_id != null ? entry.player_id : entry.player;
            const idx = list.findIndex(i => (i.player_id != null ? i.player_id : i.player) === pid);
            if(idx >=0) list[idx] = { ...list[idx], ...entry }; else list.push(entry);
          });
        });
        sortLists(s.data);
        s.data.goals_assists && (s.data.goals_assists = s.data.goals_assists.slice(0,10));
        s.data.goals && (s.data.goals = s.data.goals.slice(0,10));
        s.data.assists && (s.data.assists = s.data.assists.slice(0,10));
        s.lastUpdated = Date.now();
      });
      const after = store.get();
      const newSig = JSON.stringify({
        ga: after.data.goals_assists?.map(r=>r.player+':'+r.total).join('|'),
        g: after.data.goals?.map(r=>r.player+':'+r.goals).join('|'),
        a: after.data.assists?.map(r=>r.player+':'+r.assists).join('|')
      });
      // Если сигнатура не изменилась (или стала пустой при наличии патча) — считаем патч неприменим → полная перезагрузка
      if(prevSig === newSig || (!after.data.goals_assists?.length && (patch.goals_assists||patch.goals||patch.assists))){
        // fallback полный refetch (force)
        try { fetchData(true); } catch(_) {}
      }
      persist(store.get());
    }

    function setActiveTab(tab){
      if(!tab || (tab !== 'ga' && tab !== 'goals' && tab !== 'assists')) return;
      store.update(s => { s.activeTab = tab; });
    }

    // fetchEtag based loader (first entry only; tab switching local only)
    function fetchData(force){
      const st = store.get();
      const age = Date.now() - st.lastUpdated;
      if(!force && st.data.goals_assists && age < TTL){ return Promise.resolve(st); }
      if(st.loading) return Promise.resolve(st);
      store.update(s => { s.loading = true; s.error = null; });
      function legacyFallback(){
        const sNow = store.get();
        if(sNow.fallbackTried) return; // уже пробовали
        store.update(s=>{ s.fallbackTried = true; });
        fetch('/api/leaderboard/goal-assist?limit=50', { cache:'no-store' })
          .then(r=> r.ok? r.json(): null)
          .then(j=>{
            if(!j || !Array.isArray(j.items) || j.items.length===0) return;
            const items = j.items.map(it => ({
              player_id: it.player_id,
              player: [it.first_name, it.last_name].filter(Boolean).join(' '),
              team: it.team || '',
              games: it.matches_played || 0,
              goals: it.goals || 0,
              assists: it.assists || 0,
              total: it.goal_plus_assist || ((it.goals||0)+(it.assists||0))
            }));
            const ga = [...items];
            const g = [...items];
            const a = [...items];
            ga.sort((a,b)=> (b.total - a.total) || (a.games - b.games) || a.player.localeCompare(b.player));
            g.sort((a,b)=> (b.goals - a.goals) || (a.games - b.games) || a.player.localeCompare(b.player));
            a.sort((a,b)=> (b.assists - a.assists) || (a.games - b.games) || a.player.localeCompare(b.player));
            store.update(s=>{
              s.data.goals_assists = ga.slice(0,10);
              s.data.goals = g.slice(0,10);
              s.data.assists = a.slice(0,10);
              s.updatedAt = j.updated_at || s.updatedAt;
              s.lastUpdated = Date.now();
              s.loading = false;
            });
            persist(store.get());
          })
          .catch(()=>{});
      }
      if(!window.fetchEtag){ // fallback
        return fetch('/api/league/stats/leaderboards', { cache: 'no-store', headers: st.etag? { 'If-None-Match': st.etag } : {} })
          .then(r=> r.status===304? null : r.json())
          .then(json => {
            if(!json){ store.update(s=>{ s.loading=false; s.lastUpdated=Date.now(); }); persist(store.get()); return store.get(); }
            store.update(s => {
              s.data.goals_assists = json.goals_assists||[];
              s.data.goals = json.goals||[];
              s.data.assists = json.assists||[];
              s.updatedAt = json.updated_at || null;
              s.etag = null; // не знаем (fallback)
              s.lastUpdated = Date.now();
              s.loading = false;
            });
            sortLists(store.get().data);
            persist(store.get());
            const cur = store.get();
            if(!cur.data.goals_assists?.length && !cur.data.goals?.length && !cur.data.assists?.length){ legacyFallback(); }
            return store.get();
          })
          .catch(e=>{ store.update(s=>{ s.loading=false; s.error=e.message||'network';}); return store.get();});
      }
      return window.fetchEtag('/api/league/stats/leaderboards', {
        cacheKey: 'leaderboards:etag:v1',
        swrMs: TTL,
        forceRevalidate: force || false,
        extract: j => ({
          goals_assists: j.goals_assists||[],
          goals: j.goals||[],
          assists: j.assists||[],
          updated_at: j.updated_at||null
        }),
        onSuccess: (res) => {
          const d = res.data || {};
          store.update(s => {
            s.data.goals_assists = d.goals_assists||[];
            s.data.goals = d.goals||[];
            s.data.assists = d.assists||[];
            s.updatedAt = d.updated_at || null;
            s.etag = res.etag || s.etag || null;
            s.lastUpdated = Date.now();
            s.loading = false;
          });
          sortLists(store.get().data);
          persist(store.get());
          const cur = store.get();
            if(!cur.data.goals_assists?.length && !cur.data.goals?.length && !cur.data.assists?.length){ legacyFallback(); }
        },
        onStale: ()=>{ store.update(s=>{ s.loading = false; }); }
      }).catch(e=>{ store.update(s=>{ s.loading=false; s.error=e.message||'network';}); return store.get();});
    }

    window.LeaderboardsStoreAPI = {
      ensureFresh: fetchData,
      fetch: fetchData,
      setActiveTab,
      applyPatch,
      forceRefresh: ()=>fetchData(true)
    };

    document.addEventListener('leaderboards:patch', (e) => {
      try { applyPatch(e.detail); } catch(err){ console.warn('[LeaderboardsStore] patch event failed', err); }
    });

    try {
      if(window.__WEBSOCKETS_ENABLED__ && window.onWSMessage){
        const original = window.onWSMessage;
        window.onWSMessage = function(msg){
          try {
            if(msg && msg.topic === 'league:leaderboards:patch' && msg.data){
              applyPatch(msg.data);
              return; 
            }
          } catch(_) {}
          return original.apply(this, arguments);
        };
      }
    } catch(_) {}

    // ленивый старт
    const lazy = () => fetchData(false).catch(()=>{});
    if('requestIdleCallback' in window){ requestIdleCallback(lazy, { timeout: 2000 }); } else setTimeout(lazy,0);

    // Periodic refresh only if no WS (graceful degradation)
    try {
      const hasWS = !!(window.__WEBSOCKETS_ENABLED__ || window.io);
      if(!hasWS){
        setInterval(()=>{
          try {
            const st = store.get();
            if(Date.now() - st.lastUpdated > TTL){ fetchData(false); }
          } catch(_) {}
        }, Math.min(45_000, TTL)); // проверяем чаще, но refetch только по TTL
      }
    } catch(_) {}

  console.log('[LeaderboardsStore] initialized', { cached: !!cached });
  } catch(e){ console.warn('[LeaderboardsStore] init failed', e); }
})();
