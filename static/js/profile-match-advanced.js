// Advanced match details screen (admin controls, events, rosters, stats, finish button, comments)
// Extracted from legacy profile.js
(function(){
  function openMatchScreen(match, details){
    try { window.__CURRENT_MATCH_KEY__ = `${(match?.home||'').toLowerCase().trim()}__${(match?.away||'').toLowerCase().trim()}__${((match?.datetime||match?.date||'').toString().slice(0,10))}`; } catch(_) {}
    const schedulePane = document.getElementById('ufo-schedule');
    const mdPane = document.getElementById('ufo-match-details');
    if (!schedulePane || !mdPane) {return;}
    try {
      const tablePane = document.getElementById('ufo-table');
      const statsPaneLeague = document.getElementById('ufo-stats');
      const resultsPane = document.getElementById('ufo-results');
      [tablePane, statsPaneLeague, schedulePane, resultsPane].forEach(p => { if (p) {p.style.display='none';} });
    } catch(_) {}
    try { mdPane.querySelectorAll('.admin-score-ctrls').forEach(n=>n.remove()); } catch(_) {}
    schedulePane.style.display='none'; mdPane.style.display='';
    try { document.getElementById('ufo-subtabs').style.display='none'; } catch(_) {}
  const hLogo=document.getElementById('md-home-logo'); const aLogo=document.getElementById('md-away-logo');
  const hName=document.getElementById('md-home-name'); const aName=document.getElementById('md-away-name');
    const score=document.getElementById('md-score'); const dt=document.getElementById('md-datetime');
    const homePane=document.getElementById('md-pane-home'); const awayPane=document.getElementById('md-pane-away');
  try { mdPane.setAttribute('data-match-home', match.home||''); mdPane.setAttribute('data-match-away', match.away||''); } catch(_){ }
  const setLogo=(imgEl,name)=>{ try { (window.setTeamLogo || window.TeamUtils?.setTeamLogo || function(){ })(imgEl, name||''); } catch(_) {} };
  hName.setAttribute('data-team-name', match.home || ''); aName.setAttribute('data-team-name', match.away || '');
  try { hLogo?.setAttribute('data-team-name', match.home||''); aLogo?.setAttribute('data-team-name', match.away||''); } catch(_) {}
    hName.textContent = (window.withTeamCount?window.withTeamCount(match.home||''):(match.home||''));
    aName.textContent = (window.withTeamCount?window.withTeamCount(match.away||''):(match.away||''));
  setLogo(hLogo, match.home||''); setLogo(aLogo, match.away||'');
  try {
    const cur = (score && typeof score.textContent==='string') ? score.textContent.trim() : '';
    const hasDigits = /\d+\s*:\s*\d+/.test(cur);
    if (!hasDigits) { score.textContent = '— : —'; }
  } catch(_) { score.textContent='— : —'; }
    try { if (match.date || match.time){ const d=match.date? new Date(match.date):null; const ds=d?d.toLocaleDateString():''; dt.textContent = `${ds}${match.time? ' '+match.time:''}`; } else {dt.textContent='';} } catch(_) { dt.textContent = match.time||''; }
    const subtabs = mdPane.querySelector('.modal-subtabs');
    // PR-2a: topic-based автоподписка на детали матча (если включено)
  let __topic = null;
    try {
      if(window.__WS_TOPIC_SUBS__ && window.realtimeUpdater){
        const h=(match?.home||'').toLowerCase().trim();
        const a=(match?.away||'').toLowerCase().trim();
        const raw=(match?.date?String(match.date):(match?.datetime?String(match.datetime):''));
        const d=raw?raw.slice(0,10):'';
  const scheme = (window.__WS_TOPIC_SCHEME__ === 'with_date') ? 'with_date' : 'no_date';
  __topic = (scheme === 'with_date') ? `match:${h}__${a}__${d}:details` : `match:${h}__${a}__:details`;
  console.log('[WS Матч] Подписываемся на топик:', __topic, 'схема:', scheme, 'WS включен:', !!window.__WEBSOCKETS_ENABLED__, 'Топики включены:', !!window.__WS_TOPIC_SUBS__);
        // небольшая задержка чтобы дождаться connect
        setTimeout(()=>{ 
          try { 
            const ru = window.realtimeUpdater;
            // Анти-дребезг: не отправляем повторную подписку, если уже есть или была попытка <1.5с назад
            try { window.__WS_LAST_SUBSCRIBE_TS = window.__WS_LAST_SUBSCRIBE_TS || new Map(); } catch(_){}
            const lastTs = (function(){ try { return window.__WS_LAST_SUBSCRIBE_TS?.get?.(__topic) || 0; } catch(_) { return 0; } })();
            const recently = (Date.now() - lastTs) < 1500;
            const already = (function(){ try { return !!window.__WS_TOPIC_SUBSCRIBED?.has?.(__topic); } catch(_) { return false; } })();
            if (already || recently) {
              console.log('[WS Матч] Пропускаем повторную подписку:', __topic, 'already=', already, 'recently=', recently);
              return;
            }
            console.log('[WS Матч] Попытка подписки на топик:', __topic);
            ru.subscribeTopic(__topic);
            try { window.__WS_LAST_SUBSCRIBE_TS?.set?.(__topic, Date.now()); } catch(_){}
            console.log('[WS Матч] Подписка выполнена для:', __topic);
          } catch(e){
            console.error('[WS Матч] Ошибка подписки:', e);
          } 
        }, 400);
      } else {
        console.warn('[WS Матч] Подписка на топики отключена. WS_TOPIC_SUBS:', !!window.__WS_TOPIC_SUBS__, 'realtimeUpdater:', !!window.realtimeUpdater);
      }
    } catch(e){ 
      console.error('[WS Матч] Ошибка настройки топика:', e);
    }
    try { const mkKey=(o)=>{ const h=(o?.home||'').toLowerCase().trim(); const a=(o?.away||'').toLowerCase().trim(); const raw=o?.date?String(o.date):(o?.datetime?String(o.datetime):''); const d=raw?raw.slice(0,10):''; return `${h}__${a}__${d}`; }; mdPane.setAttribute('data-match-key', mkKey(match)); const oldTab=subtabs?.querySelector('[data-mdtab="stream"]'); if(oldTab) {oldTab.remove();} const oldPane=document.getElementById('md-pane-stream'); if(oldPane) {oldPane.remove();} } catch(_) {}
    mdPane.querySelectorAll('.modal-subtabs .subtab-item').forEach(el=>el.classList.remove('active'));
    try { const tabHome=subtabs?.querySelector('[data-mdtab="home"]'); const tabAway=subtabs?.querySelector('[data-mdtab="away"]'); if(tabHome) {tabHome.textContent=(match.home||'Команда 1');} if(tabAway) {tabAway.textContent=(match.away||'Команда 2');} } catch(_) {}
    let specialsPane=document.getElementById('md-pane-specials'); if(!specialsPane){ specialsPane=document.createElement('div'); specialsPane.id='md-pane-specials'; specialsPane.className='md-pane'; specialsPane.style.display='none'; mdPane.querySelector('.modal-body')?.appendChild(specialsPane); }
    try { const toursCache=JSON.parse(localStorage.getItem('betting:tours')||'null'); const tours=toursCache?.data?.tours || toursCache?.tours || []; const mkKey=(o)=>{ const h=(o?.home||'').toLowerCase().trim(); const a=(o?.away||'').toLowerCase().trim(); const raw=o?.date?String(o.date):(o?.datetime?String(o.datetime):''); const d=raw?raw.slice(0,10):''; return `${h}__${a}__${d}`; }; const present=new Set(); tours.forEach(t=>(t.matches||[]).forEach(x=>present.add(mkKey(x)))); const thisKey=mkKey(match); const adminId=document.body.getAttribute('data-admin'); const currentId=window.Telegram?.WebApp?.initDataUnsafe?.user?.id?String(window.Telegram.WebApp.initDataUnsafe.user.id):''; const isAdmin=!!(adminId && currentId && String(adminId)===currentId); const existed=subtabs?.querySelector('[data-mdtab="specials"]'); if (present.has(thisKey) && isAdmin){ if(!existed){ const sp=document.createElement('div'); sp.className='subtab-item'; sp.setAttribute('data-mdtab','specials'); sp.textContent='Спецсобытия'; subtabs.appendChild(sp); } } else if (existed){ existed.remove(); } } catch(_) {}
  // Интеграция трансляции через legacy Streams (если MatchStream модуль отсутствует)
  let streamPane=null;
  try {
    // Сначала новый модуль, создаёт пустую панель (без вкладки)
    if (window.MatchStream && typeof window.MatchStream.setup==='function') {
      streamPane = window.MatchStream.setup(mdPane, subtabs, match);
    }
  } catch(_) {}
  try {
    // Затем всегда пытаемся создать вкладку/скелет через Streams (он добавляет subtab)
    if (window.Streams && typeof window.Streams.setupMatchStream==='function') {
      const hasTab = subtabs?.querySelector('[data-mdtab="stream"]');
      if (!hasTab) {
        streamPane = window.Streams.setupMatchStream(mdPane, subtabs, match) || streamPane;
      }
    }
  } catch(_) {}
  let statsPane=document.getElementById('md-pane-stats'); if(!statsPane){ statsPane=document.createElement('div'); statsPane.id='md-pane-stats'; statsPane.className='md-pane'; statsPane.style.display='none'; mdPane.querySelector('.modal-body')?.appendChild(statsPane); }
  if(!subtabs.querySelector('[data-mdtab="stats"]')){ const st=document.createElement('div'); st.className='subtab-item'; st.setAttribute('data-mdtab','stats'); st.textContent='Статистика'; subtabs.appendChild(st); }
    mdPane.querySelector('.modal-subtabs .subtab-item[data-mdtab="home"]').classList.add('active');
  homePane.style.display=''; awayPane.style.display='none'; specialsPane.style.display='none'; if(streamPane) {streamPane.style.display='none';} statsPane.style.display='none';
  // Delegate roster & events rendering
  try { if(window.MatchRostersEvents?.render) { window.MatchRostersEvents.render(match, details, mdPane, { homePane, awayPane }); } } catch(_) {}

  // Если составы не пришли в initial details — сделаем одноразовый догруз через fetchMatchDetails
  try {
    const hasRosters = (()=>{ try { const h=Array.isArray(details?.rosters?.home)?details.rosters.home:[]; const a=Array.isArray(details?.rosters?.away)?details.rosters.away:[]; return (h.length + a.length) > 0; } catch(_) { return false; } })();
    if (!hasRosters && typeof window.fetchMatchDetails === 'function') {
      const raw=(match?.date?String(match.date):(match?.datetime?String(match.datetime):''));
      const dateStr=raw?raw.slice(0,10):'';
      window.fetchMatchDetails({ home: match.home||'', away: match.away||'', date: dateStr, forceFresh: true })
        .then(store => {
          try {
            const d = store && (store.data||store.raw) ? (store.data||store.raw) : null;
            if (!d) {return;}
            if (window.MatchRostersEvents?.render) {window.MatchRostersEvents.render(match, d, mdPane, { homePane, awayPane });}
          } catch(_) {}
        })
        .catch(()=>{});
    }
  } catch(_) {}
  // WS-first: при обновлении деталей матча (в т.ч. событий) перерисовываем составы/события
  try {
    // Реакция на topic_update с сущностью match_stats: целевой refetch деталей
    const onTopicUpdate = async (e)=>{
      try {
        const p = e?.detail || {};
        if (!p || p.entity !== 'match_stats') {return;}
        if (p.home && p.away) {
          const same = (p.home === match.home) && (p.away === match.away);
          if (!same) {return;}
        }
        const raw=(match?.date?String(match.date):(match?.datetime?String(match.datetime):''));
        const dateStr=raw?raw.slice(0,10):'';
        if (typeof window.fetchMatchDetails === 'function') {
          const store = await window.fetchMatchDetails({ home: match.home||'', away: match.away||'', date: dateStr, forceFresh: true }).catch(()=>null);
          const d = store && (store.data||store.raw) ? (store.data||store.raw) : null;
          if (d && window.MatchRostersEvents?.render) {
            window.MatchRostersEvents.render(match, d, mdPane, { homePane, awayPane });
          }
        }
      } catch(_){}
    };
    document.addEventListener('ws:topic_update', onTopicUpdate);
    mdPane.__onTopicUpdate = onTopicUpdate;

    const onDetailsUpdate = (e)=>{
      try {
        const d = e?.detail || {};
        if (!d) {return;}
        // В большинстве случаев сервер присылает те же home/away; допускаем частичные патчи без этих полей
        const same = (!d.home || d.home === match.home) && (!d.away || d.away === match.away);
        if (!same) {return;}
        if (window.MatchRostersEvents?.render) {
          window.MatchRostersEvents.render(match, d, mdPane, { homePane, awayPane });
        }
      } catch(_){}
    };
    document.addEventListener('matchDetailsUpdate', onDetailsUpdate);
    mdPane.__onDetailsUpdate = onDetailsUpdate;
  } catch(_){}
  // live score + admin inline ctrls delegated
  let liveScoreCtx = null;
  try { if(window.MatchLiveScore?.setup){ liveScoreCtx = window.MatchLiveScore.setup(match,{ scoreEl:score, dtEl:dt, mdPane }); } } catch(_){ }
  // preload stats & specials (modular)
  try { if(window.MatchStats?.render) {window.MatchStats.render(statsPane, match);} } catch(e){ console.error('preload stats err', e); }
  try { if(window.MatchSpecials?.render) {window.MatchSpecials.render(specialsPane, match);} } catch(e){ console.error('preload specials err', e); }
  // Lightweight polling fallback when WebSockets are disabled OR when topic subscriptions are not working
  try {
    const wsEnabled = !!window.__WEBSOCKETS_ENABLED__;
    const wsTopicEnabled = !!window.__WS_TOPIC_SUBS__;
    console.log('[Поллинг Матча] WS включен:', wsEnabled, 'WS топики включены:', wsTopicEnabled);
    
    // Запускаем поллинг если:
    // 1) WS полностью отключены, ИЛИ
    // 2) WS включены, но топики отключены, ИЛИ 
    // 3) Принудительно для отладки (можно настроить через localStorage)
    const shouldPoll = !wsEnabled || !wsTopicEnabled || localStorage.getItem('debug:force_match_polling') === '1';
    
    if(shouldPoll && window.fetchMatchDetails){
      console.log('[Поллинг Матча] Запускаем поллинг деталей матча');
      // вычисляем дату в формате YYYY-MM-DD как в топике
      const raw=(match?.date?String(match.date):(match?.datetime?String(match.datetime):''));
      const dateStr=raw?raw.slice(0,10):'';
      let lastVersion = (details && (details.version||details.etag)) || null;
      // защита от повторного запуска
      try { if(mdPane.__detailsPollCancel){ mdPane.__detailsPollCancel(); } } catch(_){}
      let cancelled=false; let busy=false; let timer=null;
      mdPane.__detailsPollCancel = ()=>{ cancelled=true; try { if(timer) {clearTimeout(timer);} } catch(_){} };
      const loop = async ()=>{
        if(cancelled || mdPane.style.display==='none') {return;}
        // Пропускаем цикл, когда вкладка в фоне
        if(document.hidden){ schedule(); return; }
        if(busy){ schedule(); return; }
        busy=true;
        try {
          console.log('[Поллинг Матча] Получаем детали матча...');
          const store = await window.fetchMatchDetails({ home: match.home||'', away: match.away||'', date: dateStr, forceFresh: true }).catch(()=>null);
          const ver = store?.version || store?.etag || null;
          if(store && ver && ver !== lastVersion){
            console.log('[Поллинг Матча] Обнаружена новая версия:', ver, 'предыдущая:', lastVersion);
            lastVersion = ver;
            try {
              // Если недавно были админские изменения карточек (желт/красн/гол/ассист), не перерисовываем составы мгновенно, чтобы избежать фликера селектов.
              const ts = Number(mdPane.getAttribute('data-admin-last-change-ts')||'0')||0;
              const justChanged = ts && (Date.now() - ts < 8000); // 8с грейс
              if (!justChanged) {
                if(window.MatchRostersEvents?.render) {window.MatchRostersEvents.render(match, store.data, mdPane, { homePane, awayPane });}
              }
            } catch(_){}
          }
        } finally {
          busy=false; schedule();
        }
      };
      const schedule = ()=>{ if(cancelled) {return;} const base=5000; const jitter=1200; const delay = base + Math.floor(Math.random()*jitter); timer = setTimeout(loop, delay); };
      console.log('[Поллинг Матча] Запускаем цикл поллинга...');
      schedule();
    } else {
      console.log('[Поллинг Матча] Поллинг отключен - полагаемся на WS топики');
    }
  } catch(e){
    console.error('[Поллинг Матча] Ошибка настройки:', e);
  }
  mdPane.querySelectorAll('.modal-subtabs .subtab-item').forEach(btn=>{ btn.onclick=()=>{ mdPane.querySelectorAll('.modal-subtabs .subtab-item').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); const key=btn.getAttribute('data-mdtab'); if(key!=='stream'){ try { document.body.classList.remove('allow-landscape'); } catch(_){ } try { if(window.MatchStream?.deactivate){ window.MatchStream.deactivate(streamPane); } } catch(_){ } }
      if(key==='home'){ homePane.style.display=''; awayPane.style.display='none'; specialsPane.style.display='none'; statsPane.style.display='none'; }
  else if(key==='away'){ homePane.style.display='none'; awayPane.style.display=''; specialsPane.style.display='none'; statsPane.style.display='none'; if(streamPane) {streamPane.style.display='none';} }
  else if(key==='specials'){ homePane.style.display='none'; awayPane.style.display='none'; specialsPane.style.display=''; try { if(window.MatchSpecials?.render) {window.MatchSpecials.render(specialsPane, match);} } catch(e){ console.error('specials render err', e); } statsPane.style.display='none'; if(streamPane) {streamPane.style.display='none';} }
      else if(key==='stream'){
  homePane.style.display='none'; awayPane.style.display='none'; specialsPane.style.display='none'; statsPane.style.display='none';
        // Если есть новый модуль MatchStream
  // Обновляем (на случай ленивой загрузки) и MatchStream, и Streams
  if(window.MatchStream?.setup){ try { streamPane = window.MatchStream.setup(mdPane, subtabs, match) || streamPane; } catch(_){} }
  if(window.Streams?.setupMatchStream){ try { const hadTab = !!subtabs.querySelector('[data-mdtab="stream"]'); streamPane = window.Streams.setupMatchStream(mdPane, subtabs, match) || streamPane; if(!hadTab) {/* tab now created */} } catch(_){} }
        if(streamPane){
          try {
            if(window.MatchStream && typeof window.MatchStream.activate==='function'){
              window.MatchStream.activate(streamPane, match);
            } else if(window.Streams && typeof window.Streams.onStreamTabActivated==='function') {
              window.Streams.onStreamTabActivated(streamPane, match);
            }
          } catch(_){}
        } else {
          // Нет панели (ещё не подтянулась ссылка) — откат на вкладку home
          btn.classList.remove('active');
          const homeTab=mdPane.querySelector('.modal-subtabs .subtab-item[data-mdtab="home"]');
          if(homeTab){ homeTab.classList.add('active'); homePane.style.display=''; awayPane.style.display='none'; specialsPane.style.display='none'; statsPane.style.display='none'; }
        }
      }
  else if(key==='stats'){ homePane.style.display='none'; awayPane.style.display='none'; specialsPane.style.display='none'; statsPane.style.display=''; if(streamPane) {streamPane.style.display='none';} try { if(window.MatchStats?.render) {window.MatchStats.render(statsPane, match);} } catch(e){ console.error('stats render err', e); } }
    }; });
  // Removed legacy subtabs stream delegation (handled above with MatchStream)
  try { const adminId=document.body.getAttribute('data-admin'); const currentId=window.Telegram?.WebApp?.initDataUnsafe?.user?.id?String(window.Telegram.WebApp.initDataUnsafe.user.id):''; const isAdmin=!!(adminId && currentId && String(adminId)===currentId); const topbar=mdPane.querySelector('.match-details-topbar'); if(isAdmin && topbar){ const prev=topbar.querySelector('#md-finish-btn'); if(prev) {prev.remove();} if(mdPane.__finishBtnTimer){ try { clearInterval(mdPane.__finishBtnTimer); } catch(_){} mdPane.__finishBtnTimer=null; } const btn=document.createElement('button'); btn.id='md-finish-btn'; btn.className='details-btn'; btn.textContent='Завершить матч'; btn.style.marginLeft='auto'; const finStore=(window.__FINISHED_MATCHES=window.__FINISHED_MATCHES||{}); const mkKey2=(m)=>{ try { const dateStr=(m?.datetime||m?.date||'').toString().slice(0,10); return `${(m.home||'').toLowerCase().trim()}__${(m.away||'').toLowerCase().trim()}__${dateStr}`; } catch(_) { return `${(m.home||'').toLowerCase().trim()}__${(m.away||'').toLowerCase().trim()}__`; } }; const mKey=mkKey2(match); const isLiveNow=(mm)=>(window.MatchUtils?window.MatchUtils.isLiveNow(mm):false);
    // Новый флаг live со стороны сервера (исправляет расхождения TZ)
    let serverLive = false;
    const refreshServerStatus = async () => {
      try {
        const url = `/api/match/status/get?home=${encodeURIComponent(match.home||'')}&away=${encodeURIComponent(match.away||'')}&date=${encodeURIComponent(((match?.datetime||match?.date||'').toString().slice(0,10))||'')}`;
        const r = await fetch(url, { cache: 'no-store' });
        const d = await r.json().catch(()=>({}));
        if (d && (d.status === 'live')) {serverLive = true;} else if (d && (d.status === 'finished')) {serverLive = false;}
      } catch(_) {}
    };
    // Первичная загрузка и периодическое обновление
    refreshServerStatus();
    if (mdPane.__finishBtnSrvTimer) { try { clearInterval(mdPane.__finishBtnSrvTimer); } catch(_){} }
    mdPane.__finishBtnSrvTimer = setInterval(refreshServerStatus, 60000);
    const applyVisibility=()=>{ const show = (!finStore[mKey]) && (isLiveNow(match) || serverLive); btn.style.display = show ? '' : 'none'; };
    applyVisibility(); mdPane.__finishBtnTimer=setInterval(applyVisibility,30000);
    const confirmFinish=()=>new Promise(resolve=>{ let ov=document.querySelector('.modal-overlay'); if(!ov){ ov=document.createElement('div'); ov.className='modal-overlay'; ov.style.position='fixed'; ov.style.inset='0'; ov.style.background='rgba(0,0,0,0.6)'; ov.style.zIndex='9999'; ov.style.display='flex'; ov.style.alignItems='center'; ov.style.justifyContent='center'; const box=document.createElement('div'); box.className='modal-box'; box.style.background='rgba(20,24,34,0.98)'; box.style.border='1px solid rgba(255,255,255,0.12)'; box.style.borderRadius='14px'; box.style.width='min(92vw,420px)'; box.style.padding='14px'; box.innerHTML='<div style="font-weight:700; font-size:16px; margin-bottom:8px;">Завершить матч?</div><div style="opacity:.9; font-size:13px; line-height:1.35; margin-bottom:12px;">Счёт будет записан, ставки рассчитаны. Продолжить?</div><div style="display:flex; gap:8px; justify-content:flex-end;"><button class="app-btn neutral" id="mf-cancel">Отмена</button><button class="app-btn danger" id="mf-ok">Завершить</button></div>'; ov.appendChild(box); document.body.appendChild(ov); box.querySelector('#mf-cancel').onclick=()=>{ ov.remove(); resolve(false); }; box.querySelector('#mf-ok').onclick=()=>{ ov.remove(); resolve(true); }; } else { resolve(false); } });         const fullRefresh=async()=>{ 
            try { 
                const tg=window.Telegram?.WebApp||null; 
                const fd=new FormData(); 
                fd.append('initData', tg?.initData||''); 
                await Promise.allSettled([ 
                    fetch('/api/league-table/refresh',{ method:'POST', body:fd }), 
                    // stats-table refresh deprecated
                    fetch('/api/schedule/refresh',{ method:'POST', body:fd }), 
                    fetch('/api/results/refresh',{ method:'POST', body:fd }) 
                ]); 
                
                // Принудительно обновляем кэш results и schedule
                try {
                    const resultsUrl = `/api/results?_=${Date.now()}`;
                    const data = await fetch(resultsUrl).then(r => r.json());
                    localStorage.setItem('results', JSON.stringify({data, ts: Date.now()}));
                } catch(_){}
                
                try {
                    const scheduleUrl = `/api/schedule?_=${Date.now()}`;
                    const data = await fetch(scheduleUrl).then(r => r.json());
                    localStorage.setItem('schedule:tours', JSON.stringify({data, ts: Date.now()}));
                } catch(_){}
                
                try { window.loadLeagueTable?.(); } catch(_){} 
                try { window.loadResults?.(); } catch(_){} 
                try { window.loadSchedule?.(); } catch(_){} 
            } catch(_){} 
        }; btn.addEventListener('click', async()=>{ const ok=await confirmFinish(); if(!ok) {return;} const tg=window.Telegram?.WebApp||null; btn.disabled=true; const old=btn.textContent; btn.textContent='Завершаю...'; try { const fd=new FormData(); fd.append('initData', tg?.initData||''); fd.append('home', match.home||''); fd.append('away', match.away||''); const r=await fetch('/api/match/settle',{ method:'POST', body:fd }); const d=await r.json().catch(()=>({})); if(!r.ok || d?.error) {throw new Error(d?.error||'Ошибка завершения');} try { window.showAlert?.('Матч завершён','success'); } catch(_){} try { if(d && d.total_bets!==undefined){ const msg=`Ставки: всего ${d.total_bets}, открытых до расчёта ${d.open_before}, изменено ${d.changed||0}, выиграло ${d.won||0}, проиграло ${d.lost||0}`; window.showAlert?.(msg,'info'); } } catch(_){} try { const dateStr=(match?.datetime||match?.date||'').toString().slice(0,10); const key=`stream:${(match.home||'').toLowerCase().trim()}__${(match.away||'').toLowerCase().trim()}__${dateStr}`; localStorage.removeItem(key); const sp=document.getElementById('md-pane-stream'); if(sp){ sp.style.display='none'; sp.innerHTML='<div class=\"stream-wrap\"><div class=\"stream-skeleton\">Трансляция недоступна</div></div>'; } } catch(_){} try { finStore[mKey]=true; } catch(_){} await fullRefresh(); try { btn.style.display='none'; const statusEl=mdPane.querySelector('.match-details-topbar .status-text'); if(statusEl) {statusEl.textContent='Матч завершен';} } catch(_){} } catch(e){ console.error('finish match error', e); try { window.showAlert?.(e?.message||'Ошибка','error'); } catch(_){} } finally { btn.disabled=false; btn.textContent=old; } }); topbar.appendChild(btn); } } catch(_){}
  // finish button delegated
  let adminCtx=null; try { if(window.MatchAdmin?.setup){ adminCtx=window.MatchAdmin.setup(match,{ mdPane }); } } catch(_){}
  const back=document.getElementById('match-back'); if(back) {back.onclick=()=>{ try { if(__topic && window.__WS_TOPIC_SUBS__ && window.realtimeUpdater) {window.realtimeUpdater.unsubscribeTopic(__topic);} } catch(_){} try { if(mdPane.__onDetailsUpdate) {document.removeEventListener('matchDetailsUpdate', mdPane.__onDetailsUpdate);} } catch(_){} try { if(mdPane.__detailsPollCancel) {mdPane.__detailsPollCancel();} } catch(_){} try { const statsHost=document.getElementById('md-pane-stats'); if(statsHost && statsHost.__statsPollCancel) {statsHost.__statsPollCancel();} } catch(_){} homePane.innerHTML=''; awayPane.innerHTML=''; try { if(adminCtx) {adminCtx.cleanup();} } catch(_){} try { if(liveScoreCtx) {liveScoreCtx.cleanup();} } catch(_){} try { if(window.Streams?.resetOnLeave) {window.Streams.resetOnLeave(mdPane);} } catch(_){} try { const spLeak=document.getElementById('md-pane-stream'); if(spLeak) {spLeak.classList.remove('fs-mode');} } catch(_){} try { document.body.classList.remove('allow-landscape'); } catch(_){} mdPane.style.display='none'; schedulePane.style.display=''; window.scrollTo({ top:0, behavior:'smooth' }); try { document.getElementById('ufo-subtabs').style.display=''; } catch(_){} };}
  }
  window.MatchAdvanced = { openMatchScreen };
  try { window.openMatchScreen = openMatchScreen; } catch(_) {}
})();
