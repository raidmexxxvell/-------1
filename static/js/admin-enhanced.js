// static/js/admin-enhanced.js
// Enhanced admin module with lineup management
(function(){
  // Toast system
  function ensureToastContainer(){
    if(document.getElementById('toast-container')) return;
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
  function showToast(msg,type='info',timeout=3000){
    try { ensureToastContainer(); const c=document.getElementById('toast-container'); if(!c) return; const box=document.createElement('div'); box.textContent=msg; box.style.pointerEvents='auto'; box.style.padding='10px 14px'; box.style.borderRadius='8px'; box.style.fontSize='13px'; box.style.maxWidth='340px'; box.style.lineHeight='1.35'; box.style.fontFamily='inherit'; box.style.color='#fff'; box.style.background= type==='error'? 'linear-gradient(135deg,#d9534f,#b52a25)': (type==='success'? 'linear-gradient(135deg,#28a745,#1e7e34)': 'linear-gradient(135deg,#444,#222)'); box.style.boxShadow='0 4px 12px rgba(0,0,0,0.35)'; box.style.opacity='0'; box.style.transform='translateY(-6px)'; box.style.transition='opacity .25s ease, transform .25s ease'; const close=document.createElement('span'); close.textContent='×'; close.style.marginLeft='8px'; close.style.cursor='pointer'; close.style.fontWeight='600'; close.onclick=()=>{ box.style.opacity='0'; box.style.transform='translateY(-6px)'; setTimeout(()=>box.remove(),220); }; const wrap=document.createElement('div'); wrap.style.display='flex'; wrap.style.alignItems='flex-start'; wrap.style.justifyContent='space-between'; wrap.style.gap='6px'; const textSpan=document.createElement('span'); textSpan.style.flex='1'; textSpan.textContent=msg; wrap.append(textSpan,close); box.innerHTML=''; box.appendChild(wrap); c.appendChild(box); requestAnimationFrame(()=>{ box.style.opacity='1'; box.style.transform='translateY(0)'; }); if(timeout>0){ setTimeout(()=>close.click(), timeout); } } catch(e){ console.warn('toast fail',e); }
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
    
    // Load initial data
    loadMatches();
  }

  function setupTabSwitching() {
    const tabs = document.querySelectorAll('#admin-subtabs .subtab-item');
    const panes = {
      'matches': document.getElementById('admin-pane-matches'),
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

    const statsRefreshBtn = document.getElementById('admin-stats-refresh');
    if (statsRefreshBtn) {
      statsRefreshBtn.addEventListener('click', loadStats);
    }

    // Logs management buttons
    const logsRefreshBtn = document.getElementById('admin-logs-refresh');
    if (logsRefreshBtn) {
      logsRefreshBtn.addEventListener('click', () => loadAdminLogs());
    }

    const logsClearFiltersBtn = document.getElementById('admin-logs-clear-filters');
    if (logsClearFiltersBtn) {
      logsClearFiltersBtn.addEventListener('click', () => {
        document.getElementById('logs-action-filter').value = '';
        document.getElementById('logs-status-filter').value = '';
        loadAdminLogs();
      });
    }

    const logsActionFilter = document.getElementById('logs-action-filter');
    if (logsActionFilter) {
      logsActionFilter.addEventListener('input', debounce(() => loadAdminLogs(), 500));
    }

    const logsStatusFilter = document.getElementById('logs-status-filter');
    if (logsStatusFilter) {
      logsStatusFilter.addEventListener('change', () => loadAdminLogs());
    }

    const logsPrevBtn = document.getElementById('logs-prev-page');
    if (logsPrevBtn) {
      logsPrevBtn.addEventListener('click', () => {
        if (window.adminLogsCurrentPage > 1) {
          window.adminLogsCurrentPage--;
          loadAdminLogs();
        }
      });
    }

    const logsNextBtn = document.getElementById('logs-next-page');
    if (logsNextBtn) {
      logsNextBtn.addEventListener('click', () => {
        if (window.adminLogsCurrentPage < window.adminLogsTotalPages) {
          window.adminLogsCurrentPage++;
          loadAdminLogs();
        }
      });
    }

  // Season rollover buttons
  const btnDry = document.getElementById('admin-season-dry');
  const btnSoft = document.getElementById('admin-season-soft');
  const btnRoll = document.getElementById('admin-season-roll');
  const btnRollback = document.getElementById('admin-season-rollback');
  const btnSheetsSelftest = document.getElementById('admin-google-selftest');
  const seasonPicker = document.getElementById('season-picker');
  const applySeasonBtn = document.getElementById('apply-season-btn');
  const activeSeasonLabel = document.getElementById('active-season-label');
  if (btnDry) btnDry.onclick = ()=> seasonRollover('dry');
  if (btnSoft) btnSoft.onclick = ()=> seasonRollover('soft');
    if (btnRoll) btnRoll.onclick = ()=> {
      const first = confirm('Полный сброс сезона? Это удалит legacy статистику матчей. Продолжить?');
      if(!first) return;
      const phrase = prompt('Введите СБРОС для подтверждения:');
      if(phrase !== 'СБРОС') { alert('Отменено'); return; }
      seasonRollover('full');
    };
  if (btnRollback) btnRollback.onclick = ()=> seasonRollback();
  if (btnSheetsSelftest) btnSheetsSelftest.onclick = ()=> sheetsSelfTest();
  if (seasonPicker) loadSeasonsIntoPicker();
  if (applySeasonBtn) applySeasonBtn.onclick = ()=> applySelectedSeason();
  }

  // Match management functions
  function loadMatches() {
    console.log('[Admin] Loading matches...');
    const container = document.getElementById('matches-list');
    if (!container) return;
    
    container.innerHTML = '<div class="status-text">Загрузка матчей...</div>';
    
    const fd = new FormData();
    fd.append('initData', window.Telegram?.WebApp?.initData || '');
    
    fetch('/api/admin/matches/upcoming', {
      method: 'POST',
      body: fd
    })
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(data => {
      console.log('[Admin] Matches loaded:', data);
      container.innerHTML = '';
      
      if (!data.matches || data.matches.length === 0) {
        container.innerHTML = '<div class="status-text">Нет предстоящих матчей</div>';
        return;
      }
      
      data.matches.forEach(match => {
        const matchEl = createMatchElement(match);
        container.appendChild(matchEl);
      });
    })
    .catch(err => {
      console.error('[Admin] Error loading matches:', err);
      container.innerHTML = '<div class="status-text">Ошибка загрузки матчей</div>';
    });
  }

  function createMatchElement(match) {
    const matchEl = document.createElement('div');
    matchEl.className = 'match-item';
    
    const lineupStatus = getLineupStatus(match.lineups);
    const matchDate = new Date(match.match_date).toLocaleString('ru-RU');
    
    matchEl.innerHTML = `
      <div class="match-info">
        <div class="match-main">
          <div class="match-teams">${match.home_team} vs ${match.away_team}</div>
          <div class="match-date">${matchDate}</div>
        </div>
        <div class="lineup-status ${lineupStatus.class}">${lineupStatus.text}</div>
      </div>
      <div class="match-actions">
        <button class="edit-lineup-btn" onclick="window.AdminEnhanced.openMatchModal('${match.id}', '${match.home_team}', '${match.away_team}')">
          Составы
        </button>
      </div>
    `;
    
    return matchEl;
  }

  function getLineupStatus(lineups) {
    if (!lineups) return { class: 'lineup-empty', text: 'Нет составов' };
    
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
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
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
      if (!container) return;
      
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
    if (!playerName) return;
    
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
    if (!textarea) return;
    
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
    if (!currentMatchId) return;
    
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
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
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
  // --- Google Sheets repair handler ---
  function repairUsersSheet(sheet) {
    const btn = document.getElementById('admin-google-repair-users');
    if (btn) { btn.disabled = true; btn.textContent = 'Repairing...'; }
    if (!sheet) {
      const sel = document.getElementById('repair-sheet-select');
      sheet = (sel && sel.value) ? sel.value : 'users';
    }
    const fd = new FormData();
    fd.append('initData', window.Telegram?.WebApp?.initData || '');
    fd.append('sheet', sheet);
    fetch('/api/admin/google/repair-users-sheet', { method: 'POST', body: fd })
      .then(r => r.json())
      .then(data => {
        console.log('repair result', data);
        if (data && data.status === 'ok') {
          showToast('Repair completed: ' + (data.deduped_rows || 0) + ' rows kept', 'success', 5000);
          if (data.removed_examples && data.removed_examples.length) {
            console.info('Removed examples:', data.removed_examples.slice(0,5));
          }
        } else {
          showToast('Repair failed: ' + (data.error || 'unknown'), 'error', 6000);
        }
      })
      .catch(err => { console.error('repair error', err); showToast('Repair request failed','error'); })
  .finally(()=>{ if (btn) { btn.disabled = false; btn.textContent = 'Почистить дубли'; } });
  }

  // Wire up the button after DOM ready
  document.addEventListener('DOMContentLoaded', ()=>{
    const repairBtn = document.getElementById('admin-google-repair-users');
    if (repairBtn) repairBtn.addEventListener('click', ()=>{
      const sel = document.getElementById('repair-sheet-select');
      const target = (sel && sel.value) ? sel.value : 'users';
      const ok = confirm(`Запустить чистку дублей в листе "${target}"? Операция перепишет лист.`);
      if (!ok) return; repairUsersSheet(target);
    });
  });
  function loadPlayers() {
    console.log('[Admin] Loading players...');
    const tbody = document.getElementById('players-table');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="6">Загрузка игроков...</td></tr>';
    
    // For now, show placeholder
    tbody.innerHTML = '<tr><td colspan="6">Функция загрузки игроков в разработке</td></tr>';
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
    
    const fd = new FormData();
    fd.append('initData', window.Telegram?.WebApp?.initData || '');
    
    Promise.allSettled([
      fetch('/api/league-table/refresh', { method: 'POST', body: fd }),
      fetch('/api/stats-table/refresh', { method: 'POST', body: fd }),
      fetch('/api/schedule/refresh', { method: 'POST', body: fd }),
      fetch('/api/results/refresh', { method: 'POST', body: fd }),
      fetch('/api/betting/tours/refresh', { method: 'POST', body: fd })
    ])
    .then(results => {
      const failed = results.filter(r => r.status === 'rejected').length;
  if (failed === 0) showToast('Все данные обновлены','success'); else showToast(`Ошибки: ${failed} / ${results.length}`,'error',6000);
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = originalText;
    });
  }

  // Google Sheets sync
  function importScheduleFromGoogle(){
    const btn = document.getElementById('admin-google-import-schedule');
    if(!btn) return;
    btn.disabled = true; const t=btn.textContent; btn.textContent='Импорт...';
    const fd=new FormData(); fd.append('initData', window.Telegram?.WebApp?.initData || '');
    fetch('/api/admin/google/import-schedule', { method:'POST', body: fd })
      .then(r=>r.json().then(d=>({ok:r.ok, d}))).then(res=>{
        if(!res.ok || res.d.error) throw new Error(res.d.error||'Ошибка');
        showToast('Расписание импортировано из Google','success');
      }).catch(e=>{ showToast('Ошибка импорта: '+e.message,'error',6000); })
      .finally(()=>{ btn.disabled=false; btn.textContent=t; });
  }

  function sheetsSelfTest(){
    const btn = document.getElementById('admin-google-selftest');
    const log = document.getElementById('google-selftest-log');
    if(!btn || !log) return;
    btn.disabled = true; const t=btn.textContent; btn.textContent='Проверяю...';
    log.style.display='block'; log.textContent='Запуск самотеста...';
    const fd=new FormData(); fd.append('initData', window.Telegram?.WebApp?.initData || '');
    fetch('/api/admin/google/self-test', { method:'POST', body: fd })
      .then(r=>r.json().then(d=>({ok:r.ok, d})))
      .then(res=>{
        if(!res.ok){ throw new Error(res.d?.error || 'Ошибка самотеста'); }
        const list = res.d?.checks || [];
        const lines = list.map(c=>{
          if(c.ok) return `✔ ${c.name}: ${c.detail??'ok'}`;
          const hint = c.hint?`\n   hint: ${c.hint}`:'';
          return `✖ ${c.name}: ${c.error}${hint}`;
        });
        log.textContent = (res.d.ok? '[OK] Доступ к Sheets настроен' : '[FAIL] Найдены проблемы')+"\n\n"+lines.join('\n');
        showToast(res.d.ok? 'Sheets OK' : 'Sheets: найдены проблемы','info');
      })
      .catch(e=>{ log.textContent='Ошибка самотеста: '+e.message; showToast('Ошибка самотеста: '+e.message,'error'); })
      .finally(()=>{ btn.disabled=false; btn.textContent=t; });
  }

  function exportAllToGoogle(){
    const btn = document.getElementById('admin-google-export-all');
    if(!btn) return;
    btn.disabled = true; const t=btn.textContent; btn.textContent='Выгружаю...';
    const fd=new FormData(); fd.append('initData', window.Telegram?.WebApp?.initData || '');
    fetch('/api/admin/google/export-all', { method:'POST', body: fd })
      .then(r=>r.json().then(d=>({ok:r.ok, d}))).then(res=>{
        if(!res.ok || res.d.error) throw new Error(res.d.error||'Ошибка');
        showToast('Данные выгружены в Google','success');
      }).catch(e=>{ showToast('Ошибка выгрузки: '+e.message,'error',6000); })
      .finally(()=>{ btn.disabled=false; btn.textContent=t; });
  }

  function loadStats() {
    console.log('[Admin] Loading stats...');
    const container = document.getElementById('admin-stats-display');
    if (!container) return;
    
    container.innerHTML = '<div class="status-text">Загрузка статистики...</div>';
    
    // For now, show placeholder
    container.innerHTML = '<div class="status-text">Статистика в разработке</div>';
  }

  function seasonRollover(mode){
    const initData = window.Telegram?.WebApp?.initData || '';
    let url='/api/admin/season/rollover';
    if(mode==='dry') url+='?dry=1'; else if(mode==='soft') url+='?soft=1';
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
      if(!proceed) return;
      const force = confirm('Принудительно выполнить откат даже если активный сезон не совпадает с последним из журнала? Нажмите Отмена для обычного отката.');
      let url='/api/admin/season/rollback'; if(force) url+='?force=1';
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
      if(msg.includes('no_rollover_history')) hint='Нет записей в журнале season_rollovers. Сначала выполните «Полный сброс» (rollover).';
      else if(msg.includes('active_mismatch')) hint='Активный турнир отличается от ожидаемого. Повторите с force=1.';
      else if(msg.includes('tournament_not_found')) hint='Не найдены записи турниров по id. Проверьте БД.';
      else if(msg.toLowerCase().includes('not found')) hint='Эндпоинт не найден. Обновите сервер до версии с /api/admin/season/rollback.';
      if(logEl){ logEl.textContent='Ошибка: '+msg+(hint?"\nПодсказка: "+hint:''); }
      showToast('Ошибка: '+msg,'error',6000);
    });
  }

  // Seasons UI helpers
  function loadSeasonsIntoPicker(refreshActive=false){
    const picker = document.getElementById('season-picker');
    const label = document.getElementById('active-season-label');
    if(!picker) return;
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
      if(label) label.textContent = active? (active.season||active.name||active.id) : '—';
      // Select active by default
      if(active) picker.value = String(active.id);
    }).catch(()=>{
      if(picker) { picker.innerHTML = '<option>Ошибка загрузки</option>'; }
    });
  }

  function applySelectedSeason(){
    const picker = document.getElementById('season-picker');
    const id = picker && picker.value ? parseInt(picker.value,10) : 0;
    if(!id){ showToast('Выберите сезон','error'); return; }
    const confirmMsg = 'Сделать выбранный турнир активным? Текущий активный будет помечен завершённым.';
    if(!confirm(confirmMsg)) return;
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
          if(!res.ok || res.d.error) throw new Error(res.d.error||'Ошибка');
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
    if (!container) return;
    
    container.innerHTML = '<div class="status-text">Загрузка новостей...</div>';
    
    const initData = window.Telegram?.WebApp?.initData || '';
    
    fetch(`/api/admin/news?initData=${encodeURIComponent(initData)}`, {
      method: 'GET'
    })
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
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

  // Init handlers for new buttons
  document.addEventListener('DOMContentLoaded', ()=>{
    const ib=document.getElementById('admin-google-import-schedule'); if(ib) ib.addEventListener('click', importScheduleFromGoogle);
    const eb=document.getElementById('admin-google-export-all'); if(eb) eb.addEventListener('click', exportAllToGoogle);
  });

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
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
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
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
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
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
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
    if (!container) return;
    
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
    
    if (actionFilter) params.append('action', actionFilter);
    if (statusFilter) params.append('status', statusFilter);
    
    const initData = window.Telegram?.WebApp?.initData || '';
    if (initData) params.append('initData', initData);
    
    fetch(`/api/admin/logs?${params.toString()}`)
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
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
      container.innerHTML = '<div class="status-text">Ошибка загрузки логов</div>';
    });
  }

  function displayLogs(logs) {
    const container = document.getElementById('admin-logs-display');
    if (!container) return;
    
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
    if (!hasExtraDetails(log)) return '';
    
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
    if (!jsonStr) return '';
    
    try {
      const obj = JSON.parse(jsonStr);
      return JSON.stringify(obj, null, 2);
    } catch (e) {
      return jsonStr;
    }
  }

  function updateLogsPagination(pagination) {
    if (!pagination) return;
    
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
    if (typeof text !== 'string') return '';
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

  // Global functions for HTML onclick handlers
  window.AdminEnhanced = {
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
    loadAdminLogs
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminDashboard);
  } else {
    initAdminDashboard();
  }

})();
