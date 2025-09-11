// static/js/league.js
// League module: batched DOM rendering for league tables, schedule, results.
// Exposes window.League with helpers used by profile.js

(function(){
  const raf = (cb) => (window.requestAnimationFrame || window.setTimeout)(cb, 0);
  const rIC = window.requestIdleCallback || function (cb) { return setTimeout(() => cb({ timeRemaining: () => 0 }), 0); };

  // Локальный маппер цветов команд (используем глобальный, если есть)
  const getTeamColor = window.getTeamColor || function(name){
    try {
      const norm = (name||'').toString().trim().toLowerCase().replace(/ё/g,'е').replace(/[^a-z0-9а-я]+/gi,'');
      const map = {
        'полет': '#fdfdfc',
        'дождь': '#292929',
        'киборги': '#f4f3fb',
        'фкобнинск': '#eb0000',
        'ювелиры': '#333333',
        'звезда': '#a01818',
        'фкsetka4real': '#000000',
        'серпантин': '#141098',
        'креатив': '#98108c',
      };
      return map[norm] || '#3b82f6';
    } catch(_) { return '#3b82f6'; }
  };

  function batchAppend(parent, nodes, batchSize = 20) {
    let i = 0;
    function step() {
      if (i >= nodes.length) return;
      const frag = document.createDocumentFragment();
      for (let k = 0; k < batchSize && i < nodes.length; k++, i++) frag.appendChild(nodes[i]);
      parent.appendChild(frag);
      raf(step);
    }
    step();
  }

  // Кэш и дозатор запросов для агрегатов голосования (TTL 2 минуты, максимум 2 параллельно)
  const VoteAgg = (() => {
    const TTL = 120000; // 2 мин
    const MAX_CONCURRENCY = 2;
    const GAP_MS = 180; // пауза между запросами
    let running = 0;
    const q = [];
    const dedup = new Map(); // key -> Promise

    const keyFrom = (home, away, dateStr) => {
      try {
        const d = String(dateStr || '').slice(0, 10);
        const h = (home || '').toLowerCase().trim();
        const a = (away || '').toLowerCase().trim();
        return `${h}__${a}__${d}`;
      } catch(_) { return `${home||''}__${away||''}__${String(dateStr||'').slice(0,10)}`; }
    };
    const readCache = (key) => {
      try {
        const j = JSON.parse(localStorage.getItem('voteAgg:' + key) || 'null');
        if (j && Number.isFinite(j.ts) && (Date.now() - j.ts < TTL)) return j;
      } catch(_) {}
      return null;
    };
    const writeCache = (key, data) => {
      try { localStorage.setItem('voteAgg:' + key, JSON.stringify({ ...data, ts: Date.now() })); } catch(_) {}
    };
    const pump = () => {
      if (running >= MAX_CONCURRENCY) return;
      const job = q.shift();
      if (!job) return;
      running++;
      const url = `/api/vote/match-aggregates?home=${encodeURIComponent(job.h)}&away=${encodeURIComponent(job.a)}&date=${encodeURIComponent(job.d)}`;
      fetch(url, { cache: 'no-store' })
        .then(r => r.json())
        .then(data => { writeCache(job.key, data || {}); job.res(data || {}); })
        .catch(() => job.res(null))
        .finally(() => { running--; setTimeout(pump, GAP_MS); });
    };
    const fetchAgg = (home, away, dateStr) => {
      const key = keyFrom(home, away, dateStr);
      const cached = readCache(key);
      if (cached) return Promise.resolve(cached);
      if (dedup.has(key)) return dedup.get(key);
      const p = new Promise(res => { q.push({ key, h: home || '', a: away || '', d: String(dateStr||'').slice(0,10), res }); pump(); });
      dedup.set(key, p);
      p.finally(() => dedup.delete(key));
      return p;
    };
    return { fetchAgg, readCache, keyFrom };
  })();
  try { window.__VoteAgg = VoteAgg; } catch(_) {}

  // In-memory состояние для счётов и голосов (исключает мерцание при повторном показе)
  const MatchState = (() => {
    const map = new Map(); // key -> { score:"X : Y", votes:{h,d,a,total}, lastAggTs }
    function get(k){ return map.get(k); }
    function set(k, patch){ map.set(k, Object.assign({}, map.get(k)||{}, patch)); }
    return { get, set };
  })();
  try { window.MatchState = MatchState; } catch(_) {}

  function setUpdatedLabelSafely(labelEl, newIso) {
    try {
      const prevIso = labelEl.getAttribute('data-updated-iso');
      const prevTs = prevIso ? Date.parse(prevIso) : 0;
      const nextTs = Date.parse(newIso);
      if (!Number.isFinite(nextTs)) return;
      if (nextTs >= prevTs) {
        labelEl.setAttribute('data-updated-iso', newIso);
        const d = new Date(newIso);
        labelEl.textContent = `Обновлено: ${d.toLocaleString()}`;
      }
    } catch(_) {}
  }

  function renderLeagueTable(tableEl, updatedTextEl, data) {
    if (!tableEl) return;
    const tbody = tableEl.querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const rows = data?.values || [];
    const nodes = [];
    for (let i = 0; i < 10; i++) {
      const r = rows[i] || [];
      const tr = document.createElement('tr');
      for (let j = 0; j < 8; j++) {
        const td = document.createElement('td');
        const val = (r[j] ?? '').toString();
        if (j === 1) {
          // Колонка с названием команды — делаем кликабельной
          const nameEl = document.createElement('span');
          nameEl.className = 'team-name';
          nameEl.setAttribute('data-team-name', val);
          nameEl.textContent = val;
          td.appendChild(nameEl);
        } else {
          td.textContent = val;
        }
        tr.appendChild(td);
      }
      nodes.push(tr);
    }
    batchAppend(tbody, nodes, 10);
    raf(() => {
      try {
        const trs = tbody.querySelectorAll('tr');
        trs.forEach((rowEl, idx) => {
          if (idx === 1) rowEl.classList.add('rank-1');
          if (idx === 2) rowEl.classList.add('rank-2');
          if (idx === 3) rowEl.classList.add('rank-3');
        });
      } catch(_) {}
      if (updatedTextEl && data?.updated_at) setUpdatedLabelSafely(updatedTextEl, data.updated_at);
    });
  }

  function renderStatsTable(tableEl, updatedEl, data) {
    if (!tableEl) return;
    const tbody = tableEl.querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const rows = data?.values || [];
    const nodes = [];
    for (let i = 0; i < 11; i++) {
      const r = rows[i] || [];
      const tr = document.createElement('tr');
      for (let j = 0; j < 7; j++) {
        const td = document.createElement('td');
        td.textContent = (r[j] ?? '').toString();
        tr.appendChild(td);
      }
      nodes.push(tr);
    }
    batchAppend(tbody, nodes, 10);
    raf(() => {
      try {
        const trs = tbody.querySelectorAll('tr');
        trs.forEach((rowEl, idx) => {
          if (idx === 1) rowEl.classList.add('rank-1');
          if (idx === 2) rowEl.classList.add('rank-2');
          if (idx === 3) rowEl.classList.add('rank-3');
        });
      } catch(_) {}
      try { if (updatedEl && data?.updated_at) updatedEl.textContent = `Обновлено: ${new Date(data.updated_at).toLocaleString()}`; } catch(_) {}
    });
  }

  function loadTeamLogo(imgEl, teamName) {
    (window.setTeamLogo || window.TeamUtils?.setTeamLogo || function(){ })(imgEl, teamName);
  }

  function renderSchedule(pane, data) {
    if (!pane) return;
    const ds = data?.tours ? data : (data?.data || {});
  let tours = ds?.tours || [];
  // Убираем туры без матчей (чтобы не показывать пустые заголовки после переноса в Результаты)
  tours = (Array.isArray(tours) ? tours.filter(t => Array.isArray(t.matches) && t.matches.length > 0) : []);
  if (!tours.length) { pane.innerHTML = '<div class="schedule-empty">Нет ближайших туров</div>'; return; }
    pane.innerHTML = '';
    const nodes = [];

    // helper from profile.js
    const withTeamCount = window.withTeamCount || ((n)=>n);

    // Виртуализация: создаём блоки туров с ленивой отрисовкой матчей
    const MAX_RENDERED_TOURS = 4; // держим в DOM не больше 4 туров одновременно
    const INITIAL_RENDER = Math.min(2, tours.length);

  function createMatchCard(m) {
      const card = document.createElement('div');
      card.className = 'match-card';
      const header = document.createElement('div'); header.className = 'match-header';
      const dateStr = (() => { try { if (m.date) { const d = new Date(m.date); return d.toLocaleDateString(); } } catch(_) {} return ''; })();
      const timeStr = m.time || '';
  let isLive = false;
  try { if (window.MatchUtils) { isLive = window.MatchUtils.isLiveNow(m); } } catch(_) {}
      const headerText = document.createElement('span'); headerText.textContent = `${dateStr}${timeStr ? ' ' + timeStr : ''}`; header.appendChild(headerText);
  const finStore=(window.__FINISHED_MATCHES=window.__FINISHED_MATCHES||{});
  const mkKey=(mm)=>{ try { return `${(mm.home||'').toLowerCase().trim()}__${(mm.away||'').toLowerCase().trim()}__${(mm.date||mm.datetime||'').toString().slice(0,10)}`; } catch(_) { return `${(mm.home||'')}__${(mm.away||'')}`; } };
  if (isLive && !finStore[mkKey(m)]) { const live = document.createElement('span'); live.className='live-badge'; const dot=document.createElement('span'); dot.className='live-dot'; const lbl=document.createElement('span'); lbl.textContent='Матч идет'; live.append(dot,lbl); header.appendChild(live); }
      card.appendChild(header);

      const center = document.createElement('div'); center.className='match-center';
      const home = document.createElement('div'); home.className='team home';
  const hImg = document.createElement('img'); hImg.className='logo'; hImg.alt = m.home || ''; hImg.setAttribute('data-team-name', m.home || ''); try { hImg.loading='lazy'; hImg.decoding='async'; } catch(_) {} loadTeamLogo(hImg, m.home || '');
      const hName = document.createElement('div'); hName.className='team-name'; hName.setAttribute('data-team-name', m.home || ''); hName.textContent = withTeamCount(m.home || '');
      home.append(hImg, hName);
  const score = document.createElement('div'); score.className = 'score'; score.textContent = 'VS';
      const away = document.createElement('div'); away.className='team away';
  const aImg = document.createElement('img'); aImg.className='logo'; aImg.alt = m.away || ''; aImg.setAttribute('data-team-name', m.away || ''); try { aImg.loading='lazy'; aImg.decoding='async'; } catch(_) {} loadTeamLogo(aImg, m.away || '');
      const aName = document.createElement('div'); aName.className='team-name'; aName.setAttribute('data-team-name', m.away || ''); aName.textContent = withTeamCount(m.away || '');
      away.append(aImg, aName);
      center.append(home, score, away);
      card.appendChild(center);

      // Если лайв — подгрузим текущий счёт
      const stateKey = (()=>{ try { return `${(m.home||'').toLowerCase().trim()}__${(m.away||'').toLowerCase().trim()}__${String(m.date||m.datetime||'').slice(0,10)}`; } catch(_) { return `${m.home||''}__${m.away||''}`; } })();
      // Восстанавливаем предыдущий известный счёт сразу (исключаем визуальный скачок 'VS')
      try {
        const prev = MatchState.get(stateKey);
        if (prev && prev.score) score.textContent = prev.score;
      } catch(_) {}
      try {
        if (isLive && !finStore[mkKey(m)]) {
          score.textContent = '0 : 0';
          const fetchScore = async () => {
            try {
              const r = await fetch(`/api/match/score/get?home=${encodeURIComponent(m.home||'')}&away=${encodeURIComponent(m.away||'')}`);
              const d = await r.json();
              if (typeof d?.score_home === 'number' && typeof d?.score_away === 'number') {
                const txt = `${Number(d.score_home)} : ${Number(d.score_away)}`;
                if (score.textContent !== txt) score.textContent = txt;
                MatchState.set(stateKey, { score: txt });
              }
            } catch(_) {}
          };
          fetchScore();
        } else if (finStore[mkKey(m)]) {
          // Попробуем сразу показать финальный счёт (однократный fetch)
          (async()=>{ try { const r=await fetch(`/api/match/score/get?home=${encodeURIComponent(m.home||'')}&away=${encodeURIComponent(m.away||'')}`); const d=await r.json(); if (typeof d?.score_home==='number' && typeof d?.score_away==='number') { const txt=`${Number(d.score_home)} : ${Number(d.score_away)}`; score.textContent=txt; MatchState.set(stateKey,{ score: txt }); } } catch(_){} })();
        }
      } catch(_) {}

      // Голосование (П1/X/П2) — показываем только если матч входит в ставочные туры
      try {
        const toursCache = (() => { try { return JSON.parse(localStorage.getItem('betting:tours') || 'null'); } catch(_) { return null; } })();
        const mkKey = (obj) => { try { const h=(obj?.home||'').toLowerCase().trim(); const a=(obj?.away||'').toLowerCase().trim(); const raw=obj?.date?String(obj.date):(obj?.datetime?String(obj.datetime):''); const d=raw?raw.slice(0,10):''; return `${h}__${a}__${d}`; } catch(_) { return `${(obj?.home||'').toLowerCase()}__${(obj?.away||'').toLowerCase()}__`; } };
        const tourMatches = new Set();
        try { const tours=toursCache?.data?.tours || toursCache?.tours || []; tours.forEach(t => (t.matches||[]).forEach(x => tourMatches.add(mkKey(x)))); } catch(_) {}
        if (tourMatches.has(mkKey(m))) {
          try {
            const voteEl = window.VoteInline?.create?.({ home: m.home, away: m.away, date: m.date || m.datetime, getTeamColor });
            if (voteEl) card.appendChild(voteEl);
          } catch(_) {}
        }
      } catch(_) {}

      // Кнопка «Детали» и админ-«⭐ На главную» из прежней логики
      const footer = document.createElement('div'); footer.className='match-footer';
      try {
        const adminId = document.body.getAttribute('data-admin');
        const currentId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id ? String(window.Telegram.WebApp.initDataUnsafe.user.id) : '';
        if (adminId && currentId && adminId === currentId) {
        const star = document.createElement('button');
        star.className = 'details-btn'; star.style.marginRight='8px';
        const featureKey = `feature:${(m.home||'').toLowerCase()}__${(m.away||'').toLowerCase()}`;
        const isFeatured = (()=>{ try { const s = localStorage.getItem('feature:current'); if (!s) return false; const j=JSON.parse(s); return j && j.home===m.home && j.away===m.away; } catch(_) { return false; } })();
        star.textContent = isFeatured ? 'Закреплено' : '⭐ На главную';
          star.addEventListener('click', async () => {
            try {
              star.disabled = true; const orig = star.textContent; star.textContent = '...';
              const fd = new FormData(); fd.append('initData', (window.Telegram?.WebApp?.initData || ''));
              fd.append('home', m.home || ''); fd.append('away', m.away || '');
              if (m.date) fd.append('date', String(m.date).slice(0,10)); if (m.datetime) fd.append('datetime', String(m.datetime));
              const r = await fetch('/api/feature-match/set', { method: 'POST', body: fd }); const j = await r.json().catch(()=>({}));
          if (!r.ok) throw new Error(j?.error || 'Ошибка'); star.textContent = 'Закреплено';
          try { localStorage.setItem('feature:current', JSON.stringify({ home: m.home||'', away: m.away||'', ts: Date.now() })); } catch(_) {}
              try { window.renderTopMatchOfWeek?.({ home: m.home, away: m.away, date: m.date, datetime: m.datetime, time: m.time }); } catch(_) {}
              try { document.dispatchEvent(new CustomEvent('feature-match:set', { detail: { match: m } })); } catch(_) {}
            } catch(_) { try { window.Telegram?.WebApp?.showAlert?.('Не удалось назначить матч недели'); } catch(_) {} }
          });
          footer.appendChild(star);
        }
      } catch(_) {}

      const btnDetails = document.createElement('button'); btnDetails.className='details-btn'; btnDetails.textContent='Детали'; btnDetails.setAttribute('data-throttle','800');
      btnDetails.addEventListener('click', () => {
        const original = btnDetails.textContent; btnDetails.disabled = true; btnDetails.textContent = 'Загрузка контента...';
        const finish = (store) => { try { window.openMatchScreen?.({ home: m.home, away: m.away, date: m.date, time: m.time }, store?.data || store); } catch(_) {} btnDetails.disabled=false; btnDetails.textContent=original; };
        if (window.fetchMatchDetails) {
          window.fetchMatchDetails({ home: m.home, away: m.away })
            .then(finish)
            .catch(()=>{ btnDetails.disabled=false; btnDetails.textContent=original; });
        } else {
          const params = new URLSearchParams({ home: m.home||'', away: m.away||'' });
          fetch(`/api/match-details?${params.toString()}`)
            .then(r=>r.json())
            .then(d=>finish({ data: d }))
            .catch(()=>{ btnDetails.disabled=false; btnDetails.textContent=original; });
        }
      });
      footer.appendChild(btnDetails);
      card.appendChild(footer);
      return card;
    }

    function renderMatchesInto(container, matches) {
      const nodes = matches.map(createMatchCard);
      batchAppend(container, nodes, 12);
    }

    const holders = tours.map((t, i) => {
      const tourEl = document.createElement('div'); tourEl.className='tour-block';
      const title = document.createElement('div'); title.className='tour-title'; title.textContent = t.title || `Тур ${t.tour || ''}`;
      const body = document.createElement('div'); body.className='tour-body';
      tourEl.append(title, body);
      tourEl.__matches = (t.matches||[]).slice();
      tourEl.__rendered = false;
      return tourEl;
    });

    // Начальный рендер первых N туров
    holders.slice(0, INITIAL_RENDER).forEach(h => { renderMatchesInto(h.querySelector('.tour-body'), h.__matches); h.__rendered = true; });
    batchAppend(pane, holders, 1);

    // Ленивая отрисовка дальнейших туров
    if ('IntersectionObserver' in window) {
      const visible = new Set(holders.slice(0, INITIAL_RENDER));
      const io = new IntersectionObserver((entries) => {
        entries.forEach(ent => {
          const el = ent.target;
          if (ent.isIntersecting && !el.__rendered) {
            renderMatchesInto(el.querySelector('.tour-body'), el.__matches);
            el.__rendered = true; visible.add(el);
            // Контроль количества отрисованных туров
            if (visible.size > MAX_RENDERED_TOURS) {
              // Удалим самый дальний от текущего viewport
              const arr = Array.from(visible);
              // Сортируем по расстоянию от viewport top
              arr.sort((a,b)=> {
                const ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect();
                return Math.abs(ra.top) - Math.abs(rb.top);
              });
              // Удалим «самый дальний» в конце массива
              const toRemove = arr[arr.length-1];
              if (toRemove && toRemove !== el) {
                const body = toRemove.querySelector('.tour-body'); if (body) body.innerHTML='';
                toRemove.__rendered = false; visible.delete(toRemove);
              }
            }
          }
        });
      }, { root: null, rootMargin: '200px 0px', threshold: 0.01 });
      holders.forEach(h => io.observe(h));
    } else {
      // Фолбэк: уже отрисовали первые INITIAL_RENDER, остальные дорисуем партиями по скроллу
      let next = INITIAL_RENDER;
      const onScroll = () => {
        if (next >= holders.length) { window.removeEventListener('scroll', onScroll); return; }
        const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 600;
        if (nearBottom) {
          const end = Math.min(holders.length, next + 1);
          for (let i=next; i<end; i++) { const h = holders[i]; renderMatchesInto(h.querySelector('.tour-body'), h.__matches); h.__rendered = true; }
          next = end;
        }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    pane.dataset.hasContent = '1';

    // --- NEW: после начального рендера пытаемся догрузить туры для ставок (если ещё нет / устарели) и внедрить голосование ---
    try {
      ensureBettingToursFresh().then(() => {
        try { patchScheduleVotes(pane); } catch(_) {}
      });
    } catch(_) {}

    // --- LIVE badges periodic rescan (UI only) ---
    try {
      if (pane.__liveRescanTimer) { clearInterval(pane.__liveRescanTimer); }
      // Кэш статусов live из бекенда (минимизируем запросы)
      const LiveStatusCache = (window.__LIVE_STATUS_CACHE = window.__LIVE_STATUS_CACHE || {
        map: new Map(), // key -> { ts, status }
        TTL: 45000,
        get(k){ const v=this.map.get(k); if(!v) return null; if(Date.now()-v.ts>this.TTL){ this.map.delete(k); return null;} return v.status; },
        set(k,status){ this.map.set(k,{ ts: Date.now(), status }); }
      });

      const rescanLiveBadges = () => {
        try {
          if (!window.MatchUtils || typeof window.MatchUtils.isLiveNow !== 'function') return;
          const finStore = (window.__FINISHED_MATCHES = window.__FINISHED_MATCHES || {});
          const mkKey = (mm)=>{ try { return `${(mm.home||'').toLowerCase().trim()}__${(mm.away||'').toLowerCase().trim()}__${(mm.date||mm.datetime||'').toString().slice(0,10)}`; } catch(_) { return `${(mm.home||'')}__${(mm.away||'')}`; } };
          // Берём только видимые отрисованные карточки
          const cards = pane.querySelectorAll('.tour-block .tour-body .match-card');
          let scanned = 0;
          cards.forEach(card => {
            if (scanned > 120) return; // safety limit
            scanned++;
            try {
              // Восстановление данных матча из DOM
              const home = card.querySelector('.team.home .team-name')?.getAttribute('data-team-name') || card.querySelector('.team.home .team-name')?.textContent || '';
              const away = card.querySelector('.team.away .team-name')?.getAttribute('data-team-name') || card.querySelector('.team.away .team-name')?.textContent || '';
              let date = card.getAttribute('data-date') || '';
              let time = card.getAttribute('data-time') || '';
              if (!date) {
                const headerSpan = card.querySelector('.match-header span');
                const txt = headerSpan ? headerSpan.textContent||'' : '';
                const m = txt.match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})/);
                if (m) { date = m[1].split('.').reverse().join('-'); time = time || m[2]; }
              }
              const matchObj = { home, away, date, time };
              let live = window.MatchUtils.isLiveNow(matchObj);
              const key = mkKey(matchObj);
              const header = card.querySelector('.match-header'); if(!header) return;
              let badge = header.querySelector('.live-badge');
              // Фолбэк: если локально не live, но старт в пределах +-10 минут от now — спросим бекенд статус (1 запрос на матч в TTL)
              if(!live && !finStore[key]){
                try {
                  const dt = window.MatchUtils.parseDateTime(matchObj);
                  if (dt) {
                    const diffMin = Math.abs((Date.now() - dt.getTime())/60000);
                    if (diffMin <= 10) {
                      const cached = LiveStatusCache.get(key);
                      if (cached === 'live') { live = true; }
                      else if (cached === null) {
                        // делаем отложенный fetch чтобы не блокировать цикл
                        setTimeout(()=>{
                          // двойная проверка чтобы не дублировать запросы
                          if(LiveStatusCache.get(key) !== null) return;
                          fetch(`/api/match/status/get?home=${encodeURIComponent(matchObj.home||'')}&away=${encodeURIComponent(matchObj.away||'')}`)
                            .then(r=>r.json())
                            .then(s=>{
                              try {
                                if(s && s.status){
                                  LiveStatusCache.set(key, s.status);
                                  if(s.status==='live') { rescanLiveBadges(); }
                                }
                              } catch(_) {}
                            })
                            .catch(()=>{ try { LiveStatusCache.set(key,'err'); } catch(_){} });
                        }, 0);
                      }
                    }
                  }
                } catch(_) {}
              }
              if (live && !finStore[key]) {
                if (!badge) {
                  badge = document.createElement('span'); badge.className='live-badge';
                  const dot=document.createElement('span'); dot.className='live-dot';
                  const lbl=document.createElement('span'); lbl.textContent='Матч идет';
                  badge.append(dot,lbl); header.appendChild(badge);
                }
              } else if (badge) {
                badge.remove();
              }
            } catch(_) {}
          });
        } catch(_) {}
      };
      rescanLiveBadges(); // immediate
      pane.__liveRescanTimer = setInterval(rescanLiveBadges, 60000); // every 60s
    } catch(_) {}
    // --- end LIVE badges periodic rescan ---
  }

  function renderResults(pane, data) {
    if (!pane) return;
    const withTeamCount = window.withTeamCount || ((n)=>n);
    const all = data?.results || data?.data?.results || [];
    if (!all.length) { pane.innerHTML = '<div class="schedule-empty">Нет прошедших матчей</div>'; return; }
    pane.innerHTML = '';
    const byTour = new Map();
    all.forEach(m => { const t = m.tour || 0; if (!byTour.has(t)) byTour.set(t, []); byTour.get(t).push(m); });
    const tourList = Array.from(byTour.keys()).sort((a,b)=>b-a);
    const container = document.createElement('div'); container.className='results-container';
    const pager = document.createElement('div'); pager.className='results-pager';
    const prev = document.createElement('button'); prev.className='pager-btn'; prev.textContent='←';
    const title = document.createElement('div'); title.className='pager-title';
    const next = document.createElement('button'); next.className='pager-btn'; next.textContent='→';
    pager.append(prev, title, next);
    const listWrap = document.createElement('div'); listWrap.className='results-list';
    container.append(pager, listWrap);
    pane.appendChild(container);

    let idx = 0;
    const renderPage = () => {
      const tour = tourList[idx];
      title.textContent = `${tour} Тур`;
      listWrap.innerHTML = '';
      const matches = (byTour.get(tour) || []).slice();
      matches.sort((m1,m2)=>{ const d1 = m1.datetime || m1.date || ''; const d2 = m2.datetime || m2.date || ''; return (d2 > d1) ? 1 : (d2 < d1 ? -1 : 0); });
      const nodes = [];
      matches.forEach(m => {
        const card = document.createElement('div'); card.className='match-card result';
        const header = document.createElement('div'); header.className='match-header';
        const dateStr = (() => { try { if (m.date) { const d = new Date(m.date); return d.toLocaleDateString(); } } catch(_) {} return ''; })();
        header.textContent = `${dateStr}${m.time ? ' ' + m.time : ''}`; card.appendChild(header);
        const center = document.createElement('div'); center.className='match-center';
        const home = document.createElement('div'); home.className='team home';
  const hImg = document.createElement('img'); hImg.className='logo'; hImg.alt = m.home || ''; hImg.setAttribute('data-team-name', m.home || ''); try { hImg.loading='lazy'; hImg.decoding='async'; } catch(_) {} loadTeamLogo(hImg, m.home || '');
        const hName = document.createElement('div'); hName.className='team-name'; hName.setAttribute('data-team-name', m.home || ''); hName.textContent = withTeamCount(m.home || '');
        home.append(hImg, hName);
        const score = document.createElement('div'); score.className='score';
        const sH = (m.score_home || '').toString().trim(); const sA = (m.score_away || '').toString().trim();
        score.textContent = (sH && sA) ? `${sH} : ${sA}` : '— : —';
        const away = document.createElement('div'); away.className='team away';
  const aImg = document.createElement('img'); aImg.className='logo'; aImg.alt = m.away || ''; aImg.setAttribute('data-team-name', m.away || ''); try { aImg.loading='lazy'; aImg.decoding='async'; } catch(_) {} loadTeamLogo(aImg, m.away || '');
        const aName = document.createElement('div'); aName.className='team-name'; aName.setAttribute('data-team-name', m.away || ''); aName.textContent = withTeamCount(m.away || '');
        away.append(aImg, aName);
        center.append(home, score, away); card.appendChild(center);
        nodes.push(card);
      });
      batchAppend(listWrap, nodes, 12);
      prev.disabled = idx <= 0; next.disabled = idx >= tourList.length - 1;
    };
  prev.onclick = () => { if (idx > 0) { idx--; renderPage(); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
    next.onclick = () => { if (idx < tourList.length - 1) { idx++; renderPage(); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
    renderPage();
    pane.dataset.hasContent = '1';
  }

  // Добавим публичные рефреши, чтобы realtime-updates мог инициировать перезагрузку
  function refreshTable(){
    try {
      const table = document.getElementById('league-table');
      const updatedText = document.getElementById('league-updated-text');
      if (!table || !window.fetchEtag) return;
      // Сначала пробуем живую проекцию (без ETag), затем стандартную таблицу
      fetch('/api/league-table/live', { cache: 'no-store' })
        .then(r => r.ok ? r.json() : Promise.reject('no_live'))
        .then(data => {
          try { renderLeagueTable(table, updatedText, data); } catch(_) {}
          if (updatedText && data?.updated_at) {
            try { setUpdatedLabelSafely(updatedText, data.updated_at); } catch(_) {}
          }
        })
        .catch(() => {
          window.fetchEtag('/api/league-table', { cacheKey: 'league:table', swrMs: 5000, extract: j=>j })
        .then(({ data, headerUpdatedAt }) => {
          try { renderLeagueTable(table, updatedText, data); } catch(_) {}
          if (updatedText && headerUpdatedAt) {
            try { setUpdatedLabelSafely(updatedText, headerUpdatedAt); } catch(_) {}
          }
        })
        .catch(()=>{});
        });
    } catch(_) {}
  }

  function refreshSchedule(){
    try {
      const pane = document.getElementById('league-pane-schedule');
      if (!pane || !window.fetchEtag) return;
      window.fetchEtag('/api/schedule', { cacheKey: 'league:schedule', swrMs: 8000, extract: j=> (j?.data||j) })
        .then(({ data }) => { try { renderSchedule(pane, data); } catch(_) {} })
        .catch(()=>{});
    } catch(_) {}
  }

  window.League = { batchAppend, renderLeagueTable, renderStatsTable, renderSchedule, renderResults, setUpdatedLabelSafely, refreshTable, refreshSchedule };

  // ================== A) Ранняя загрузка betting tours (только если отсутствует или устарел) ==================
  const TOURS_CACHE_KEY = 'betting:tours';
  const TOURS_FRESH_TTL = 5 * 60 * 1000; // 5 минут как в predictions.js
  let __toursFetchPromise = null;
  function readToursCache(){ try { return JSON.parse(localStorage.getItem(TOURS_CACHE_KEY) || 'null'); } catch(_) { return null; } }
  function writeToursCache(obj){ try { localStorage.setItem(TOURS_CACHE_KEY, JSON.stringify(obj)); } catch(_) {} }
  function ensureBettingToursFresh(){
    try {
      const cached = readToursCache();
      const fresh = cached && Number.isFinite(cached.ts) && (Date.now() - cached.ts < TOURS_FRESH_TTL) && (Array.isArray(cached?.data?.tours) ? cached.data.tours.length>0 : Array.isArray(cached?.tours) && cached.tours.length>0);
      if (fresh) return Promise.resolve(cached);
      if (__toursFetchPromise) return __toursFetchPromise;
      __toursFetchPromise = fetch('/api/betting/tours', { headers: { 'Cache-Control': 'no-cache' } })
        .then(r => r.json().then(data => ({ data, version: r.headers.get('ETag') || null })))
        .then(store => { writeToursCache({ data: store.data, version: store.version, ts: Date.now() }); return store; })
        .catch(() => null)
        .finally(() => { setTimeout(() => { __toursFetchPromise = null; }, 1000); });
      return __toursFetchPromise;
    } catch(_) { return Promise.resolve(null); }
  }

  // ================== B) Патч голосований после догрузки туров ==================
  function buildTourMatchKey(obj){ try { const h=(obj?.home||'').toLowerCase().trim(); const a=(obj?.away||'').toLowerCase().trim(); const raw=(obj?.date?String(obj.date):(obj?.datetime?String(obj.datetime):'')); const d=raw?raw.slice(0,10):''; return `${h}__${a}__${d}`; } catch(_) { return ''; } }
  function computeTourMatchSet(cache){
    const s = new Set();
    try {
      const tours = cache?.data?.tours || cache?.tours || [];
      (tours||[]).forEach(t => (t.matches||[]).forEach(m => { const k=buildTourMatchKey(m); if(k) s.add(k); }));
    } catch(_) {}
    return s;
  }
  function patchScheduleVotes(pane){
    if (!pane) return;
    const cache = readToursCache();
    if (!cache) return;
    const tourMatches = computeTourMatchSet(cache);
    if (!tourMatches.size) return;
    // Пройдём по матч-картам без уже вставленного голосования
    pane.querySelectorAll('.match-card').forEach(card => {
      try {
        if (card.querySelector('.vote-inline')) return; // уже есть
        const home = card.querySelector('.team.home .team-name')?.textContent?.trim() || '';
        const away = card.querySelector('.team.away .team-name')?.textContent?.trim() || '';
        // ищем дату в заголовке (может быть в формате DD.MM.YYYY HH:MM)
        const headerSpan = card.querySelector('.match-header span') || card.querySelector('.match-header');
        let dateKey = '';
        try {
          const txt = (headerSpan?.textContent||'').trim();
            // Ищем паттерн dd.mm.yyyy
          const m = txt.match(/(\d{2}\.\d{2}\.\d{4})/);
          if (m) { const parts = m[1].split('.'); dateKey = `${parts[2]}-${parts[1]}-${parts[0]}`; }
        } catch(_) {}
        if (!dateKey) return;
        const key = `${home.toLowerCase()}__${away.toLowerCase()}__${dateKey}`;
        if (!tourMatches.has(key)) return;
        // Создаём голосование
        if (window.VoteInline && typeof window.VoteInline.create === 'function') {
          const voteEl = window.VoteInline.create({ home, away, date: dateKey, getTeamColor });
          if (voteEl) card.appendChild(voteEl);
        }
      } catch(_) {}
    });
  }

  // Ранняя фоноваая инициализация при загрузке (не блокирует основной рендер)
  try { ensureBettingToursFresh().then(()=>{ const pane=document.getElementById('league-pane-schedule'); if(pane && pane.dataset.hasContent==='1') { try { patchScheduleVotes(pane); } catch(_){} } }); } catch(_) {}

  // Фоновый опрос агрегатов голосования для непроголосовавших пользователей (каждые ~4s)
  function startVotePolling(){
    const INTERVAL = 4000; // 4 секунды (в заданном диапазоне 3-5)
    setInterval(() => {
      try {
        if (document.hidden) return;
        document.querySelectorAll('.vote-inline[data-votekey]').forEach(wrap => {
          try {
            const key = wrap.dataset.votekey;
            const st = MatchState.get(key);
            if (st && Date.now() - (st.lastAggTs||0) < 3500) return; // ещё свежо
            const home = wrap.dataset.home || '';
            const away = wrap.dataset.away || '';
            const date = wrap.dataset.date || '';
            // Не опрашиваем если пользователь уже голосовал (кнопок нет и confirm есть) реже? всё равно можно — нагрузка ограничена VoteAgg
            VoteAgg.fetchAgg(home, away, date).then(agg => {
              const segH = wrap.querySelector('.seg-h');
              const segD = wrap.querySelector('.seg-d');
              const segA = wrap.querySelector('.seg-a');
              if (!segH) return;
              const h = Number(agg?.home||0), d = Number(agg?.draw||0), a = Number(agg?.away||0);
              const sum = Math.max(1, h+d+a);
              const ph = Math.round(h*100/sum), pd = Math.round(d*100/sum), pa = Math.round(a*100/sum);
              if (segH.style.width !== ph+'%') segH.style.width = ph+'%';
              if (segD.style.width !== pd+'%') segD.style.width = pd+'%';
              if (segA.style.width !== pa+'%') segA.style.width = pa+'%';
              MatchState.set(key, { votes:{ h,d,a,total:h+d+a }, lastAggTs: Date.now() });
            }).catch(()=>{});
          } catch(_) {}
        });
      } catch(_) {}
    }, INTERVAL);
  }
  if (!window.__VOTE_POLLING_STARTED__) { window.__VOTE_POLLING_STARTED__ = true; startVotePolling(); }
})();
