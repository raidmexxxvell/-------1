/**
 * Real-time updates через WebSocket для мгновенного отображения изменений
 * Минимизирует количество polling запросов к серверу
 */

class RealtimeUpdater {
    constructor() {
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.isConnected = false;
        this.callbacks = new Map();
        this.debug = localStorage.getItem('websocket_debug') === 'true';
    // Версионность коэффициентов по матчу: key = "home|away" → int
    this.oddsVersions = new Map();
    // Feature flag for topic-based subscriptions (from template meta)
    this.topicEnabled = !!window.__WS_TOPIC_SUBS__;
        
        this.initSocket();
    }
    
    initSocket() {
        try {
            if (!window.__WEBSOCKETS_ENABLED__) {  return; }
            // Проверяем поддержку Socket.IO
            if (typeof io === 'undefined') { return; }
            // Пробный ping на /socket.io/ без апгрейда: если 4xx/5xx — не подключаемся
            const probeUrl = '/socket.io/?EIO=4&transport=polling&t=' + Date.now();
            fetch(probeUrl, { method: 'GET', cache: 'no-store', redirect: 'manual' })
                .then(r => {
                    if (!r || !r.ok) {
                        window.__WEBSOCKETS_ENABLED__ = false;
                        return null;
                    }
                    // ok → инициализируем соединение
                    this.socket = io({
                        transports: ['websocket','polling'],
                        upgrade: true,
                        rememberUpgrade: true,
                        timeout: 20000,
                        forceNew: false
                    });
                    this.setupEventHandlers();
                    return true;
                })
                .catch(() => { window.__WEBSOCKETS_ENABLED__ = false; });
        } catch (error) {
            
        }
    }
    
    setupEventHandlers() {
        if (!this.socket) return;
        
    this.socket.on('connect', () => {
            
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            // Уведомляем сервер о подключении пользователя
            const initData = window.Telegram?.WebApp?.initData;
            if (initData) {
                this.socket.emit('user_connected', { initData });
            }
        });
        
    this.socket.on('disconnect', (reason) => {
            
            this.isConnected = false;
            
            if (reason === 'io server disconnect') {
                // Сервер принудительно отключил - переподключаемся
                this.scheduleReconnect();
            }
        });
        
        this.socket.on('connect_error', (error) => {
            
            this.isConnected = false;
            this.scheduleReconnect();
        });
        
        // Основной обработчик обновлений данных
        this.socket.on('data_changed', (message) => {
            this.handleDataUpdate(message);
        });
        
        // Компактные патчи данных
        this.socket.on('data_patch', (patch) => {
            this.handleDataPatch(patch);
        });

        // Событие завершения матча (содержит optional results_block для мгновенного UX)
        this.socket.on('match_finished', (payload) => {
            try {
                if(!payload || !payload.home || !payload.away) return;
                const { home, away } = payload;
                // Удаляем live-бейджи и кнопку на открытом экране (если админ)
                try {
                    document.querySelectorAll('.live-badge').forEach(b=>{
                        const wrap = b.closest('#ufo-match-details');
                        if(wrap) b.remove();
                    });
                    const btn=document.getElementById('md-finish-btn'); if(btn) btn.style.display='none';
                } catch(_){}
                // Мгновенно скрываем матч из расписания (плавно)
                try {
                    const cards=document.querySelectorAll('.match-card');
                    cards.forEach(c=>{
                        const h=c.querySelector('.team.home .team-name')?.textContent?.trim();
                        const a=c.querySelector('.team.away .team-name')?.textContent?.trim();
                        if(h===home && a===away){
                            c.style.transition='opacity .35s ease';
                            c.style.opacity='0';
                            setTimeout(()=>{ try { c.remove(); } catch(_){} }, 360);
                        }
                    });
                } catch(_){}
                // Если пришёл актуальный блок результатов, обновим локально без fetch
                if(payload.results_block){
                    try {
                        const data = payload.results_block;
                        localStorage.setItem('results', JSON.stringify({ data, ts: Date.now() }));
                        const pane = document.getElementById('league-pane-results');
                        if(pane && window.League && typeof window.League.renderResults==='function'){
                            window.League.renderResults(pane, { results: data.results });
                        }
                    } catch(_){}
                }
                // Фоновая синхронизация (расписание нужно обновить в любом случае)
                this.refreshSchedule();
                if(!payload.results_block){
                    setTimeout(()=>this.triggerDataRefresh('results'), 150);
                }
                // Точечное обновление открытых экранов команд (без fetch если текущая вкладка команды активна)
                try {
                    const teamPane = document.getElementById('ufo-team');
                    if(teamPane && teamPane.style.display !== 'none'){
                        const nameEl = document.getElementById('team-name');
                        const openedTeam = nameEl ? nameEl.textContent.trim() : '';
                        // Если открыт экран одной из команд матча — инвалидация кэша + форсированный refresh
                        if(openedTeam && (openedTeam===home || openedTeam===away)){
                            // Удаляем ETag кэш, чтобы следующий fetch не получил 304 со старым snapshot
                            const cacheKey = `team:overview:${openedTeam.toLowerCase()}`;
                            try { localStorage.removeItem(cacheKey); } catch(_) {}
                            // Попробуем лёгкий refetch (используем имеющийся API TeamPage)
                            if(window.TeamPage && typeof window.TeamPage.openTeam==='function'){
                                // Перерисуем асинхронно, чтобы не блокировать основной поток применения события
                                setTimeout(()=>{ try { window.TeamPage.openTeam(openedTeam); } catch(_){} }, 50);
                            }
                        }
                    }
                } catch(_){}
                // Обновление таблицы лиги (live проекция) — быстрый refresh чтобы отразить победы/очки
                try { this.refreshTable(); } catch(_){}
            } catch(_){}
        });

        // Обработчик live обновлений матчей
        this.socket.on('live_update', (message) => {
            this.handleLiveUpdate(message);
        });
        
        if (this.debug) {
            this.socket.onAny((eventName, ...args) => {
                
            });
        }

    // Если включены topic-подписки, экспонируем subscribe/unsubscribe
    this.topicEnabled = !!window.__WS_TOPIC_SUBS__;
    }
    
    handleDataPatch(patch) {
        if (!patch || patch.type !== 'data_patch') return;
        const { entity, id, fields } = patch;
        try {
            if (entity === 'match') {
                // ожидаем id как {home, away}
                if (id && id.home && id.away) {
                    // Версия коэффициентов (если есть) — сохраняем
                    if (fields && fields.odds_version != null) {
                        this._setOddsVersion(id.home, id.away, Number(fields.odds_version) || 0);
                    }
                    // локальное обновление счёта, если передан
                    if (fields && (fields.score_home !== undefined || fields.score_away !== undefined)) {
                        this.updateMatchScore(id.home, id.away, {
                            score_home: fields.score_home,
                            score_away: fields.score_away
                        });
                    }
                    // если прилетели составы или статус — пробрасываем в matchDetailsUpdate
                    const other = { ...fields };
                    delete other.score_home; delete other.score_away;
                    delete other.odds_version;
                    if (Object.keys(other).length) {
                        this.refreshMatchDetails({ home: id.home, away: id.away, ...other });
                    }
                }
                return;
            }
            if (entity === 'odds') {
                // id может быть строкой (старый формат) или объектом {home, away, date}
                let home, away, date;
                if (typeof id === 'string') {
                    [home, away, date] = id.split('_');
                } else if (id && typeof id === 'object') {
                    home = id.home;
                    away = id.away;
                    date = id.date;
                }

                if (!home || !away) return;

                const incomingV = (fields && fields.odds_version != null) ? Number(fields.odds_version) : null;
                if (incomingV != null) {
                    const cur = this._getOddsVersion(home, away);
                    if (incomingV < cur) { return; }
                    if (incomingV > cur) { this._setOddsVersion(home, away, incomingV); }
                }
                // Пробрасываем событие вниз по UI
                this.refreshBettingOdds({ ...(fields || {}), home, away, date, odds_version: incomingV });
                return;
            }
            // по умолчанию — общий refresh
            this.triggerDataRefresh(entity);
        } catch (_) { }
    }

    _ovKey(home, away) {
        return `${(home||'').trim()}|${(away||'').trim()}`;
    }
    _getOddsVersion(home, away) {
        const k = this._ovKey(home, away);
        return Number(this.oddsVersions.get(k) || 0);
    }
    _setOddsVersion(home, away, v) {
        try { this.oddsVersions.set(this._ovKey(home, away), Number(v)||0); } catch(_) {}
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            
            return;
        }
        
        this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    // Планируем повторное подключение через delay мс (экспоненциальная задержка)
        
        setTimeout(() => {
            if (!this.isConnected) {
                this.socket?.connect();
            }
        }, delay);
    }
    
    handleDataUpdate(message) {
        const { type, data_type, data, timestamp } = message;
        
        if (this.debug) {
            
        }
        
        // Вызываем зарегистрированные callbacks
        const callbacks = this.callbacks.get(data_type) || [];
        callbacks.forEach(callback => {
            try {
                callback(data, timestamp);
            } catch (error) {
                
            }
        });
        
        // Стандартные обновления UI
        this.updateUI(data_type, data, timestamp);
    }
    
    handleLiveUpdate(message) {
        const { home, away, data } = message;
        
        if (this.debug) {
            
        }
        
        // Обновляем счет матча в real-time
        this.updateMatchScore(home, away, data);
        
        // Показываем уведомление
        this.showNotification(`${home} ${data.score_home || 0} - ${data.score_away || 0} ${away}`);
    }
    
    updateUI(dataType, data, timestamp) {
        switch (dataType) {
            case 'league_table':
                this.refreshLeagueTable();
                break;
                
            case 'schedule':
                this.refreshSchedule();
                break;
                
            case 'match_details':
                this.refreshMatchDetails(data);
                break;
                
            case 'betting_odds':
                this.refreshBettingOdds(data);
                break;
            case 'lineups_updated':
                // Авто-обновление составов конкретного матча
                this.handleLineupsUpdated(data);
                break;
                
            default:
                // Общее обновление данных
                this.triggerDataRefresh(dataType);
        }
    }

    handleLineupsUpdated(data){
        try {
            if(!data) return;
            // Проверяем, есть ли на странице что-то связанное с матчем (ростер или карточка матча)
            const selectorMatchCard = `[data-match-home="${data.home}"][data-match-away="${data.away}"]`;
            const rosterPresent = document.querySelector('.roster-table') || document.querySelector(selectorMatchCard);
            if(!rosterPresent){
                // Ничего подходящего – пропускаем тихо
                return;
            }
            // Фетчим свежие детали матча, чтобы получить обновлённые составы
            if(data.home && data.away){
                                const params = new URLSearchParams({ home: data.home, away: data.away });
                                // сначала пробуем новый компактный эндпоинт из БД
                                fetch(`/api/match/lineups?${params.toString()}`, { headers: { 'Cache-Control':'no-store' } })
                                    .then(r=> r.ok? r.json(): Promise.reject(new Error('HTTP '+r.status)))
                                    .then(dbPayload => {
                                            // Трансформируем в формат match-details (минимум, чтобы слушатели отработали)
                                            const details = { rosters: dbPayload.rosters || {home:[],away:[]}, source: 'db' };
                                            this.refreshMatchDetails(details);
                                            this.showNotification(`Обновлены составы: ${data.home} vs ${data.away}`);
                                    })
                                    .catch(_=>{
                                        // fallback на старый эндпоинт, если ошибка
                                        fetch(`/api/match-details?${params.toString()}`, { headers: { 'Cache-Control':'no-store' } })
                                            .then(r=> r.ok? r.json(): Promise.reject(new Error('HTTP '+r.status)))
                                            .then(details => { this.refreshMatchDetails(details); this.showNotification(`Обновлены составы: ${data.home} vs ${data.away}`); })
                                            .catch(()=>{});
                                    });
            }
        } catch(_) {}
    }
    
    updateMatchScore(home, away, data) {
        // Обновляем отображение счета матча
        const matchElements = document.querySelectorAll(`[data-match-home="${home}"][data-match-away="${away}"]`);
        
        matchElements.forEach(element => {
            const scoreElement = element.querySelector('.match-score');
            if (scoreElement && data.score_home !== undefined && data.score_away !== undefined) {
                scoreElement.textContent = `${data.score_home} - ${data.score_away}`;
                
                // Добавляем анимацию обновления
                scoreElement.classList.add('score-updated');
                setTimeout(() => {
                    scoreElement.classList.remove('score-updated');
                }, 2000);
            }
        });
    }
    
    showNotification(message) {
        // system notification (browser) optional
        try {
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('Лига Обнинска', { body: message, icon: '/static/img/logo.png', silent: true });
            }
        } catch(_) {}
        // Unified UI notification
        if (window.NotificationSystem) {
            window.NotificationSystem.show(message, 'info', 4000);
        } else if (window.showAlert) {
            window.showAlert(message, 'info');
        } else {
            try {  } catch(_) {}
        }
    }
    
    // API для подписки на обновления
    subscribe(dataType, callback) {
        if (!this.callbacks.has(dataType)) {
            this.callbacks.set(dataType, []);
        }
        this.callbacks.get(dataType).push(callback);
    }
    
    unsubscribe(dataType, callback) {
        const callbacks = this.callbacks.get(dataType);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }
    
    // Методы для принудительного обновления UI
    refreshLeagueTable() {
        if (typeof window.League?.refreshTable === 'function') {
            window.League.refreshTable();
        }
    }
    
    refreshSchedule() {
        if (typeof window.League?.refreshSchedule === 'function') {
            window.League.refreshSchedule();
        }
    }
    
    refreshMatchDetails(data) {
        // Обновляем детали матча
        const event = new CustomEvent('matchDetailsUpdate', { detail: data });
        document.dispatchEvent(event);
    }
    
    refreshBettingOdds(data) {
        // Обновляем коэффициенты ставок
        const event = new CustomEvent('bettingOddsUpdate', { detail: data });
        document.dispatchEvent(event);
    }
    
    triggerDataRefresh(dataType) {
        // Общий триггер обновления данных
        const event = new CustomEvent('dataRefresh', { detail: { type: dataType } });
        document.dispatchEvent(event);
    }
    
    // Подключение к комнате матча для live обновлений
    joinMatchRoom(home, away) {
        if (this.socket && this.isConnected) {
            this.socket.emit('join_match_room', { home, away });
        }
    }
    
    leaveMatchRoom(home, away) {
        if (this.socket && this.isConnected) {
            this.socket.emit('leave_match_room', { home, away });
        }
    }
    
    // Новые topic-based подписки (за фиче-флагом)
    subscribeTopic(topic){
        try {
            if(!this.socket || !this.isConnected || !this.topicEnabled) return;
            if(!topic || typeof topic!== 'string') return;
            this.socket.emit('subscribe', { topic });
        } catch(_) {}
    }
    unsubscribeTopic(topic){
        try {
            if(!this.socket || !this.isConnected || !this.topicEnabled) return;
            if(!topic || typeof topic!== 'string') return;
            this.socket.emit('unsubscribe', { topic });
        } catch(_) {}
    }

    // Статус подключения
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts,
            socket: !!this.socket
        };
    }
}

// Глобальная инициализация
window.realtimeUpdater = null;

// Инициализируем после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    // Запрашиваем разрешение на уведомления
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    // Инициализируем updater с небольшой задержкой
    setTimeout(() => {
        window.realtimeUpdater = new RealtimeUpdater();
    }, 1000);
});

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RealtimeUpdater;
}
