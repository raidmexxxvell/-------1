// static/js/predictions.js
(function(){
  document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram?.WebApp || null;
    const wrap = document.getElementById('tab-predictions');
    if (!wrap) {return;}

    const toursEl = document.getElementById('pred-tours');
    const myBetsEl = document.getElementById('my-bets');

    // --- STORE ADAPTERS: Odds/Predictions (no-op if TS store not compiled) ---
    function flattenAndUpdateOddsStoreForMatch(matchId, m, versionHint) {
      try {
        if (!window.OddsStore || !window.OddsStore.update) {return;}
        const now = Date.now();
        const v = (versionHint != null ? Number(versionHint) : (m?.odds_version != null ? Number(m.odds_version) : 0)) || 0;
        const apply = (key, val) => {
          if (val == null || Number.isNaN(Number(val))) {return;}
          window.OddsStore.update(s => {
            if (!s.map) {s.map = {};}
            s.map[key] = { value: Number(val), version: v, lastUpdated: now };
          });
        };
        // 1x2
        if (m && m.odds) {
          if (m.odds.home != null) {apply(`${matchId}|1x2|home`, m.odds.home);}
          if (m.odds.draw != null) {apply(`${matchId}|1x2|draw`, m.odds.draw);}
          if (m.odds.away != null) {apply(`${matchId}|1x2|away`, m.odds.away);}
        }
        // Totals
        const totals = m?.markets?.totals;
        if (Array.isArray(totals)) {
          totals.forEach(row => {
            const line = (row && (row.line != null)) ? String(row.line) : null;
            if (!line) {return;}
            const over = row?.odds?.over; const under = row?.odds?.under;
            if (over != null) {apply(`${matchId}|totals|over|${line}`, over);}
            if (under != null) {apply(`${matchId}|totals|under|${line}`, under);}
          });
        }
        // Specials
        const sp = m?.markets?.specials;
        if (sp && sp.penalty && sp.penalty.odds) {
          const o = sp.penalty.odds; if (o.yes != null) {apply(`${matchId}|penalty|yes`, o.yes);} if (o.no != null) {apply(`${matchId}|penalty|no`, o.no);}
        }
        if (sp && sp.redcard && sp.redcard.odds) {
          const o = sp.redcard.odds; if (o.yes != null) {apply(`${matchId}|redcard|yes`, o.yes);} if (o.no != null) {apply(`${matchId}|redcard|no`, o.no);}
        }
      } catch(_) {}
    }
    function updateStoresFromTours(store) {
      try {
        const ds = store?.data || store || {};
        const tours = Array.isArray(ds.tours) ? ds.tours : [];
        const version = store?.version || ds?.version || null;
        if (!tours.length) {return;}
        const items = [];
        tours.forEach(t => (t.matches||[]).forEach(m => {
          const d = (m.date || m.datetime || '').slice(0,10);
          const matchId = `${m.home}_${m.away}_${d}`;
          // Odds store
          flattenAndUpdateOddsStoreForMatch(matchId, m, version);
          // Predictions list (light descriptor)
          const has12 = !!(m?.odds && (m.odds.home!=null || m.odds.draw!=null || m.odds.away!=null));
          const totals = Array.isArray(m?.markets?.totals) ? m.markets.totals.map(r=>r?.line).filter(l=>l!=null) : [];
          const specials = m?.markets?.specials ? Object.keys(m.markets.specials) : [];
          items.push({ id: matchId, matchId, market: 'available', options: [ has12?'1x2':null, totals.length?`totals(${totals.length})`:null, specials.length?`specials(${specials.length})`:null ].filter(Boolean) });
        }));
        if (window.PredictionsStore && window.PredictionsStore.set) {
          window.PredictionsStore.set({ items });
        }
      } catch(_) {}
    }

    // Вынесено в общий скоуп: вспомогательные функции, используемые и рендером, и глобальным обработчиком событий
    function setTextAnimated(btn, newText) {
      if (!btn || btn.textContent === newText) {return;}
      btn.textContent = newText;
      btn.classList.add('updated');
      setTimeout(() => btn.classList.remove('updated'), 500);
    }

    function updateCardOddsUI(card, odds, markets) {
      try {
        // 1) Основной рынок 1x2
        const buttons12 = card.querySelectorAll('.bet-btn[data-bet-key]');
        buttons12.forEach(btn => {
          const key = btn.dataset.betKey;
          const label = { home: 'П1', draw: 'Х', away: 'П2' }[key];
          if (label && odds && odds[key] != null) {
            setTextAnimated(btn, `${label} (${Number(odds[key]).toFixed(2)})`);
          }
        });
        // 2) Тоталы
        if (markets && Array.isArray(markets.totals)) {
          markets.totals.forEach(row => {
            try {
              const line = String(row.line);
              const over = Number(row.odds?.over);
              const under = Number(row.odds?.under);
              const overBtn = card.querySelector(`.bet-btn[data-market="totals"][data-side="over"][data-line="${line}"]`);
              const underBtn = card.querySelector(`.bet-btn[data-market="totals"][data-side="under"][data-line="${line}"]`);
              if (overBtn && !Number.isNaN(over)) {
                setTextAnimated(overBtn, `Больше (${over.toFixed(2)})`);
              }
              if (underBtn && !Number.isNaN(under)) {
                setTextAnimated(underBtn, `Меньше (${under.toFixed(2)})`);
              }
            } catch(_){}
          });

          // Обновляет коэффициенты и рынки на уже отрендеренных карточках на основе ответа /api/betting/tours
          function updateOddsUIFromStore(store) {
            try {
              const tours = store?.data?.tours || store?.tours || [];
              if (!Array.isArray(tours) || tours.length === 0) {return;}
              const map = new Map();
              tours.forEach(t => (t.matches||[]).forEach(m => {
                const matchDate = (m.date || m.datetime || '').slice(0,10);
                const id = `${m.home}_${m.away}_${matchDate}`;
                map.set(id, { odds: (m.odds||{}), markets: (m.markets||{}) });
              }));
              const cards = toursEl.querySelectorAll('.pred-tours-container .match-card[data-match-id]');
              cards.forEach(card => {
                const id = card.getAttribute('data-match-id');
                const entry = map.get(id);
                if (!entry) {return;}
                updateCardOddsUI(card, entry.odds || {}, entry.markets || {});
              });
            } catch(_) {}
          }
        }
        // 3) Спецрынки
        if (markets && markets.specials) {
          const sp = markets.specials;
          const updYN = (mk) => {
            const o = sp[mk]?.odds || null;
            if (!o) {return;}
            const yesBtn = card.querySelector(`.bet-btn[data-market="${mk}"][data-side="yes"]`);
            const noBtn = card.querySelector(`.bet-btn[data-market="${mk}"][data-side="no"]`);
            if (yesBtn && o.yes != null) {
              setTextAnimated(yesBtn, `Да (${Number(o.yes).toFixed(2)})`);
            }
            if (noBtn && o.no != null) {
              setTextAnimated(noBtn, `Нет (${Number(o.no).toFixed(2)})`);
            }
          };
          updYN('penalty');
          updYN('redcard');
        }
      } catch(_){}
    }

    // Подвкладки раздела
    const pTabs = document.querySelectorAll('#pred-subtabs .subtab-item');
    const pMap = {
      place: document.getElementById('pred-pane-place'),
      mybets: document.getElementById('pred-pane-mybets')
    };
    pTabs.forEach(btn => {
      btn.setAttribute('data-throttle','600');
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-ptab');
        pTabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Object.values(pMap).forEach(el => { if(el) {el.style.display='none';} });
        if (pMap[key]) {
          pMap[key].style.display = '';
          if (key === 'place') {loadTours();}
          if (key === 'mybets') { try { if (wrap.__oddsPollCancel) {wrap.__oddsPollCancel();} } catch(_){} loadMyBets(); }
        }
      });
    });

  let _toursLoading = false;
  function loadTours() {
      if (!toursEl || _toursLoading) {return;}
      _toursLoading = true;

      // --- НОВЫЙ КОД: Подписка на WebSocket (с очередью тем, если realtimeUpdater ещё не готов) ---
      const enqueueTopic = (topic) => {
        try {
          if (!topic) {return;}
          if (window.realtimeUpdater && typeof window.realtimeUpdater.subscribeTopic === 'function') {
            window.realtimeUpdater.subscribeTopic(topic);
          } else {
            window.__PENDING_WS_TOPICS__ = window.__PENDING_WS_TOPICS__ || new Set();
            try { window.__PENDING_WS_TOPICS__.add(topic); } catch(_) {}
          }
        } catch(_) {}
      };
      try { enqueueTopic('predictions_page'); } catch(_) {}
      // --- КОНЕЦ НОВОГО КОДА ---

      const CACHE_KEY = 'betting:tours';
      const FRESH_TTL = 5 * 60 * 1000; // 5 минут
      const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch(_) { return null; } };
      const writeCache = (obj) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch(_) {} };
      const hasAnyOddsMarkets = (store) => {
        try {
          const tours = store?.data?.tours || store?.tours || [];
          if (!Array.isArray(tours)) {return false;}
          let hasOdds = false, hasMarkets = false;
          tours.forEach(t => (t.matches||[]).forEach(m => {
            if (m?.odds && Object.keys(m.odds).length) {hasOdds = true;}
            if (m?.markets && (Array.isArray(m.markets.totals) && m.markets.totals.length || m.markets.specials)) {hasMarkets = true;}
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
          if (!oldStore) {return newStore;}
          const oldMap = indexMatches(oldStore);
          const ns = JSON.parse(JSON.stringify(newStore));
          const tours = ns?.data?.tours || ns?.tours || [];
          tours.forEach(t => (t.matches||[]).forEach(m => {
            try {
              const d = (m.date || m.datetime || '').slice(0,10);
              const key = `${m.home}_${m.away}_${d}`;
              const prev = oldMap.get(key);
              if (!prev) {return;}
              // Если в новом нет odds/markets — подмешиваем из старого
              if (!m.odds && prev.odds) {m.odds = prev.odds;}
              if (!m.markets && prev.markets) {m.markets = prev.markets;}
              // Если есть, но пусто — тоже дополним
              if (m.odds && prev.odds && Object.keys(m.odds).length === 0) {m.odds = prev.odds;}
              if (m.markets && prev.markets) {
                const mt = m.markets.totals; const pm = prev.markets;
                if (!(Array.isArray(mt) && mt.length) && Array.isArray(pm.totals) && pm.totals.length) {
                  m.markets.totals = pm.totals;
                }
                if (!m.markets.specials && pm.specials) {m.markets.specials = pm.specials;}
              }
            } catch(_) {}
          }));
          return ns;
        } catch(_) { return newStore; }
      };

      // --- DRY helpers вынесены выше ---

      const renderTours = (data) => {
        const ds = data?.tours ? data : (data?.data || {});
        const tours = ds.tours || [];
        if (!tours.length) {
          // если у нас уже есть контент — не затираем его пустым ответом
          if (toursEl.childElementCount > 0 || toursEl.dataset.hasContent === '1') { return; }
          toursEl.innerHTML = '<div class="schedule-empty">Матчи скоро появяться</div>';
          return;
        }
        const container = document.createElement('div');
        container.className = 'pred-tours-container';
        let visibleMatchesTotal = 0;
        tours.forEach(t => {
          const tourEl = document.createElement('div'); tourEl.className = 'tour-block';
          const title = document.createElement('div'); title.className = 'tour-title'; title.textContent = t.title || `Тур ${t.tour||''}`; tourEl.appendChild(title);
          const tourMatches = (t.matches||[]).filter(m => !m.lock);
          tourMatches.forEach(m => {
            const card = document.createElement('div'); card.className = 'match-card';
            
            // --- НОВЫЙ КОД: Уникальный ID и подписка на комнату матча ---
            const matchDate = (m.date || m.datetime || '').slice(0, 10);
            const matchId = `${m.home}_${m.away}_${matchDate}`;
            card.dataset.matchId = matchId;
            try { enqueueTopic(`match_odds_${matchId}`); } catch(_) {}
            // --- КОНЕЦ НОВОГО КОДА ---

            try { card.dataset.home = m.home || ''; card.dataset.away = m.away || ''; } catch(_) {}
            const header = document.createElement('div'); header.className = 'match-header';
            const dtText = formatDateTime(m.date, m.time);
            const span = document.createElement('span'); span.textContent = dtText; header.appendChild(span);
            // LIVE badge (не показываем если матч помечен завершённым локально)
            const finStore = (window.__FINISHED_MATCHES = window.__FINISHED_MATCHES || {});
            const mkKey = (mm)=>{ try { return `${(mm.home||'').toLowerCase().trim()}__${(mm.away||'').toLowerCase().trim()}__${(mm.date||mm.datetime||'').toString().slice(0,10)}`; } catch(_) { return `${(mm.home||'')}__${(mm.away||'')}`; } };
            if (isLiveNow(m) && !finStore[mkKey(m)]) {
              const live = document.createElement('span'); live.className = 'live-badge';
              const dot = document.createElement('span'); dot.className = 'live-dot';
              const lbl = document.createElement('span'); lbl.textContent = 'Матч идет';
              live.append(dot, lbl); header.appendChild(live);
            }
            card.appendChild(header);
            const center = document.createElement('div'); center.className = 'match-center';
            const home = mkTeam(m.home); const score = document.createElement('div'); score.className='score'; score.textContent = 'VS'; const away = mkTeam(m.away);
            center.append(home, score, away); card.appendChild(center);
            const line = document.createElement('div'); line.className = 'betting-line';
            const opts = mkOptions(t.tour, m, !!m.lock);
            line.appendChild(opts);
            card.appendChild(line);

            // Кнопка «Больше прогнозов» и скрытая панель с доп.рынками (тоталы)
            const moreWrap = document.createElement('div'); moreWrap.style.marginTop = '8px'; moreWrap.style.textAlign = 'center';
            const moreBtn = document.createElement('button'); moreBtn.className = 'details-btn'; moreBtn.textContent = 'Больше прогнозов'; moreBtn.setAttribute('data-throttle','800');
            const extra = document.createElement('div'); extra.className = 'extra-markets hidden'; extra.style.marginTop = '8px';
            moreBtn.addEventListener('click', () => { extra.classList.toggle('hidden'); });
            moreWrap.appendChild(moreBtn);

            // Тоталы: 3.5/4.5/5.5 Over/Under
            const totals = (m.markets && m.markets.totals) || [];
            if (totals.length) {
              const table = document.createElement('div'); table.className = 'totals-table';
              totals.forEach(row => {
                const rowEl = document.createElement('div'); rowEl.className = 'totals-row';
                const lbl = document.createElement('div'); lbl.className = 'totals-line'; lbl.textContent = `Тотал ${row.line.toFixed(1)}`;
                const btnOver = document.createElement('button'); btnOver.className='bet-btn'; btnOver.textContent = `Больше (${Number(row.odds.over).toFixed(2)})`;
                btnOver.dataset.market = 'totals'; btnOver.dataset.side = 'over'; btnOver.dataset.line = String(row.line);
                const btnUnder = document.createElement('button'); btnUnder.className='bet-btn'; btnUnder.textContent = `Меньше (${Number(row.odds.under).toFixed(2)})`;
                btnUnder.dataset.market = 'totals'; btnUnder.dataset.side = 'under'; btnUnder.dataset.line = String(row.line);
                btnOver.disabled = !!m.lock; btnUnder.disabled = !!m.lock;
                btnOver.setAttribute('data-throttle','1200');
                btnUnder.setAttribute('data-throttle','1200');
                btnOver.addEventListener('click', ()=> {
                  if (btnOver.disabled) {return;}
                  btnOver.disabled = true;
                  Promise.resolve(openStakeModal(t.tour, m, 'over', 'totals', row.line)).finally(()=>{ btnOver.disabled = false; });
                });
                btnUnder.addEventListener('click', ()=> {
                  if (btnUnder.disabled) {return;}
                  btnUnder.disabled = true;
                  Promise.resolve(openStakeModal(t.tour, m, 'under', 'totals', row.line)).finally(()=>{ btnUnder.disabled = false; });
                });
                rowEl.append(lbl, btnOver, btnUnder);
                table.appendChild(rowEl);
              });
              extra.appendChild(table);
            }

            // Спецрынки: пенальти/красная (Да/Нет)
            const specials = (m.markets && m.markets.specials) || {};
            const mkYN = (title, odds, marketKey) => {
              if (!odds) {return null;}
              const rowEl = document.createElement('div'); rowEl.className = 'totals-row';
              const lbl = document.createElement('div'); lbl.className = 'totals-line'; lbl.textContent = title;
              const yesBtn = document.createElement('button'); yesBtn.className='bet-btn'; yesBtn.textContent = `Да (${Number(odds.yes).toFixed(2)})`;
              yesBtn.dataset.market = marketKey; yesBtn.dataset.side = 'yes';
              const noBtn = document.createElement('button'); noBtn.className='bet-btn'; noBtn.textContent = `Нет (${Number(odds.no).toFixed(2)})`;
              noBtn.dataset.market = marketKey; noBtn.dataset.side = 'no';
              yesBtn.disabled = !!m.lock; noBtn.disabled = !!m.lock;
              yesBtn.setAttribute('data-throttle','1200');
              noBtn.setAttribute('data-throttle','1200');
              yesBtn.addEventListener('click', ()=> {
                if (yesBtn.disabled) {return;}
                yesBtn.disabled = true;
                Promise.resolve(openStakeModal(t.tour, m, 'yes', marketKey)).finally(()=>{ yesBtn.disabled = false; });
              });
              noBtn.addEventListener('click', ()=> {
                if (noBtn.disabled) {return;}
                noBtn.disabled = true;
                Promise.resolve(openStakeModal(t.tour, m, 'no', marketKey)).finally(()=>{ noBtn.disabled = false; });
              });
              rowEl.append(lbl, yesBtn, noBtn);
              return rowEl;
            };
            if (specials.penalty?.available) {
              const block = document.createElement('div'); block.className = 'totals-table';
              const row = mkYN('Пенальти', specials.penalty.odds, 'penalty');
              if (row) {block.appendChild(row);}
              extra.appendChild(block);
            }
            if (specials.redcard?.available) {
              const block = document.createElement('div'); block.className = 'totals-table';
              const row = mkYN('Красная карточка', specials.redcard.odds, 'redcard');
              if (row) {block.appendChild(row);}
              extra.appendChild(block);
            }

            card.appendChild(moreWrap);
            card.appendChild(extra);
            tourEl.appendChild(card);
            visibleMatchesTotal++;
          });
          if (tourMatches.length > 0) {
            container.appendChild(tourEl);
          }
        });
        toursEl.innerHTML = '';
        if (visibleMatchesTotal === 0) {
          toursEl.innerHTML = '<div class="schedule-empty">Матчи скоро появяться</div>';
        } else {
          toursEl.appendChild(container);
          toursEl.dataset.hasContent = '1';
          
          // Принудительная загрузка коэффициентов сразу после рендеринга
          setTimeout(() => {
            try {
              // Обновляем UI коэффициентами из кэша
              updateOddsUIFromStore(data);
              // Синхронизируем централизованный стор
              updateStoresFromTours(data);
            } catch(_) {}
          }, 50);
        }
      };

      const cached = readCache();
      if (cached) {
        renderTours(cached);
        // Немедленно применим коэффициенты из кэша (убирает эффект «пустых» кнопок)
        try { updateOddsUIFromStore(cached); } catch(_) {}
        // Обновим централизованный стор коэффициентов/предсказаний
        try { updateStoresFromTours(cached); } catch(_) {}
      } else {
        toursEl.innerHTML = '<div class="schedule-loading">Загрузка матчей...</div>';
      }

      // Валидация/обновление по сети с ETag
      const fetchWithETag = (etag) => fetch('/api/betting/tours', { headers: etag ? { 'If-None-Match': etag } : {} })
        .then(async r => {
          if (r.status === 304 && cached) {
            // Если кэш есть, но в нём отсутствуют коэффициенты/рынки — форсируем полный рефетч
            try {
              const tours = cached?.data?.tours || cached?.tours || [];
              const hasOdds = tours.some(t => (t.matches||[]).some(m => m?.odds && Object.keys(m.odds).length));
              const hasMarkets = tours.some(t => (t.matches||[]).some(m => m?.markets && (m.markets.totals?.length || m.markets.specials)));
              if (!hasOdds || !hasMarkets) {
                const r2 = await fetch('/api/betting/tours');
                const data2 = await r2.json().catch(()=>null);
                if (data2) {
                  const version2 = data2.version || r2.headers.get('ETag') || null;
                  let store2 = { data: data2, version: version2, ts: Date.now() };
                  // Сольём с кэшем, чтобы не потерять имеющиеся odds/markets
                  store2 = mergeOddsMarkets(cached, store2);
                  writeCache(store2);
                  return store2;
                }
              }
            } catch(_) {}
            try { updateStoresFromTours(cached); } catch(_) {}
            return cached;
          }
          const data = await r.json();
          const version = data.version || r.headers.get('ETag') || null;
          let store = { data, version, ts: Date.now() };
          // не перезатираем кэш пустыми турами, если ранее были валидные
          const incoming = Array.isArray(data?.tours) ? data.tours : Array.isArray(data?.data?.tours) ? data.data.tours : [];
          const cachedTours = Array.isArray(cached?.data?.tours) ? cached.data.tours : [];
          // Мержим с кэшем для сохранения имеющихся коэффициентов
          if (cached) {store = mergeOddsMarkets(cached, store);}
          const writeable = incoming.length > 0 && (hasAnyOddsMarkets(store) || !cached || cachedTours.length === 0);
          if (writeable) {writeCache(store);}
          try { updateStoresFromTours(store); } catch(_) {}
          return store;
        });

      // Fallback-пуллинг коэффициентов при отключённых/неподключённых WebSocket: обновляем кнопки П1/Х/П2 по ETag каждые ~3.5-4.7с
      const startOddsPolling = (initialVersion) => {
        try { if (wrap.__oddsPollCancel) {wrap.__oddsPollCancel();} } catch(_){}
        // используем пуллинг, если:
        // 1) WS выключен ИЛИ
        // 2) нет активного подключения ИЛИ
        // 3) topic-подписки выключены на клиенте ИЛИ
        // 4) нет подписки на 'predictions_page' (подписка могла не установиться из-за порядка загрузки)
        let wsConnected = false, topicsOn = false, hasPredTopic = false;
        try {
          wsConnected = !!(window.__WEBSOCKETS_ENABLED__ && window.realtimeUpdater && window.realtimeUpdater.getConnectionStatus && window.realtimeUpdater.getConnectionStatus().connected);
          topicsOn = !!(window.realtimeUpdater && typeof window.realtimeUpdater.getTopicEnabled === 'function' && window.realtimeUpdater.getTopicEnabled());
          hasPredTopic = !!(window.realtimeUpdater && typeof window.realtimeUpdater.hasTopic === 'function' && window.realtimeUpdater.hasTopic('predictions_page'));
        } catch(_) {}
        const needPolling = !window.__WEBSOCKETS_ENABLED__ || !wsConnected || !topicsOn || !hasPredTopic;
        if (!needPolling) {return;}
        let cancelled = false, busy = false, timer = null;
        let lastVersion = initialVersion || (cached && cached.version) || null;
        wrap.__oddsPollCancel = () => { cancelled = true; try { if (timer) {clearTimeout(timer);} } catch(_){} };
        // Применяем данные стора к UI
  const schedule = () => { if (cancelled) {return;} const base=3500, jitter=1200; timer = setTimeout(loop, base + Math.floor(Math.random()*jitter)); };
        const loop = async () => {
          if (cancelled) {return;}
          const placeVisible = pMap.place && pMap.place.style.display !== 'none' && wrap.style.display !== 'none';
          if (document.hidden || !placeVisible) { schedule(); return; }
          if (busy) { schedule(); return; }
          busy = true;
          try {
            const store = await fetchWithETag(lastVersion).catch(()=>null);
            if (store) {
              const changed = store.version && store.version !== lastVersion;
              if (changed) {lastVersion = store.version;}
              // Даже при неизменном ETag обновим UI — покрывает кейс свежего кэша без коэффициентов
              updateOddsUIFromStore(store);
              // И стор коэффициентов/предсказаний
              try { updateStoresFromTours(store); } catch(_) {}
            }
          } finally { busy = false; schedule(); }
        };
        schedule();
      };
  const __FRESH_TTL__ = 5 * 60 * 1000; // 5 минут
  const __isFresh__ = cached && Number.isFinite(cached.ts) && (Date.now() - cached.ts < __FRESH_TTL__) && ((cached?.data?.tours && cached.data.tours.length>0) || (cached?.tours && cached.tours.length>0));
  if (cached && cached.version) {
        fetchWithETag(cached.version).then((store)=>{ 
          if(!__isFresh__) { renderTours(store); } 
          updateOddsUIFromStore(store); 
          startOddsPolling(store?.version);
          // Дополнительное обновление коэффициентов через небольшую задержку
          setTimeout(() => updateOddsUIFromStore(store), 200);
        }).catch(()=>{}).finally(()=>{ _toursLoading = false; });
      } else {
        fetchWithETag(null).then((store)=>{ 
          if(!__isFresh__) { renderTours(store); } 
          updateOddsUIFromStore(store); 
          startOddsPolling(store?.version);
          // Дополнительное обновление коэффициентов через небольшую задержку
          setTimeout(() => updateOddsUIFromStore(store), 200);
        }).catch(err => {
          if (!cached || !__isFresh__) {toursEl.innerHTML = '<div class="schedule-error">Не удалось загрузить</div>';}
        }).finally(()=>{ _toursLoading = false; });
      }
      if (cached && !(_toursLoading)) { /* уже отрисовали кэш; загрузка в фоне */ }
  }

  // Экспортируем для вызова извне при входе во вкладку
  try { window.loadBetTours = () => { try { loadTours(); } catch(_) {} }; } catch(_) {}

  function mkTeam(name) {
  const d = document.createElement('div'); d.className = 'team';
      const img = document.createElement('img'); img.className = 'logo'; img.alt = name || '';
  (window.setTeamLogo || window.TeamUtils?.setTeamLogo || function(){ })(img, name||'');
  img.setAttribute('data-team-name', name || '');
      const nm = document.createElement('div'); nm.className = 'team-name';
      nm.setAttribute('data-team-name', name || '');
  d.setAttribute('data-team-name', name || '');
      try {
        const withTeamCount = window.withTeamCount || (window.profileWithTeamCount /* fallback stub */);
        nm.textContent = withTeamCount ? withTeamCount(name||'') : (name||'');
      } catch(_) { nm.textContent = name || ''; }
      d.append(img, nm); return d;
    }
    // Удалена локальная setTeamLogo: используется глобальная TeamUtils

    function mkOptions(tour, m, locked) {
      const box = document.createElement('div'); box.className = 'options-box';
      const odds = m.odds || {};
      const mkBtn = (key, label) => {
        const b = document.createElement('button'); b.className='bet-btn';
        b.dataset.betKey = key; // Добавляем data-атрибут для легкого поиска
        const k = odds[key] != null ? ` (${Number(odds[key]).toFixed(2)})` : '';
        b.textContent = label + k; b.disabled = !!locked;
        b.addEventListener('click', ()=> {
          if (b.disabled) {return;}
          b.disabled = true;
          Promise.resolve(openStakeModal(tour, m, key)).finally(()=>{ b.disabled = false; });
        });
        return b;
      };
      box.append(mkBtn('home','П1'), mkBtn('draw','Х'), mkBtn('away','П2'));
      return box;
    }

    function openStakeModal(tour, m, selection, market='1x2', line=null) {
      let selText = selection;
      if(market==='1x2') {selText = {'home':'П1','draw':'Х','away':'П2'}[selection]||selection;}
      else if(market==='totals') {selText = (selection.startsWith('over')||selection.startsWith('under')) ? (selection.startsWith('over')?`Больше ${selection.split('_')[1]}`:`Меньше ${selection.split('_')[1]}`) : selText;}
      else if(market==='penalty' || market==='redcard') {selText = {'yes':'Да','no':'Нет'}[selection]||selection;}
      // Покажем кастомную модалку вместо prompt
      return showStakeModal(`Ставка на ${m.home} vs ${m.away}`, `Исход: ${selText}. Введите сумму:`, '100')
        .then(stake => {
          if (!stake) {return Promise.resolve();}
          const amt = parseInt(String(stake).replace(/[^0-9]/g,''), 10) || 0;
          if (amt <= 0) {return Promise.resolve();}
          if (!tg || !tg.initDataUnsafe?.user) { try { alert('Нужен Telegram WebApp'); } catch(_) {} return Promise.resolve(); }
          const fd = new FormData();
          fd.append('initData', tg.initData || '');
          if (tour != null) {fd.append('tour', String(tour));}
          fd.append('home', m.home || '');
          fd.append('away', m.away || '');
          fd.append('selection', selection);
          if (market) {fd.append('market', market);}
          if (market === 'totals' && line != null) {fd.append('line', String(line));}
          fd.append('stake', String(amt));
          return fetch('/api/betting/place', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(resp => {
              if (resp?.error) { try { tg?.showAlert?.(resp.error); } catch(_) { alert(resp.error); } return; }
              try { tg?.showAlert?.(`Ставка принята! Баланс: ${resp.balance}`); } catch(_) {}
              // Обновим профильные кредиты на экране
              const creditsEl = document.getElementById('credits');
              if (creditsEl) {creditsEl.textContent = (resp.balance||0).toLocaleString();}
              // обновим список ставок если открыт
              const myPane = document.getElementById('pred-pane-mybets');
              if (myPane && myPane.style.display !== 'none') {loadMyBets();}
            })
            .catch(err => {  try { tg?.showAlert?.('Ошибка размещения ставки'); } catch(_) {} });
        });
    }

    // Показывает стилизованную модалку для ввода суммы ставки. Возвращает Promise<string|null> с введённой суммой (или null при отмене).
    function showStakeModal(title, message, defaultValue) {
      return new Promise(resolve => {
        const modal = document.createElement('div'); modal.className = 'modal stake-modal show';
        // Строка лимитов (если сервер передал глобальные лимиты)
        const L = (window.__BET_LIMITS__||{});
        const limLine = (L && (L.min!=null || L.max!=null))
          ? `<div class="modal-hint">Лимиты: мин ${Number(L.min||10)}, макс ${Number(L.max||5000)}${L.daily?`, в день до ${Number(L.daily)}`:''}</div>`
          : '';
        modal.innerHTML = `
          <div class="modal-backdrop"></div>
          <div class="modal-dialog">
            <div class="modal-title">${escapeHtml(title)}</div>
            <div class="modal-desc">${escapeHtml(message)}</div>
            <input class="modal-input" type="text" inputmode="numeric" value="${String(defaultValue||'')}" />
            ${limLine}
            <div class="modal-error"></div>
            <div class="modal-actions">
              <button class="btn btn-secondary modal-cancel" type="button">Отмена</button>
              <button class="btn btn-primary modal-ok" type="button">OK</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        const input = modal.querySelector('.modal-input');
        const err = modal.querySelector('.modal-error');
        const btnOk = modal.querySelector('.modal-ok');
        const btnCancel = modal.querySelector('.modal-cancel');

        function cleanup() { modal.classList.remove('show'); setTimeout(()=> { try { modal.remove(); } catch(_) {} }, 180); }

        btnCancel.addEventListener('click', () => { cleanup(); resolve(null); });
        btnOk.addEventListener('click', () => {
          const val = String(input.value || '').replace(/[^0-9]/g, '');
          const n = parseInt(val, 10) || 0;
          if (n <= 0) { err.textContent = 'Введите корректную сумму'; input.focus(); return; }
          cleanup(); resolve(String(n));
        });
        // Enter/Escape
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { btnOk.click(); }
          if (e.key === 'Escape') { btnCancel.click(); }
        });
        // focus
        setTimeout(()=>{ try { input.focus(); input.select(); } catch(_){} }, 40);
      });
    }

    // Простая экранизация текста для вставки в innerHTML (title/desc)
    function escapeHtml(str) {
      return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function loadMyBets() {
      if (!myBetsEl) {return;}
      if (!tg || !tg.initDataUnsafe?.user) { myBetsEl.textContent = 'Недоступно вне Telegram'; return; }
      
      // Используем PredictionsStore вместо прямого localStorage
      const FRESH_TTL = 2 * 60 * 1000; // 2 минуты
      
      const render = (data) => {
        const ds = data?.bets ? data : (data?.data || {});
        const bets = ds.bets || [];
        if (!bets.length) { myBetsEl.innerHTML = '<div class="schedule-empty">Ставок нет</div>'; return; }
        const list = document.createElement('div'); list.className = 'bets-list';
        bets.forEach(b => {
          const card = document.createElement('div'); card.className = 'bet-card';
          const top = document.createElement('div'); top.className = 'bet-top';
          const title = document.createElement('div'); title.className = 'bet-title'; title.textContent = `${b.home} vs ${b.away}`;
          const when = document.createElement('div'); when.className = 'bet-when'; when.textContent = b.datetime ? formatDateTime(b.datetime) : '';
          top.append(title, when);
          // Локализованный вывод исхода
          const selDisp = b.selection_display || b.selection;
          const marketDisp = b.market_display || 'Исход';
          const mid = document.createElement('div'); mid.className = 'bet-mid'; mid.textContent = `${marketDisp}: ${selDisp} | Кф: ${b.odds || '-'} | Ставка: ${b.stake}`;
          const st = document.createElement('div'); 
          st.className = `bet-status ${b.status}`;
          
          // Локализация статусов
          let statusText = b.status;
          if (b.status === 'open') {statusText = 'Открыта';}
          else if (b.status === 'won') {statusText = 'Выиграна';}
          else if (b.status === 'lost') {statusText = 'Проиграна';}
          
          // Добавляем сумму выигрыша для выигранных ставок
          if (b.status === 'won' && b.winnings) {
            statusText += ` (+${b.winnings} кр.)`;
          }
          
          st.textContent = statusText;
          card.append(top, mid, st);
          list.appendChild(card);
        });
        myBetsEl.innerHTML = '';
        myBetsEl.appendChild(list);
      };
      
      // Проверяем кэш в PredictionsStore
      const cachedBets = window.PredictionHelpers?.getCachedMyBets?.(FRESH_TTL);
      if (cachedBets) {
        render({ bets: cachedBets });
      } else {
        myBetsEl.innerHTML = '<div class="schedule-loading">Загрузка...</div>';
      }
      
      const fd = new FormData(); fd.append('initData', tg.initData || '');
      fetch('/api/betting/my-bets', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(data => { 
          // Сохраняем в PredictionsStore вместо localStorage
          try { 
            const bets = data?.bets || [];
            window.PredictionHelpers?.setCachedMyBets?.(bets, FRESH_TTL);
          } catch(_) {} 
          render(data); 
        })
        .catch(err => {  
          if (!cachedBets) {myBetsEl.innerHTML = '<div class="schedule-error">Ошибка загрузки</div>';} 
        });
    }

  // Используем унифицированные утилиты форматирования и live-статуса
  const formatDateTime = (d,t) => (window.MatchUtils? window.MatchUtils.formatDateTime(d,t): (d||'') );
  const isLiveNow = (m) => (window.MatchUtils? window.MatchUtils.isLiveNow(m): false);

    // Реакция на глобальный topic_update: если пришло обновление туров ставок — очищаем кэш и перезагружаем
    document.addEventListener('ws:topic_update', (e) => {
      try {
        const p = e && e.detail ? e.detail : e;
        const entity = p && (p.entity || p.change_type || p.type);
        if (entity === 'betting_tours') {
          try { localStorage.removeItem('betting:tours'); } catch(_) {}
          // Мягкий рефетч если вкладка видна
          const predTab = document.querySelector('.nav-item[data-tab="predictions"]');
          const isPredActive = predTab && predTab.classList.contains('active');
          if (isPredActive && wrap && !wrap.hidden) {
            loadTours();
          }
        }
      } catch(_) {}
    });

    // Автозагрузка при входе во вкладку (каждый раз, не только первый)
    document.addEventListener('click', (e) => {
      const item = e.target.closest('.nav-item[data-tab="predictions"]');
      if (item) { 
        // Загружаем коэффициенты сразу при переходе на вкладку
        setTimeout(() => loadTours(), 100);
      }
    });

    // Автозагрузка коэффициентов при показе вкладки predictions
    const checkAndLoadOnVisible = () => {
      const predTab = document.querySelector('.nav-item[data-tab="predictions"]');
      const isPredActive = predTab && predTab.classList.contains('active');
      if (isPredActive && wrap && !wrap.hidden) {
        loadTours();
      }
    };

    // Наблюдатель за изменением видимости вкладки
    const observer = new MutationObserver(() => {
      checkAndLoadOnVisible();
    });

    // Следим за изменениями класса active у вкладок
    document.querySelectorAll('.nav-item').forEach(item => {
      observer.observe(item, { attributes: true, attributeFilter: ['class'] });
    });

    // Периодическое обновление коэффициентов (каждые 30 сек) если вкладка активна
    setInterval(() => {
      const predTab = document.querySelector('.nav-item[data-tab="predictions"]');
      const isPredActive = predTab && predTab.classList.contains('active');
      if (isPredActive && wrap && !wrap.hidden) {
        loadTours();
      }
    }, 30000);

    // --- НОВЫЙ КОД: Обработчик обновлений коэффициентов от WebSocket ---
    document.addEventListener('bettingOddsUpdate', (e) => {
      const { detail } = e;
      if (!detail) {return;}
      const homeTeam = detail.homeTeam || detail.home;
      const awayTeam = detail.awayTeam || detail.away;
      const date = detail.date || '';
      if (!homeTeam || !awayTeam) {return;}

      const matchId = `${homeTeam}_${awayTeam}_${date}`;
      let card = document.querySelector(`.match-card[data-match-id="${matchId}"]`);
      // Запасной путь: если дата не совпала/пустая — ищем по data-home/data-away
      if (!card) {
        card = document.querySelector(`.match-card[data-home="${homeTeam}"][data-away="${awayTeam}"]`);
      }
      if (!card) {return;}

      const fields = detail.odds ? detail : { odds: { ...detail } };
      const odds = fields.odds || {};
      const markets = fields.markets || {};
      updateCardOddsUI(card, odds, markets);
      // Обновляем централизованный стор (реалтайм)
      try {
        flattenAndUpdateOddsStoreForMatch(matchId, { odds, markets }, detail.odds_version);
      } catch(_) {}
      // Синхронизируем локальный кэш betting:tours
      try {
        const CACHE_KEY = 'betting:tours';
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (cached && cached.data && Array.isArray(cached.data.tours)) {
          const d = String(date || '').slice(0,10);
          cached.data.tours.forEach(t => (t.matches||[]).forEach(m => {
            const md = (m.date || m.datetime || '').slice(0,10);
            if (m.home === homeTeam && m.away === awayTeam && md === d) {
              // Сохраняем 1x2, totals и specials
              if (odds && Object.keys(odds).length) { m.odds = { ...(m.odds||{}), ...odds }; }
              if (markets && Object.keys(markets).length) { m.markets = { ...(m.markets||{}), ...markets }; }
              if (detail.odds_version != null) { cached.version = String(detail.odds_version); }
            }
          }));
          localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
        }
      } catch(_) {}
    });
    // --- КОНЕЦ НОВОГО КОДА ---


  });
})();
