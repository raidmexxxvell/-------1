// static/js/league.js
// League module: batched DOM rendering for league tables, schedule, results.
// Exposes window.League with helpers used by profile.js

(function(){
  const raf = (cb) => (window.requestAnimationFrame || window.setTimeout)(cb, 0);
  const _rIC = window.requestIdleCallback || function (cb) { return setTimeout(() => cb({ timeRemaining: () => 0 }), 0); };

  // Нормализация даты к формату YYYY-MM-DD без преобразования часового пояса
  // Важно: не используем new Date(...), чтобы избежать смещения дня при разных TZ
  function normalizeDateStr(raw) {
    try {
      if (!raw) {return '';}
      const s = String(raw).trim();
      // dd.mm.yyyy -> yyyy-mm-dd
      const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
      if (m) {return `${m[3]}-${m[2]}-${m[1]}`;}
      // Если ISO-подобное — берём первые 10 символов (yyyy-mm-dd)
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) {return s.slice(0, 10);}
      // Если внутри есть 'T' (datetime), тоже берём yyyy-mm-dd до 'T'
      const tIdx = s.indexOf('T');
      if (tIdx > 0 && /^\d{4}-\d{2}-\d{2}$/.test(s.slice(0,10))) {return s.slice(0,10);}
      // Фолбэк: попытка выделить yyyy-mm-dd из произвольной строки
      const m2 = s.match(/(\d{4}-\d{2}-\d{2})/);
      if (m2) {return m2[1];}
      // Иначе вернём обрезанную под YYYY-MM-DD строку — лучше, чем уходить в TZ-конвертацию
      return s.slice(0, 10);
    } catch(_) { return String(raw||'').slice(0,10); }
  }

  // Форматирование yyyy-mm-dd -> dd.mm.yyyy (стабильно, без TZ)
  function formatDateRu(isoDate) {
    try {
      const s = String(isoDate||'').slice(0,10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {return s;}
      const [y,m,d] = s.split('-');
      return `${d}.${m}.${y}`;
    } catch(_) { return String(isoDate||''); }
  }

  // Используем унифицированную функцию из match-utils.js
  const matchKey = window.MatchUtils?.matchKey || function(obj) {
    try {
      const norm = (s)=> (s||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-z0-9а-я]+/gi,'').trim();
      const h = norm(obj?.home);
      const a = norm(obj?.away);
      const d = normalizeDateStr(obj?.date || obj?.datetime || '');
      return `${h}__${a}__${d}`;
    } catch(_) { return `${(obj?.home||'').toLowerCase()}__${(obj?.away||'').toLowerCase()}__`; }
  };

  // Используем унифицированную функцию из team-utils.js
  const getTeamColor = window.TeamUtils?.getTeamColor || window.getTeamColor || function(name){
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
      if (i >= nodes.length) {return;}
      const frag = document.createDocumentFragment();
      for (let k = 0; k < batchSize && i < nodes.length; k++, i++) {frag.appendChild(nodes[i]);}
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
        const d = normalizeDateStr(dateStr || '');
        const h = (home || '').toLowerCase().replace(/ё/g,'е').trim();
        const a = (away || '').toLowerCase().replace(/ё/g,'е').trim();
        return `${h}__${a}__${d}`;
      } catch(_) { return `${(home||'').toLowerCase()}__${(away||'').toLowerCase()}__${normalizeDateStr(dateStr||'')}`; }
    };
    const readCache = (key) => {
      try {
        const j = JSON.parse(localStorage.getItem('voteAgg:' + key) || 'null');
        if (j && Number.isFinite(j.ts) && (Date.now() - j.ts < TTL)) {return j;}
      } catch(_) {}
      return null;
    };
    const writeCache = (key, data) => {
      try { localStorage.setItem('voteAgg:' + key, JSON.stringify({ ...data, ts: Date.now() })); } catch(_) {}
    };
    const pump = () => {
      if (running >= MAX_CONCURRENCY) {return;}
      const job = q.shift();
      if (!job) {return;}
      running++;
      let url = `/api/vote/match-aggregates?home=${encodeURIComponent(job.h)}&away=${encodeURIComponent(job.a)}&date=${encodeURIComponent(job.d)}`;
      try {
        const init = window.Telegram?.WebApp?.initData || '';
        if (init) {url += `&initData=${encodeURIComponent(init)}`;}
      } catch(_) {}
      fetch(url, { cache: 'no-store' })
        .then(r => r.json())
        .then(data => { writeCache(job.key, data || {}); job.res(data || {}); })
        .catch(() => job.res(null))
        .finally(() => { running--; setTimeout(pump, GAP_MS); });
    };
    const fetchAgg = (home, away, dateStr) => {
      const key = keyFrom(home, away, dateStr);
      const cached = readCache(key);
      if (cached) {return Promise.resolve(cached);}
      if (dedup.has(key)) {return dedup.get(key);}
      const p = new Promise(res => { q.push({ key, h: home || '', a: away || '', d: String(dateStr||'').slice(0,10), res }); pump(); });
      dedup.set(key, p);
      p.finally(() => dedup.delete(key));
      return p;
    };
    return { fetchAgg, readCache, keyFrom };
  })();
  try { window.__VoteAgg = VoteAgg; } catch(_) {}

  // Legacy: MatchState теперь поступает из MatchesStore с совместимостью
  // Код сохранён для комментариев, но MatchState теперь глобальный из store/matches.js
  // const MatchState = (() => {
  //   const map = new Map(); // key -> { score:"X : Y", votes:{h,d,a,total}, lastAggTs }
  //   function get(k){ return map.get(k); }
  //   function set(k, patch){ map.set(k, Object.assign({}, map.get(k)||{}, patch)); }
  //   return { get, set };
  // })();
  // try { window.MatchState = MatchState; } catch(_) {}

  function setUpdatedLabelSafely(labelEl, newIso) {
    try {
      const prevIso = labelEl.getAttribute('data-updated-iso');
      const prevTs = prevIso ? Date.parse(prevIso) : 0;
      const nextTs = Date.parse(newIso);
      if (!Number.isFinite(nextTs)) {return;}
      if (nextTs >= prevTs) {
        labelEl.setAttribute('data-updated-iso', newIso);
        const d = new Date(newIso);
        labelEl.textContent = `Обновлено: ${d.toLocaleString()}`;
      }
    } catch(_) {}
  }

  function renderLeagueTable(tableEl, updatedTextEl, data) {
    if (!tableEl) {return;}
    const tbody = tableEl.querySelector('tbody');
    if (!tbody) {return;}
    const rows = data?.values || [];
    // Guard: проверяем и версию, и короткую сигнатуру, чтобы избежать пропуска реальных изменений
    try {
      const sigRows = JSON.stringify(rows.slice(0, 10));
      const sameSig = !!(tbody.children.length > 0 && tableEl.dataset && tableEl.dataset.sig === sigRows);
      const prevIso = updatedTextEl?.getAttribute('data-updated-iso') || '';
      const nextIso = data?.updated_at || '';
      let notNewer = false;
      if (nextIso && prevIso) {
        const prevTs = Date.parse(prevIso);
        const nextTs = Date.parse(nextIso);
        notNewer = Number.isFinite(prevTs) && Number.isFinite(nextTs) && nextTs <= prevTs;
      }
      if (sameSig && notNewer) {return;} // ничего не поменялось — не перерисовываем
      if (tableEl.dataset) {tableEl.dataset.sig = sigRows;}
    } catch(_) {}
    tbody.innerHTML = '';
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
          if (idx === 1) {rowEl.classList.add('rank-1');}
          if (idx === 2) {rowEl.classList.add('rank-2');}
          if (idx === 3) {rowEl.classList.add('rank-3');}
        });
      } catch(_) {}
      if (updatedTextEl && data?.updated_at) {setUpdatedLabelSafely(updatedTextEl, data.updated_at);}
    });
  }

  function renderStatsTable(tableEl, updatedEl, data) {
    if (!tableEl) {return;}
    const tbody = tableEl.querySelector('tbody');
    if (!tbody) {return;}
    tbody.innerHTML = '';
    const rows = data?.values || [];
    const MAX_ROWS = 10; // показываем максимум 10
    const nodes = [];
    const isEmpty = !Array.isArray(rows) || rows.length === 0;
    for (let i = 0; i < MAX_ROWS; i++) {
      const r = rows[i] || [];
      const tr = document.createElement('tr');
      for (let j = 0; j < 5; j++) { // 5 колонок: Name, Matches, Goals, Assists, Total
        const td = document.createElement('td');
        let val = (r[j] ?? '').toString();
        // Если данных нет — рендерим стабильный скелет: имя пусто, числовые колонки = 0
        if (isEmpty && j > 0) {val = '0';}
        td.textContent = val;
        tr.appendChild(td);
      }
      if (i === 0) {tr.classList.add('rank-1');}
      else if (i === 1) {tr.classList.add('rank-2');}
      else if (i === 2) {tr.classList.add('rank-3');}
      nodes.push(tr);
    }
    batchAppend(tbody, nodes, 10);
    raf(() => {
      try { 
        if (updatedEl && data?.updated_at) {updatedEl.textContent = `Обновлено: ${new Date(data.updated_at).toLocaleString()}`;} 
      } catch(_) {}
      try {
        // Проставляем сигнатуру первых 10 строк для дедупликации дальнейших рендеров
        const sig = JSON.stringify((rows||[]).slice(0,10));
        if (tableEl.dataset) {tableEl.dataset.sig = sig;}
      } catch(_) {}
    });
  }

  function loadTeamLogo(imgEl, teamName) {
    (window.setTeamLogo || window.TeamUtils?.setTeamLogo || function(){ })(imgEl, teamName);
  }

  function renderSchedule(pane, data) {

    if (!pane) {return;}
    const ds = data?.tours ? data : (data?.data || {});
    let tours = ds?.tours || [];
    // Guard: сравнение сигнатуры туров. Если расписание не изменилось — не перерисовываем контейнер (исключаем моргание голосовалок)
    try {
      const mkKeySafe = (m) => {
        try { return matchKey(m); } catch(_) { return `${m?.home||''}__${m?.away||''}__${m?.date||m?.datetime||''}`; }
      };
      const sig = JSON.stringify((Array.isArray(tours)?tours:[]).map(t=>({
        t: t?.tour||t?.title||'',
        m: (t?.matches||[]).map(m=>mkKeySafe(m))
      })));
      if (pane.dataset && pane.dataset.hasContent === '1' && pane.dataset.sig === sig) {
        // Данные не изменились — ранний прогрев туров без патчинга голосований
        try { ensureBettingToursFresh().catch(()=>{}); } catch(_) {}
        return;
      }
      if (pane.dataset) {pane.dataset.sig = sig;}
    } catch(_) {}
    // Синхронизируем расписание и betting:tours для актуального голосования (динамический импорт)
    (async () => {
      try {
        const bettingTours = JSON.parse(localStorage.getItem('betting:tours') || 'null');
        if (bettingTours) {
          // В классических скриптах относительный импорт может резолвиться от корня документа и давать 404.
          // Используем абсолютный путь в static для стабильной подгрузки помощника.
          const helpers = await import('/static/js/helpers.js');
          if (helpers && typeof helpers.syncScheduleAndBettingTours === 'function') {
            helpers.syncScheduleAndBettingTours(ds, bettingTours);
            localStorage.setItem('betting:tours', JSON.stringify(bettingTours));
          }
        }
      } catch(_) {}
    })();
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
      // WS addressing: помечаем карточку атрибутами для таргетирования updateMatchScore
      try {
        if (m && typeof m.home === 'string') { card.setAttribute('data-match-home', m.home); }
        if (m && typeof m.away === 'string') { card.setAttribute('data-match-away', m.away); }
      } catch(_) {}
      const header = document.createElement('div'); header.className = 'match-header';
  const dateStr = (() => { try { const ds = normalizeDateStr(m.date || m.datetime); return ds ? formatDateRu(ds) : ''; } catch(_) { return ''; } })();
      const timeStr = m.time || '';
  let isLive = false;
  try { if (window.MatchUtils) { isLive = window.MatchUtils.isLiveNow(m); } } catch(_) {}
  const headerText = document.createElement('span'); headerText.textContent = `${dateStr}${timeStr ? ' ' + timeStr : ''}`; header.appendChild(headerText);
  try { card.setAttribute('data-date', normalizeDateStr(m.date || m.datetime) || ''); } catch(_) {}
  try { if (m.time) {card.setAttribute('data-time', String(m.time));} } catch(_) {}
  const finStore=(window.__FINISHED_MATCHES=window.__FINISHED_MATCHES||{});
  const mkKey = (mm) => matchKey(mm);
  if (isLive && !finStore[mkKey(m)]) { const live = document.createElement('span'); live.className='live-badge'; const dot=document.createElement('span'); dot.className='live-dot'; const lbl=document.createElement('span'); lbl.textContent='Матч идет'; live.append(dot,lbl); header.appendChild(live); }
      card.appendChild(header);

  const center = document.createElement('div'); center.className='match-center';
      const home = document.createElement('div'); home.className='team home';
  const hImg = document.createElement('img'); hImg.className='logo'; hImg.alt = m.home || ''; hImg.setAttribute('data-team-name', m.home || ''); try { hImg.loading='lazy'; hImg.decoding='async'; } catch(_) {} loadTeamLogo(hImg, m.home || '');
      const hName = document.createElement('div'); hName.className='team-name'; hName.setAttribute('data-team-name', m.home || ''); hName.textContent = withTeamCount(m.home || '');
      home.append(hImg, hName);
  // Добавляем класс match-score, чтобы realtime-updates смог находить и обновлять счёт по WS
  const score = document.createElement('div'); score.className = 'score match-score'; score.textContent = 'VS';
      const away = document.createElement('div'); away.className='team away';
  const aImg = document.createElement('img'); aImg.className='logo'; aImg.alt = m.away || ''; aImg.setAttribute('data-team-name', m.away || ''); try { aImg.loading='lazy'; aImg.decoding='async'; } catch(_) {} loadTeamLogo(aImg, m.away || '');
      const aName = document.createElement('div'); aName.className='team-name'; aName.setAttribute('data-team-name', m.away || ''); aName.textContent = withTeamCount(m.away || '');
      away.append(aImg, aName);
      center.append(home, score, away);
      card.appendChild(center);

      // Если лайв — подгрузим текущий счёт
  const stateKey = matchKey(m);
      // Восстанавливаем предыдущий известный счёт сразу (исключаем визуальный скачок 'VS')
      try {
        const prev = MatchState.get(stateKey);
        if (prev && prev.score) {score.textContent = prev.score;}
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
                if (score.textContent !== txt) {score.textContent = txt;}
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

      // Голосование удалено из расписания — доступно только во вкладке «Прогнозы»

      // Кнопка «Детали» и админ-«⭐ На главную» из прежней логики
      const footer = document.createElement('div'); footer.className='match-footer';
      try {
        const adminId = document.body.getAttribute('data-admin');
        const currentId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id ? String(window.Telegram.WebApp.initDataUnsafe.user.id) : '';
        if (adminId && currentId && adminId === currentId) {
        const star = document.createElement('button');
        star.className = 'details-btn'; star.style.marginRight='8px';
        const featureKey = `feature:${(m.home||'').toLowerCase()}__${(m.away||'').toLowerCase()}`;
        const isFeatured = (()=>{ try { const s = localStorage.getItem('feature:current'); if (!s) {return false;} const j=JSON.parse(s); return j && j.home===m.home && j.away===m.away; } catch(_) { return false; } })();
        star.textContent = isFeatured ? 'Закреплено' : '⭐ На главную';
          star.addEventListener('click', async () => {
            try {
              star.disabled = true; const orig = star.textContent; star.textContent = '...';
              const fd = new FormData(); fd.append('initData', (window.Telegram?.WebApp?.initData || ''));
              fd.append('home', m.home || ''); fd.append('away', m.away || '');
              if (m.date) {fd.append('date', String(m.date).slice(0,10));} if (m.datetime) {fd.append('datetime', String(m.datetime));}
              const r = await fetch('/api/feature-match/set', { method: 'POST', body: fd }); const j = await r.json().catch(()=>({}));
          if (!r.ok) {throw new Error(j?.error || 'Ошибка');} star.textContent = 'Закреплено';
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
                const body = toRemove.querySelector('.tour-body'); if (body) {body.innerHTML='';}
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

    // --- NEW: ранний прогрев туров ставок (без внедрения голосований в расписание) ---
    try { ensureBettingToursFresh().catch(()=>{}); } catch(_) {}

    // --- LIVE badges periodic rescan (UI only) ---
    try {
      if (pane.__liveRescanTimer) { clearInterval(pane.__liveRescanTimer); }
      // Кэш статусов live из бекенда (минимизируем запросы)
      const LiveStatusCache = (window.__LIVE_STATUS_CACHE = window.__LIVE_STATUS_CACHE || {
        map: new Map(), // key -> { ts, status }
        TTL: 45000,
        get(k){ const v=this.map.get(k); if(!v) {return null;} if(Date.now()-v.ts>this.TTL){ this.map.delete(k); return null;} return v.status; },
        set(k,status){ this.map.set(k,{ ts: Date.now(), status }); }
      });

      const rescanLiveBadges = () => {
        try {
          if (!window.MatchUtils || typeof window.MatchUtils.isLiveNow !== 'function') {return;}
          const finStore = (window.__FINISHED_MATCHES = window.__FINISHED_MATCHES || {});
          const mkKey = (mm)=>{ try { return `${(mm.home||'').toLowerCase().trim()}__${(mm.away||'').toLowerCase().trim()}__${(mm.date||mm.datetime||'').toString().slice(0,10)}`; } catch(_) { return `${(mm.home||'')}__${(mm.away||'')}`; } };
          // Берём только видимые отрисованные карточки
          const cards = pane.querySelectorAll('.tour-block .tour-body .match-card');
          let scanned = 0;
          cards.forEach(card => {
            if (scanned > 120) {return;} // safety limit
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
              const header = card.querySelector('.match-header'); if(!header) {return;}
              let badge = header.querySelector('.live-badge');
              // Фолбэк: если локально не live, но старт в пределах ~±130 минут от now — спросим бекенд статус (1 запрос на матч в TTL)
              if(!live && !finStore[key]){
                try {
                  const dt = window.MatchUtils.parseDateTime(matchObj);
                  if (dt) {
                    const diffMin = Math.abs((Date.now() - dt.getTime())/60000);
                    // 130 минут ~ 2ч 10м — покрывает предматчевое окно и стандартную длительность
                    if (diffMin <= 130) {
                      const cached = LiveStatusCache.get(key);
                      if (cached === 'live') { live = true; }
                      else if (cached === null) {
                        // делаем отложенный fetch чтобы не блокировать цикл
                        setTimeout(()=>{
                          // двойная проверка чтобы не дублировать запросы
                          if(LiveStatusCache.get(key) !== null) {return;}
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
    if (!pane) {return;}
    const withTeamCount = window.withTeamCount || ((n)=>n);
    const all = data?.results || data?.data?.results || [];
    if (!all.length) { pane.innerHTML = '<div class="schedule-empty">Нет прошедших матчей</div>'; return; }
    pane.innerHTML = '';
    const byTour = new Map();
    all.forEach(m => { const t = m.tour || 0; if (!byTour.has(t)) {byTour.set(t, []);} byTour.get(t).push(m); });
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
  const dateStr = (() => { try { const ds = normalizeDateStr(m.date || m.datetime); return ds ? formatDateRu(ds) : ''; } catch(_) { return ''; } })();
        header.textContent = `${dateStr}${m.time ? ' ' + m.time : ''}`; card.appendChild(header);
        const center = document.createElement('div'); center.className='match-center';
        const home = document.createElement('div'); home.className='team home';
  const hImg = document.createElement('img'); hImg.className='logo'; hImg.alt = m.home || ''; hImg.setAttribute('data-team-name', m.home || ''); try { hImg.loading='lazy'; hImg.decoding='async'; } catch(_) {} loadTeamLogo(hImg, m.home || '');
        const hName = document.createElement('div'); hName.className='team-name'; hName.setAttribute('data-team-name', m.home || ''); hName.textContent = withTeamCount(m.home || '');
        home.append(hImg, hName);
  const score = document.createElement('div'); score.className='score';
  const hasSh = (m.score_home !== undefined && m.score_home !== null && m.score_home !== '');
  const hasSa = (m.score_away !== undefined && m.score_away !== null && m.score_away !== '');
  const sH = hasSh ? String(m.score_home) : '';
  const sA = hasSa ? String(m.score_away) : '';
  score.textContent = (hasSh && hasSa) ? `${sH} : ${sA}` : '— : —';
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
      if (!table || !window.fetchEtag) {return;}
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
          window.fetchEtag('/api/league-table', { cacheKey: 'league:table', swrMs: 5000, extract: j=>j, onSuccess: (res)=>{
            try {
              if (window.LeagueStore) {window.LeagueStore.update(s => { s.table = Array.isArray(res.data) ? res.data : []; });}
            } catch(_){}
          } })
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

  async function refreshSchedule(){
    try {
      const pane = document.getElementById('league-pane-schedule');
      if (!pane || !window.fetchEtag) {return;}
      // Сначала пробуем прогретый кэш от /api/summary
      const STORE_KEY = 'schedule:tours';
      const FRESH_TTL = 10 * 60 * 1000; // 10 минут как в profile.js
      let cached = null; try { cached = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch(_) { cached = null; }
      const isFresh = cached && Number.isFinite(cached.ts) && (Date.now() - cached.ts < FRESH_TTL) && ((cached.data?.tours && cached.data.tours.length>0) || (cached?.tours && cached.tours.length>0));
      if (isFresh) {
        try { renderSchedule(pane, cached.data || cached); } catch(_) {}
        return; // экономим сеть — считаем, что уже свежо
      }
      // Если кэш устарел и предзагрузка summary ещё идёт — подождём немного
      try {
        if (window.__SUMMARY_IN_FLIGHT__) {
          const waitForSummary = (ms=1200) => new Promise(resolve => {
            let t=null; const onReady = () => { try { if(t) {clearTimeout(t);} } catch(_) {}; resolve('ready'); };
            try { window.addEventListener('preload:summary-ready', onReady, { once: true }); } catch(_) {}
            t = setTimeout(() => { try { window.removeEventListener('preload:summary-ready', onReady); } catch(_) {}; resolve('timeout'); }, ms);
          });
          await waitForSummary(1200);
          try { cached = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch(_) { cached = null; }
          const fresh2 = cached && Number.isFinite(cached.ts) && (Date.now() - cached.ts < FRESH_TTL) && ((cached.data?.tours && cached.data.tours.length>0) || (cached?.tours && cached.tours.length>0));
          if (fresh2) { try { renderSchedule(pane, (cached.data||cached)); } catch(_) {}; return; }
        }
      } catch(_) {}
      // Фолбэк: обычная загрузка через ETag
      window.fetchEtag('/api/schedule', { cacheKey: 'league:schedule', swrMs: 8000, extract: j=> (j?.data||j), onSuccess: (res)=>{
        try {
          if (window.LeagueStore) {window.LeagueStore.update(s => {
            s.schedule.tours = Array.isArray(res.data?.tours) ? res.data.tours : (Array.isArray(res.data) ? res.data : []);
            s.schedule.lastUpdated = Date.now();
            s.schedule.etag = res.etag || s.schedule.etag || null;
          });}
        } catch(_){}
      } })
        .then(({ data }) => { try { renderSchedule(pane, data); } catch(_) {} })
        .catch(()=>{});
    } catch(_) {}
  }

  // Экспортируем публичные методы, чтобы realtime-updates мог дергать refreshTable / refreshSchedule / renderResults
  window.League = { batchAppend, renderLeagueTable, renderStatsTable, renderSchedule, renderResults, setUpdatedLabelSafely, refreshTable, refreshSchedule };

  // === Расширенная статистика (Swiper) через LeaderboardsStore + feature flag ===
  function initLeagueStatsSwiper(){
    // Фича-флаг проверяется в самом сторе; здесь дополнительно не мешаемся
    try { if (document.getElementById('ls-track').__inited) return; } catch(_) {}
    const track = document.getElementById('ls-track');
    if(!track) return;
    track.__inited = true;
    const slides = Array.from(track.querySelectorAll('.ls-slide'));
    const btnPrev = document.getElementById('ls-prev');
    const btnNext = document.getElementById('ls-next');
    const title = document.getElementById('ls-title');
    const TITLES = ['Лучший игрок (Г+П)','Лучший бомбардир','Лучший ассистент'];
    let idx = 0;

    function updateNav(){
      if(btnPrev) btnPrev.disabled = idx<=0;
      if(btnNext) btnNext.disabled = idx>=slides.length-1;
      if(title) title.innerHTML = '<span class="ls-arrows">⟵</span> '+TITLES[idx]+' <span class="ls-arrows">⟶</span>';
    }

    function buildTable(list, updatedAt){
      const wrap = document.createElement('div'); wrap.className='league-table-wrap';
      const table = document.createElement('table'); table.className='league-table';
      const thead = document.createElement('thead'); thead.innerHTML = '<tr><th>#</th><th>Игрок</th><th>Команда</th><th>И</th><th>Г</th><th>П</th><th>Г+П</th></tr>';
      const tbody = document.createElement('tbody');
      for(let i=0;i<10;i++){
        const r = list && list[i];
        const tr = document.createElement('tr');
        const cols = r ? [i+1, r.player||'', r.team||'', r.games||0, r.goals||0, r.assists||0, r.total||0] : [i+1,'—','',0,0,0,0];
        cols.forEach(c=>{ const td=document.createElement('td'); td.textContent=String(c); tr.appendChild(td); });
        if(i===0) tr.classList.add('rank-1'); else if(i===1) tr.classList.add('rank-2'); else if(i===2) tr.classList.add('rank-3');
        tbody.appendChild(tr);
      }
      table.append(thead, tbody);
      const upd = document.createElement('div'); upd.className='table-updated'; upd.textContent = updatedAt ? ('Обновлено: '+ new Date(updatedAt).toLocaleString()) : '';
      wrap.append(table, upd);
      return wrap;
    }

    function renderSlides(){
      const st = window.LeaderboardsStore?.get();
      if(!st) return;
      slides.forEach(sl => {
        const type = sl.getAttribute('data-ls');
        let list = null;
        if(type==='ga') list = st.data.goals_assists;
        else if(type==='g') list = st.data.goals;
        else if(type==='a') list = st.data.assists;
        if(!list) return; // ждём загрузку
        if(sl.__renderedVersion === st.lastUpdated) return; // уже актуально
        sl.innerHTML='';
        sl.appendChild(buildTable(list, st.updatedAt));
        sl.__renderedVersion = st.lastUpdated;
      });
    }

    function go(n){
      if(n<0||n>=slides.length||n===idx) return;
      slides[idx].classList.remove('active'); slides[idx].setAttribute('aria-hidden','true');
      idx = n;
      slides[idx].classList.add('active'); slides[idx].removeAttribute('aria-hidden');
      track.style.transform = 'translateX(' + (-idx*100) + '%)';
      updateNav();
      const map = ['ga','g','a'];
      const storeMap = { ga:'ga', g:'goals', a:'assists' };
      try { window.LeaderboardsStoreAPI?.setActiveTab(storeMap[map[idx]]); } catch(_) {}
      renderSlides();
    }
    btnPrev && btnPrev.addEventListener('click', ()=>go(idx-1));
    btnNext && btnNext.addEventListener('click', ()=>go(idx+1));
    let startX=0, dragging=false;
    track.addEventListener('pointerdown', e=>{ dragging=true; startX=e.clientX; });
    track.addEventListener('pointerup', e=>{ if(!dragging) return; const dx=e.clientX-startX; dragging=false; if(Math.abs(dx)>40){ if(dx<0) go(idx+1); else go(idx-1);} });
    track.addEventListener('pointerleave', ()=>{ if(dragging) dragging=false; });

    // Подписка на стор
    (function waitStore(){
      if(window.LeaderboardsStore){
        try { window.LeaderboardsStore.subscribe(()=>{ renderSlides(); }); } catch(_) {}
        try { window.LeaderboardsStoreAPI?.ensureFresh(); } catch(_) {}
        renderSlides();
      } else {
        setTimeout(waitStore,120);
      }
    })();

    updateNav();
  }
  window.initLeagueStatsSwiper = initLeagueStatsSwiper;

  // Автоинициализация при активации вкладки статистики (observer на клики по субтабу)
  try {
    document.addEventListener('click', (e)=>{
      const t = e.target;
      if (!(t instanceof HTMLElement)) {return;}
      if (t.matches('.subtab-item[data-subtab="stats"], #ufo-tab-stats')) {
        setTimeout(()=>{ try { initLeagueStatsSwiper(); } catch(_){} }, 0);
      }
    });
    // Если вкладка уже активна на загрузке
    if (document.getElementById('ufo-stats')?.style.display !== 'none') {
      setTimeout(()=>{ try { initLeagueStatsSwiper(); } catch(_){} }, 50);
    }
  } catch(_) {}

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
      if (fresh) {return Promise.resolve(cached);}
      if (__toursFetchPromise) {return __toursFetchPromise;}
      const headers = { 'Cache-Control': 'no-cache' };
      if (cached?.version) {headers['If-None-Match'] = cached.version;}
      __toursFetchPromise = fetch('/api/betting/tours', { headers, cache: 'no-store' })
        .then(async r => {
          if (r.status === 304) {
            if (cached) {
              // Не изменилось — просто продлим TTL и вернём кэш
              writeToursCache({ data: cached.data, version: cached.version, ts: Date.now() });
              return { data: cached.data, version: cached.version };
            }
            // Нет локального кэша, но сервер вернул 304 (браузерное условное кеширование)
            // Делаем повторный запрос с cache-bust, чтобы принудительно получить тело
            const bustUrl = `/api/betting/tours?ts=${Date.now()}`;
            const r2 = await fetch(bustUrl, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
            const data2 = await r2.json();
            const version2 = r2.headers.get('ETag') || null;
            writeToursCache({ data: data2, version: version2, ts: Date.now() });
            return { data: data2, version: version2 };
          }
          const data = await r.json();
          const version = r.headers.get('ETag') || null;
          writeToursCache({ data, version, ts: Date.now() });
          return { data, version };
        })
        .catch(() => { return cached || null; })
        .finally(() => { setTimeout(() => { __toursFetchPromise = null; }, 1000); });
      return __toursFetchPromise;
    } catch(_) { return Promise.resolve(null); }
  }

  // ================== B) Патч голосований после догрузки туров ==================
  function buildTourMatchKey(obj){ return matchKey(obj); }
  function computeTourMatchSet(cache){
    const s = new Set();
    try {
      const tours = cache?.data?.tours || cache?.tours || [];
      (tours||[]).forEach(t => (t.matches||[]).forEach(m => { const k=buildTourMatchKey(m); if(k) {s.add(k);} }));
    } catch(_) {}
    return s;
  }
  function patchScheduleVotes(pane){ /* no-op: голосование показываем только во вкладке «Прогнозы» */ }

  // Ранняя фоноваая инициализация при загрузке (не блокирует основной рендер)
  try { ensureBettingToursFresh().catch(()=>{}); } catch(_) {}

  // Фоновый опрос агрегатов голосования для непроголосовавших пользователей (каждые ~4s)
  function startVotePolling(){
    const INTERVAL = 4000; // 4 секунды (в заданном диапазоне 3-5)
    setInterval(() => {
      try {
        if (document.hidden) {return;}
        document.querySelectorAll('.vote-inline[data-votekey]').forEach(wrap => {
          try {
            const key = wrap.dataset.votekey;
            const st = MatchState.get(key);
            if (st && Date.now() - (st.lastAggTs||0) < 3500) {return;} // ещё свежо
            const home = wrap.dataset.home || '';
            const away = wrap.dataset.away || '';
            const date = wrap.dataset.date || '';
            // Не опрашиваем если пользователь уже голосовал (кнопок нет и confirm есть) реже? всё равно можно — нагрузка ограничена VoteAgg
            VoteAgg.fetchAgg(home, away, date).then(agg => {
              const segH = wrap.querySelector('.seg-h');
              const segD = wrap.querySelector('.seg-d');
              const segA = wrap.querySelector('.seg-a');
              if (!segH) {return;}
              // Серверные значения
              let h = Number(agg?.home||0), d = Number(agg?.draw||0), a = Number(agg?.away||0);
              let sum = Math.max(0, h+d+a);
              // Текущее локальное состояние (могло увеличиться оптимистично после клика)
              const st = MatchState.get(key);
              const sv = st && st.votes ? st.votes : null;
              const ssum = Math.max(0, (sv?.h||0)+(sv?.d||0)+(sv?.a||0));
              if (ssum > sum) {
                h = Number(sv?.h||0); d = Number(sv?.d||0); a = Number(sv?.a||0);
                sum = Math.max(1, h+d+a);
              } else {
                sum = Math.max(1, sum);
              }
              const ph = Math.round(h*100/sum), pd = Math.round(d*100/sum), pa = Math.round(a*100/sum);
              if (segH.style.width !== ph+'%') {segH.style.width = ph+'%';}
              if (segD.style.width !== pd+'%') {segD.style.width = pd+'%';}
              if (segA.style.width !== pa+'%') {segA.style.width = pa+'%';}
              MatchState.set(key, { votes:{ h,d,a,total:h+d+a }, lastAggTs: Date.now() });
            }).catch(()=>{});
          } catch(_) {}
        });
      } catch(_) {}
    }, INTERVAL);
  }
  if (!window.__VOTE_POLLING_STARTED__) { window.__VOTE_POLLING_STARTED__ = true; startVotePolling(); }
})();

// ========== WebSocket handler (subscribe to betting_tours updates) ==========
try {
  if (window.io && typeof window.io === 'function') {
    const socket = window.io();
    let socketConnected = false;
    let pollToursTimer = null;

    function startToursPolling() {
      try {
        if (pollToursTimer) {return;}
        pollToursTimer = setInterval(() => {
          try { ensureBettingToursFresh(); } catch(_) {}
        }, 4000);
      } catch(_) {}
    }
    function stopToursPolling() {
      try {
        if (pollToursTimer) { clearInterval(pollToursTimer); pollToursTimer = null; }
      } catch(_) {}
    }

    // If socket fails to connect within a short timeout, start polling as fallback
    const wsFallbackTimeout = setTimeout(() => {
      if (!socketConnected) {startToursPolling();}
    }, 1500);

    socket.on('connect', () => {
      try { socketConnected = true; clearTimeout(wsFallbackTimeout); stopToursPolling(); console.info('WS connected for live updates'); } catch(_) {}
    });
    socket.on('disconnect', () => { try { socketConnected = false; startToursPolling(); } catch(_) {} });
    socket.on('data_changed', msg => {
      try {
        if (!msg || msg.data_type !== 'betting_tours') {return;}
        // Сбрасываем локальный кэш и обновляем туры/расписание
        try { localStorage.removeItem('betting:tours'); } catch(_) {}
        try { window.League && window.League.refreshSchedule && window.League.refreshSchedule(); } catch(_) {}
        try { ensureBettingToursFresh(); } catch(_) {}
      } catch(_) {}
    });
  }
} catch(_) {}
