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
        option.value = team.name;
        option.textContent = team.name;
        teamFilter.appendChild(option);
      });
    }

    if (targetTeamSelect) {
      targetTeamSelect.innerHTML = '<option value="">Выберите команду...</option>';
      allTeams.forEach(team => {
        const option = document.createElement('option');
        option.value = team.name;
        option.textContent = team.name;
        targetTeamSelect.appendChild(option);
      });
    }
  }

  // Загрузка всех игроков
  async function loadAllPlayers() {
    const loadingEl = document.getElementById('transfer-loading');
    const tableEl = document.getElementById('transfer-players-table');
    const noDataEl = document.getElementById('transfer-no-players');

    if (loadingEl) loadingEl.style.display = 'block';
    if (tableEl) tableEl.style.display = 'none';
    if (noDataEl) noDataEl.style.display = 'none';

    try {
      allPlayers = [];

      // Загружаем игроков для каждой команды
      const loadPromises = allTeams.map(async team => {
        try {
          const response = await fetch(`/api/admin/teams/${team.id}/roster`);
          if (!response.ok) throw new Error(`Failed to load roster for ${team.name}`);

          const data = await response.json();
          const players = data.players || [];

          // Добавляем информацию о команде к каждому игроку
          return players.map(player => ({
            ...player,
            team_name: team.name,
            team_id: team.id,
            full_name: `${player.first_name || ''} ${player.last_name || ''}`.trim(),
          }));
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
      return;
    }

    if (tableEl) tableEl.style.display = 'table';
    if (noDataEl) noDataEl.style.display = 'none';

    tbody.innerHTML = '';

    playersToShow.forEach(player => {
      const row = document.createElement('tr');

      // Проверяем, находится ли игрок в очереди трансферов
      const inQueue = transferQueue.some(
        t => t.player_name === player.full_name && t.from_team === player.team_name
      );

      if (inQueue) {
        row.classList.add('player-in-transfer-queue');
      }

      row.innerHTML = `
                <td class="player-name-compact">
                    <div><strong>${player.full_name || 'Без имени'}</strong></div>
                    ${inQueue ? '<div class="transfer-badge-compact">В очереди</div>' : ''}
                </td>
                <td class="team-name-compact">${player.team_name}</td>
                <td class="stats-compact">${player.goals || 0}/${player.assists || 0}</td>
                <td class="cards-compact">
                    <span>🟡${player.yellow_cards || 0}</span>
                    <span>🔴${player.red_cards || 0}</span>
                </td>
                <td>
                    <button class="transfer-btn-compact" onclick="window.TransferManager.openTransferModal('${player.full_name}', '${player.team_name}')" ${inQueue ? 'disabled' : ''}>
                        ↔️
                    </button>
                </td>
            `;

      tbody.appendChild(row);
    });
  }

  // Фильтрация игроков
  function filterPlayers() {
    const searchTerm =
      document.getElementById('transfer-player-search')?.value?.toLowerCase() || '';
    const teamFilter = document.getElementById('transfer-team-filter')?.value || '';

    let filtered = allPlayers;

    // Фильтр по поиску (имя игрока)
    if (searchTerm) {
      filtered = filtered.filter(player => player.full_name.toLowerCase().includes(searchTerm));
    }

    // Фильтр по команде
    if (teamFilter) {
      filtered = filtered.filter(player => player.team_name === teamFilter);
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
  function openTransferModal(playerName, currentTeam) {
    const modal = document.getElementById('transfer-player-modal');
    const playerNameEl = document.getElementById('transfer-player-name');
    const currentTeamEl = document.getElementById('transfer-current-team');
    const targetTeamSelect = document.getElementById('transfer-target-team');

    if (!modal) return;

    currentPlayerData = { playerName, currentTeam };

    if (playerNameEl) playerNameEl.textContent = playerName;
    if (currentTeamEl) currentTeamEl.textContent = currentTeam;

    // Очищаем и заполняем селект команд (исключая текущую)
    if (targetTeamSelect) {
      targetTeamSelect.innerHTML = '<option value="">Выберите команду...</option>';
      allTeams.forEach(team => {
        if (team.name !== currentTeam) {
          const option = document.createElement('option');
          option.value = team.name;
          option.textContent = team.name;
          targetTeamSelect.appendChild(option);
        }
      });
    }

    modal.style.display = 'flex';
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
    if (!currentPlayerData) return;

    const targetTeam = document.getElementById('transfer-target-team')?.value;
    if (!targetTeam) {
      showNotification('Выберите команду для перевода', 'error');
      return;
    }

    // Проверяем, что игрок еще не в очереди
    const existingTransfer = transferQueue.find(
      t =>
        t.player_name === currentPlayerData.playerName &&
        t.from_team === currentPlayerData.currentTeam
    );

    if (existingTransfer) {
      showNotification('Игрок уже добавлен в очередь переводов', 'warning');
      return;
    }

    // Сохраняем данные игрока перед закрытием модального окна
    const playerName = currentPlayerData.playerName;

    // Добавляем в очередь
    transferQueue.push({
      player_name: currentPlayerData.playerName,
      from_team: currentPlayerData.currentTeam,
      to_team: targetTeam,
    });

    updateTransferQueueDisplay();
    closeTransferModal();
    renderPlayersTable(); // Перерисовываем таблицу чтобы показать статус

    showNotification(`Игрок ${playerName} добавлен в очередь переводов`, 'success');
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
      await loadAllPlayers();

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
        await loadAllPlayers();
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
