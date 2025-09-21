// static/js/admin-enhanced.js
// Enhanced admin module with lineup management
(function(){
  // Toast system
  function ensureToastContainer(){
    if(document.getElementById('toast-container')) {return;}
    const c=document.createElement('div');
    c.id='toast-container';
    c.style.position='fixed';
    c.style.top='12px';
    c.style.right='12px';
    c.style.zIndex='9999';
    c.style.display='flex';
    c.style.flexDirection='column';
    c.style.gap='8px';
    c.style.pointerEvents='none';
    document.addEventListener('DOMContentLoaded',()=>{ document.body.appendChild(c); });
  }
  // Teams management functions
  let currentTeamId = null;
  let allTeams = [];

  async function loadTeams() {
    try {
      const response = await fetch('/api/admin/teams');
      const result = await response.json();
      
      if (response.ok) {
        allTeams = result.teams || [];
        displayTeams(allTeams);
        showToast(`Загружено ${allTeams.length} команд`, 'success');
      } else {
        showToast(`Ошибка загрузки команд: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('Load teams error:', error);
      showToast('Ошибка соединения при загрузке команд', 'error');
    }
  }

  function displayTeams(teams) {
    const tbody = document.getElementById('teams-table');
    if (!tbody) {return;}
    
    tbody.innerHTML = '';
    
    teams.forEach(team => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>
          <div class="team-info">
            ${team.logo_url ? `<img src="${team.logo_url}" alt="${team.name}" class="team-logo-small">` : ''}
            <span>${team.name}</span>
          </div>
        </td>
        <td>${team.city || '-'}</td>
        <td>
          ${team.logo_url ? '<span class="status-badge status-yes">Есть</span>' : '<span class="status-badge status-no">Нет</span>'}
        </td>
        <td>
          <span class="status-badge ${team.is_active ? 'status-active' : 'status-inactive'}">
            ${team.is_active ? 'Активна' : 'Неактивна'}
          </span>
        </td>
        <td>
          <button class="btn-small btn-edit" onclick="window.AdminEnhanced.editTeam(${team.id})">Редактировать</button>
          <button class="btn-small btn-delete" onclick="window.AdminEnhanced.deleteTeam(${team.id}, '${team.name}')">Удалить</button>
          <button class="btn-small btn-secondary" onclick="window.AdminEnhanced.openTeamRoster(${team.id}, '${team.name.replace(/'/g, "\\'")}')">Состав</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  }

  function filterTeams() {
    const searchTerm = document.getElementById('team-search').value.toLowerCase();
    const filteredTeams = allTeams.filter(team => 
      team.name.toLowerCase().includes(searchTerm) ||
      (team.city && team.city.toLowerCase().includes(searchTerm))
    );
    displayTeams(filteredTeams);
  }

  function openTeamModal(teamId = null) {
    const modal = document.getElementById('team-modal');
    const title = document.getElementById('team-modal-title');
    const form = document.getElementById('team-form');
    const nameEl = document.getElementById('team-name');
    const cityEl = document.getElementById('team-city');
    const foundedEl = document.getElementById('team-founded-year');
    const logoEl = document.getElementById('team-logo-url');
    const descEl = document.getElementById('team-description');

    if (!modal || !title || !form) {return;}

    currentTeamId = teamId;

    if (teamId) {
      title.textContent = 'Редактировать команду';
      const team = allTeams.find(t => t.id === teamId);
      if (team) {
        if (nameEl) {nameEl.value = team.name || '';}
        if (cityEl) {cityEl.value = team.city || '';}
        if (foundedEl) {foundedEl.value = team.founded_year || '';}
        if (logoEl) {logoEl.value = team.logo_url || '';}
        if (descEl) {descEl.value = team.description || '';}
      }
    } else {
      title.textContent = 'Добавить команду';
      if (form) {form.reset();}
    }

    modal.style.display = 'flex';
  }

  function closeTeamModal() {
    const modal = document.getElementById('team-modal');
    if (modal) {modal.style.display = 'none';}
  }

  async function saveTeam(e) {
    if (e && e.preventDefault) {e.preventDefault();}
    const name = document.getElementById('team-name')?.value.trim();
    const city = document.getElementById('team-city')?.value.trim();
    const founded_year = parseInt(document.getElementById('team-founded-year')?.value || '0', 10) || null;
    const logo_url = document.getElementById('team-logo-url')?.value.trim();
    const description = document.getElementById('team-description')?.value.trim();

    if (!name) { showToast('Введите название команды','error'); return; }

    const payload = { name, city, founded_year, logo_url, description };
    const initData = window.Telegram?.WebApp?.initData || '';
    const method = currentTeamId ? 'PUT' : 'POST';
    const url = currentTeamId ? `/api/admin/teams/${currentTeamId}` : '/api/admin/teams';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, ...payload })
      });
      const data = await res.json();
      if (!res.ok || data.error) {throw new Error(data.error || 'Ошибка сохранения');}
      showToast(currentTeamId ? 'Команда обновлена' : 'Команда добавлена', 'success');
      closeTeamModal();
      loadTeams();
    } catch (err) {
      console.error('saveTeam error', err);
      showToast('Не удалось сохранить команду: ' + err.message, 'error');
    }
  }

  function editTeam(teamId) { openTeamModal(teamId); }

  async function deleteTeam(teamId, name) {
    // Проверка feature flag для опасной операции
    if (window.AdminFeatureFlags && !window.AdminFeatureFlags.isDangerousOperationAllowed('feature:admin:team_delete')) {
      const enable = window.AdminFeatureFlags.enableDangerousOperation(
        'feature:admin:team_delete',
        'Удаление команды из системы'
      );
      if (!enable) {
        showToast('Операция заблокирована feature flag: feature:admin:team_delete', 'warning');
        return;
      }
    }

    if (!confirm(`Удалить команду "${name}"?`)) {return;}
    try {
      const res = await fetch(`/api/admin/teams/${teamId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: window.Telegram?.WebApp?.initData || '' })
      });
      const data = await res.json();
      if (!res.ok || data.error) {throw new Error(data.error || 'Ошибка удаления');}
      showToast('Команда удалена', 'success');
      loadTeams();
    } catch (err) {
      console.error('deleteTeam error', err);
      showToast('Не удалось удалить команду: ' + err.message, 'error');
    }
  }

  async function openTeamRoster(teamId, teamName){
    const modal = document.getElementById('team-roster-modal');
    const title = document.getElementById('team-roster-title');
    const status = document.getElementById('team-roster-status');
    const tbody = document.getElementById('team-roster-table');
    if (!modal || !tbody) {return;}
    if (title) {title.textContent = `Состав команды: ${teamName}`;}
    if (status){ status.style.display='block'; status.textContent='Загрузка состава...'; }
    tbody.innerHTML = '';
    try{
      const res = await fetch(`/api/admin/teams/${teamId}/roster`);
      const data = await res.json();
      if(!res.ok || data.error) {throw new Error(data.error||'Ошибка загрузки состава');}
      // API возвращает players (динамические team_stats_<id>), поддержим также старый ключ roster на всякий случай
      const list = data.players || data.roster || [];
      list.forEach((p, idx)=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${idx+1}</td>
          <td>${p.first_name||''}</td>
          <td>${p.last_name||''}</td>
          <td>${p.goals ?? 0}</td>
          <td>${p.assists ?? 0}</td>
          <td>${(p.yellow_cards ?? p.yellow) ?? 0}</td>
          <td>${(p.red_cards ?? p.red) ?? 0}</td>`;
        tbody.appendChild(tr);
      });
      if(status){ status.textContent = list.length? '' : 'Состав пуст'; if(!list.length) {status.className='status-text';} }
    }catch(e){
      console.error('openTeamRoster error', e);
      if(status){ status.textContent = 'Ошибка загрузки состава: '+e.message; status.className='status-text'; }
    }
    modal.style.display='flex';
  }

  function closeTeamRoster(){
    const modal = document.getElementById('team-roster-modal');
    if(modal) {modal.style.display='none';}
  }

    // Teams management buttons
    const addNewTeamBtn = document.getElementById('add-new-team-btn');
    if (addNewTeamBtn) {
      addNewTeamBtn.addEventListener('click', () => openTeamModal());
    }

    const refreshTeamsBtn = document.getElementById('refresh-teams-btn');
    if (refreshTeamsBtn) {
      refreshTeamsBtn.addEventListener('click', loadTeams);
    }

    const teamSearch = document.getElementById('team-search');
    if (teamSearch) {
      teamSearch.addEventListener('input', debounce(() => filterTeams(), 300));
    }

    const teamForm = document.getElementById('team-form');
    if (teamForm) {
      teamForm.addEventListener('submit', saveTeam);
    }

  function showToast(msg,type='info',timeout=3000){
    try { ensureToastContainer(); const c=document.getElementById('toast-container'); if(!c) {return;} const box=document.createElement('div'); box.textContent=msg; box.style.pointerEvents='auto'; box.style.padding='10px 14px'; box.style.borderRadius='8px'; box.style.fontSize='13px'; box.style.maxWidth='340px'; box.style.lineHeight='1.35'; box.style.fontFamily='inherit'; box.style.color='#fff'; box.style.background= type==='error'? 'linear-gradient(135deg,#d9534f,#b52a25)': (type==='success'? 'linear-gradient(135deg,#28a745,#1e7e34)': 'linear-gradient(135deg,#444,#222)'); box.style.boxShadow='0 4px 12px rgba(0,0,0,0.35)'; box.style.opacity='0'; box.style.transform='translateY(-6px)'; box.style.transition='opacity .25s ease, transform .25s ease'; const close=document.createElement('span'); close.textContent='×'; close.style.marginLeft='8px'; close.style.cursor='pointer'; close.style.fontWeight='600'; close.onclick=()=>{ box.style.opacity='0'; box.style.transform='translateY(-6px)'; setTimeout(()=>box.remove(),220); }; const wrap=document.createElement('div'); wrap.style.display='flex'; wrap.style.alignItems='flex-start'; wrap.style.justifyContent='space-between'; wrap.style.gap='6px'; const textSpan=document.createElement('span'); textSpan.style.flex='1'; textSpan.textContent=msg; wrap.append(textSpan,close); box.innerHTML=''; box.appendChild(wrap); c.appendChild(box); requestAnimationFrame(()=>{ box.style.opacity='1'; box.style.transform='translateY(0)'; }); if(timeout>0){ setTimeout(()=>close.click(), timeout); } } catch(e){ console.warn('toast fail',e); }
  }
  window.showToast = showToast;
  ensureToastContainer();
  
  // Global variables for lineup management
  let currentMatchId = null;
  let currentLineups = { home: { main: [] }, away: { main: [] } };

  // Initialize admin dashboard
  function initAdminDashboard() {
    console.log('[Admin] Initializing enhanced admin dashboard');
    
    // Set up tab switching
    setupTabSwitching();
    
    // Set up event listeners
    setupEventListeners();
    
    // Set up data repair listeners
    setupDataRepairListeners();
    
    // Load initial data
    loadMatches();
  }

  function setupTabSwitching() {
    const tabs = document.querySelectorAll('#admin-subtabs .subtab-item');
    const panes = {
      'matches': document.getElementById('admin-pane-matches'),
  'teams': document.getElementById('admin-pane-teams'),
      'players': document.getElementById('admin-pane-players'),
      'news': document.getElementById('admin-pane-news'),
      'service': document.getElementById('admin-pane-service'),
      'stats': document.getElementById('admin-pane-stats'),
      'logs': document.getElementById('admin-pane-logs')
    };
    
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetPane = tab.getAttribute('data-atab');
        
        // Update active tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Show/hide panes
        Object.keys(panes).forEach(key => {
          if (panes[key]) {
            panes[key].style.display = key === targetPane ? 'block' : 'none';
          }
        });
        
        // Load data for active pane
        if (targetPane === 'matches') {
        } else if (targetPane === 'teams') {
          loadTeams();
          loadMatches();
        } else if (targetPane === 'players') {
          loadPlayers();
        } else if (targetPane === 'news') {
          loadNews();
        } else if (targetPane === 'stats') {
          loadStats();
        } else if (targetPane === 'logs') {
          loadAdminLogs();
        }
      });
    });
  }

  function setupEventListeners() {
    // Matches refresh button
    const refreshBtn = document.getElementById('admin-matches-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadMatches);
    }

    // Save lineups button
    const saveBtn = document.getElementById('save-lineups-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', saveLineups);
    }

    // Add player button
    const addPlayerBtn = document.getElementById('add-new-player-btn');
    if (addPlayerBtn) {
      addPlayerBtn.addEventListener('click', () => openPlayerModal());
    }

    // Add news button
    const addNewsBtn = document.getElementById('add-new-news-btn');
    if (addNewsBtn) {
      addNewsBtn.addEventListener('click', () => openNewsModal());
    }

    // Service buttons
    const refreshAllBtn = document.getElementById('admin-refresh-all');
    if (refreshAllBtn) {
      refreshAllBtn.addEventListener('click', refreshAllData);
    }

    // Health sync viewer
    const healthSyncBtn = document.getElementById('admin-health-sync-refresh');
    if (healthSyncBtn) {
      healthSyncBtn.addEventListener('click', () => {
        const out = document.getElementById('admin-health-sync-view');
        if (out) {out.textContent = 'Загрузка...';}
        fetch('/health/sync', { cache: 'no-store' })
          .then(r => r.json().then(d => ({ ok: r.ok, d })))
          .then(res => {
            if (!res.ok) {throw new Error('HTTP ' + (res.d?.status || r.status));}
            if (out) {out.textContent = JSON.stringify(res.d, null, 2);}
          })
          .catch(err => {
            if (out) {out.textContent = 'Ошибка загрузки: ' + (err && err.message || String(err));}
          });
      });
      // auto-load once
      try { healthSyncBtn.click(); } catch(_) {}
    }

    // Season controls
    const btnGenSoft = document.getElementById('admin-season-generate-soft');
    if (btnGenSoft) {
      btnGenSoft.addEventListener('click', () => generateSeason('soft_start'));
    }
    const btnGenFull = document.getElementById('admin-season-generate-full');
    if (btnGenFull) {
      btnGenFull.addEventListener('click', () => generateSeason('full_reset'));
    }
    const btnSeasonDry = document.getElementById('admin-season-dry');
    if (btnSeasonDry) {
      btnSeasonDry.addEventListener('click', () => seasonRollover('dry'));
    }
    const btnSeasonSoft = document.getElementById('admin-season-soft');
    if (btnSeasonSoft) {
      btnSeasonSoft.addEventListener('click', () => seasonRollover('soft'));
    }
    const btnSeasonRoll = document.getElementById('admin-season-roll');
    if (btnSeasonRoll) {
      btnSeasonRoll.addEventListener('click', () => seasonRollover('full'));
    }
    const btnSeasonRollback = document.getElementById('admin-season-rollback');
    if (btnSeasonRollback) {
      btnSeasonRollback.addEventListener('click', () => seasonRollback());
    }
    const btnApplySeason = document.getElementById('apply-season-btn');
    if (btnApplySeason) {
      btnApplySeason.addEventListener('click', () => applySelectedSeason());
    }
    // Update helper label for season to be created
    const startInput = document.getElementById('season-generate-date');
    if (startInput) {
      const labelEl = document.getElementById('season-generate-label');
      const update = () => { if (labelEl) {labelEl.textContent = 'Будет создан сезон: ' + computeSeasonLabelFromDate(startInput.value);} };
      startInput.addEventListener('input', update);
      update();
    }
    // Fill seasons picker initially (if exists)
    try { loadSeasonsIntoPicker(true); } catch(_) {}

    // Logs: refresh button
    const logsRefreshBtn = document.getElementById('admin-logs-refresh');
    if (logsRefreshBtn) {
      logsRefreshBtn.addEventListener('click', () => loadAdminLogs(1));
    }

    // Logs: clear filters button
    const logsClearBtn = document.getElementById('admin-logs-clear-filters');
    if (logsClearBtn) {
      logsClearBtn.addEventListener('click', () => {
        const actionEl = document.getElementById('logs-action-filter');
        const statusEl = document.getElementById('logs-status-filter');
        if (actionEl) {actionEl.value = '';}
        if (statusEl) {statusEl.value = '';}
        // выключаем автообновление метрик, если включено
        const chk = document.getElementById('metrics-autorefresh');
        if (chk && chk.checked) { chk.checked = false; }
        // скрыть контролы метрик, перейти в обычный режим логов
        toggleMetricsControls(false);
        loadAdminLogs(1);
      });
    }

    // Logs: live filter reactions
    const actionFilter = document.getElementById('logs-action-filter');
    if (actionFilter) {
      actionFilter.addEventListener('input', debounce(() => loadAdminLogs(1), 400));
    }
    const statusFilter = document.getElementById('logs-status-filter');
    if (statusFilter) {
      statusFilter.addEventListener('change', () => loadAdminLogs(1));
    }

    // Logs: pagination controls
    const prevBtn = document.getElementById('logs-prev-page');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        const page = Math.max(1, (window.adminLogsCurrentPage || 1) - 1);
        loadAdminLogs(page);
      });
    }
    const nextBtn = document.getElementById('logs-next-page');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const total = window.adminLogsTotalPages || 1;
        const page = Math.min(total, (window.adminLogsCurrentPage || 1) + 1);
        loadAdminLogs(page);
      });
    }
  }

  function createMatchElement(match) {
    const matchEl = document.createElement('div');
    matchEl.className = 'match-card';
    
    const lineupStatus = getLineupStatus(match.lineups);
    const matchDate = new Date(match.match_date).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    matchEl.innerHTML = `
      <div class="match-header">
        <div class="match-teams">${match.home_team} vs ${match.away_team}</div>
        <div class="lineup-status ${lineupStatus.class}">${lineupStatus.text}</div>
      </div>
      <div class="match-footer">
        <div class="match-date">${matchDate}</div>
        <button class="edit-lineup-btn" onclick="window.AdminEnhanced.openMatchModal('${match.id}', '${match.home_team}', '${match.away_team}')">
          Составы
        </button>
      </div>
    `;
    
    return matchEl;
  }

  function getLineupStatus(lineups) {
    if (!lineups) {return { class: 'lineup-empty', text: 'Нет составов' };}
    
    const homeMain = lineups.home?.main?.length || 0;
    const awayMain = lineups.away?.main?.length || 0;
    
    if (homeMain >= 11 && awayMain >= 11) {
      return { class: 'lineup-complete', text: 'Составы готовы' };
    } else if (homeMain > 0 || awayMain > 0) {
      return { class: 'lineup-partial', text: `Частично (${homeMain}/${awayMain})` };
    } else {
      return { class: 'lineup-empty', text: 'Нет составов' };
    }
  }

  // ================== MATCHES & LINEUPS LIST ==================
  async function loadMatches(){
    const container = document.getElementById('matches-list');
    if (!container) {return;}
    container.innerHTML = '<div class="status-text">Загрузка ближайших матчей...</div>';
    try{
      const fd = new FormData();
      fd.append('initData', window.Telegram?.WebApp?.initData || '');
      const res = await fetch('/api/admin/matches/upcoming', { method: 'POST', body: fd, credentials: 'include' });
      const data = await res.json();
      if(!res.ok || data.error){ throw new Error(data.error || `HTTP ${res.status}`); }
      const tours = Array.isArray(data.tours) ? data.tours : [];
      container.innerHTML = '';
      if(tours.length === 0){
        container.innerHTML = '<div class="status-text">Нет ближайших матчей</div>';
        return;
      }
      tours.forEach(tour => container.appendChild(createTourElement(tour)));
    } catch(err){
      console.error('[Admin] loadMatches error', err);
      container.innerHTML = '<div class="status-text">Ошибка загрузки матчей</div>';
      showToast('Ошибка загрузки матчей: ' + err.message, 'error');
    }
  }

  function createTourElement(tour) {
    const tourEl = document.createElement('div');
    tourEl.className = 'tour-container';
    
    const tourTitle = document.createElement('h4');
    tourTitle.className = 'tour-title';
    tourTitle.textContent = tour.title || `Тур ${tour.tour}`;
    tourEl.appendChild(tourTitle);
    
    const matchesGrid = document.createElement('div');
    matchesGrid.className = 'matches-grid';
    
    tour.matches.forEach(match => {
      matchesGrid.appendChild(createMatchElement(match));
    });
    
    tourEl.appendChild(matchesGrid);
    return tourEl;
  }

  // Modal functions
  function openMatchModal(matchId, homeTeam, awayTeam) {
    console.log('[Admin] Opening match modal:', matchId, homeTeam, awayTeam);
    currentMatchId = matchId;
    
    document.getElementById('match-details-title').textContent = `${homeTeam} vs ${awayTeam} - Составы`;
    document.getElementById('home-team-name').textContent = homeTeam;
    document.getElementById('away-team-name').textContent = awayTeam;
    
    // Load existing lineups
    loadLineups(matchId);
    
    document.getElementById('match-details-modal').style.display = 'flex';
  }

  function closeMatchModal() {
    document.getElementById('match-details-modal').style.display = 'none';
    currentMatchId = null;
  }
  // Legacy global alias for existing inline onclick="closeMatchModal()" in template
  window.closeMatchModal = closeMatchModal;

  function loadLineups(matchId) {
    console.log('[Admin] Loading lineups for match:', matchId);
    
    const fd = new FormData();
    fd.append('initData', window.Telegram?.WebApp?.initData || '');
    
    fetch(`/api/admin/match/${matchId}/lineups`, {
      method: 'POST',
      body: fd
    })
    .then(r => {
      if (!r.ok) {throw new Error(`HTTP ${r.status}`);}
      return r.json();
    })
    .then(data => {
      console.log('[Admin] Lineups loaded:', data);
      currentLineups = data.lineups || { home: { main: [], sub: [] }, away: { main: [], sub: [] } };
      renderLineups();
    })
    .catch(err => {
      console.error('[Admin] Error loading lineups:', err);
      currentLineups = { home: { main: [], sub: [] }, away: { main: [], sub: [] } };
      renderLineups();
    });
  }

  function renderLineups() {
    console.log('[Admin] Rendering lineups:', currentLineups);
    
    ['home', 'away'].forEach(team => {
      // Рендерим только основной состав (main)
      const container = document.getElementById(`${team}-main-lineup`);
      if (!container) {return;}
      
      container.innerHTML = '';
      
      const counts = currentLineups[team].main.reduce((a,p)=>{const k=p.name.toLowerCase();a[k]=(a[k]||0)+1;return a;},{});
      currentLineups[team].main.forEach((player, index) => {
        const dup = counts[player.name.toLowerCase()] > 1;
        const playerEl = document.createElement('div');
        playerEl.className = 'player-item';
        playerEl.innerHTML = `
          <div class="player-info">
            <span class="player-name ${dup ? 'dup-player' : ''}" data-player-index="${index}">${player.name}</span>
          </div>
          <button class="remove-player" title="Удалить" onclick="window.AdminEnhanced.removePlayer('${team}', 'main', ${index})">×</button>
        `;
        container.appendChild(playerEl);
      });
    });
  }

  function addPlayerToLineup(team, type) {
    const playerName = prompt('Введите имя игрока:');
    if (!playerName) {return;}
    
    const playerNumber = prompt('Введите номер игрока (или оставьте пустым):');
    const playerPosition = prompt('Введите позицию (GK/DEF/MID/FWD):');
    
    const player = {
      name: playerName.trim(),
      number: playerNumber ? parseInt(playerNumber) : null,
      position: playerPosition ? playerPosition.toUpperCase() : null
    };
    
    currentLineups[team][type].push(player);
    renderLineups();
  }

  function updateTeamLineup(team) {
    const inputId = `${team}-main-lineup-input`;
    const textarea = document.getElementById(inputId);
    if (!textarea) {return;}
    
    const lines = textarea.value
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    if (lines.length === 0) {
      showToast('Введите список игроков','error');
      return;
    }
    
    // Проверка дублей
    const counts = lines.reduce((acc,l)=>{const k=l.toLowerCase();acc[k]=(acc[k]||0)+1;return acc;},{});
    const dups = Object.entries(counts).filter(([_,c])=>c>1).map(([k])=>k);
    if (dups.length){
      textarea.classList.add('has-dup');
      showToast('Дубликаты: '+dups.join(', '),'error',6000);
      return;
    } else {
      textarea.classList.remove('has-dup');
    }
    // Сохраняем
    currentLineups[team].main = lines.map(name => ({ name, number: null, position: null }));
    // Очищаем textarea после применения
    textarea.value = '';
    
    // Обновляем отображение
    renderLineups();
    
    console.log(`[Admin] Updated ${team} lineup:`, currentLineups[team].main);
  }

  function removePlayer(team, type, index) {
    currentLineups[team][type].splice(index, 1);
    renderLineups();
  }

  function saveLineups() {
    if (!currentMatchId) {return;}
    
    // Готовим данные только с основными составами
    const lineupsToSave = {
  home: { main: currentLineups.home.main.map(p => ({ name: p.name })), sub: [] },
  away: { main: currentLineups.away.main.map(p => ({ name: p.name })), sub: [] }
    };
    
    console.log('[Admin] Saving lineups:', lineupsToSave);
    
    const btn = document.getElementById('save-lineups-btn');
    btn.disabled = true;
    btn.textContent = 'Сохранение...';
    
    const fd = new FormData();
    fd.append('initData', window.Telegram?.WebApp?.initData || '');
    fd.append('lineups', JSON.stringify(lineupsToSave));
    
    fetch(`/api/admin/match/${currentMatchId}/lineups/save`, {
      method: 'POST',
      body: fd
    })
    .then(r => {
      if (!r.ok) {throw new Error(`HTTP ${r.status}`);}
      return r.json();
    })
    .then(data => {
      console.log('[Admin] Lineups saved:', data);
      if (data.success) {
        showToast('Составы сохранены','success');
        closeMatchModal();
        loadMatches(); // Refresh matches list
      } else {
        showToast('Ошибка сохранения: ' + (data.error || 'Неизвестная'),'error',6000);
      }
    })
    .catch(err => {
      console.error('[Admin] Error saving lineups:', err);
      showToast('Ошибка сохранения составов','error',6000);
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = 'Сохранить составы';
    });
  }

  // Player management functions
  function loadPlayers() {
    console.log('[Admin] Loading players via TransferManager...');
    
    // Инициализируем новую систему трансферов если она доступна
    if (window.TransferManager && typeof window.TransferManager.loadAllPlayers === 'function') {
      window.TransferManager.loadAllPlayers();
    } else {
      console.warn('[Admin] TransferManager not available, falling back to placeholder');
      const tbody = document.getElementById('transfer-players-tbody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6">Система трансферов загружается...</td></tr>';
      }
    }
  }

  function openPlayerModal(playerId = null) {
    document.getElementById('player-modal-title').textContent = playerId ? 'Редактировать игрока' : 'Добавить игрока';
    document.getElementById('player-modal').style.display = 'flex';
    
    if (playerId) {
      loadPlayerData(playerId);
    } else {
      document.getElementById('player-form').reset();
    }
  }

  function closePlayerModal() {
    document.getElementById('player-modal').style.display = 'none';
  }

  function loadPlayerData(playerId) {
    console.log('[Admin] Loading player data for:', playerId);
    // Implementation for loading specific player data
  }

  // Service functions
  function refreshAllData() {
    console.log('[Admin] Refreshing all data...');
    
    const btn = document.getElementById('admin-refresh-all');
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Обновляю...';
    
    const fd = new FormData(); fd.append('initData', window.Telegram?.WebApp?.initData || '');

    // Зона прогресса
    let progressBox = document.getElementById('refresh-all-progress');
    if(!progressBox){
      progressBox = document.createElement('div');
      progressBox.id='refresh-all-progress';
      progressBox.style.cssText='margin-top:8px; font-size:12px; background:#111; border:1px solid #333; padding:6px; border-radius:6px; line-height:1.4;';
      btn.parentElement.appendChild(progressBox);
    }
    progressBox.innerHTML='<div>Старт объединённого обновления...</div>';

    // Подписка на WS прогресс
    try {
      if(window.subscribeTopic){
        window.subscribeTopic('admin_refresh', (evt)=>{
          if(!evt || typeof evt !== 'object') {return;}
            if(evt.type==='progress'){
              const perc = evt.total ? Math.round((evt.index/evt.total)*100) : 0;
              if(evt.status==='start'){
                progressBox.innerHTML += `<div>▶ ${evt.index}/${evt.total}: ${evt.step}...</div>`;
              } else if(evt.status==='done') {
                progressBox.innerHTML += `<div>✔ ${evt.index}/${evt.total}: ${evt.step} (${evt.duration_ms||0}мс${evt.error? ' — ошибка: '+escapeHtml(evt.error):''})</div>`;
              }
              progressBox.scrollTop = progressBox.scrollHeight;
            } else if(evt.type==='complete') {
              progressBox.innerHTML += `<div style="margin-top:4px;">Готово за ${evt.total_duration_ms||0}мс</div>`;
            }
        });
      }
    } catch(e){ console.warn('WS progress subscribe failed', e); }

    fetch('/api/admin/refresh-all', { method:'POST', body: fd })
      .then(r=>r.json().then(d=>({ok:r.ok,d})))
      .then(res=>{
        if(!res.ok || res.d.error){ throw new Error(res.d.error||'Ошибка'); }
        const partial = res.d.status==='partial';
        showToast(partial? 'Обновление завершено с ошибками':'Все данные обновлены', partial? 'warning':'success', partial?6000:3000);
      })
      .catch(e=>{ showToast('Ошибка объединённого обновления: '+e.message,'error',6000); })
      .finally(()=>{
        btn.disabled=false; btn.textContent=originalText;
        // Отписка
        try{ if(window.unsubscribeTopic) {window.unsubscribeTopic('admin_refresh');} }catch(_){ }
      });
  }

  // Google Sheets sync — удалено

  // ---- Season generation helpers ----
  function computeSeasonLabelFromDate(dmy){
    // Accepts 'DD.MM.YYYY'; falls back to today
    let day, month, year;
    try{
      const m = String(dmy||'').trim().match(/^(\d{1,2})[.](\d{1,2})[.](\d{4})$/);
      if(m){ day=parseInt(m[1],10); month=parseInt(m[2],10); year=parseInt(m[3],10); }
      else { const d=new Date(); day=d.getDate(); month=d.getMonth()+1; year=d.getFullYear(); }
    }catch(_){ const d=new Date(); day=d.getDate(); month=d.getMonth()+1; year=d.getFullYear(); }
    const yy = String(year).slice(-2);
    // Rule: if month <= 6 → single year (season in first half-year), else cross-year (YY-YY+1)
    if (month <= 6) {return yy;}
    const next = String((year+1)).slice(-2);
    return yy+'-'+next;
  }

  function parseStartDateForBackend(dmy){
    // Backend accepts DD.MM.YY or YYYY-MM-DD; keep as DD.MM.YYYY to match UI
    const v = String(dmy||'').trim();
    if (/^\d{1,2}[.]\d{1,2}[.]\d{4}$/.test(v)) {return v;}
    // try ISO
    const d=new Date(v);
    if(!isNaN(d)){
      const dd=String(d.getDate()).padStart(2,'0');
      const mm=String(d.getMonth()+1).padStart(2,'0');
      const yyyy=d.getFullYear();
      return `${dd}.${mm}.${yyyy}`;
    }
    return '';
  }

  function generateSeason(mode){
    const startInput = document.getElementById('season-generate-date');
    if(!startInput){ showToast('Поле даты не найдено','error'); return; }
    const startRaw = startInput.value;
    const start = parseStartDateForBackend(startRaw);
    if(!start){ showToast('Неверный формат даты. Используйте ДД.ММ.ГГГГ','error'); return; }
    const btnSoft = document.getElementById('admin-season-generate-soft');
    const btnFull = document.getElementById('admin-season-generate-full');
    const disable= (b)=>{ if(b){ b.disabled=true; b.dataset.t=b.textContent; b.textContent='Выполняю...'; }};
    const enable= (b)=>{ if(b){ b.disabled=false; if(b.dataset.t){ b.textContent=b.dataset.t; delete b.dataset.t; } }};
    disable(btnSoft); disable(btnFull);
    const fd = new FormData();
    fd.append('initData', window.Telegram?.WebApp?.initData || '');
    fd.append('mode', mode);
    fd.append('start_date', start);
    // time slots implied by backend defaults; can be customized later
    fetch('/api/admin/schedule/generate', { method:'POST', body: fd })
      .then(async r=>{
        const data = await r.json().catch(()=>({}));
        if(r.status===409){ throw new Error(data?.error || 'Soft start невозможен: в активном турнире уже есть матчи'); }
        if(!r.ok){ throw new Error(data?.error || ('HTTP '+r.status)); }
        return data;
      })
      .then(res=>{
        const label = computeSeasonLabelFromDate(start);
        const tours = res?.tours_created ?? res?.tours ?? '—';
        const matches = res?.matches_created ?? res?.created ?? '—';
        showToast(`Сезон ${label} создан: туров ${tours}, матчей ${matches}`,'success',6000);
        if (res?.warnings && Array.isArray(res.warnings) && res.warnings.length) {
          showToast('Предупреждения: ' + res.warnings.join('; '), 'info', 8000);
        }
        // Refresh UI pieces
        try{ loadMatches(); }catch(_){}
      })
      .catch(err=>{
        showToast('Ошибка генерации сезона: '+err.message,'error',7000);
      })
      .finally(()=>{ enable(btnSoft); enable(btnFull); });
  }

  function loadStats() {
    console.log('[Admin] Loading stats...');
    const container = document.getElementById('admin-stats-display');
    if (!container) {return;}
    
    container.innerHTML = '<div class="status-text">Загрузка статистики...</div>';
    
    // For now, show placeholder
    container.innerHTML = '<div class="status-text">Статистика в разработке</div>';
  }

  function seasonRollover(mode){
    const initData = window.Telegram?.WebApp?.initData || '';
    let url='/api/admin/season/rollover';
    if(mode==='dry') {url+='?dry=1';} else if(mode==='soft') {url+='?soft=1';}
    else if(mode==='full') {
      // Проверяем чекбокс deep
      const deepCb = document.getElementById('season-rollover-deep');
      if(deepCb && deepCb.checked){
        url += (url.includes('?')?'&':'?')+'deep=1';
      }
    }
    const logEl=document.getElementById('season-rollover-log');
    if(logEl){ logEl.style.display='block'; logEl.textContent='Выполняю '+mode+'...'; }
    const fd=new FormData(); fd.append('initData', initData);
    fetch(url,{ method:'POST', body:fd }).then(r=>r.json().then(d=>({ok:r.ok, d}))).then(res=>{
      if(!res.ok || res.d.error){ throw new Error(res.d.error||'Ошибка'); }
      if(logEl){ logEl.textContent=JSON.stringify(res.d,null,2); }
  if(!res.d.dry_run){ showToast('Новый сезон: '+res.d.new_season,'success'); loadSeasonsIntoPicker(true); }
    }).catch(e=>{ if(logEl){ logEl.textContent='Ошибка: '+e.message; } showToast('Ошибка: '+e.message,'error',6000); });
  }

  function seasonRollback(){
    const initData = window.Telegram?.WebApp?.initData || '';
    const urlDry = '/api/admin/season/rollback?dry=1';
    const logEl=document.getElementById('season-rollover-log');
    if(logEl){ logEl.style.display='block'; logEl.textContent='Проверка плана отката...'; }
    const fd=new FormData(); fd.append('initData', initData);
    // Сначала показываем план
    fetch(urlDry,{ method:'POST', body:fd }).then(r=>r.json().then(d=>({ok:r.ok, status:r.status, d}))).then(res=>{
      if(!res.ok || res.d.error){ throw new Error(res.d.error||'Ошибка'); }
      if(logEl){ logEl.textContent=JSON.stringify(res.d,null,2); }
      const proceed = confirm('Выполнить откат сезона? Активным станет предыдущий турнир. Данные legacy, если были очищены ранее, не восстановятся.');
      if(!proceed) {return;}
      const force = confirm('Принудительно выполнить откат даже если активный сезон не совпадает с последним из журнала? Нажмите Отмена для обычного отката.');
      let url='/api/admin/season/rollback'; if(force) {url+='?force=1';}
      if(logEl){ logEl.textContent+='\n\nВыполняю откат...'; }
      return fetch(url,{ method:'POST', body:fd }).then(r=>r.json().then(d=>({ok:r.ok, status:r.status, d}))).then(res2=>{
        if(!res2.ok || res2.d.error){ throw new Error(res2.d.error||'Ошибка'); }
        if(logEl){ logEl.textContent=JSON.stringify(res2.d,null,2); }
  showToast('Сезон откатан: активирован '+res2.d.activated_season,'success');
  loadSeasonsIntoPicker(true);
      });
    }).catch(e=>{
      let hint='';
      const msg = e.message||'';
      if(msg.includes('no_rollover_history')) {hint='Нет записей в журнале season_rollovers. Сначала выполните «Полный сброс» (rollover).';}
      else if(msg.includes('active_mismatch')) {hint='Активный турнир отличается от ожидаемого. Повторите с force=1.';}
      else if(msg.includes('tournament_not_found')) {hint='Не найдены записи турниров по id. Проверьте БД.';}
      else if(msg.toLowerCase().includes('not found')) {hint='Эндпоинт не найден. Обновите сервер до версии с /api/admin/season/rollback.';}
      if(logEl){ logEl.textContent='Ошибка: '+msg+(hint?"\nПодсказка: "+hint:''); }
      showToast('Ошибка: '+msg,'error',6000);
    });
  }

  // Seasons UI helpers
  function loadSeasonsIntoPicker(refreshActive=false){
    const picker = document.getElementById('season-picker');
    const label = document.getElementById('active-season-label');
    if(!picker) {return;}
    fetch('/api/tournaments?status=all').then(r=>r.json()).then(data=>{
      const list = (data.tournaments||[]);
      // Fill options
      picker.innerHTML = '';
      list.forEach(t=>{
        const opt=document.createElement('option');
        opt.value=String(t.id);
        opt.textContent = `${t.season||t.name||t.id} (${t.status})`;
        picker.appendChild(opt);
      });
      // Active label
      const active = list.find(t=>t.status==='active');
      if(label) {label.textContent = active? (active.season||active.name||active.id) : '—';}
      // Select active by default
      if(active) {picker.value = String(active.id);}
    }).catch(()=>{
      if(picker) { picker.innerHTML = '<option>Ошибка загрузки</option>'; }
    });
  }

  function applySelectedSeason(){
    const picker = document.getElementById('season-picker');
    const id = picker && picker.value ? parseInt(picker.value,10) : 0;
    if(!id){ showToast('Выберите сезон','error'); return; }
    const confirmMsg = 'Сделать выбранный турнир активным? Текущий активный будет помечен завершённым.';
    if(!confirm(confirmMsg)) {return;}
    const fd = new FormData();
    fd.append('initData', window.Telegram?.WebApp?.initData || '');
    // Эндпоинт минимальный: используем откат/ролловер в зависимости от ситуации не меняя схему.
    // Пытаемся вычислить: если выбран предыдущий от активного — можно нажать откат;
    // иначе показываем подсказку (полный редактирующий эндпоинт не реализован в сервере).
    fetch('/api/tournaments?status=all').then(r=>r.json()).then(data=>{
      const list=data.tournaments||[];
      const active=list.find(t=>t.status==='active');
      const target=list.find(t=>String(t.id)===String(id));
      if(!target){ showToast('Сезон не найден','error'); return; }
      if(active && Number(id)===Number(active.id)){
        showToast('Этот сезон уже активен','info'); return;
      }
      // Если целевой == предыдущий от активного по времени — запускаем откат с force=1
      const sorted=[...list].sort((a,b)=> (new Date(b.start_date||0)) - (new Date(a.start_date||0)) );
      const idx = active ? sorted.findIndex(t=>t.id===active.id) : -1;
      const prev = idx>=0 ? sorted[idx+1] : null;
      if(prev && prev.id===id){
        const url='/api/admin/season/rollback?force=1';
        return fetch(url,{method:'POST', body:fd}).then(r=>r.json().then(d=>({ok:r.ok,d}))).then(res=>{
          if(!res.ok || res.d.error) {throw new Error(res.d.error||'Ошибка');}
          showToast('Активирован сезон: '+res.d.activated_season,'success');
          loadSeasonsIntoPicker(true);
        });
      }
      alert('Для произвольного выбора сезона нужен отдельный админ‑эндпоинт активации. Сейчас поддержан откат к предыдущему (через кнопку/force).');
    }).catch(()=> showToast('Ошибка применения сезона','error'));
  }

  // News management functions
  function loadNews() {
    console.log('[Admin] Loading news...');
    const container = document.getElementById('news-list');
    if (!container) {return;}
    
    container.innerHTML = '<div class="status-text">Загрузка новостей...</div>';
    
    const initData = window.Telegram?.WebApp?.initData || '';
    
    fetch(`/api/admin/news?initData=${encodeURIComponent(initData)}`, {
      method: 'GET'
    })
    .then(r => {
      if (!r.ok) {throw new Error(`HTTP ${r.status}`);}
      return r.json();
    })
    .then(data => {
      console.log('[Admin] News loaded:', data);
      container.innerHTML = '';
      
      if (!data.news || data.news.length === 0) {
        container.innerHTML = '<div class="status-text">Нет новостей</div>';
        return;
      }
      
      data.news.forEach(news => {
        const newsEl = createNewsElement(news);
        container.appendChild(newsEl);
      });
    })
    .catch(err => {
      console.error('[Admin] Error loading news:', err);
      container.innerHTML = '<div class="status-text">Ошибка загрузки новостей</div>';
    });
  }

  // (Удалено) Инициализация Google Import/Export и модалка импорта расписания

  function createNewsElement(news) {
    const newsEl = document.createElement('div');
    newsEl.className = 'news-item';
    
    const createdDate = new Date(news.created_at).toLocaleString('ru-RU');
    const truncatedContent = news.content.length > 100 ? 
      news.content.substring(0, 100) + '...' : news.content;
    
    newsEl.innerHTML = `
      <div class="news-info">
        <div class="news-title">${news.title}</div>
        <div class="news-content">${truncatedContent}</div>
        <div class="news-date">Создано: ${createdDate}</div>
      </div>
      <div class="news-actions">
        <button class="edit-news-btn" onclick="window.AdminEnhanced.openNewsModal(${news.id})">
          Редактировать
        </button>
        <button class="delete-news-btn" onclick="window.AdminEnhanced.deleteNews(${news.id})">
          Удалить
        </button>
      </div>
    `;
    
    return newsEl;
  }

  function openNewsModal(newsId = null) {
    console.log('[Admin] Opening news modal:', newsId);
    
    document.getElementById('news-modal-title').textContent = newsId ? 'Редактировать новость' : 'Создать новость';
    document.getElementById('news-modal').style.display = 'flex';
    
    if (newsId) {
      loadNewsData(newsId);
    } else {
      document.getElementById('news-form').reset();
    }
    
    // Store current news ID for saving
    document.getElementById('news-modal').setAttribute('data-news-id', newsId || '');
  }

  function closeNewsModal() {
    document.getElementById('news-modal').style.display = 'none';
  }

  function loadNewsData(newsId) {
    console.log('[Admin] Loading news data for:', newsId);
    
    const initData = window.Telegram?.WebApp?.initData || '';
    
    fetch(`/api/admin/news?initData=${encodeURIComponent(initData)}`, {
      method: 'GET'
    })
    .then(r => {
      if (!r.ok) {throw new Error(`HTTP ${r.status}`);}
      return r.json();
    })
    .then(data => {
      const news = data.news.find(n => n.id === newsId);
      if (news) {
        document.getElementById('news-title').value = news.title;
        document.getElementById('news-content').value = news.content;
      }
    })
    .catch(err => {
  console.error('[Admin] Error loading news data:', err);
  showToast('Ошибка загрузки данных новости','error',6000);
    });
  }

  function saveNews() {
    const modal = document.getElementById('news-modal');
    const newsId = modal.getAttribute('data-news-id');
    const title = document.getElementById('news-title').value.trim();
    const content = document.getElementById('news-content').value.trim();
    
    if (!title || !content) {
      showToast('Заполните все поля','error');
      return;
    }
    
    console.log('[Admin] Saving news:', { newsId, title, content });
    
    const btn = document.getElementById('save-news-btn');
    btn.disabled = true;
    btn.textContent = 'Сохранение...';
    
    const data = {
      initData: window.Telegram?.WebApp?.initData || '',
      title: title,
      content: content
    };
    
    const url = newsId ? `/api/admin/news/${newsId}` : '/api/admin/news';
    const method = newsId ? 'PUT' : 'POST';
    
    fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
    .then(r => {
      if (!r.ok) {throw new Error(`HTTP ${r.status}`);}
      return r.json();
    })
    .then(data => {
      console.log('[Admin] News saved:', data);
      if (data.status === 'success') {
        showToast(newsId ? 'Новость обновлена!' : 'Новость создана!','success');
        closeNewsModal();
        loadNews(); // Refresh news list
      } else {
        showToast('Ошибка сохранения: ' + (data.error || 'Неизвестная'),'error',6000);
      }
    })
    .catch(err => {
      console.error('[Admin] Error saving news:', err);
      showToast('Ошибка сохранения новости','error',6000);
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = 'Сохранить';
    });
  }

  function deleteNews(newsId) {
    if (!confirm('Вы уверены, что хотите удалить эту новость?')) {
      return;
    }
    
    console.log('[Admin] Deleting news:', newsId);
    
    const initData = window.Telegram?.WebApp?.initData || '';
    
    fetch(`/api/admin/news/${newsId}?initData=${encodeURIComponent(initData)}`, {
      method: 'DELETE'
    })
    .then(r => {
      if (!r.ok) {throw new Error(`HTTP ${r.status}`);}
      return r.json();
    })
    .then(data => {
      console.log('[Admin] News deleted:', data);
      if (data.status === 'success') {
        showToast('Новость удалена!','success');
        loadNews(); // Refresh news list
      } else {
        showToast('Ошибка удаления: ' + (data.error || 'Неизвестная'),'error',6000);
      }
    })
    .catch(err => {
      console.error('[Admin] Error deleting news:', err);
      showToast('Ошибка удаления новости','error',6000);
    });
  }

  // ================== ADMIN LOGS MANAGEMENT ==================

  // Global variables for logs pagination
  window.adminLogsCurrentPage = 1;
  window.adminLogsTotalPages = 1;

  function loadAdminLogs(page = null) {
    console.log('[Admin] Loading admin logs...');
    
    if (page) {
      window.adminLogsCurrentPage = page;
    } else if (!window.adminLogsCurrentPage) {
      window.adminLogsCurrentPage = 1;
    }
    
    const container = document.getElementById('admin-logs-display');
    if (!container) {return;}
    
    // Показываем индикатор загрузки
    container.innerHTML = '<div class="loading-indicator">Загрузка логов...</div>';
    
    // Получаем фильтры
    const actionFilter = document.getElementById('logs-action-filter')?.value?.trim() || '';
    const statusFilter = document.getElementById('logs-status-filter')?.value || '';
    
    // Формируем URL с параметрами
    const params = new URLSearchParams({
      page: window.adminLogsCurrentPage,
      per_page: 20
    });
    
    if (actionFilter) {params.append('action', actionFilter);}
    if (statusFilter) {params.append('status', statusFilter);}
    
    const initData = window.Telegram?.WebApp?.initData || '';
    if (initData) {params.append('initData', initData);}
    
    // Режим метрик: не запрашиваем /api/admin/logs, а показываем snapshot /health/perf
    if (statusFilter === 'metrics') {
      container.innerHTML = '<div class="loading-indicator">Загрузка метрик...</div>';
      const perfParams = new URLSearchParams();
      if (initData) {perfParams.append('initData', initData);}
      // use credentials include so admin cookie is sent when hosted cross-site
      fetch(`/health/perf?${perfParams.toString()}`, { credentials: 'include' })
        .then(r => { if (!r.ok) {throw new Error('HTTP '+r.status);} return r.json(); })
        .then(data => {
          renderMetricsSnapshot(container, data);
        })
        .catch(err => {
          console.error('[Admin] Metrics load error', err);
          container.innerHTML = '<div class="status-text">Ошибка загрузки метрик</div>';
        });
      const pag = document.getElementById('logs-pagination');
      if (pag) {pag.style.display = 'none';}
      toggleMetricsControls(true);
      return;
    }
    toggleMetricsControls(false);

    // Ensure cookies (admin_auth) are sent; helpful when site is served via proxy or cross-site
    fetch(`/api/admin/logs?${params.toString()}`, { credentials: 'include' })
    .then(r => {
      if (!r.ok) {
        if (r.status === 401) {
          // Show clearer message prompting to login via admin form or Telegram
          container.innerHTML = '<div class="status-text">Требуется авторизация. Пожалуйста, войдите в админку (логин/пароль или Telegram).</div>';
          throw new Error('Unauthorized');
        }
        throw new Error(`HTTP ${r.status}`);
      }
      return r.json();
    })
    .then(data => {
      console.log('[Admin] Logs loaded:', data);
      
      if (data.ok && data.logs) {
        displayLogs(data.logs);
        updateLogsPagination(data.pagination);
      } else {
        container.innerHTML = '<div class="status-text">Ошибка загрузки логов</div>';
      }
    })
    .catch(err => {
      console.error('[Admin] Error loading logs:', err);
      if (!container.innerHTML || container.innerHTML.indexOf('Требуется авторизация') === -1) {
        container.innerHTML = '<div class="status-text">Ошибка загрузки логов</div>';
      }
    });
  }

  function renderMetricsSnapshot(container, data) {
    if (!data || typeof data !== 'object') {
      container.innerHTML = '<div class="status-text">Нет данных метрик</div>';
      return;
    }
    try {
      const apiRows = Object.entries(data.api || {}).map(([k,v]) => {
        const p95 = v.p95_ms||0; const cls = latencyClass(p95);
        return `<tr class="lt-${cls}"><td>${escapeHtml(k)}</td><td>${v.count||0}</td><td>${v.p50_ms||0}</td><td>${p95}</td></tr>`;
      }).join('');
      const cache = data.cache || {};
      const ws = data.ws || {};
      const etag = data.etag || {};
      container.innerHTML = `
        <div class="metrics-block">
          <h4 style="margin:4px 0 8px;">Uptime: ${data.uptime_sec||0}s</h4>
          <div style="display:flex; flex-direction:column; gap:16px;">
            <div>
              <h5>API (EMA)</h5>
              <table class="admin-table" style="font-size:12px;">
                <thead><tr><th>Endpoint</th><th>Count</th><th>p50(ms)</th><th>p95(ms)</th></tr></thead>
                <tbody>${apiRows || '<tr><td colspan="4" style="text-align:center;">—</td></tr>'}</tbody>
              </table>
              ${metricsLegendHtml()}
            </div>
            <div>
              <h5>Cache</h5>
              <div class="status-text">memory_hits=${cache.memory_hits||0}; redis_hits=${cache.redis_hits||0}; misses=${cache.misses||0}; sets=${cache.sets||0}</div>
            </div>
            ${renderAccordion('WebSocket', ws)}
            ${renderAccordion('ETag', etag)}
          </div>
        </div>`;
    } catch (e) {
      console.error('[Admin] renderMetricsSnapshot error', e);
      container.innerHTML = '<div class="status-text">Ошибка рендера метрик</div>';
    }
  }

  function latencyClass(p95){
    if(p95 < 250) {return 'ok';}
    if(p95 < 600) {return 'warn';}
    return 'bad';
  }
  function metricsLegendHtml(){
    return `<div style="margin-top:6px; font-size:11px; line-height:1.4;">
      <strong>Легенда:</strong>
      <div><span style="display:inline-block;width:10px;height:10px;background:#0b6623;vertical-align:middle;margin-right:4px;"></span> p95 < 250мс — норма</div>
      <div><span style="display:inline-block;width:10px;height:10px;background:#b8860b;vertical-align:middle;margin-right:4px;"></span> 250–600мс — обратить внимание</div>
      <div><span style="display:inline-block;width:10px;height:10px;background:#8B0000;vertical-align:middle;margin-right:4px;"></span> > 600мс — плохо</div>
      <div style="margin-top:4px;">Цвет строки = состояние p95. Значения p50/p95 — экспоненциальные сглаженные (EMA) оценки.</div>
    </div>`;
  }

  function renderAccordion(title, obj) {
    const content = escapeHtml(JSON.stringify(obj || {}, null, 2));
    const id = 'acc_'+title.toLowerCase();
    return `<div class="metrics-accordion" data-acc="${id}">
      <button class="accordion-toggle" style="background:#222; color:#fff; padding:6px 10px; border:1px solid #333; border-radius:6px; width:100%; text-align:left; font-size:13px; display:flex; justify-content:space-between; align-items:center;">
        <span>${title}</span><span class="acc-ind">▼</span>
      </button>
      <div class="accordion-content" style="display:none; margin-top:6px;">
        <pre style="background:#111; padding:8px; border:1px solid #333; border-radius:6px; max-height:220px; overflow:auto;">${content}</pre>
      </div>
    </div>`;
  }

  // Делегирование кликов по аккордеонам
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.metrics-accordion > .accordion-toggle');
    if (!btn) {return;}
    const wrap = btn.parentElement;
    const cnt = wrap.querySelector('.accordion-content');
    const ind = btn.querySelector('.acc-ind');
    if (cnt.style.display === 'none') {
      cnt.style.display = 'block';
      if (ind) {ind.textContent = '▲';}
    } else {
      cnt.style.display = 'none';
      if (ind) {ind.textContent = '▼';}
    }
  });

  // Метрики: управление кнопками и автообновлением
  let metricsAutoTimer = null;
  function toggleMetricsControls(on) {
    const btn = document.getElementById('admin-metrics-refresh');
    const wrap = document.getElementById('metrics-autorefresh-wrapper');
    if (!btn || !wrap) {return;}
    btn.style.display = on ? 'inline-block' : 'none';
    wrap.style.display = on ? 'flex' : 'none';
    if (!on) {
      if (metricsAutoTimer) { clearInterval(metricsAutoTimer); metricsAutoTimer = null; }
      const chk = document.getElementById('metrics-autorefresh');
      if (chk) {chk.checked = false;}
    }
  }
  // События для кнопок
  (function initMetricsControls(){
    const btn = document.getElementById('admin-metrics-refresh');
    if (btn) {btn.addEventListener('click', () => loadAdminLogs());}
    const chk = document.getElementById('metrics-autorefresh');
    if (chk) {chk.addEventListener('change', () => {
      if (chk.checked) {
        if (metricsAutoTimer) {clearInterval(metricsAutoTimer);}
        metricsAutoTimer = setInterval(() => {
          const statusFilter = document.getElementById('logs-status-filter')?.value;
          if (statusFilter === 'metrics') {loadAdminLogs();}
        }, 15000); // 15s
      } else {
        if (metricsAutoTimer) { clearInterval(metricsAutoTimer); metricsAutoTimer = null; }
      }
    });}
  })();

  function displayLogs(logs) {
    const container = document.getElementById('admin-logs-display');
    if (!container) {return;}
    
    if (!logs || logs.length === 0) {
      container.innerHTML = '<div class="status-text">Логи не найдены</div>';
      return;
    }
    
    container.innerHTML = '';
    
    logs.forEach(log => {
      const logEl = createLogElement(log);
      container.appendChild(logEl);
    });
  }

  function createLogElement(log) {
    const logEl = document.createElement('div');
    logEl.className = 'log-item';
    
    // Форматирование времени
    const createdAt = new Date(log.created_at);
    const timeStr = createdAt.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    // Показать время выполнения если есть
    const executionTime = log.execution_time_ms ? `${log.execution_time_ms}ms` : '';
    
    // Создание содержимого лога
    logEl.innerHTML = `
      <div class="log-header">
        <div class="log-action">${escapeHtml(log.action)}</div>
        <div class="log-status ${log.result_status}">${log.result_status.toUpperCase()}</div>
      </div>
      <div class="log-description">${escapeHtml(log.description)}</div>
      <div class="log-details">
        <div class="log-meta">
          <span class="log-time">${timeStr}</span>
          ${log.endpoint ? `<span class="log-endpoint">${escapeHtml(log.endpoint)}</span>` : ''}
          ${executionTime ? `<span class="log-execution-time">${executionTime}</span>` : ''}
        </div>
        ${hasExtraDetails(log) ? '<a href="#" class="log-expand" onclick="toggleLogDetails(this)">Подробнее ↓</a>' : ''}
      </div>
      ${createExtraDetailsElement(log)}
    `;
    
    return logEl;
  }

  function hasExtraDetails(log) {
    return log.request_data || log.result_message || log.affected_entities || log.ip_address;
  }

  function createExtraDetailsElement(log) {
    if (!hasExtraDetails(log)) {return '';}
    
    let details = '';
    
    if (log.result_message && log.result_message !== 'Операция выполнена успешно') {
      details += `<strong>Результат:</strong>\n${log.result_message}\n\n`;
    }
    
    if (log.request_data) {
      details += `<strong>Данные запроса:</strong>\n${formatJsonForDisplay(log.request_data)}\n\n`;
    }
    
    if (log.affected_entities) {
      details += `<strong>Затронутые сущности:</strong>\n${formatJsonForDisplay(log.affected_entities)}\n\n`;
    }
    
    if (log.ip_address) {
      details += `<strong>IP адрес:</strong> ${log.ip_address}\n`;
    }
    
    return `<div class="log-extra-details"><pre>${escapeHtml(details.trim())}</pre></div>`;
  }

  function formatJsonForDisplay(jsonStr) {
    if (!jsonStr) {return '';}
    
    try {
      const obj = JSON.parse(jsonStr);
      return JSON.stringify(obj, null, 2);
    } catch (e) {
      return jsonStr;
    }
  }

  function updateLogsPagination(pagination) {
    if (!pagination) {return;}
    
    window.adminLogsTotalPages = pagination.total_pages;
    
    const paginationEl = document.getElementById('logs-pagination');
    const pageInfo = document.getElementById('logs-page-info');
    const prevBtn = document.getElementById('logs-prev-page');
    const nextBtn = document.getElementById('logs-next-page');
    
    if (paginationEl && pagination.total_pages > 1) {
      paginationEl.style.display = 'block';
      
      if (pageInfo) {
        pageInfo.textContent = `Страница ${pagination.page} из ${pagination.total_pages}`;
      }
      
      if (prevBtn) {
        prevBtn.disabled = !pagination.has_prev;
      }
      
      if (nextBtn) {
        nextBtn.disabled = !pagination.has_next;
      }
    } else if (paginationEl) {
      paginationEl.style.display = 'none';
    }
  }

  // Utility functions
  function escapeHtml(text) {
    if (typeof text !== 'string') {return '';}
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Global function to toggle log details
  window.toggleLogDetails = function(link) {
    const logItem = link.closest('.log-item');
    const detailsEl = logItem.querySelector('.log-extra-details');
    
    if (detailsEl.classList.contains('expanded')) {
      detailsEl.classList.remove('expanded');
      link.textContent = 'Подробнее ↓';
    } else {
      detailsEl.classList.add('expanded');
      link.textContent = 'Скрыть ↑';
    }
  };

  // Setup data repair listeners
  function setupDataRepairListeners() {
    const fixResultsToursBtn = document.getElementById('fix-results-tours-btn');
    const fixResultsToursStatus = document.getElementById('fix-results-tours-status');
    
    if (fixResultsToursBtn) {
      fixResultsToursBtn.addEventListener('click', async () => {
        try {
          fixResultsToursBtn.disabled = true;
          fixResultsToursBtn.textContent = 'Выполняется...';
          
          if (fixResultsToursStatus) {
            fixResultsToursStatus.textContent = 'Починка номеров туров...';
            fixResultsToursStatus.className = 'status-message loading';
          }
          
          const response = await fetch('/api/admin/fix-results-tours', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          const result = await response.json();
          
          if (response.ok) {
            showToast(`Успешно починено ${result.fixed_count} из ${result.total_results} записей результатов`, 'success');
            if (fixResultsToursStatus) {
              fixResultsToursStatus.textContent = `✅ Починено ${result.fixed_count} из ${result.total_results} записей`;
              fixResultsToursStatus.className = 'status-message success';
            }
          } else {
            throw new Error(result.error || 'Ошибка при починке данных');
          }
        } catch (error) {
          console.error('Fix results tours error:', error);
          showToast(`Ошибка починки: ${error.message}`, 'error');
          if (fixResultsToursStatus) {
            fixResultsToursStatus.textContent = `❌ Ошибка: ${error.message}`;
            fixResultsToursStatus.className = 'status-message error';
          }
        } finally {
          fixResultsToursBtn.disabled = false;
          fixResultsToursBtn.textContent = 'Починить номера туров в результатах';
        }
      });
    }
  }

  // Global functions for HTML onclick handlers
  // Initialize or merge into window.AdminEnhanced to avoid clobbering other scripts
  window.AdminEnhanced = window.AdminEnhanced || {};
  Object.assign(window.AdminEnhanced, {
    openMatchModal,
    closeMatchModal,
    addPlayerToLineup,
    updateTeamLineup,
    removePlayer,
    openPlayerModal,
    closePlayerModal,
    openNewsModal,
    closeNewsModal,
    saveNews,
    deleteNews,
    loadNews,
    loadAdminLogs,
    openTeamModal,
    closeTeamModal,
    editTeam,
    deleteTeam,
    openTeamRoster,
    closeTeamRoster
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminDashboard);
  } else {
    initAdminDashboard();
  }

})();
