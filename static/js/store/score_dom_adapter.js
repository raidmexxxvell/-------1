// score_dom_adapter.js
// Единый подписчик: обновляет DOM счёта карточек (лига, профиль, избранный матч)
// Источник истины: MatchesStoreAPI. Fallback: разовый fetch если WS нет и стор не дал счёт.
(function(){
  if(typeof window==='undefined') return;
  if(window.ScoreDOMAdapter) return;

  const registry = new Map(); // matchId -> { els:Set<HTMLElement>, resolvedKey:string|null, firstAt:number, fetched:false }
  let storeUnsub = null;
  let storeReadyTried = 0;

  function matchId(meta){
    const h=(meta.home||'').toLowerCase().trim();
    const a=(meta.away||'').toLowerCase().trim();
    return h+'__'+a; // без даты — используем findMatchByTeams
  }

  function applyScoreToEl(el, sh, sa){
    try {
      if(typeof sh!=='number'||typeof sa!=='number') return;
      const txt=`${sh} : ${sa}`;
      const cur=(el.textContent||'').trim();
      if(cur!==txt){ el.textContent=txt; }
    } catch(_){}
  }

  function tryResolveKey(entry){
    if(!window.MatchesStoreAPI) return null;
    try { return window.MatchesStoreAPI.findMatchByTeams(entry.meta.home, entry.meta.away); } catch(_) { return null; }
  }

  function ensureStoreSub(){
    if(storeUnsub || !window.MatchesStoreAPI) return;
    try {
      storeUnsub = window.MatchesStoreAPI.subscribe((state)=>{
        registry.forEach((rec)=>{
          if(!rec.resolvedKey){ rec.resolvedKey = tryResolveKey(rec); }
          if(!rec.resolvedKey) return;
          const data = window.MatchesStoreAPI.getMatch(rec.resolvedKey);
            if(data && data.score && typeof data.score.home==='number' && typeof data.score.away==='number'){
              rec.els.forEach(el=>applyScoreToEl(el, data.score.home, data.score.away));
              rec.scoreApplied = true;
            }
        });
      });
      // Первичный прогон чтобы гидратировать сразу
      const st = window.MatchesStoreAPI.get();
      if(st){
        registry.forEach(r=>{ if(!r.resolvedKey) r.resolvedKey = tryResolveKey(r); });
      }
    } catch(e){ console.warn('[ScoreDOMAdapter] subscribe fail', e); }
  }

  function scheduleFallbackFetch(rec){
    if(rec.fetched) return;
    setTimeout(async ()=>{
      if(rec.scoreApplied) return; // уже получили из стора
      if(rec.fetched) return;
      if(window.__WEBSOCKETS_ENABLED__) return; // если WS включён — ждём стор
      rec.fetched = true;
      try {
        const url=`/api/match/score/get?home=${encodeURIComponent(rec.meta.home||'')}&away=${encodeURIComponent(rec.meta.away||'')}`;
        const r=await fetch(url); if(!r.ok) return; const d=await r.json().catch(()=>null);
        if(d && typeof d.score_home==='number' && typeof d.score_away==='number'){
          rec.els.forEach(el=>applyScoreToEl(el, d.score_home, d.score_away));
        }
      } catch(_){}
    }, 6000); // 6s ждём стор перед fallback
  }

  window.ScoreDOMAdapter = {
    attach(el, meta){
      try {
        if(!el || !meta || !meta.home || !meta.away) return;
        const id = matchId(meta);
        if(!registry.has(id)){
          registry.set(id, { els:new Set(), meta: {home:meta.home, away:meta.away}, resolvedKey:null, firstAt:Date.now(), fetched:false, scoreApplied:false });
        }
        const rec = registry.get(id);
        rec.els.add(el);
        el.setAttribute('data-match-home', meta.home||'');
        el.setAttribute('data-match-away', meta.away||'');
        ensureStoreSub();
        // Попытка гидратации немедленно
        if(window.MatchesStoreAPI){
          if(!rec.resolvedKey) rec.resolvedKey = tryResolveKey(rec);
          if(rec.resolvedKey){
            const data = window.MatchesStoreAPI.getMatch(rec.resolvedKey);
            if(data && data.score) applyScoreToEl(el, data.score.home, data.score.away);
          }
        }
        scheduleFallbackFetch(rec);
      } catch(e){ console.warn('[ScoreDOMAdapter] attach error', e); }
    }
  };
})();
