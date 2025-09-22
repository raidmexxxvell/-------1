// Live status badge + score polling & admin inline score controls (without finish)
(function(){
  function setup(match, refs){
    const scoreEl = refs.scoreEl; const dtEl = refs.dtEl; const mdPane=refs.mdPane; if(!scoreEl||!dtEl||!mdPane) {return {};}
    
    // STATE: центральное состояние с сигнатурой как в статистике
    const state = { 
      etag: null, 
      sig: null, // сигнатура счета для защиты от дубликатов  
      timer: null, 
      busy: false, 
      cancelled: false,
      noFetchUntil: 0, // временная блокировка fetch после админ-действий
      lastAdminAction: 0, // timestamp последнего админ-действия
      // КРИТИЧНО: Сохраняем актуальный счет в state для инкрементов (принцип статистики)
      currentScore: { home: 0, away: 0 }
    };
    
    let scorePoll=null; let pollWatch=null; let adminScoreCtrlsAdded=false;
    const isAdmin = (()=>{ try { const adminId=document.body.getAttribute('data-admin'); const currentId=window.Telegram?.WebApp?.initDataUnsafe?.user?.id?String(window.Telegram.WebApp.initDataUnsafe.user.id):''; return !!(adminId && currentId && String(adminId)===currentId); } catch(_) { return false; } })();
    
    // Генерация сигнатуры счета (как в статистике)
    const generateScoreSig = (sh, sa) => {
      try {
        return `${Number(sh)||0}:${Number(sa)||0}`;
      } catch(_) {
        return '0:0';
      }
    };
    
    // КРИТИЧНО: Инициализируем currentScore из DOM при загрузке
    const initCurrentScore = () => {
      try {
        const currentText = scoreEl.textContent || '';
        const match = currentText.match(/(\d+)\s*:\s*(\d+)/);
        if (match) {
          state.currentScore.home = parseInt(match[1], 10) || 0;
          state.currentScore.away = parseInt(match[2], 10) || 0;
          console.log('[LiveScore] Инициализирован счет из DOM:', state.currentScore.home, ':', state.currentScore.away);
        }
      } catch(e) {
        console.warn('[LiveScore] Ошибка инициализации счета:', e);
      }
    };
    
    // Инициализируем счет при загрузке
    initCurrentScore();
    
    const applyScore=(sh,sa)=>{ 
      try { 
        if(sh==null || sa==null) {return false;}
        const newSig = generateScoreSig(sh, sa);
        
        // КРИТИЧНО: Проверяем сигнатуру - если счет не изменился, пропускаем
        if (state.sig && newSig === state.sig) {
          console.log('[LiveScore] Пропускаем обновление - сигнатура не изменилась:', newSig);
          return false;
        }
        
        const newScoreText = `${Number(sh)} : ${Number(sa)}`;
        console.log('[LiveScore] Применяем счет:', newScoreText, 'сигнатура:', newSig);
        
        scoreEl.textContent = newScoreText;
        state.sig = newSig;
        
        // КРИТИЧНО: Сохраняем актуальный счет в state для инкрементов
        state.currentScore.home = Number(sh) || 0;
        state.currentScore.away = Number(sa) || 0;
        
        return true;
      } catch(_){
        return false;
      }
    };
    
    const fetchScore=async()=>{ 
      try { 
        // Защита: не перетирать админское обновление (как в статистике - больший период)
        if (Date.now() < state.noFetchUntil) { 
          console.log('[LiveScore] Пропускаем fetch - защита от админ-конфликта');
          return; 
        }
        
        // Проверяем не слишком ли частые админ-действия
        const timeSinceAdmin = Date.now() - state.lastAdminAction;
        if (timeSinceAdmin < 10000) { // 10 секунд защита вместо 6
          console.log('[LiveScore] Пропускаем fetch - недавнее админ-действие');
          return;
        }
        
        const url = `/api/match/score/get?home=${encodeURIComponent(match.home||'')}&away=${encodeURIComponent(match.away||'')}`;
        
        // Используем ETag как в статистике
        const headers = state.etag ? { 'If-None-Match': state.etag } : {};
        const r = await fetch(url, { headers }); 
        
        if (r.status === 304) {
          console.log('[LiveScore] 304 Not Modified - счет не изменился');
          return;
        }
        
        const d = await r.json(); 
        const newEtag = r.headers.get('ETag');
        
        if (typeof d?.score_home==='number' && typeof d?.score_away==='number') {
          const applied = applyScore(d.score_home, d.score_away);
          if (applied) {
            state.etag = newEtag;
            console.log('[LiveScore] Счет обновлен из API:', d.score_home, ':', d.score_away);
          }
        }
      } catch(e) {
        console.warn('[LiveScore] Ошибка fetchScore:', e);
      }
    };
    const ensureAdminCtrls=()=>{ try { if(adminScoreCtrlsAdded) {return;} const adminId=document.body.getAttribute('data-admin'); const currentId=window.Telegram?.WebApp?.initDataUnsafe?.user?.id?String(window.Telegram.WebApp.initDataUnsafe.user.id):''; const isAdmin=!!(adminId && currentId && String(adminId)===currentId); if(!isAdmin) {return;} if(mdPane.querySelector('.admin-score-ctrls')){ adminScoreCtrlsAdded=true; return; }
        const mkBtn=(t)=>{ const b=document.createElement('button'); b.className='details-btn'; b.textContent=t; b.style.padding='2px 8px'; b.style.minWidth='unset'; return b; };
        const row=document.createElement('div'); row.className='admin-score-ctrls'; row.style.marginTop='6px'; row.style.display='flex'; row.style.gap='10px'; row.style.alignItems='center'; row.style.justifyContent='center';
        const left=document.createElement('div'); left.style.display='flex'; left.style.gap='6px';
        const right=document.createElement('div'); right.style.display='flex'; right.style.gap='6px';
        const hMinus=mkBtn('−'); const hPlus=mkBtn('+'); const aMinus=mkBtn('−'); const aPlus=mkBtn('+');
        left.append(hMinus,hPlus); right.append(aMinus,aPlus);
        const center=scoreEl.parentElement || dtEl.parentElement || mdPane.querySelector('.match-modal-header .center');
        const spacer=document.createElement('div'); spacer.style.width='8px';
        row.append(left, spacer, right);
        try { center.appendChild(row); } catch(_){}
        const tg=window.Telegram?.WebApp||null;
        
        // КРИТИЧНО: Заменяем parseScore() на state-based подход (принцип статистики)
        const getCurrentScore = () => {
          return [state.currentScore.home, state.currentScore.away];
        };
        
        const postScore=async(sh,sa)=>{ 
          try { 
            console.log('[LiveScore] Отправляем новый счет:', sh, ':', sa);
            
            const fd=new FormData(); 
            fd.append('initData', tg?.initData||''); 
            fd.append('home',match.home||''); 
            fd.append('away',match.away||''); 
            fd.append('score_home', String(Math.max(0,sh))); 
            fd.append('score_away', String(Math.max(0,sa))); 
            
            const r=await fetch('/api/match/score/set',{ method:'POST', body:fd }); 
            const d=await r.json().catch(()=>({})); 
            
            if(!r.ok || d?.error) {
              throw new Error(d?.error||'Ошибка сохранения');
            } 
            
            // КРИТИЧНО: Локально применяем счёт ТОЛЬКО если сервер подтвердил
            if (typeof d.score_home === 'number' && typeof d.score_away === 'number') {
              const applied = applyScore(d.score_home, d.score_away);
              if (applied) {
                console.log('[LiveScore] Счет подтвержден сервером и применен:', d.score_home, ':', d.score_away);
                
                // Обновляем timestamps для защиты
                state.lastAdminAction = Date.now();
                state.noFetchUntil = Date.now() + 15000; // 15 секунд защита вместо 6
                
                // Маркируем админское изменение
                try { 
                  const host=document.getElementById('ufo-match-details'); 
                  if(host){ 
                    host.setAttribute('data-admin-last-change-ts', String(Date.now())); 
                  } 
                } catch(_){}
                
                // Уведомляем другие компоненты через WebSocket-совместимое событие
                try {
                  const event = new CustomEvent('scoreUpdatedByAdmin', {
                    detail: {
                      home: match.home,
                      away: match.away,
                      score_home: d.score_home,
                      score_away: d.score_away,
                      timestamp: Date.now(),
                      source: 'admin'
                    }
                  });
                  document.dispatchEvent(event);
                } catch(_) {}
              }
            } else {
              console.warn('[LiveScore] Сервер не вернул корректный счет:', d);
            }
          } catch(e){ 
            console.error('[LiveScore] Ошибка postScore:', e);
            window.showAlert?.(e?.message||'Не удалось сохранить счёт','error'); 
          } 
        };
        hMinus.addEventListener('click',()=>{ const [h,a]=getCurrentScore(); postScore(Math.max(0,h-1),a); });
        hPlus.addEventListener('click',()=>{ const [h,a]=getCurrentScore(); postScore(h+1,a); });
        aMinus.addEventListener('click',()=>{ const [h,a]=getCurrentScore(); postScore(h,Math.max(0,a-1)); });
        aPlus.addEventListener('click',()=>{ const [h,a]=getCurrentScore(); postScore(h,a+1); });
        adminScoreCtrlsAdded=true;
      } catch(_){} 
    };

    // WebSocket listener для мгновенного обновления счета (как в статистике)
    let wsScoreRefreshHandler = null;
    
    // Создаем обработчик WebSocket событий
    wsScoreRefreshHandler = (e) => {
      try {
        const { home, away, score_home, score_away, source } = e.detail || {};
        if (!home || !away) { return; }
        
        // Защита: только для нашего матча
        if (String(home) !== (match.home || '') || String(away) !== (match.away || '')) { 
          return; 
        }
        
        console.log('[LiveScore] Получено WebSocket обновление счета:', score_home, ':', score_away, 'источник:', source);
        
        // Если это административное изменение - защита от конфликтов
        if (source === 'admin') {
          state.lastAdminAction = Date.now();
          state.noFetchUntil = Date.now() + 12000; // 12 секунд защита
        }
        
        // Применяем счет с проверкой сигнатуры
        if (typeof score_home === 'number' && typeof score_away === 'number') {
          const applied = applyScore(score_home, score_away);
          if (applied) {
            console.log('[LiveScore] Счет обновлен через WebSocket');
          }
        }
      } catch(err) {
        console.error('[LiveScore] Ошибка обработки WebSocket события:', err);
      }
    };
    
    // Слушаем разные типы событий обновления счета
    document.addEventListener('scoreUpdatedByAdmin', wsScoreRefreshHandler);
    document.addEventListener('matchScoreUpdate', wsScoreRefreshHandler); // общее событие
    document.addEventListener('ws:score_update', wsScoreRefreshHandler); // из WebSocket
    
    // Cleanup при отмене
    const originalCancel = mdPane.__scoreSetupCancel || (() => {});
    mdPane.__scoreSetupCancel = () => {
      state.cancelled = true;
      try { if (state.timer) { clearTimeout(state.timer); } } catch(_) {}
      try { if (scorePoll) { clearInterval(scorePoll); } } catch(_) {}
      try { if (pollWatch) { clearInterval(pollWatch); } } catch(_) {}
      try { 
        if (wsScoreRefreshHandler) {
          document.removeEventListener('scoreUpdatedByAdmin', wsScoreRefreshHandler);
          document.removeEventListener('matchScoreUpdate', wsScoreRefreshHandler);
          document.removeEventListener('ws:score_update', wsScoreRefreshHandler);
        }
      } catch(_) {}
      originalCancel();
    };

    // Вычисляем WS-топик деталей матча, как в profile-match-advanced.js
    const __wsTopic = (()=>{ 
      try { 
        const h=(match?.home||'').toLowerCase().trim(); 
        const a=(match?.away||'').toLowerCase().trim(); 
        const raw=(match?.date?String(match.date):(match?.datetime?String(match.datetime):'')); 
        const d=raw?raw.slice(0,10):''; 
        return `match:${h}__${a}__${d}:details`; 
      } catch(_) { 
        return null; 
      } 
    })();
    
    const isWsActive = ()=>{
      try {
        if(!window.__WEBSOCKETS_ENABLED__) {return false;}
        if(!__wsTopic) {return false;}
        const ru = window.realtimeUpdater;
        return !!(ru && typeof ru.getTopicEnabled==='function' && ru.getTopicEnabled() && typeof ru.hasTopic==='function' && ru.hasTopic(__wsTopic));
      } catch(_) { return false; }
    };

    fetch(`/api/match/status/get?home=${encodeURIComponent(match.home||'')}&away=${encodeURIComponent(match.away||'')}&date=${encodeURIComponent((match?.datetime||match?.date||'').toString().slice(0,10))}`)
      .then(r=>r.json())
      .then(async s=>{
        const localLive = (()=>{ try { return window.MatchUtils?.isLiveNow ? window.MatchUtils.isLiveNow(match) : false; } catch(_) { return false; } })();
        const serverLive = (s?.status==='live');
        const finished = (s?.status==='finished');
        // Админу позволяем работать, если локально матч идёт, даже если сервер ошибочно вернул finished
        if (serverLive || (isAdmin && localLive)) {
          // Вставим бейдж live в UI
          try { const exists = dtEl.querySelector('.live-badge'); if(!exists){ const live=document.createElement('span'); live.className='live-badge'; const dot=document.createElement('span'); dot.className='live-dot'; const lbl=document.createElement('span'); lbl.textContent='Матч идет'; live.append(dot,lbl); dtEl.appendChild(live); } } catch(_){}
          // Если счёта нет — показываем 0:0
          try { if(scoreEl.textContent.trim()==='— : —') {scoreEl.textContent='0 : 0';} } catch(_){}
          // Админ: если сервер не live, но локально live — мягко выставим live (инициализируем счёт)
          if (isAdmin && !serverLive && localLive) {
            try {
              const r0 = await fetch(`/api/match/score/get?home=${encodeURIComponent(match.home||'')}&away=${encodeURIComponent(match.away||'')}`);
              const d0 = await r0.json().catch(()=>({}));
              if (d0?.score_home==null && d0?.score_away==null) {
                const tg=window.Telegram?.WebApp||null; const fd0=new FormData();
                fd0.append('initData', tg?.initData||''); fd0.append('home', match.home||''); fd0.append('away', match.away||'');
                await fetch('/api/match/status/set-live',{ method:'POST', body:fd0 }).catch(()=>{});
              }
            } catch(_){}
          }
          // Polling логика как в статистике - отключается при активных WebSocket
          const schedule = () => { 
            if (state.cancelled) { return; }
            if (isWsActive()) { 
              console.log('[LiveScore] WebSocket активен - polling отключен');
              return; 
            }
            const base = 15000; // 15 секунд базовый интервал
            const jitter = 5000; // 5 секунд джиттер
            const delay = base + Math.floor(Math.random() * jitter);
            state.timer = setTimeout(scorePollingLoop, delay);
          };
          
          const scorePollingLoop = async () => {
            if (state.cancelled) { return; }
            if (document.hidden) { schedule(); return; }
            if (state.busy) { schedule(); return; }
            if (isWsActive()) { 
              console.log('[LiveScore] WebSocket активен во время polling - пропускаем');
              schedule(); 
              return; 
            }
            
            state.busy = true;
            try {
              await fetchScore();
            } finally {
              state.busy = false;
              schedule();
            }
          };
          
          // Мониторинг состояния WebSocket как в статистике
          const syncPolling = () => {
            try {
              const needPoll = !isWsActive();
              console.log('[LiveScore] Проверка polling:', needPoll ? 'включен' : 'выключен');
              
              if (needPoll) {
                if (!state.timer) { 
                  console.log('[LiveScore] Запускаем polling');
                  fetchScore(); // первичная загрузка
                  schedule(); 
                }
              } else {
                if (state.timer) { 
                  console.log('[LiveScore] Останавливаем polling - WebSocket активен');
                  clearTimeout(state.timer); 
                  state.timer = null; 
                }
              }
            } catch(e) {
              console.error('[LiveScore] Ошибка syncPolling:', e);
            }
          };
          
          // Первичный запуск
          syncPolling();
          
          // Периодическая проверка состояния WebSocket (как в статистике)
          pollWatch = setInterval(syncPolling, 5000);
          
          ensureAdminCtrls();
        }
      }).catch(()=>{});
    return { cleanup(){ try { if(state.timer) {clearTimeout(state.timer);} } catch(_){} try { if(pollWatch) {clearInterval(pollWatch);} } catch(_){} try { mdPane.querySelectorAll('.admin-score-ctrls').forEach(n=>n.remove()); } catch(_){} } };
  }
  window.MatchLiveScore = { setup };
})();
