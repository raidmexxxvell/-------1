// etag-fetch.js
// Универсальная утилита SWR + ETag для GET запросов
// Использование:
// fetchEtag('/api/achievements', { cacheKey:'achievements:v1', swrMs:30000, extract: j=>j.achievements||[] })
//   .then(({data, etag, fromCache, updated}) => { /* ... */ });
(function(){
  if (window.fetchEtag) return; // уже определено

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
    } = options;
    if(!cacheKey) throw new Error('fetchEtag: cacheKey required');

    // Собираем финальный URL (безопасно добавляем params)
    let finalUrl = url;
    if (params && typeof params === 'object'){
      try {
        const u = new URL(url, window.location.origin);
        Object.entries(params).forEach(([k,v])=>{ if(v!==undefined && v!==null) u.searchParams.set(k, v); });
        finalUrl = u.pathname + u.search;
      } catch(_) { /* ignore */ }
    }
    const storeKey = cacheKey; // без префиксов (уже используется в коде проекта)
    const now = Date.now();
    let cached = null;
    try { cached = safeParse(localStorage.getItem(storeKey)); } catch(_) {}
    const isFresh = cached && (now - (cached.ts||0) < swrMs);

    // Быстрый возврат свежих данных (SWR) — сеть не идём
    if (isFresh && !forceRevalidate){
      return Promise.resolve({ data: cached.data, etag: cached.etag, fromCache: true, updated: false, raw: cached.raw });
    }

    // Сформировать заголовки (conditional запрос если есть ETag)
    const reqHeaders = Object.assign({}, headers);
    if (cached && cached.etag) reqHeaders['If-None-Match'] = cached.etag;

    return fetch(finalUrl, { method, headers: reqHeaders })
      .then(async res => {
        const headerUpdatedAt = res.headers ? res.headers.get('X-Updated-At') : null;
        if (res.status === 304 && cached){
          // Ничего не изменилось — возвращаем кэш и время обновления из заголовка
          return { data: cached.data, etag: cached.etag, fromCache: true, updated: false, raw: cached.raw, headerUpdatedAt };
        }
        let json = null;
        try { json = await res.json(); } catch(e){
          if (cached){
            return { data: cached.data, etag: cached.etag, fromCache: true, updated: false, raw: cached.raw, headerUpdatedAt };
          }
          throw e;
        }
        const etag = json && (json.version || res.headers.get('ETag')) || res.headers.get('ETag') || null;
        let data = null;
        try { data = extract(json); } catch(e){ data = json; }
        try { localStorage.setItem(storeKey, JSON.stringify({ etag, ts: Date.now(), data, raw: json })); } catch(_) {}
        return { data, etag, fromCache: false, updated: true, raw: json, headerUpdatedAt };
      })
      .catch(err => {
        console.warn('fetchEtag error', err);
        if (cached){
          return { data: cached.data, etag: cached.etag, fromCache: true, updated: false, raw: cached.raw };
        }
        throw err;
      });
  }

  window.fetchEtag = fetchEtag;
})();
