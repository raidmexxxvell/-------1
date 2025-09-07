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
    const wrap = document.createElement('div');
    wrap.style.display = 'grid'; wrap.style.gridTemplateColumns = 'repeat(3,1fr)'; wrap.style.gap = '10px'; wrap.style.padding = '10px';
    const card = (label, value) => { const d=document.createElement('div'); d.className='stat-card'; d.innerHTML = `<div class="stat-value">${value}</div><div class="stat-label">${label}</div>`; return d; };
    wrap.append(
      card('Матчей', stats.matches||0),
      card('Побед', stats.wins||0),
      card('Ничьих', stats.draws||0),
      card('Поражений', stats.losses||0),
      card('Голы (заб.)', stats.goals_for||0),
      card('Голы (проп.)', stats.goals_against||0),
      card('Сухие', stats.clean_sheets||0)
    );
    const last = document.createElement('div'); last.style.padding='10px'; last.style.color='var(--gray)';
    const seq = (stats.last5||[]).slice().join(' · ');
    last.textContent = `Последние 5: ${seq || '—'}`;
    host.append(wrap, last);
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
    [sched,res,table,stats].forEach(el=>{ if (el) el.style.display='none'; });
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
    // Делегирование клика от карточек матчей (расписание/результаты)
    document.addEventListener('click', (e) => {
      try {
        const el = e.target.closest?.('.team-name[data-team-name]');
        if (el){
          const name = el.getAttribute('data-team-name') || el.textContent || '';
          if (name){ e.preventDefault(); e.stopPropagation(); openTeam(name.trim()); }
        }
      } catch(_) {}
    }, true);
    // Назад
    document.getElementById('team-back')?.addEventListener('click', () => {
      const pane = document.getElementById('ufo-team');
      const subtabs = document.getElementById('ufo-subtabs');
      if (pane) pane.style.display = 'none';
      if (subtabs) subtabs.style.display = '';
      // Вернёмся в таблицу по умолчанию
      try { document.querySelector('#ufo-subtabs .subtab-item[data-subtab="table"]').click(); } catch(_) {}
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
