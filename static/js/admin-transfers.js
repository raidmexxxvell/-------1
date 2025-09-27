/**
 * Transfer Manager - система управления трансферами игроков
 * Интегрируется с админ-панелью для работы с окном трансферов
 */
(function () {
  'use strict';

  // Глобальные переменные состояния
  let transferQueue = [];
  let allPlayers = [];
  let allTeams = [];
  let currentPlayerData = null;
  const playersByKey = new Map();
  const globalPlayersByKey = new Map();

  function rosterStoreApi() {
    return window.AdminRosterStore || {};
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getPlayerDisplayName(player) {
    if (!player) {
      return 'Без имени';
    }
    const full = (player.full_name || '').trim();
    if (full) {
      return full;
    }
    const combo = `${player.first_name || ''} ${player.last_name || ''}`.trim();
    return combo || 'Без имени';
  }

  function getPlayerStat(player, key) {
    if (!player) {
      return 0;
    }
    if (player.stats && typeof player.stats === 'object' && key in player.stats) {
      const value = player.stats[key];
      return value ?? 0;
    }
    return player[key] ?? 0;
  }

  function buildRosterKey(team, player, index) {
    const parts = [
      team?.id ?? 'team',
      player?.team_player_id ?? player?.id ?? 'entry',
      player?.player_id ?? 'player',
      index,
    ];
    return parts.join(':');
  }

  async function fetchTeamRosterFallback(teamId) {
    const response = await fetch(`/api/admin/teams/${teamId}/roster`);
    const data = await response.json();
    if (!response.ok || data?.error) {
      throw new Error(data?.error || 'Не удалось загрузить состав команды');
    }
    const players = Array.isArray(data.players)
      ? data.players
      : Array.isArray(data.roster)
        ? data.roster
        : [];
    return {
      players,
      source: data.source === 'legacy' ? 'legacy' : 'normalized',
    };
  }

  // Утилиты для debounce поиска
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

  // Показ уведомлений
  function showNotification(message, type = 'info') {
    if (window.showToast) {
      window.showToast(message, type, 4000);
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
      alert(message);
    }
  }

  // Загрузка команд
  async function loadTeams() {
    try {
      const response = await fetch('/api/admin/teams');
      if (!response.ok) throw new Error('Failed to fetch teams');

      const data = await response.json();
      allTeams = data.teams || [];

      // Заполнение селектов команд
      populateTeamSelects();
    } catch (error) {
      console.error('Load teams error:', error);
      showNotification('Ошибка загрузки команд: ' + error.message, 'error');
    }
  }

  // Заполнение селектов команд
  function populateTeamSelects() {
    const teamFilter = document.getElementById('transfer-team-filter');
    const targetTeamSelect = document.getElementById('transfer-target-team');

    if (teamFilter) {
      teamFilter.innerHTML = '<option value="">Все команды</option>';
      allTeams.forEach(team => {
        const option = document.createElement('option');
        option.value = String(team.id);
        option.dataset.teamName = team.name;
        option.textContent = team.name;
        teamFilter.appendChild(option);
      });
    }

    if (targetTeamSelect) {
      targetTeamSelect.innerHTML = '<option value="">Выберите команду...</option>';
      allTeams.forEach(team => {
        const option = document.createElement('option');
        option.value = String(team.id);
        option.textContent = team.name;
        targetTeamSelect.appendChild(option);
      });
    }
  }

  // Загрузка всех игроков
  async function loadAllPlayers(force = false) {
    const loadingEl = document.getElementById('transfer-loading');
    const tableEl = document.getElementById('transfer-players-table');
    const noDataEl = document.getElementById('transfer-no-players');

    if (loadingEl) loadingEl.style.display = 'block';
    if (tableEl) tableEl.style.display = 'none';
    if (noDataEl) noDataEl.style.display = 'none';

    try {
      const rosterApi = rosterStoreApi();
      const useStore = typeof rosterApi.ensureTeamRoster === 'function';
      globalPlayersByKey.clear();

      const loadPromises = allTeams.map(async team => {
        try {
          const snapshot = useStore
            ? await rosterApi.ensureTeamRoster(team.id, { force })
            : await fetchTeamRosterFallback(team.id);
          const source = snapshot?.source || 'normalized';
          const players = Array.isArray(snapshot?.players)
            ? snapshot.players
            : snapshot?.players || [];
          return players.map((player, index) => {
            const rosterKey = buildRosterKey(team, player, index);
            const clone = {
              ...player,
              roster_key: rosterKey,
              team_id: team.id,
              team_name: team.name,
              team_player_id: player.id ?? player.team_player_id ?? null,
              player_id: player.player_id ?? null,
              roster_source: source,
              transferEligible: Boolean((player.id ?? null) || (player.player_id ?? null)),
              full_name: getPlayerDisplayName(player),
            };
            globalPlayersByKey.set(rosterKey, clone);
            return clone;
          });
        } catch (error) {
          console.warn(`Failed to load roster for team ${team.name}:`, error);
          return [];
        }
      });

      const teamPlayers = await Promise.all(loadPromises);
      allPlayers = teamPlayers.flat();

      renderPlayersTable();
    } catch (error) {
      console.error('Load all players error:', error);
      showNotification('Ошибка загрузки игроков: ' + error.message, 'error');
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  // Рендеринг таблицы игроков
  function renderPlayersTable(filteredPlayers = null) {
    const tbody = document.getElementById('transfer-players-tbody');
    const tableEl = document.getElementById('transfer-players-table');
    const noDataEl = document.getElementById('transfer-no-players');

    if (!tbody) return;

    const playersToShow = filteredPlayers || allPlayers;

    if (playersToShow.length === 0) {
      if (tableEl) tableEl.style.display = 'none';
      if (noDataEl) noDataEl.style.display = 'block';
      tbody.innerHTML = '';
      return;
    }

    if (tableEl) tableEl.style.display = 'table';
    if (noDataEl) noDataEl.style.display = 'none';

    tbody.innerHTML = '';
    playersByKey.clear();

    playersToShow.forEach(player => {
      const key = player.roster_key || buildRosterKey({ id: player.team_id }, player, 0);
      playersByKey.set(key, player);

      const inQueue = transferQueue.some(t => t.player_key === key);
      const transferDisabled = !player.transferEligible;
      const goals = getPlayerStat(player, 'goals');
      const assists = getPlayerStat(player, 'assists');
      const yellows = getPlayerStat(player, 'yellow_cards');
      const reds = getPlayerStat(player, 'red_cards');
      const name = escapeHtml(getPlayerDisplayName(player));
      const teamName = escapeHtml(player.team_name || '—');
      const disabledAttr = inQueue || transferDisabled ? ' disabled' : '';
      const transferTitle = transferDisabled
        ? 'Перевод станет доступен после миграции игрока'
        : inQueue
          ? 'Игрок уже добавлен в очередь'
          : 'Добавить игрока в очередь';
      const badges = [];
      if (inQueue) {
        badges.push('<div class="transfer-badge-compact">В очереди</div>');
      }
      if (player.roster_source === 'legacy' || transferDisabled) {
        badges.push('<div class="transfer-badge-compact" style="background:#f6ad55;">Legacy</div>');
      }

      const row = document.createElement('tr');
      if (inQueue) {
        row.classList.add('player-in-transfer-queue');
      }
      if (transferDisabled) {
        row.classList.add('player-transfer-disabled');
      }
      row.innerHTML = `
                <td class="player-name-compact">
                    <div><strong>${name}</strong></div>
                    ${badges.join('')}
                </td>
                <td class="team-name-compact">${teamName}</td>
                <td class="stats-compact">${goals}/${assists}</td>
                <td class="cards-compact">
                    <span>🟡${yellows}</span>
                    <span>🔴${reds}</span>
                </td>
                <td>
                    <button class="transfer-btn-compact" data-player-key="${escapeHtml(key)}" title="${escapeHtml(transferTitle)}"${disabledAttr}>
                        ↔️
                    </button>
                </td>
            `;

      const transferBtn = row.querySelector('.transfer-btn-compact');
      if (transferBtn && !transferBtn.disabled) {
        transferBtn.addEventListener('click', () => openTransferModalByKey(key));
      }
      tbody.appendChild(row);
    });
  }

  // Фильтрация игроков
  function filterPlayers() {
    const searchTerm =
      document.getElementById('transfer-player-search')?.value?.toLowerCase() || '';
    const teamFilterValue = document.getElementById('transfer-team-filter')?.value || '';

    let filtered = allPlayers;

    // Фильтр по поиску (имя игрока)
    if (searchTerm) {
      filtered = filtered.filter(player => player.full_name.toLowerCase().includes(searchTerm));
    }

    // Фильтр по команде
    if (teamFilterValue) {
      filtered = filtered.filter(player => String(player.team_id) === teamFilterValue);
    }

    renderPlayersTable(filtered);
  }

  // Очистка поиска
  function clearSearch() {
    const searchInput = document.getElementById('transfer-player-search');
    const teamFilter = document.getElementById('transfer-team-filter');

    if (searchInput) searchInput.value = '';
    if (teamFilter) teamFilter.value = '';

    renderPlayersTable();
  }

  // Открытие модального окна трансфера
  function openTransferModalByKey(playerKey) {
    const modal = document.getElementById('transfer-player-modal');
    const playerNameEl = document.getElementById('transfer-player-name');
    const currentTeamEl = document.getElementById('transfer-current-team');
    const targetTeamSelect = document.getElementById('transfer-target-team');

    if (!modal) return;

    const player = playersByKey.get(playerKey) || globalPlayersByKey.get(playerKey);
    if (!player) {
      showNotification('Игрок не найден в загруженном составе', 'error');
      return;
    }

    if (!player.transferEligible) {
      showNotification(
        'Сначала мигрируйте игрока в нормализованный состав, затем повторите попытку',
        'warning'
      );
      return;
    }

    currentPlayerData = { key: playerKey, player };

    if (playerNameEl) playerNameEl.textContent = getPlayerDisplayName(player);
    if (currentTeamEl) currentTeamEl.textContent = player.team_name || '—';

    // Очищаем и заполняем селект команд (исключая текущую)
    if (targetTeamSelect) {
      targetTeamSelect.innerHTML = '<option value="">Выберите команду...</option>';
      allTeams.forEach(team => {
        if (team.id !== player.team_id) {
          const option = document.createElement('option');
          option.value = String(team.id);
          option.textContent = team.name;
          targetTeamSelect.appendChild(option);
        }
      });
    }

    modal.style.display = 'flex';
  }

  function openTransferModal(playerIdentifier, legacyTeamName) {
    if (playersByKey.has(playerIdentifier)) {
      openTransferModalByKey(playerIdentifier);
      return;
    }
    if (legacyTeamName !== undefined) {
      const fallback = allPlayers.find(
        player =>
          getPlayerDisplayName(player) === playerIdentifier && player.team_name === legacyTeamName
      );
      if (fallback?.roster_key) {
        openTransferModalByKey(fallback.roster_key);
        return;
      }
    }
    showNotification('Игрок не найден в текущем составе', 'error');
  }

  // Закрытие модального окна трансфера
  function closeTransferModal() {
    const modal = document.getElementById('transfer-player-modal');
    const targetTeamSelect = document.getElementById('transfer-target-team');

    if (modal) modal.style.display = 'none';
    if (targetTeamSelect) targetTeamSelect.value = '';

    currentPlayerData = null;
  }

  // Добавление в очередь трансферов
  function addToTransferQueue() {
    if (!currentPlayerData || !currentPlayerData.player) return;

    const targetTeamSelect = document.getElementById('transfer-target-team');
    const targetTeamValue = targetTeamSelect?.value;
    if (!targetTeamValue) {
      showNotification('Выберите команду для перевода', 'error');
      return;
    }

    const targetTeam = allTeams.find(team => String(team.id) === targetTeamValue);
    if (!targetTeam) {
      showNotification('Команда не найдена', 'error');
      return;
    }

    const player = currentPlayerData.player;
    if (String(player.team_id) === String(targetTeam.id)) {
      showNotification('Игрок уже числится в этой команде', 'warning');
      return;
    }

    // Проверяем, что игрок еще не в очереди
    const existingTransfer = transferQueue.find(
      t => t.player_key === currentPlayerData.key && String(t.to_team_id) === String(targetTeam.id)
    );

    if (existingTransfer) {
      showNotification('Игрок уже добавлен в очередь переводов', 'warning');
      return;
    }

    // Добавляем в очередь
    transferQueue.push({
      player_key: currentPlayerData.key,
      team_player_id: player.team_player_id ?? null,
      player_id: player.player_id ?? null,
      from_team_id: player.team_id ?? null,
      to_team_id: targetTeam.id,
      from_team: player.team_name,
      to_team: targetTeam.name,
      player_name: getPlayerDisplayName(player),
      roster_source: player.roster_source || 'normalized',
    });

    updateTransferQueueDisplay();
    closeTransferModal();
    renderPlayersTable(); // Перерисовываем таблицу чтобы показать статус

    showNotification(
      `Игрок ${getPlayerDisplayName(player)} добавлен в очередь переводов`,
      'success'
    );
  }

  // Обновление отображения очереди трансферов
  function updateTransferQueueDisplay() {
    const countEl = document.getElementById('transfer-count');
    const emptyStateEl = document.getElementById('transfer-queue-empty');
    const contentEl = document.getElementById('transfer-queue-content');
    const listEl = document.getElementById('transfer-queue-list');
    const saveBtn = document.getElementById('transfer-save-all');

    if (countEl) countEl.textContent = transferQueue.length;

    if (transferQueue.length === 0) {
      if (emptyStateEl) emptyStateEl.style.display = 'flex';
      if (contentEl) contentEl.style.display = 'none';
    } else {
      if (emptyStateEl) emptyStateEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'flex';
    }

    if (saveBtn) {
      saveBtn.disabled = transferQueue.length === 0;
    }

    if (listEl) {
      listEl.innerHTML = '';
      transferQueue.forEach((transfer, index) => {
        const item = document.createElement('div');
        item.className = 'queue-item-compact';
        item.innerHTML = `
                    <div class="transfer-info-compact">
                        <div class="player-in-queue">${transfer.player_name}</div>
                        <div class="transfer-direction-compact">
                            ${transfer.from_team} → ${transfer.to_team}
                        </div>
                    </div>
                    <button class="remove-btn-compact" onclick="window.TransferManager.removeFromQueue(${index})" title="Удалить">
                        ✕
                    </button>
                `;
        listEl.appendChild(item);
      });
    }
  }

  // Удаление из очереди трансферов
  function removeFromQueue(index) {
    if (index >= 0 && index < transferQueue.length) {
      const removed = transferQueue.splice(index, 1)[0];
      updateTransferQueueDisplay();
      renderPlayersTable(); // Перерисовываем таблицу
      showNotification(`Перевод ${removed.player_name} удален из очереди`, 'info');
    }
  }

  // Очистка всей очереди
  function clearTransferQueue() {
    if (transferQueue.length === 0) return;

    if (confirm(`Удалить все ${transferQueue.length} переводов из очереди?`)) {
      transferQueue = [];
      updateTransferQueueDisplay();
      renderPlayersTable();
      showNotification('Очередь переводов очищена', 'info');
    }
  }

  // Сохранение всех трансферов
  function saveAllTransfers() {
    if (transferQueue.length === 0) return;

    const modal = document.getElementById('transfer-confirm-modal');
    const listEl = document.getElementById('transfer-confirm-list');

    if (!modal || !listEl) return;

    // Заполняем список трансферов для подтверждения
    listEl.innerHTML = '';
    transferQueue.forEach((transfer, index) => {
      const item = document.createElement('div');
      item.className = 'confirm-item';
      item.innerHTML = `
                <div class="confirm-transfer">
                    ${index + 1}. <strong>${transfer.player_name}</strong>
                    <span class="transfer-direction">${transfer.from_team} → ${transfer.to_team}</span>
                </div>
            `;
      listEl.appendChild(item);
    });

    modal.style.display = 'flex';
  }

  // Закрытие модального окна подтверждения
  function closeConfirmModal() {
    const modal = document.getElementById('transfer-confirm-modal');
    const titleInput = document.getElementById('transfer-news-title');

    if (modal) modal.style.display = 'none';
    if (titleInput) titleInput.value = '';
  }

  // Выполнение трансферов
  async function executeTransfers() {
    const executeBtn = document.getElementById('transfer-confirm-execute');
    const customTitle = document.getElementById('transfer-news-title')?.value?.trim() || '';

    if (!executeBtn || transferQueue.length === 0) return;

    const originalText = executeBtn.textContent;
    executeBtn.disabled = true;
    executeBtn.textContent = 'Выполняется...';

    try {
      // Выполняем переводы по одному
      const successfulTransfers = [];
      const failedTransfers = [];

      for (const transfer of transferQueue) {
        try {
          const response = await fetch('/api/admin/players/transfer', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(transfer),
          });

          if (response.ok) {
            successfulTransfers.push(transfer);
          } else {
            const errorData = await response.json();
            failedTransfers.push({
              ...transfer,
              error: errorData.error || 'Unknown error',
            });
          }
        } catch (error) {
          failedTransfers.push({
            ...transfer,
            error: error.message,
          });
        }
      }

      // Создаем новость о трансферах, если есть успешные переводы
      if (successfulTransfers.length > 0) {
        try {
          await fetch('/api/admin/transfers/news', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              transfers: successfulTransfers,
              news_title: customTitle,
            }),
          });
        } catch (newsError) {
          console.warn('Failed to create transfer news:', newsError);
        }
      }

      // Очищаем очередь и закрываем модальное окно
      transferQueue = [];
      updateTransferQueueDisplay();
      closeConfirmModal();

      // Перезагружаем данные
      await loadAllPlayers(true);

      // Показываем результат
      if (successfulTransfers.length > 0 && failedTransfers.length === 0) {
        showNotification(
          `Все ${successfulTransfers.length} переводов выполнены успешно! Новость создана.`,
          'success'
        );
      } else if (successfulTransfers.length > 0) {
        showNotification(
          `${successfulTransfers.length} переводов выполнено успешно, ${failedTransfers.length} с ошибками.`,
          'warning'
        );
      } else {
        showNotification('Все переводы завершились ошибками', 'error');
      }

      // Показываем детали ошибок если есть
      if (failedTransfers.length > 0) {
        console.error('Failed transfers:', failedTransfers);
      }
    } catch (error) {
      console.error('Execute transfers error:', error);
      showNotification('Ошибка при выполнении трансферов: ' + error.message, 'error');
    } finally {
      executeBtn.disabled = false;
      executeBtn.textContent = originalText;
    }
  }

  // Инициализация
  function initTransferManager() {
    console.log('[TransferManager] Initializing transfer management system');

    // Подписываемся на события поиска
    const searchInput = document.getElementById('transfer-player-search');
    const teamFilter = document.getElementById('transfer-team-filter');
    const clearSearchBtn = document.getElementById('transfer-clear-search');
    const refreshBtn = document.getElementById('transfer-refresh-btn');

    if (searchInput) {
      searchInput.addEventListener('input', debounce(filterPlayers, 300));
    }

    if (teamFilter) {
      teamFilter.addEventListener('change', filterPlayers);
    }

    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', clearSearch);
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        await loadTeams();
        await loadAllPlayers(true);
      });
    }

    // Кнопки управления очередью
    const saveAllBtn = document.getElementById('transfer-save-all');
    const clearAllBtn = document.getElementById('transfer-clear-all');
    const addToQueueBtn = document.getElementById('transfer-add-to-queue');
    const executeBtn = document.getElementById('transfer-confirm-execute');

    if (saveAllBtn) {
      saveAllBtn.addEventListener('click', saveAllTransfers);
    }

    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', clearTransferQueue);
    }

    if (addToQueueBtn) {
      addToQueueBtn.addEventListener('click', addToTransferQueue);
    }

    if (executeBtn) {
      executeBtn.addEventListener('click', executeTransfers);
    }

    // Загрузка начальных данных
    loadTeams().then(() => {
      loadAllPlayers();
    });
  }

  // Экспортируем API в глобальную область видимости
  window.TransferManager = {
    init: initTransferManager,
    openTransferModal,
    openTransferModalByKey,
    closeTransferModal,
    closeConfirmModal,
    removeFromQueue,
    loadAllPlayers,
    clearSearch,
  };

  // Автоинициализация при загрузке DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTransferManager);
  } else {
    initTransferManager();
  }
})();
