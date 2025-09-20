// etag-fetch.js
// Универсальная утилита SWR + ETag для GET запросов
// Использование:
// fetchEtag('/api/achievements', { cacheKey:'achievements:v1', swrMs:30000, extract: j=>j.achievements||[] })
//   .then(({data, etag, fromCache, updated}) => { /* ... */ });
(function(){
  if (window.fetchEtag) {return;} // уже определено

  function safeParse(jsonText){ try { return JSON.parse(jsonText); } catch(_) { return null; } }
  function normalizeKey(url){
    try {
      const u = new URL(url, window.location.origin);
      u.searchParams.delete('_'); // убираем cache-buster если есть
      return u.pathname + (u.search ? u.search : '');
    } catch(_) { return url; }
  }

  /**
   * fetchEtag(url, options)
   * options:
   *  - cacheKey (string) обязательный / уникальный
   *  - swrMs (number) окно свежести (default 30000)
   *  - extract (fn(json) -> any) выделить полезные данные
   *  - method (default GET)
   *  - headers (доп. заголовки)
   *  - params (object) — будут добавлены в query
   *  - forceRevalidate (boolean) — игнорировать окно свежести и пойти в сеть (If-None-Match)
   * Возвращает Promise<{ data, etag, fromCache, updated, raw }>
   */
  function fetchEtag(url, options={}){
    const {
      cacheKey,
      swrMs = 30000,
      extract = (j)=>j,
      method = 'GET',
      headers = {},
      params = null,
      forceRevalidate = false,
      onSuccess = null,
      onStale = null,
    } = options;
    if(!cacheKey) {throw new Error('fetchEtag: cacheKey required');}

    // Собираем финальный URL (безопасно добавляем params)
    let finalUrl = url;
    if (params && typeof params === 'object'){
      try {
        const u = new URL(url, window.location.origin);
        Object.entries(params).forEach(([k,v])=>{ if(v!==undefined && v!==null) {u.searchParams.set(k, v);} });
        finalUrl = u.pathname + u.search;
      } catch(_) { /* ignore */ }
    }
    const storeKey = cacheKey; // без префиксов (уже используется в коде проекта)
    function emit(name, detail){
      try { 
        window.dispatchEvent(new CustomEvent(name, { detail })); 
        // Admin logging for structured logs
        if (window.AdminLogger) {
          const eventType = name.replace('etag:', '');
          window.AdminLogger.logETagEvent(detail.cacheKey, eventType, detail);
        }
        // Debug logging for cache events in dev mode
        if (window.StoreDebugger?.enabled) {
          console.log(`📡 ETag Event: ${name}`, detail);
        }
      } catch(_) {}
    }
    const now = Date.now();
    let cached = null;
    try { cached = safeParse(localStorage.getItem(storeKey)); } catch(_) {}
    const isFresh = cached && (now - (cached.ts||0) < swrMs);

    // Быстрый возврат свежих данных (SWR) — сеть не идём
    if (isFresh && !forceRevalidate){
      const result = { data: cached.data, etag: cached.etag, fromCache: true, updated: false, raw: cached.raw };
      try { if (typeof onSuccess === 'function') {onSuccess(result);} } catch(_) {}
      emit('etag:success', { cacheKey: storeKey, url: normalizeKey(finalUrl), ...result });
      emit('etag:cache_hit', { cacheKey: storeKey, url: normalizeKey(finalUrl), age: now - (cached.ts||0) });
      return Promise.resolve(result);
    }

    // Сформировать заголовки (conditional запрос если есть ETag)
    const reqHeaders = Object.assign({}, headers);
    if (cached && cached.etag) {reqHeaders['If-None-Match'] = cached.etag;}

    return fetch(finalUrl, { method, headers: reqHeaders })
      .then(async res => {
        const headerUpdatedAt = res.headers ? res.headers.get('X-Updated-At') : null;
        if (res.status === 304 && cached){
          // Ничего не изменилось — возвращаем кэш и время обновления из заголовка
          const result = { data: cached.data, etag: cached.etag, fromCache: true, updated: false, raw: cached.raw, headerUpdatedAt };
          try { if (typeof onSuccess === 'function') {onSuccess(result);} } catch(_) {}
          emit('etag:success', { cacheKey: storeKey, url: normalizeKey(finalUrl), ...result });
          emit('etag:not_modified', { cacheKey: storeKey, url: normalizeKey(finalUrl), etag: cached.etag });
          return result;
        }
        let json = null;
        try { json = await res.json(); } catch(e){
          if (cached){
            const result = { data: cached.data, etag: cached.etag, fromCache: true, updated: false, raw: cached.raw, headerUpdatedAt };
            try { if (typeof onStale === 'function') {onStale(result);} } catch(_) {}
            return result;
          }
          throw e;
        }
        const etag = json && (json.version || res.headers.get('ETag')) || res.headers.get('ETag') || null;
        let data = null;
        try { data = extract(json); } catch(e){ data = json; }
        try { localStorage.setItem(storeKey, JSON.stringify({ etag, ts: Date.now(), data, raw: json })); } catch(_) {}
        const result = { data, etag, fromCache: false, updated: true, raw: json, headerUpdatedAt };
        try { if (typeof onSuccess === 'function') {onSuccess(result);} } catch(_) {}
        emit('etag:success', { cacheKey: storeKey, url: normalizeKey(finalUrl), ...result });
        emit('etag:cache_miss', { cacheKey: storeKey, url: normalizeKey(finalUrl), etag });
        return result;
      })
      .catch(err => {
        console.warn('fetchEtag error', err);
        emit('etag:error', { cacheKey: storeKey, url: normalizeKey(finalUrl), error: err.message || 'Network error' });
        if (cached){
          const result = { data: cached.data, etag: cached.etag, fromCache: true, updated: false, raw: cached.raw };
          try { if (typeof onStale === 'function') {onStale(result);} } catch(_) {}
          emit('etag:stale', { cacheKey: storeKey, url: normalizeKey(finalUrl), ...result });
          return result;
        }
        throw err;
      });
  }

  // Global cache management utilities
  window.fetchEtagUtils = {
    clearCache: function(pattern) {
      if (!localStorage) {return 0;}
      let count = 0;
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (!pattern || key.includes(pattern)) {
          try { localStorage.removeItem(key); count++; } catch(_) {}
        }
      }
      console.log(`🗑️ Cleared ${count} cache entries${pattern ? ` matching "${pattern}"` : ''}`);
      return count;
    },
    
    getCacheStats: function() {
      if (!localStorage) {return { total: 0, etag: 0, size: 0 };}
      const keys = Object.keys(localStorage);
      let etagCount = 0, totalSize = 0;
      
      for (const key of keys) {
        try {
          const value = localStorage.getItem(key);
          if (value) {
            totalSize += value.length;
            // Heuristic: ETag cache entries usually have 'etag' property
            if (value.includes('"etag"') || key.includes(':')) {etagCount++;}
          }
        } catch(_) {}
      }
      
      return {
        total: keys.length,
        etag: etagCount,
        size: Math.round(totalSize / 1024) // KB
      };
    },
    
    invalidateByPrefix: function(prefix) {
      return this.clearCache(prefix);
    }
  };

  window.fetchEtag = fetchEtag;
})();
