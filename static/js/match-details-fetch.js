// match-details-fetch.js
// Унификация получения деталей матча через fetchEtag (если доступен) с fallback на старую схему.
// API: fetchMatchDetails({ home, away, date?, forceFresh? }) -> Promise<{ data, etag, ts }>
(function(){
  if (window.fetchMatchDetails) { return; }
  const TTL_MS = 10 * 60 * 1000; // 10 минут как было
  function cacheKey(home, away){ return `md:${(home||'').toLowerCase()}::${(away||'').toLowerCase()}`; }
  function readCache(k){ try { return JSON.parse(localStorage.getItem(k)||'null'); } catch(_) { return null; } }
  function writeCache(k, store){ try { localStorage.setItem(k, JSON.stringify(store)); } catch(_) {} }

  async function legacyFetch(paramsStr, cached){
    const r = await fetch(`/api/match-details?${paramsStr}`, { headers: cached?.version ? { 'If-None-Match': cached.version } : {} });
    if (r.status === 304 && cached) { return cached; }
    const data = await r.json();
    const version = data.version || r.headers.get('ETag') || null;
    const store = { data, version, ts: Date.now() };
    writeCache(cacheKey(data?.home||'', data?.away||''), store); // best effort
    return store;
  }

  async function fetchMatchDetails(opts){
    const { home, away, date=null, forceFresh=false } = opts || {};
    if (!home || !away) { throw new Error('home & away required'); }
    const key = cacheKey(home, away);
    const cached = readCache(key);
    const isEmptyRosters = (()=>{ try { const d=cached?.data; const h=Array.isArray(d?.rosters?.home)?d.rosters.home:[]; const a=Array.isArray(d?.rosters?.away)?d.rosters.away:[]; return h.length===0 && a.length===0; } catch(_) { return false; } })();
    const fresh = cached && !isEmptyRosters && (Date.now() - (cached.ts||0) < TTL_MS);
  const params = new URLSearchParams({ home, away }); if (date) { params.set('date', date); }

    // Если нет утилиты fetchEtag — fallback сразу
    if (!window.fetchEtag) {
      if (fresh && !forceFresh) { return cached; }
      try { return await legacyFetch(params.toString(), cached); } catch(e){ if (cached) { return cached; } throw e; }
    }

    if (fresh && !forceFresh) { return cached; }
    // Используем fetchEtag — forceRevalidate если есть версия
    const res = await window.fetchEtag(`/api/match-details?${params.toString()}`, {
      cacheKey: `md:etag-temp:${home.toLowerCase()}::${away.toLowerCase()}`,
      swrMs: TTL_MS,
      forceRevalidate: !!cached,
      extract: j => j
    }).catch(err => { if (cached) { return { data: cached.data, etag: cached.version, updated:false }; } throw err; });
    const data = res.raw || res.data;
    const version = res.etag || data?.version || null;
    const store = { data, version, ts: Date.now() };
    // Не затираем кэш пустыми составами если раньше были заполнены
    const incomingRosters = (()=>{ try { const h=Array.isArray(data?.rosters?.home)?data.rosters.home:[]; const a=Array.isArray(data?.rosters?.away)?data.rosters.away:[]; return h.length + a.length; } catch(_) { return 0; } })();
    const cachedRosters = (()=>{ try { const h=Array.isArray(cached?.data?.rosters?.home)?cached.data.rosters.home:[]; const a=Array.isArray(cached?.data?.rosters?.away)?cached.data.rosters.away:[]; return h.length + a.length; } catch(_) { return 0; } })();
    const shouldWrite = incomingRosters > 0 || !cached || cachedRosters === 0;
    if (shouldWrite) { writeCache(key, store); }
    return store;
  }

  window.fetchMatchDetails = fetchMatchDetails;
})();
