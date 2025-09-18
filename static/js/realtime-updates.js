/**
 * Real-time updates через WebSocket для мгновенного отображения изменений
 * Минимизирует количество polling запросов к серверу
 */

function __wsEmit(name, detail){
    try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch(_) {}
}

class RealtimeUpdater {
    constructor() {
        this.socket = null;
        this.reconnectAttempts = 0;
               console.warn(`🔌 Max reconnect attempts (${this.maxReconnectAttempts}) reached`);
        __wsEmit('ws:max_reconnects_reached', { attempts: this.reconnectAttempts });
        
        // Admin logging
        if (window.AdminLogger) {
          window.AdminLogger.error('ws', `Max reconnect attempts reached`, {
            attempts: this.reconnectAttempts,
            maxAttempts: this.maxReconnectAttempts
          });
        }his.maxReconnectAttempts = 8;  // increased from 5
        this.reconnectDelay = 1000;
        this.maxReconnectDelay = 30000; // 30 sec max
        this.jitterFactor = 0.3;        // 30% random jitter
        this.isConnected = false;
        this.callbacks = new Map();
        this.debug = localStorage.getItem('websocket_debug') === 'true';
        // Heartbeat config
        this.heartbeatInterval = null;
        this.heartbeatTimeout = null;
        this.pingInterval = 25000;      // 25 sec ping
        this.pongTimeout = 5000;        // 5 sec pong wait
        this.lastPongTime = 0;
    // Версионность коэффициентов по матчу: key = "home|away" → int
    this.oddsVersions = new Map();
    // Очередь тем для подписки до момента connect
    this.pendingTopics = new Set();
    this.subscribedTopics = new Set();
    // Feature flag for topic-based subscriptions (from template meta)
    this.topicEnabled = !!window.__WS_TOPIC_SUBS__;
        
        this.initSocket();

        // Автоподписка на глобальные обновления (full_reset и т.п.), даже до установления соединения
        try {
            if (this.topicEnabled && typeof this.subscribeTopic === 'function') {
                this.subscribeTopic('global');
            }
        } catch(_) {}
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
            this.setupHeartbeat();
    try { window.RealtimeStore && window.RealtimeStore.set({ connected: true }); } catch(_){}
    __wsEmit('ws:connected', { reconnects: this.reconnectAttempts });
            
            // Уведомляем сервер о подключении пользователя
            const initData = window.Telegram?.WebApp?.initData;
            if (initData) {
                this.socket.emit('user_connected', { initData });
            }
            // Восстановим отложенные topic-подписки (если включены)
            try {
                if (this.topicEnabled) {
                    // Соберём отложенные темы из глобального буфера (если предустановлен до инициализации)
                    const glob = window.__PENDING_WS_TOPICS__;
                    if (glob && typeof glob.forEach === 'function') {
                        glob.forEach(t => { try { this.pendingTopics.add(String(t)); } catch(_){} });
                        try { glob.clear?.(); } catch(_) {}
                    }
                    this.pendingTopics.forEach(topic => {
                        if (!this.subscribedTopics.has(topic)) {
                            this.socket.emit('subscribe', { topic });
                            this.subscribedTopics.add(topic);
                        }
                    });
                }
            } catch(_) {}
        });
        
    this.socket.on('disconnect', (reason) => {
            
            this.isConnected = false;
            this.clearHeartbeat();
            try { window.RealtimeStore && window.RealtimeStore.set({ connected: false }); } catch(_){}
            __wsEmit('ws:disconnected', { reason: reason || '' });
            
            if (reason === 'io server disconnect') {
                // Сервер принудительно отключил - переподключаемся
                this.scheduleReconnect();
            }
        });
        
        this.socket.on('connect_error', (error) => {
            
            this.isConnected = false;
            this.clearHeartbeat();
            try { window.RealtimeStore && window.RealtimeStore.update(s => { s.connected = false; s.reconnects = (s.reconnects||0)+1; }); } catch(_){}
            this.scheduleReconnect();
        });
        
        // Основной обработчик обновлений данных
        this.socket.on('data_changed', (message) => {
            this.handleDataUpdate(message);
        });
        
        // Компактные патчи данных
        this.socket.on('data_patch', (patch) => {
            this.handleDataPatch(patch);
            __wsEmit('ws:data_patch', patch || {});
        });

        // Топиковые уведомления (например, глобальный full_reset)
        this.socket.on('topic_update', (payload) => {
            this.handleTopicUpdate(payload);
            __wsEmit('ws:topic_update', payload || {});
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
                // Принудительное обновление кэшей расписания и результатов для синхронизации
                try { 
                    localStorage.removeItem('league:schedule'); 
                    localStorage.removeItem('league:results');
                    localStorage.removeItem('schedule:tours');
                } catch(_){}
                // Дополнительно обновляем результаты если не было results_block
                if(!payload.results_block){
                    setTimeout(()=>{
                        try { this.triggerDataRefresh('schedule'); } catch(_){}
                    }, 300);
                }
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
    
    handleTopicUpdate(payload){
        try {
            if (!payload || typeof payload !== 'object') return;
            const reason = payload.reason || payload.change_type || '';
            // Точечный триггер обновления статистики матча по WS (без ожидания polling)
            try {
                if (payload.entity === 'match_stats' && payload.home && payload.away) {
                    const ev = new CustomEvent('matchStatsRefresh', { detail: { home: payload.home, away: payload.away } });
                    document.dispatchEvent(ev);
                }
            } catch(_){}
            // Обновление составов/событий: при изменении событий матча перезагружаем детали и оповещаем слушателей
            try {
                if ((payload.entity === 'match_events' || payload.entity === 'match_events_removed') && payload.home && payload.away) {
                    if (typeof window.fetchMatchDetails === 'function') {
                        // Быстрый рефетч только деталей открытого матча
                        window.fetchMatchDetails({ home: payload.home, away: payload.away, forceFresh: true })
                            .then(store => { try { if (store && (store.data||store.raw)) { const d = store.data || store.raw; this.refreshMatchDetails(d); } } catch(_){} })
                            .catch(()=>{});
                    } else {
                        // Fallback: лёгкий запрос без ETag-утилиты
                        const params = new URLSearchParams({ home: payload.home, away: payload.away });
                        fetch(`/api/match-details?${params.toString()}`, { headers: { 'Cache-Control': 'no-store' } })
                            .then(r => r.ok ? r.json() : Promise.reject(new Error('http '+r.status)))
                            .then(d => { try { this.refreshMatchDetails(d); } catch(_){} })
                            .catch(()=>{});
                    }
                }
            } catch(_){}
            // Полный сброс: чистим локальные отметки голосований и восстанавливаем UI
            if (reason === 'full_reset') {
                // 1) Удаляем локальные ключи голосования
                try {
                    const toDel = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (!k) continue;
                        if (k.startsWith('voted:') || k.startsWith('voteAgg:')) toDel.push(k);
                    }
                    toDel.forEach(k => { try { localStorage.removeItem(k); } catch(_){} });
                } catch(_) {}

                // 2) Восстанавливаем кнопки и сбрасываем подтверждение на всех видимых виджетах голосования
                try {
                    document.querySelectorAll('.vote-inline').forEach(wrap => {
                        try {
                            const btns = wrap.querySelector('.vote-inline-btns');
                            const confirm = wrap.querySelector('.vote-confirm');
                            if (confirm) confirm.textContent = '';
                            if (btns) {
                                btns.style.display = '';
                                btns.querySelectorAll('button').forEach(b => b.disabled = false);
                            }
                            // Перезапрашиваем агрегаты, чтобы полоса отразила актуальные значения (обычно нули)
                            const home = wrap.dataset.home || '';
                            const away = wrap.dataset.away || '';
                            const date = wrap.dataset.date || '';
                            if (window.__VoteAgg && typeof window.__VoteAgg.fetchAgg === 'function') {
                                window.__VoteAgg.fetchAgg(home, away, date)
                                    .then(agg => { try { if (typeof wrap.__applyAgg === 'function') wrap.__applyAgg(agg); } catch(_){} })
                                    .catch(()=>{});
                            }
                        } catch(_) {}
                    });
                } catch(_) {}
            }
        } catch(_) {}
    }
    
    handleDataPatch(patch) {
        // Патчи могут приходить без поля type (тип уже задан именем события 'data_patch')
        if (!patch) return;
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
                // Чтобы не конфликтовали ключи 'home' (команда) и 'home' (кэф), помещаем кэфы в под-объект odds,
                // а названия команд передаём как homeTeam/awayTeam.
                const payload = { homeTeam: home, awayTeam: away, date, odds_version: incomingV, odds: { ...(fields || {}) } };
                this.refreshBettingOdds(payload);
                __wsEmit('ws:odds', payload);
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
            console.warn(`🔌 Max reconnect attempts (${this.maxReconnectAttempts}) reached`);
            __wsEmit('ws:max_reconnects_reached', { attempts: this.reconnectAttempts });
            return;
        }
        
        this.clearHeartbeat();
        this.reconnectAttempts++;
        
        // Exponential backoff with jitter
        const baseDelay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        const maxDelay = Math.min(baseDelay, this.maxReconnectDelay);
        const jitter = maxDelay * this.jitterFactor * Math.random();
        const delay = maxDelay + jitter;
        
        console.log(`🔄 Reconnecting in ${Math.round(delay/1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        __wsEmit('ws:reconnect_scheduled', { attempt: this.reconnectAttempts, delay });
        
        // Admin logging
        if (window.AdminLogger) {
          window.AdminLogger.warn('ws', `Reconnecting in ${Math.round(delay/1000)}s`, {
            attempt: this.reconnectAttempts,
            maxAttempts: this.maxReconnectAttempts,
            delay: Math.round(delay)
          });
        }
        
        setTimeout(() => {
            if (!this.isConnected) {
                this.socket?.connect();
            }
        }, delay);
    }
    
    setupHeartbeat() {
        this.clearHeartbeat();
        
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected && this.socket) {
                this.socket.emit('ping', { timestamp: Date.now() });
                
                // Set timeout for pong response
                this.heartbeatTimeout = setTimeout(() => {
                    console.warn('🏓 Pong timeout - disconnecting');
                    this.socket?.disconnect();
                }, this.pongTimeout);
            }
        }, this.pingInterval);
        
        // Listen for pong responses
        if (this.socket) {
            this.socket.on('pong', (data) => {
                this.lastPongTime = Date.now();
                if (this.heartbeatTimeout) {
                    clearTimeout(this.heartbeatTimeout);
                    this.heartbeatTimeout = null;
                }
                if (this.debug) {
                    console.log('🏓 Pong received', data);
                }
            });
        }
    }
    
    clearHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
        }
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
            if(!topic || typeof topic!== 'string') return;
            // Кладём в очередь всегда (на случай вызова до готовности socket)
            this.pendingTopics.add(topic);
            try {
                window.__PENDING_WS_TOPICS__ = window.__PENDING_WS_TOPICS__ || new Set();
                window.__PENDING_WS_TOPICS__.add(topic);
            } catch(_) {}
            if(!this.topicEnabled) return;
            if(this.socket && this.isConnected && !this.subscribedTopics.has(topic)){
                this.socket.emit('subscribe', { topic });
                this.subscribedTopics.add(topic);
                try { window.RealtimeStore && window.RealtimeStore.update(s => { if (!Array.isArray(s.topics)) s.topics = []; if (!s.topics.includes(topic)) s.topics.push(topic); }); } catch(_){}
            }
        } catch(_) {}
    }
    unsubscribeTopic(topic){
        try {
            if(!topic || typeof topic!== 'string') return;
            try { this.pendingTopics.delete(topic); } catch(_) {}
            try { this.subscribedTopics.delete(topic); } catch(_) {}
            try { window.__PENDING_WS_TOPICS__?.delete?.(topic); } catch(_) {}
            if(!this.topicEnabled) return;
            if(this.socket && this.isConnected){ this.socket.emit('unsubscribe', { topic }); }
            try { window.RealtimeStore && window.RealtimeStore.update(s => { s.topics = (s.topics||[]).filter(t => t!==topic); }); } catch(_){}
        } catch(_) {}
    }

    // Проверка состояния topic-подписок/фича-флага
    getTopicEnabled(){
        return !!this.topicEnabled;
    }
    hasTopic(topic){
        try {
            if(!topic) return false;
            return (this.subscribedTopics && this.subscribedTopics.has(topic)) ||
                   (this.pendingTopics && this.pendingTopics.has(topic)) ||
                   (window.__PENDING_WS_TOPICS__ && typeof window.__PENDING_WS_TOPICS__.has === 'function' && window.__PENDING_WS_TOPICS__.has(topic));
        } catch(_) { return false; }
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
