// LeaderboardsStore: хранит расширенные статистические таблицы (goals+assists, goals, assists)
// TTL + ETag + optional WebSocket patch merge
(function(){
  try {
    if(!window.Store || !window.Store.createStore) return; // core store не загружен
    if(window.LeaderboardsStore) return; // уже инициализировано

    // Feature flag gating
    const enabled = (function(){
      try {
        const hardDisable = /(?:[?&#])(ff|feature:league_extended_leaderboards)=0\b/.test(location.search) || /(?:[?&#])(ff|feature:league_extended_leaderboards)=0\b/.test(location.hash);
        if(hardDisable) return false;
        const forced = /(?:[?&#])(ff|feature:league_extended_leaderboards)=1\b/.test(location.search) || /(?:[?&#])(ff|feature:league_extended_leaderboards)=1\b/.test(location.hash);
        if(forced) { localStorage.setItem('feature:league_extended_leaderboards','1'); }
        const ls = localStorage.getItem('feature:league_extended_leaderboards');
        return ls === '1';
      } catch(_) { return false; }
    })();
    if(!enabled) { console.log('[LeaderboardsStore] feature disabled'); return; }

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
      error: null
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

    console.log('[LeaderboardsStore] initialized (flag on)', { cached: !!cached });
  } catch(e){ console.warn('[LeaderboardsStore] init failed', e); }
})();
