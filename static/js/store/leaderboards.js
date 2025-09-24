// LeaderboardsStore: хранит расширенные статистические таблицы (goals+assists, goals, assists)
// TTL + ETag + optional WebSocket patch merge
(function(){
  try {
    if(!window.Store || !window.Store.createStore) return; // core store не загружен
    if(window.LeaderboardsStore) return; // уже инициализировано

    const TTL = 90_000; // 90s
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
      etag: cached?.etag || null,
      lastUpdated: cached?.ts || 0,
      loading: false,
      error: null
    };

    const store = window.Store.createStore('leaderboards', initial);
    window.LeaderboardsStore = store;

    function persist(state){
      try { localStorage.setItem(LS_KEY, JSON.stringify({ etag: state.etag, ts: state.lastUpdated, data: state.data })); } catch(_) {}
    }

    async function fetchData(force){
      const st = store.get();
      const age = Date.now() - st.lastUpdated;
      if(!force && age < TTL && st.data.goals_assists) return st; // свежие данные
      if(st.loading) return st;

      store.update(s => { s.loading = true; s.error = null; });

      const headers = { 'Cache-Control': 'no-cache' };
      if(st.etag) headers['If-None-Match'] = st.etag;

      try {
        const resp = await fetch('/api/league/stats/leaderboards', { headers, cache: 'no-store' });
        if(resp.status === 304){
          store.update(s => { s.lastUpdated = Date.now(); s.loading = false; });
          persist(store.get());
          return store.get();
        }
        if(!resp.ok){ throw new Error('HTTP '+resp.status); }
        const json = await resp.json();
        const etag = resp.headers.get('ETag');
        store.update(s => {
          s.data.goals_assists = json.goals_assists || [];
            s.data.goals = json.goals || [];
            s.data.assists = json.assists || [];
            s.etag = etag || null;
            s.lastUpdated = Date.now();
            s.loading = false;
        });
        persist(store.get());
        return store.get();
      } catch(e){
        store.update(s => { s.loading = false; s.error = e.message || 'network'; });
        return store.get();
      }
    }

    function setActiveTab(tab){
      if(!tab || (tab !== 'ga' && tab !== 'goals' && tab !== 'assists')) return;
      store.update(s => { s.activeTab = tab; });
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
            if(!entry || entry.player_id == null) return;
            const idx = list.findIndex(i => i.player_id === entry.player_id);
            if(idx >=0) list[idx] = { ...list[idx], ...entry }; else list.push(entry);
          });
        });
        sortLists(s.data);
        // Ensure only top10 (server contract)
        s.data.goals_assists && (s.data.goals_assists = s.data.goals_assists.slice(0,10));
        s.data.goals && (s.data.goals = s.data.goals.slice(0,10));
        s.data.assists && (s.data.assists = s.data.assists.slice(0,10));
        s.lastUpdated = Date.now();
      });
      persist(store.get());
    }

    // Attach global API
    window.LeaderboardsStoreAPI = {
      ensureFresh: fetchData,
      fetch: fetchData,
      setActiveTab,
      applyPatch,
      forceRefresh: () => fetchData(true)
    };

    // Custom event based patch integration (optional, fired elsewhere)
    document.addEventListener('leaderboards:patch', (e) => {
      try { applyPatch(e.detail); } catch(err){ console.warn('[LeaderboardsStore] patch event failed', err); }
    });

    // WebSocket integration (optional) — expects global dispatcher to call window.onWSMessage(json)
    // We monkey-patch if a primitive global WS hook exists
    try {
      if(window.__WEBSOCKETS_ENABLED__ && window.onWSMessage){
        const original = window.onWSMessage;
        window.onWSMessage = function(msg){
          try {
            if(msg && msg.topic === 'league:leaderboards:patch' && msg.data){
              applyPatch(msg.data);
              return; // swallow? or continue chain? keep chain
            }
          } catch(_) {}
          return original.apply(this, arguments);
        };
      }
    } catch(_) {}

    // Авто-фетч (ленивый) через requestIdleCallback / timeout
    const schedule = () => {
      const load = () => fetchData(false).catch(()=>{});
      if('requestIdleCallback' in window){ requestIdleCallback(load, { timeout: 2000 }); } else setTimeout(load, 0);
    };
    schedule();

    console.log('[LeaderboardsStore] initialized', { cached: !!cached });
  } catch(e){ console.warn('[LeaderboardsStore] init failed', e); }
})();
