/**
 * Player Migration Step 4: Frontend updates for normalized players
 * This file contains updated JavaScript for admin-enhanced.js
 */

// ==================== UPDATED ADMIN FUNCTIONS ====================

window.AdminEnhanced = window.AdminEnhanced || {};

/**
 * Updated openTeamRoster function with dual-read support
 */
window.AdminEnhanced.openTeamRosterNormalized = function(teamId, teamName) {
    const modal = document.getElementById('team-roster-modal');
    const title = document.getElementById('team-roster-title');
    const statusDiv = document.getElementById('team-roster-status');
    const tableBody = document.getElementById('team-roster-table');
    
    if (!modal || !title || !tableBody) {
        console.error('Team roster modal elements not found');
        return;
    }
    
    title.textContent = `Состав команды: ${teamName}`;
    statusDiv.style.display = 'block';
    statusDiv.textContent = 'Загрузка...';
    statusDiv.className = 'status-text';
    tableBody.innerHTML = '';
    
    // Store team info for later use
    modal.dataset.teamId = teamId;
    modal.dataset.teamName = teamName;
    
    // Try normalized API first, fallback to legacy
    fetch(`/api/admin/teams/${teamId}/roster/normalized`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        }
        // If normalized fails, try legacy
        console.warn('Normalized API failed, trying legacy');
        return fetch(`/api/admin/teams/${teamId}/roster`)
            .then(r => r.json())
            .then(data => {
                data.source = 'legacy'; // Mark as legacy source
                return data;
            });
    })
    .then(data => {
        statusDiv.style.display = 'none';
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        const players = data.players || [];
        const source = data.source || 'unknown';
        
        if (players.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Нет игроков</td></tr>';
        } else {
            renderPlayersTable(tableBody, players, source);
        }
        
        // Show add player button for normalized source
        if (source === 'normalized') {
            showAddPlayerButton(modal, teamId);
        }
    })
    .catch(error => {
        console.error('Error loading team roster:', error);
        statusDiv.style.display = 'block';
        statusDiv.textContent = `Ошибка: ${error.message}`;
        statusDiv.className = 'status-text error';
    });
    
    modal.style.display = 'block';
};

/**
 * Render players table with normalized data
 */
function renderPlayersTable(tableBody, players, source) {
    tableBody.innerHTML = '';
    
    players.forEach((player, index) => {
        const row = document.createElement('tr');
        row.dataset.playerId = player.id;
        
        // Handle both normalized and legacy formats
        const firstName = player.first_name || '';
        const lastName = player.last_name || '';
        const fullName = source === 'legacy' ? player.name || `${firstName} ${lastName}`.trim() : `${firstName} ${lastName}`.trim();
        const position = player.position || '';
        const matches = player.matches_played || player.games || 0;
        const goals = player.goals || player.goals_scored || 0;
        const assists = player.assists || 0;
        const yellowCards = player.yellow_cards || player.yellows || 0;
        const redCards = player.red_cards || player.reds || 0;
        const totalPoints = player.total_points || (goals + assists) || 0;
        
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>
                <input type="text" value="${firstName}" class="player-input" 
                       data-field="first_name" ${source === 'legacy' ? 'readonly' : ''}>
            </td>
            <td>
                <input type="text" value="${lastName}" class="player-input" 
                       data-field="last_name" ${source === 'legacy' ? 'readonly' : ''}>
            </td>
            <td>
                <input type="text" value="${position}" class="player-input" 
                       data-field="position" ${source === 'legacy' ? 'readonly' : ''}>
            </td>
            <td>${matches}</td>
            <td>${goals}</td>
            <td>${assists}</td>
            <td>${yellowCards}/${redCards}</td>
            <td class="actions">
                ${source === 'normalized' ? `
                    <button onclick="savePlayerChanges(${player.id})" class="btn-small">Сохранить</button>
                    <button onclick="deletePlayer(${player.id})" class="btn-small btn-danger">Удалить</button>
                ` : `
                    <span class="legacy-indicator">Legacy</span>
                `}
            </td>
        `;
        
        tableBody.appendChild(row);
    });
}

/**
 * Show add player button
 */
function showAddPlayerButton(modal, teamId) {
    let addButton = modal.querySelector('.add-player-button');
    if (!addButton) {
        addButton = document.createElement('button');
        addButton.className = 'add-player-button btn-primary';
        addButton.textContent = 'Добавить игрока';
        addButton.onclick = () => showAddPlayerForm(teamId);
        
        const modalContent = modal.querySelector('.modal-content');
        modalContent.appendChild(addButton);
    }
    addButton.style.display = 'block';
}

/**
 * Show add player form
 */
function showAddPlayerForm(teamId) {
    const firstName = prompt('Имя игрока:');
    if (!firstName) return;
    
    const lastName = prompt('Фамилия игрока (необязательно):') || '';
    const position = prompt('Позиция (необязательно):') || '';
    
    createPlayer({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        position: position.trim(),
        team_id: teamId
    });
}

/**
 * Create new player
 */
function createPlayer(playerData) {
    fetch('/api/admin/players', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(playerData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            throw new Error(data.error);
        }
        
        alert('Игрок создан успешно');
        // Refresh roster
        const modal = document.getElementById('team-roster-modal');
        const teamId = modal.dataset.teamId;
        const teamName = modal.dataset.teamName;
        if (teamId && teamName) {
            window.AdminEnhanced.openTeamRosterNormalized(teamId, teamName);
        }
    })
    .catch(error => {
        console.error('Error creating player:', error);
        alert(`Ошибка создания игрока: ${error.message}`);
    });
}

/**
 * Save player changes
 */
function savePlayerChanges(playerId) {
    const row = document.querySelector(`tr[data-player-id="${playerId}"]`);
    if (!row) return;
    
    const inputs = row.querySelectorAll('.player-input');
    const updateData = {};
    
    inputs.forEach(input => {
        const field = input.dataset.field;
        const value = input.value.trim();
        if (value) {
            updateData[field] = value;
        }
    });
    
    fetch(`/api/admin/players/${playerId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            throw new Error(data.error);
        }
        
        alert('Изменения сохранены');
    })
    .catch(error => {
        console.error('Error updating player:', error);
        alert(`Ошибка обновления: ${error.message}`);
    });
}

/**
 * Delete player
 */
function deletePlayer(playerId) {
    if (!confirm('Удалить игрока?')) return;
    
    fetch(`/api/admin/players/${playerId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            throw new Error(data.error);
        }
        
        alert('Игрок удален');
        // Remove row from table
        const row = document.querySelector(`tr[data-player-id="${playerId}"]`);
        if (row) {
            row.remove();
        }
    })
    .catch(error => {
        console.error('Error deleting player:', error);
        alert(`Ошибка удаления: ${error.message}`);
    });
}

/**
 * Close team roster modal
 */
window.AdminEnhanced.closeTeamRoster = function() {
    const modal = document.getElementById('team-roster-modal');
    if (modal) {
        modal.style.display = 'none';
        
        // Hide add player button
        const addButton = modal.querySelector('.add-player-button');
        if (addButton) {
            addButton.style.display = 'none';
        }
    }
};

// ==================== INTEGRATION HELPERS ====================

/**
 * Initialize migration step 4 - update existing openTeamRoster calls
 */
window.AdminEnhanced.initMigrationStep4 = function() {
    // Replace existing openTeamRoster function
    if (window.AdminEnhanced.openTeamRoster) {
        window.AdminEnhanced.openTeamRosterLegacy = window.AdminEnhanced.openTeamRoster;
    }
    window.AdminEnhanced.openTeamRoster = window.AdminEnhanced.openTeamRosterNormalized;
    
    console.log('Migration Step 4: Frontend updated to use normalized player API');
};

// Auto-initialize if not already done
if (!window.AdminEnhanced._step4Initialized) {
    window.AdminEnhanced.initMigrationStep4();
    window.AdminEnhanced._step4Initialized = true;
}