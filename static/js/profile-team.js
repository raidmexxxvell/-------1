// static/js/profile-team.js
// Экран команды: загрузка Overview по ETag и делегирование кликов из лиги.
(function(){
  if (window.TeamPage) { return; }

  function setUpdatedLabel(el, iso){
    try {
      if (!iso || !el) { return; }
      const prevIso = el.getAttribute('data-updated-iso');
      const prevTs = prevIso ? Date.parse(prevIso) : 0;
      const nextTs = Date.parse(iso);
      if (Number.isFinite(nextTs) && nextTs >= prevTs){
        el.setAttribute('data-updated-iso', iso);
        el.textContent = `Обновлено: ${new Date(iso).toLocaleString()}`;
      }
    } catch(_) {}
  }

  async function fetchOverview(teamName){
    const key = `team:overview:${(teamName||'').toLowerCase()}`;
    const { data, headerUpdatedAt } = await (window.fetchEtag||((u)=>fetch(u).then(r=>r.json().then(j=>({data:j})))))(
      `/api/team/overview`, {
        cacheKey: key,
        swrMs: 60_000,
        params: { name: teamName }
      }
    );
    return { data, headerUpdatedAt };
  }

  async function fetchRoster(teamName){
    const key = `team:roster:${(teamName||'').toLowerCase()}`;
    // In-memory cache для мгновенного повторного показа
    window.__teamRosterCache = window.__teamRosterCache || {};
    const cached = window.__teamRosterCache[key];
    const startFetch = (window.fetchEtag||((u)=>fetch(u).then(r=>r.json().then(j=>({data:j})))))(
      `/api/team/roster`, {
        cacheKey: key,
        swrMs: 60_000,
        params: { name: teamName }
      }
    );
    const p = startFetch.then(({data})=>{
      if(data && !data.error){ window.__teamRosterCache[key] = { ts: Date.now(), data }; }
      return data;
    });
    return cached ? Promise.resolve(cached.data) : p;
  }

  function renderRoster(host, payload){
    if(!host) { return; }
    host.innerHTML='';
    const list = Array.isArray(payload?.players)? payload.players: [];
  if(!list.length){ host.innerHTML = '<div style="padding:12px; color: var(--gray);">Состав пуст</div>'; return; }
    const table = document.createElement('table'); table.className='team-roster-table'; table.style.width='100%'; table.style.borderCollapse='collapse';
    const thead=document.createElement('thead'); const trh=document.createElement('tr');
    const headers=['Игрок','Голы','Пасы','ЖК','КК'];
    headers.forEach(h=>{ const th=document.createElement('th'); th.textContent=h; th.style.padding='6px 8px'; th.style.fontWeight='600'; th.style.fontSize='12px'; th.style.textAlign='left'; th.style.background='var(--surface-alt,rgba(255,255,255,0.05))'; th.style.borderBottom='1px solid rgba(255,255,255,0.15)'; trh.appendChild(th); });
    thead.appendChild(trh); table.appendChild(thead);
    const tbody=document.createElement('tbody');
    list.forEach(p=>{
      const tr=document.createElement('tr'); tr.style.borderBottom='1px solid rgba(255,255,255,0.07)';
      const full = `${p.first_name||''} ${p.last_name||''}`.trim();
      const cells=[full, p.goals??0, p.assists??0, (p.yellow_cards??0), (p.red_cards??0)];
      cells.forEach((c,i)=>{ const td=document.createElement('td'); td.style.padding='6px 8px'; td.style.fontSize='12px'; td.style.textAlign = i===0?'left':'center'; td.textContent=c; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody); host.appendChild(table);
  }

  function renderOverview(host, payload){
    if (!host) { return; }
    host.innerHTML = '';
    const stats = payload?.stats || { matches:0,wins:0,draws:0,losses:0,goals_for:0,goals_against:0,clean_sheets:0,last5:[] };

    // Раздел: Форма (2 последних матча)
    const section = document.createElement('div'); section.className = 'team-overview-section';
    const title = document.createElement('div'); title.className = 'section-title'; title.textContent = 'Форма';
    const form = document.createElement('div'); form.className = 'team-form';
  const last2 = Array.isArray(payload?.recent) && payload.recent.length ? payload.recent.slice(0,2) : (stats.last5||[]).slice(0,2);
    last2.forEach((r) => {
      const cell = document.createElement('div'); cell.className='form-cell';
      const dt = document.createElement('div'); dt.className='form-date';
      const item = document.createElement('div'); item.className='form-item';
      const logoWrap = document.createElement('div'); logoWrap.className='logo-wrap';
      const logo = document.createElement('img'); logo.className='logo'; logo.alt='';
      try {
        const oppName = (typeof r === 'object' && r && r.opponent) ? r.opponent : null;
        const logoTeam = oppName || (payload?.team?.name || '');
        (window.setTeamLogo||window.TeamUtils?.setTeamLogo)?.(logo, logoTeam);
      } catch(_) {}
      const scoreOverlay = document.createElement('div'); scoreOverlay.className='score-badge';
      const score = document.createElement('div'); score.className='score';
      const badge = document.createElement('div'); badge.className = 'badge';
      if (typeof r === 'string') {
        score.textContent = r==='W'?'3:2':(r==='D'?'1:1':'0:2');
        badge.className += ' ' + (r==='W'?'badge-win':(r==='D'?'badge-draw':'badge-loss'));
        badge.textContent = r;
        dt.textContent = '';
        scoreOverlay.textContent = score.textContent;
      } else {
        score.textContent = r?.score || '—';
        const rr = r?.result || 'D';
        badge.className += ' ' + (rr==='W'?'badge-win':(rr==='D'?'badge-draw':'badge-loss'));
        badge.textContent = rr;
        try { dt.textContent = r?.date ? new Date(r.date).toLocaleDateString() : ''; } catch(_) { dt.textContent = ''; }
        scoreOverlay.textContent = r?.score || '';
      }
      logoWrap.append(logo, scoreOverlay);
      item.append(logoWrap, score, badge);
      cell.append(dt, item);
      form.appendChild(cell);
    });
    section.append(title, form);

    // Статистика: сводная карта + мини-карточки
  const statsWrap = document.createElement('div'); statsWrap.className='stats-wrap';
  // Заголовок блока статистики (как на эталонном макете)
  const statsTitle = document.createElement('div'); statsTitle.className='stats-title'; statsTitle.textContent='Статистика';
  const summary = document.createElement('div'); summary.className='stat-summary';
    const left = document.createElement('div'); left.className='summary-left';
    // Полукруг (SVG) с тремя сегментами W/D/L + tooltip
    const gauge = document.createElement('div'); gauge.className='gauge';
    const total = Math.max(0, stats.matches||0);
    const w = Math.max(0, stats.wins||0);
    const d = Math.max(0, stats.draws||0);
    const l = Math.max(0, stats.losses||0);
    let wn=w, dn=d, ln=l, sum = w+d+l;
  if (total && sum && sum !== total){ const k= total/sum; wn=w*k; dn=d*k; ln=l*k; }
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width','140'); svg.setAttribute('height','60'); svg.setAttribute('viewBox','0 0 140 70');
  const centerX=70, centerY=65, radius=58; // центр чуть ниже, чтобы дуга компактно вписывалась
    // Фон-трек
    const track = document.createElementNS('http://www.w3.org/2000/svg','path');
    track.setAttribute('d', describeArc(centerX, centerY, radius, 180, 0));
    track.setAttribute('class','track');
  svg.appendChild(track);
    // Подготовка сегментов
  const segments = [];
  if (wn>0) { segments.push({label:'Победы', short:'W', value:w, adj:wn, colorClass:'seg-win'}); }
  if (dn>0) { segments.push({label:'Ничьи', short:'D', value:d, adj:dn, colorClass:'seg-draw'}); }
  if (ln>0) { segments.push({label:'Поражения', short:'L', value:l, adj:ln, colorClass:'seg-loss'}); }
    const usableAngle = 180;
    const gapDeg = segments.length>1 ? 4 : 0; // межсегментный визуальный зазор
    const totalGap = gapDeg * (segments.length - 1);
    const scale = usableAngle - totalGap;
    let cursor = 180; // старт слева
    segments.forEach((seg, idx) => {
      const raw = total? (seg.adj/total)*scale : 0;
      const startAngle = cursor;
      const endAngle = startAngle - raw; // двигаемся к 0
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      const innerGap = gapDeg && idx < segments.length-1 ? gapDeg : 0;
      // Для аккуратных закруглений слегка уменьшаем дугу
      const pad = raw>4 ? 1.5 : 0; // не убивать совсем короткие
      const realStart = startAngle - pad;
      const realEnd = endAngle + pad;
      path.setAttribute('d', describeArc(centerX, centerY, radius, realStart, realEnd));
      path.setAttribute('class','segment '+seg.colorClass);
      const pct = total? (seg.value/total*100) : 0;
      path.dataset.tooltip = `${seg.label}: ${seg.value} (${pct.toFixed(1)}%)`;
      svg.appendChild(path);
      cursor = endAngle - innerGap; // смещаем, учитывая gap
    });
    // Tooltip
    const tip = document.createElement('div'); tip.className='gauge-tooltip'; tip.style.opacity='0';
    gauge.append(svg, tip);
    // Текст по центру
  const gText = document.createElement('div'); gText.className='gauge-text';
  const gVal = document.createElement('div'); gVal.className='gauge-value'; gVal.textContent = String(total);
    const pluralMatches = (n)=>{
      n=Math.abs(n||0);
      if(n%10===1&&n%100!==11){ return 'матч'; }
      if([2,3,4].includes(n%10)&&![12,13,14].includes(n%100)) { return 'матча'; }
      return 'матчей';
    };
  const gLab = document.createElement('div'); gLab.className='gauge-label'; gLab.textContent = pluralMatches(total);
  gText.append(gVal, gLab);
  gauge.append(gText);
    // Наведение: показываем tooltip
    svg.addEventListener('mousemove', (e)=>{
      const target = e.target.closest('.segment');
      if (target){
        tip.textContent = target.dataset.tooltip||'';
        tip.style.opacity='1';
        const rect = gauge.getBoundingClientRect();
        tip.style.left = (e.clientX - rect.left) + 'px';
        tip.style.top = (e.clientY - rect.top - 12) + 'px';
      } else {
        tip.style.opacity='0';
      }
    });
  svg.addEventListener('mouseleave', ()=>{ tip.style.opacity='0'; });
    left.appendChild(gauge);
    // Функция описания дуги (startAngle -> endAngle, углы в градусах, 0° справа, растёт по часовой стрелке)
    function describeArc(cx, cy, r, startAngle, endAngle){
      // Рисуем по часовой стрелке (sweep=1) чтобы визуально шло слева направо сверху
      const start = polar(cx, cy, r, startAngle);
      const end = polar(cx, cy, r, endAngle);
      const large = Math.abs(startAngle - endAngle) > 180 ? 1 : 0;
      const sweep = 1; // по часовой
      return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} ${sweep} ${end.x} ${end.y}`;
    }
    function polar(cx, cy, r, deg){
      const rad = (Math.PI/180)*deg;
      return { x: cx + r*Math.cos(rad), y: cy + r*Math.sin(rad) };
    }
    const right = document.createElement('div'); right.className='summary-right';
    const ul = document.createElement('div'); ul.className='summary-list';
    const row = (label, value)=>{ const d=document.createElement('div'); d.innerHTML=`<span class="dot"></span>${label}: <b>${value}</b>`; return d; };
    ul.append(row('Победы', stats.wins||0), row('Ничьи', stats.draws||0), row('Поражения', stats.losses||0));
    right.appendChild(ul);
    summary.append(left, right);

    const mini = document.createElement('div'); mini.className='mini-grid';
    const m = (icon, val, label)=>{
      const d=document.createElement('div'); d.className='mini-card';
      const i=document.createElement('img'); i.className='icon'; i.src=icon; i.alt='';
      i.onerror = () => { try { i.onerror=null; i.src='/static/img/icons/goal.png'; } catch(_) {} };
      const w=document.createElement('div');
      const v=document.createElement('div'); v.className='mval'; v.textContent=String(val);
      const l=document.createElement('div'); l.className='mlabel'; l.textContent=label; w.append(v,l);
      d.append(i,w); return d;
    };
    mini.append(
      m('/static/img/icons/trophy.svg', payload?.tournaments || 0, 'Турниры'),
      m('/static/img/icons/goal.png', stats.goals_for||0, 'Забито'),
      m('/static/img/icons/goal.png', stats.goals_against||0, 'Пропущено'),
      m('/static/img/icons/yellow.png', (payload?.cards && payload.cards.yellow) ? payload.cards.yellow : 0, 'Жёлтых'),
      m('/static/img/icons/red.png', (payload?.cards && payload.cards.red) ? payload.cards.red : 0, 'Красных'),
      m('/static/img/icons/clean-sheet.svg', stats.clean_sheets||0, 'На «0»')
    );

    statsWrap.append(statsTitle, summary, mini);
    host.append(section, statsWrap);

    // (раньше здесь подгружался глобальный лидерборд, но по требованиям на странице команды
    // статистика игроков не должна отображаться — логика перенесена в общий раздел Лига→Статистика)
  }

  async function openTeam(teamName){
    if (!teamName) { return; }
    try { document.getElementById('ufo-schedule')?.setAttribute('aria-hidden','true'); } catch(_) {}
    const pane = document.getElementById('ufo-team');
    const subtabs = document.getElementById('ufo-subtabs');
    const nameEl = document.getElementById('team-name');
    const title = document.getElementById('team-title');
    const logo = document.getElementById('team-logo');
    const ov = document.getElementById('team-pane-overview');
  if (!pane || !nameEl || !title) { return; }
    // Показать экран
    const sched = document.getElementById('ufo-schedule');
    const res = document.getElementById('ufo-results');
    const table = document.getElementById('ufo-table');
    const stats = document.getElementById('ufo-stats');
  const mdPane = document.getElementById('ufo-match-details');
    [sched,res,table,stats].forEach(el=>{ if (el) { el.style.display='none'; } });
  if (mdPane) { mdPane.style.display='none'; }
    if (subtabs) { subtabs.style.display = 'none'; }
    pane.style.display = '';
    nameEl.textContent = teamName;
    title.textContent = 'Команда';
    try { (window.setTeamLogo||window.TeamUtils?.setTeamLogo)?.(logo, teamName); } catch(_) {}
    // Активная вкладка — «Обзор»
    try {
      const tabs = document.querySelectorAll('#team-subtabs .subtab-item');
      tabs.forEach(t=>{ t.classList.remove('active'); });
      const ovBtn = document.querySelector('#team-subtabs .subtab-item[data-ttab="overview"]');
      ovBtn?.classList.add('active');
      document.getElementById('team-pane-overview')?.setAttribute('style','');
      document.getElementById('team-pane-matches')?.setAttribute('style','display:none;');
      document.getElementById('team-pane-roster')?.setAttribute('style','display:none;');
    } catch(_) {}
    // Загрузка Overview
    ov.innerHTML = '<div style="padding:12px; color: var(--gray);">Загружаю...</div>';
    try {
      const { data, headerUpdatedAt } = await fetchOverview(teamName);
      renderOverview(ov, data);
      const upd = document.getElementById('league-updated-text');
      if (upd && (data?.updated_at || headerUpdatedAt)) { setUpdatedLabel(upd, data?.updated_at || headerUpdatedAt); }
  } catch(_e){ ov.innerHTML = '<div style="padding:12px; color: var(--danger);">Не удалось загрузить</div>'; }
  }

  function attachDelegation(){
    // Делегирование клика: имя или логотип команды (любой элемент с data-team-name)
    document.addEventListener('click', (e) => {
      try {
        const el = e.target.closest?.('[data-team-name]');
        if (el){
          const name = el.getAttribute('data-team-name') || el.textContent || '';
          if (name){
            // Запомним контекст возврата: из матча или из вкладки UFO (table/schedule/results/stats)
            const mdPane = document.getElementById('ufo-match-details');
            const fromMatch = mdPane && mdPane.style.display !== 'none';
            if (fromMatch){
              window.__TEAM_BACK_CTX__ = { from: 'match' };
            } else {
              const activeSub = document.querySelector('#ufo-subtabs .subtab-item.active');
              const subKey = activeSub ? (activeSub.getAttribute('data-subtab')||'table') : 'table';
              window.__TEAM_BACK_CTX__ = { from: 'ufo', subtab: subKey };
            }
            e.preventDefault(); e.stopPropagation();
            // Если мы не на вкладке «Лига», переключимся на неё прежде чем открыть экран команды
            const ufoTab = document.getElementById('tab-ufo');
            const isUfoVisible = ufoTab && ufoTab.style.display !== 'none';
            if (!isUfoVisible){
              try { document.querySelector('.nav-item[data-tab="ufo"]').click(); } catch(_) {}
              setTimeout(() => { try { openTeam(name.trim()); } catch(_) {} }, 30);
            } else {
              openTeam(name.trim());
            }
          }
        }
      } catch(_) {}
    }, true);
    // Назад
    document.getElementById('team-back')?.addEventListener('click', () => {
      const pane = document.getElementById('ufo-team');
      if (pane) { pane.style.display = 'none'; }
      const ctx = window.__TEAM_BACK_CTX__ || { from: 'ufo', subtab: 'table' };
      // Возврат к источнику
      if (ctx.from === 'match'){
        // Вернуть экран деталей матча (subtabs оставляем скрытыми)
        try {
          const mdPane = document.getElementById('ufo-match-details');
          if (mdPane) { mdPane.style.display = ''; }
          const sched = document.getElementById('ufo-schedule'); if (sched) { sched.style.display='none'; }
          const res = document.getElementById('ufo-results'); if (res) { res.style.display='none'; }
          const table = document.getElementById('ufo-table'); if (table) { table.style.display='none'; }
          const stats = document.getElementById('ufo-stats'); if (stats) { stats.style.display='none'; }
          const subtabs = document.getElementById('ufo-subtabs'); if (subtabs) { subtabs.style.display='none'; }
        } catch(_) {}
      } else {
        // Вернуть соответствующую подвкладку UFO
        try {
          const subtabs = document.getElementById('ufo-subtabs'); if (subtabs) { subtabs.style.display=''; }
          const target = document.querySelector(`#ufo-subtabs .subtab-item[data-subtab="${ctx.subtab||'table'}"]`)
                        || document.querySelector('#ufo-subtabs .subtab-item[data-subtab="table"]');
          target?.click();
        } catch(_) {}
      }
      window.__TEAM_BACK_CTX__ = null;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    // Переключение сабвкладок внутри экрана команды
    const teamTabs = document.querySelectorAll('#team-subtabs .subtab-item');
    teamTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        teamTabs.forEach(b => { b.classList.remove('active'); }); btn.classList.add('active');
        const key = btn.getAttribute('data-ttab');
        const ov = document.getElementById('team-pane-overview');
        const mt = document.getElementById('team-pane-matches');
        const rs = document.getElementById('team-pane-roster');
        if (key === 'overview'){ ov.style.display=''; mt.style.display='none'; rs.style.display='none'; }
        else if (key === 'matches'){ ov.style.display='none'; mt.style.display=''; rs.style.display='none'; }
        else {
          ov.style.display='none'; mt.style.display='none'; rs.style.display='';
          // Lazy load roster один раз
          if(!rs.getAttribute('data-loaded')){
            rs.innerHTML = '<div style="padding:12px; color: var(--gray);">Загружаю состав...</div>';
            const teamName = (document.getElementById('team-name')||{}).textContent || '';
            fetchRoster(teamName).then(data=>{
              if(data && !data.error){ renderRoster(rs, data); rs.setAttribute('data-loaded','1'); }
              else { rs.innerHTML = '<div style="padding:12px; color: var(--danger);">Не удалось загрузить</div>'; }
              // SWR refresh параллельно (второй вызов fetchRoster отдаст cache сразу)
              setTimeout(()=>{ fetchRoster(teamName).then(fresh=>{ if(fresh && !fresh.error) { renderRoster(rs,fresh); } }); }, 10);
            }).catch(()=>{ rs.innerHTML = '<div style="padding:12px; color: var(--danger);">Ошибка загрузки</div>'; });
          }
        }
      });
    });
  }

  attachDelegation();
  window.TeamPage = { openTeam };
})();
