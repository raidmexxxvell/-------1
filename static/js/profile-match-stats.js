// Match stats rendering module extracted from profile.js
(function(){
  function render(host, match){
    try { if(host.__statsPollCancel){ host.__statsPollCancel(); } } catch(_){}
    host.innerHTML = '<div class="stats-wrap">Загрузка…</div>';
    const url = `/api/match/stats/get?home=${encodeURIComponent(match.home||'')}&away=${encodeURIComponent(match.away||'')}`;
    const updateStatBar = (row, leftVal, rightVal) => {
      try { const total=(Number(leftVal)||0)+(Number(rightVal)||0); const lp= total>0?Math.round((leftVal/total)*100):50; const rp=100-lp; const leftFill=row.querySelector('.stat-fill-left'); const rightFill=row.querySelector('.stat-fill-right'); if(leftFill&&rightFill){ leftFill.style.transition='width .3s ease'; rightFill.style.transition='width .3s ease'; leftFill.style.width=lp+'%'; rightFill.style.width=rp+'%'; } } catch(e){}
    };
    const metrics=[{key:'shots_total',label:'Всего ударов'},{key:'shots_on',label:'Удары в створ'},{key:'corners',label:'Угловые'},{key:'yellows',label:'Жёлтые карточки'},{key:'reds',label:'Удаления'}];
    const rows = new Map();
    const buildOnce=(d)=>{
      const wrap=document.createElement('div'); wrap.className='stats-grid';
      const bar=(l,r)=>{ 
        // Обработка null значений
        const leftVal = (l === null || l === undefined) ? 0 : (Number(l) || 0);
        const rightVal = (r === null || r === undefined) ? 0 : (Number(r) || 0);
        const total = leftVal + rightVal; 
        const lp = total > 0 ? Math.round((leftVal/total)*100) : 50; 
        const rp = 100 - lp; 
        const row=document.createElement('div'); row.className='stat-row'; const leftSide=document.createElement('div'); leftSide.className='stat-side stat-left'; const leftValEl=document.createElement('div'); leftValEl.className='stat-val'; leftValEl.textContent=String(leftVal); leftSide.appendChild(leftValEl); const mid=document.createElement('div'); mid.className='stat-bar'; const leftFill=document.createElement('div'); leftFill.className='stat-fill-left'; leftFill.style.width=lp+'%'; const rightFill=document.createElement('div'); rightFill.className='stat-fill-right'; rightFill.style.width=rp+'%'; try { leftFill.style.backgroundColor=getTeamColor(match.home||''); rightFill.style.backgroundColor=getTeamColor(match.away||''); } catch(_){} mid.append(leftFill,rightFill); const rightSide=document.createElement('div'); rightSide.className='stat-side stat-right'; const rightValEl=document.createElement('div'); rightValEl.className='stat-val'; rightValEl.textContent=String(rightVal); rightSide.appendChild(rightValEl); row.append(leftSide, mid, rightSide); return { row, leftVal: leftValEl, rightVal: rightValEl };
      };
      metrics.forEach(mt=>{ const rowWrap=document.createElement('div'); rowWrap.className='metric'; const title=document.createElement('div'); title.className='metric-title'; title.textContent=mt.label; const vals= d && Array.isArray(d[mt.key])? d[mt.key]:[0,0]; 
        // Безопасная обработка null значений в массиве
        const safeVals = [
          (vals[0] === null || vals[0] === undefined) ? 0 : (Number(vals[0]) || 0),
          (vals[1] === null || vals[1] === undefined) ? 0 : (Number(vals[1]) || 0)
        ]; const built=bar(safeVals[0],safeVals[1]);
        try { const adminId=document.body.getAttribute('data-admin'); const currentId=window.Telegram?.WebApp?.initDataUnsafe?.user?.id? String(window.Telegram.WebApp.initDataUnsafe.user.id):''; const isAdmin=!!(adminId && currentId && String(adminId)===currentId); if(isAdmin){ const mk=(t)=>{ const b=document.createElement('button'); b.className='details-btn'; b.textContent=t; b.style.padding='0 6px'; b.style.minWidth='unset'; return b; }; const lh=mk('−'), lplus=mk('+'), rh=mk('−'), rplus=mk('+'); const leftBox=document.createElement('div'); leftBox.className='admin-inc'; const rightBox=document.createElement('div'); rightBox.className='admin-inc'; const base=mt.key; const post=(lv,rv)=>{ const tg=window.Telegram?.WebApp||null; const fd=new FormData(); fd.append('initData', tg?.initData||''); fd.append('home', match.home||''); fd.append('away', match.away||''); fd.append(base+'_home', String(lv)); fd.append(base+'_away', String(rv)); fetch('/api/match/stats/set',{method:'POST', body:fd}).catch(()=>{}); }; const anim=(el,from,to)=>{ if(window.CounterAnimation) {window.CounterAnimation.animate(el,from,to,200);} else {el.textContent=String(to);} el.classList.add('stat-update-animation'); setTimeout(()=>el.classList.remove('stat-update-animation'),300); }; const getVals=()=>{ const l=parseInt(built.leftVal.textContent,10)||0; const r=parseInt(built.rightVal.textContent,10)||0; return [l,r]; }; lh.addEventListener('click',()=>{ const [l,r]=getVals(); const nv=Math.max(0,l-1); anim(built.leftVal,l,nv); updateStatBar(built.row,nv,r); post(nv,r); }); lplus.addEventListener('click',()=>{ const [l,r]=getVals(); const nv=l+1; anim(built.leftVal,l,nv); updateStatBar(built.row,nv,r); post(nv,r); }); rh.addEventListener('click',()=>{ const [l,r]=getVals(); const nv=Math.max(0,r-1); anim(built.rightVal,r,nv); updateStatBar(built.row,l,nv); post(l,nv); }); rplus.addEventListener('click',()=>{ const [l,r]=getVals(); const nv=r+1; anim(built.rightVal,r,nv); updateStatBar(built.row,l,nv); post(l,nv); }); leftBox.append(lh,lplus); rightBox.append(rh,rplus); const leftSide=built.row.querySelector('.stat-left'); const rightSide=built.row.querySelector('.stat-right'); if(leftSide) {leftSide.insertBefore(leftBox,leftSide.firstChild);} if(rightSide) {rightSide.appendChild(rightBox);} } } catch(_){ }
        rowWrap.append(title,built.row); wrap.appendChild(rowWrap); rows.set(mt.key, built);
      });
      host.innerHTML=''; host.appendChild(wrap);
    };
    const applyUpdate=(d)=>{
      metrics.forEach(mt=>{ const built=rows.get(mt.key); if(!built) {return;} const vals= d && Array.isArray(d[mt.key])? d[mt.key]:[0,0]; 
        // Безопасная обработка null значений
        const l = (vals[0] === null || vals[0] === undefined) ? 0 : (Number(vals[0]) || 0);
        const r = (vals[1] === null || vals[1] === undefined) ? 0 : (Number(vals[1]) || 0);
        try {
          const curL=parseInt(built.leftVal.textContent,10)||0; const curR=parseInt(built.rightVal.textContent,10)||0;
          if(curL!==l){ if(window.CounterAnimation) {window.CounterAnimation.animate(built.leftVal,curL,l,200);} else {built.leftVal.textContent=String(l);} }
          if(curR!==r){ if(window.CounterAnimation) {window.CounterAnimation.animate(built.rightVal,curR,r,200);} else {built.rightVal.textContent=String(r);} }
          updateStatBar(built.row,l,r);
        } catch(_){ }
      });
    };
  const state={ etag:null, sig:null, timer:null, busy:false, cancelled:false };
  // WS-топик для этого матча
  const wsTopic = (()=>{ try { const h=(match?.home||'').toLowerCase().trim(); const a=(match?.away||'').toLowerCase().trim(); const raw=(match?.date?String(match.date):(match?.datetime?String(match.datetime):'')); const d=raw?raw.slice(0,10):''; return `match:${h}__${a}__${d}:details`; } catch(_) { return null; } })();
  const wsActive = ()=>{ try { return !!(window.__WEBSOCKETS_ENABLED__ && wsTopic && window.realtimeUpdater && window.realtimeUpdater.getTopicEnabled && window.realtimeUpdater.hasTopic && window.realtimeUpdater.getTopicEnabled() && window.realtimeUpdater.hasTopic(wsTopic)); } catch(_) { return false; } };
  let wsRefreshHandler = null; let watch=null;
  host.__statsPollCancel = ()=>{ state.cancelled=true; try { if(state.timer) {clearTimeout(state.timer);} } catch(_){} try { if(watch) {clearInterval(watch);} } catch(_){} try { if(wsRefreshHandler) {document.removeEventListener('matchStatsRefresh', wsRefreshHandler);} } catch(_){} };
  const schedule = ()=>{ if(state.cancelled) {return;} if(wsActive()) {return;} const base=10000; const jitter=5000; const delay=base + Math.floor(Math.random()*jitter); state.timer=setTimeout(loop, delay); };
    const loop = async ()=>{
      if(state.cancelled) {return;} if(document.hidden){ schedule(); return; } if(state.busy){ schedule(); return; }
      state.busy=true;
      try {
        let data=null; let etag=null; let notModified=false;
        if(window.fetchEtag){
          const res=await window.fetchEtag(url,{
            cacheKey: `md:stats:${(match.home||'').toLowerCase()}::${(match.away||'').toLowerCase()}`,
            swrMs: 60000,
            forceRevalidate: true,
            extract: j=>j
          }).catch(()=>null);
          if(res){ etag=res.etag||null; data=res.raw||res.data||null; notModified = !!res.notModified; }
        } else {
          const r=await fetch(url,{ headers: state.etag? { 'If-None-Match': state.etag }: {} });
          if(r.status===304){ notModified=true; } else { data=await r.json().catch(()=>null); etag=r.headers.get('ETag'); }
        }
        if(notModified){ return; }
        if(etag && etag===state.etag){ return; }
        if(!data){ return; }
        const sig = (()=>{ try { return metrics.map(m=>{
          const v=Array.isArray(data[m.key])?data[m.key]:[0,0]; 
          const l = (v[0] === null || v[0] === undefined) ? 0 : (Number(v[0]) || 0);
          const r = (v[1] === null || v[1] === undefined) ? 0 : (Number(v[1]) || 0);
          return `${l}-${r}`; }).join('|'); } catch(_){ return null; } })();
        if(sig && state.sig && sig===state.sig){ return; }
        if(rows.size===0){ buildOnce(data); } else { applyUpdate(data); }
        state.sig=sig; state.etag=etag||state.etag;
      } finally { state.busy=false; schedule(); }
    };
    // Реакция на WS-событие обновления статистики: мгновенный refetch (одноразовый)
    wsRefreshHandler = (e)=>{
      try {
        const { home, away } = e.detail||{};
        if(!home || !away) {return;}
        // Защита от лишних запросов: только если это наш матч
        if(String(home)!==(match.home||'') || String(away)!==(match.away||'')) {return;}
        fetch(url, { headers: state.etag? { 'If-None-Match': state.etag }: {} })
          .then(async r=>{ const et=r.headers.get('ETag'); const d= r.status===304? null: await r.json().catch(()=>null); if(d) { if(rows.size===0) {buildOnce(d);} else {applyUpdate(d);} state.sig = metrics.map(m=>{ const v=Array.isArray(d[m.key])?d[m.key]:[0,0]; const l = (v[0] === null || v[0] === undefined) ? 0 : (Number(v[0]) || 0); const r = (v[1] === null || v[1] === undefined) ? 0 : (Number(v[1]) || 0); return `${l}-${r}`; }).join('|'); } state.etag=et; })
          .catch(()=>{});
      } catch(_){}
    };
    document.addEventListener('matchStatsRefresh', wsRefreshHandler);

    // Первичная загрузка
    fetch(url, { headers: state.etag? { 'If-None-Match': state.etag }: {} })
      .then(async r=>{ const et=r.headers.get('ETag'); const d= r.status===304? null: await r.json().catch(()=>null); if(d) { buildOnce(d); state.sig = metrics.map(m=>{ const v=Array.isArray(d[m.key])?d[m.key]:[0,0]; const l = (v[0] === null || v[0] === undefined) ? 0 : (Number(v[0]) || 0); const r = (v[1] === null || v[1] === undefined) ? 0 : (Number(v[1]) || 0); return `${l}-${r}`; }).join('|'); } state.etag=et; schedule(); })
      .catch(()=>{ host.innerHTML='<div class="stats-wrap">Нет данных</div>'; schedule(); });

    // Следим за состоянием WS-подписки и включаем/выключаем polling
    const armWatch = ()=>{
      try {
        const adjust = ()=>{
          try { if(state.cancelled) {return;} if(wsActive()){ if(state.timer){ clearTimeout(state.timer); state.timer=null; } } else { if(!state.timer) {schedule();} } } catch(_){}
        };
        adjust();
        watch = setInterval(adjust, 5000);
      } catch(_){ }
    };
    armWatch();
  }
  window.MatchStats={ render };
})();
