// static/js/predictions-preload.js
// Тихая предзагрузка туров ставок: обновляет локальный кэш до первого захода во вкладку «Прогнозы».
(function(){
  try {
    if (window.__PREDICTIONS_PRELOAD_DONE__) { return; } // idempotent
    window.__PREDICTIONS_PRELOAD_DONE__ = true;
    const CACHE_KEY = 'betting:tours';
    const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch(_) { return null; } };
    const writeCache = (obj) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch(_) {} };
    const hasAnyOddsMarkets = (store) => {
      try {
  const tours = store?.data?.tours || store?.tours || [];
        let hasOdds=false, hasMarkets=false;
        tours.forEach(t => (t.matches||[]).forEach(m => {
          if (m?.odds && Object.keys(m.odds).length) { hasOdds = true; }
          if (m?.markets && ((Array.isArray(m.markets.totals) && m.markets.totals.length) || m.markets.specials)) { hasMarkets = true; }
        }));
        return hasOdds && hasMarkets;
      } catch(_) { return false; }
    };
    const indexMatches = (store) => {
      const map = new Map();
      try {
        const tours = store?.data?.tours || store?.tours || [];
        tours.forEach(t => (t.matches||[]).forEach(m => {
          const d = (m.date || m.datetime || '').slice(0,10);
          map.set(`${m.home}_${m.away}_${d}`, m);
        }));
      } catch(_) {}
      return map;
    };
    const mergeOddsMarkets = (oldStore, newStore) => {
      try {
        if (!oldStore) { return newStore; }
        const oldMap = indexMatches(oldStore);
        const ns = JSON.parse(JSON.stringify(newStore));
        const tours = ns?.data?.tours || ns?.tours || [];
        tours.forEach(t => (t.matches||[]).forEach(m => {
          try {
            const d = (m.date || m.datetime || '').slice(0,10);
            const key = `${m.home}_${m.away}_${d}`;
            const prev = oldMap.get(key);
            if (!prev) { return; }
            if (!m.odds && prev.odds) { m.odds = prev.odds; }
            if (!m.markets && prev.markets) { m.markets = prev.markets; }
            if (m.odds && prev.odds && Object.keys(m.odds).length === 0) { m.odds = prev.odds; }
            if (m.markets && prev.markets) {
              const mt = m.markets.totals; const pm = prev.markets;
              if (!(Array.isArray(mt) && mt.length) && Array.isArray(pm.totals) && pm.totals.length) { m.markets.totals = pm.totals; }
              if (!m.markets.specials && pm.specials) { m.markets.specials = pm.specials; }
            }
          } catch(_) {}
        }));
        return ns;
      } catch(_) { return newStore; }
    };

    const cached = readCache();
    const etag = cached?.version || null;
    const headers = etag ? { 'If-None-Match': etag } : {};
    fetch('/api/betting/tours', { headers })
      .then(async r => {
        if (r.status === 304 && cached) {
          // Если кэш пустой по odds/markets — однократно форсим рефетч
          if (!hasAnyOddsMarkets(cached)) {
            try {
              const r2 = await fetch('/api/betting/tours');
              const data2 = await r2.json().catch(()=>null);
              if (data2) {
                const version2 = data2.version || r2.headers.get('ETag') || null;
                let store2 = { data: data2, version: version2, ts: Date.now() };
                store2 = mergeOddsMarkets(cached, store2);
                writeCache(store2);
              }
            } catch(_){ }
          }
          return;
        }
        const data = await r.json().catch(()=>null);
        if (!data) { return; }
        let store = { data, version: (data.version || r.headers.get('ETag') || null), ts: Date.now() };
        if (cached) { store = mergeOddsMarkets(cached, store); }
        const incoming = Array.isArray(data?.tours) ? data.tours : Array.isArray(data?.data?.tours) ? data.data.tours : [];
        if (incoming.length > 0 && hasAnyOddsMarkets(store)) { writeCache(store); }
      })
      .catch(()=>{});
  } catch(_) {}
})();
