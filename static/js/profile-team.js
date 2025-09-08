// static/js/profile-team.js
// Экран команды: загрузка Overview по ETag и делегирование кликов из лиги.
(function(){
  if (window.TeamPage) return;

  function setUpdatedLabel(el, iso){
    try {
      if (!iso || !el) return;
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

  function renderOverview(host, payload){
    if (!host) return;
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
      try { (window.setTeamLogo||window.TeamUtils?.setTeamLogo)?.(logo, payload?.team?.name || ''); } catch(_) {}
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
    const summary = document.createElement('div'); summary.className='stat-summary';
    const left = document.createElement('div'); left.className='summary-left';
    const gauge = document.createElement('div'); gauge.className='gauge'; gauge.style.setProperty('--pct', Math.max(0, Math.min(100, (stats.matches||0))));
    const gText = document.createElement('div'); gText.className='gauge-text';
    const gVal = document.createElement('div'); gVal.className='gauge-value'; gVal.textContent = String(stats.matches||0);
    const gLab = document.createElement('div'); gLab.className='gauge-label'; gLab.textContent = 'матч';
    gText.append(gVal, gLab); gauge.appendChild(gText); left.appendChild(gauge);
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

    statsWrap.append(summary, mini);
    host.append(section, statsWrap);
  }

  async function openTeam(teamName){
    if (!teamName) return;
    try { document.getElementById('ufo-schedule')?.setAttribute('aria-hidden','true'); } catch(_) {}
    const pane = document.getElementById('ufo-team');
    const subtabs = document.getElementById('ufo-subtabs');
    const nameEl = document.getElementById('team-name');
    const title = document.getElementById('team-title');
    const logo = document.getElementById('team-logo');
    const ov = document.getElementById('team-pane-overview');
    if (!pane || !nameEl || !title) return;
    // Показать экран
    const sched = document.getElementById('ufo-schedule');
    const res = document.getElementById('ufo-results');
    const table = document.getElementById('ufo-table');
    const stats = document.getElementById('ufo-stats');
  const mdPane = document.getElementById('ufo-match-details');
    [sched,res,table,stats].forEach(el=>{ if (el) el.style.display='none'; });
  if (mdPane) mdPane.style.display='none';
    if (subtabs) subtabs.style.display = 'none';
    pane.style.display = '';
    nameEl.textContent = teamName;
    title.textContent = 'Команда';
    try { (window.setTeamLogo||window.TeamUtils?.setTeamLogo)?.(logo, teamName); } catch(_) {}
    // Активная вкладка — «Обзор»
    try {
      const tabs = document.querySelectorAll('#team-subtabs .subtab-item');
      tabs.forEach(t=>t.classList.remove('active'));
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
      if (upd && (data?.updated_at || headerUpdatedAt)) setUpdatedLabel(upd, data?.updated_at || headerUpdatedAt);
    } catch(e){ ov.innerHTML = '<div style="padding:12px; color: var(--danger);">Не удалось загрузить</div>'; }
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
      if (pane) pane.style.display = 'none';
      const ctx = window.__TEAM_BACK_CTX__ || { from: 'ufo', subtab: 'table' };
      // Возврат к источнику
      if (ctx.from === 'match'){
        // Вернуть экран деталей матча (subtabs оставляем скрытыми)
        try {
          const mdPane = document.getElementById('ufo-match-details');
          if (mdPane) mdPane.style.display = '';
          const sched = document.getElementById('ufo-schedule'); if (sched) sched.style.display='none';
          const res = document.getElementById('ufo-results'); if (res) res.style.display='none';
          const table = document.getElementById('ufo-table'); if (table) table.style.display='none';
          const stats = document.getElementById('ufo-stats'); if (stats) stats.style.display='none';
          const subtabs = document.getElementById('ufo-subtabs'); if (subtabs) subtabs.style.display='none';
        } catch(_) {}
      } else {
        // Вернуть соответствующую подвкладку UFO
        try {
          const subtabs = document.getElementById('ufo-subtabs'); if (subtabs) subtabs.style.display='';
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
        teamTabs.forEach(b => b.classList.remove('active')); btn.classList.add('active');
        const key = btn.getAttribute('data-ttab');
        const ov = document.getElementById('team-pane-overview');
        const mt = document.getElementById('team-pane-matches');
        const rs = document.getElementById('team-pane-roster');
        if (key === 'overview'){ ov.style.display=''; mt.style.display='none'; rs.style.display='none'; }
        else if (key === 'matches'){ ov.style.display='none'; mt.style.display=''; rs.style.display='none'; }
        else { ov.style.display='none'; mt.style.display='none'; rs.style.display=''; }
      });
    });
  }

  attachDelegation();
  window.TeamPage = { openTeam };
})();
