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
                this.maxReconnectAttempts = 8;  // increased from 5
        this.reconnectDelay = 1000;
        this.maxReconnectDelay = 30000; // 30 sec max
        this.jitterFactor = 0.3;        // 30% random jitter
        this.isConnected = false;
        this.callbacks = new Map();
        this.debug = localStorage.getItem('websocket_debug') === 'true';
                // Rely on Socket.IO built-in heartbeats; custom ping/pong removed to avoid false disconnects
                this.heartbeatInterval = null;
                this.heartbeatTimeout = null;
                this.pingInterval = null;
                this.pongTimeout = null;
                this.lastPongTime = 0;
    // Версионность коэффициентов по матчу: key = "home|away" → int
    this.oddsVersions = new Map();
    // Очередь тем для подписки до момента connect
    this.pendingTopics = new Set();
    this.subscribedTopics = new Set();
    // Feature flag for topic-based subscriptions (from template meta)
    this.topicEnabled = !!window.__WS_TOPIC_SUBS__;
        
        // Глобальные отладочные структуры
        try {
            window.__WEBSOCKETS_SOCKET = null;
            window.__WEBSOCKETS_CONNECTED = false;
            window.__WS_TOPIC_SUBSCRIBED = window.__WS_TOPIC_SUBSCRIBED || new Set();
            window.__WS_PENDING_SUBSCRIPTIONS = window.__WS_PENDING_SUBSCRIPTIONS || new Map(); // topic -> ts
            window.__wsDebug = function(){
                try {
                    const sock = window.__WEBSOCKETS_SOCKET;
                    const topics = Array.from(window.__WS_TOPIC_SUBSCRIBED || []);
                    const pending = Array.from((window.__WS_PENDING_SUBSCRIPTIONS || new Map()).keys());
                    const info = {
                        connected: !!window.__WEBSOCKETS_CONNECTED,
                        socketId: sock && (sock.id || sock.engine?.id || null),
                        topics,
                        pending
                    };
                    console.log('[WS DEBUG]', info);
                    return info;
                } catch(e){ console.warn('[WS DEBUG] error', e); return { connected:false, topics:[], pending:[] }; }
            };
        } catch(_) {}

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
            console.log(`[WS Инициализация] window.__WEBSOCKETS_ENABLED__: ${window.__WEBSOCKETS_ENABLED__}`);
            if (!window.__WEBSOCKETS_ENABLED__) {  
                console.log('[WS Инициализация] WebSockets отключены через флаг');
                return; 
            }
            // Проверяем поддержку Socket.IO
            console.log(`[WS Инициализация] typeof io: ${typeof io}`);
            if (typeof io === 'undefined') { 
                console.log('[WS Инициализация] Socket.IO не загружен');
                return; 
            }
            // Пробный ping на /socket.io/ без апгрейда: если 4xx/5xx — не подключаемся
            const probeUrl = '/socket.io/?EIO=4&transport=polling&t=' + Date.now();
            console.log(`[WS Инициализация] Проверяем доступность: ${probeUrl}`);
            fetch(probeUrl, { method: 'GET', cache: 'no-store', redirect: 'manual' })
                .then(r => {
                    console.log(`[WS Инициализация] Ответ пробы: статус=${r?.status}, ok=${r?.ok}`);
                    if (!r || !r.ok) {
                        console.log('[WS Инициализация] Проба неуспешна, отключаем WebSockets');
                        window.__WEBSOCKETS_ENABLED__ = false;
                        return null;
                    }
                    // ok → инициализируем соединение
                    console.log('[WS Инициализация] Проба успешна, создаем Socket.IO соединение');
                    this.socket = io({
                        transports: ['websocket','polling'],
                        upgrade: true,
                        rememberUpgrade: true,
                        timeout: 20000,
                        forceNew: false
                    });
                    console.log('[WS Инициализация] Socket.IO создан, настраиваем обработчики');
                    try { window.__WEBSOCKETS_SOCKET = this.socket; } catch(_) {}
                    this.setupEventHandlers();
                    return true;
                })
                .catch((err) => { 
                    console.log(`[WS Инициализация] Ошибка пробы: ${err}`);
                    window.__WEBSOCKETS_ENABLED__ = false; 
                });
        } catch (error) {
            console.log(`[WS Инициализация] Критическая ошибка: ${error}`);
        }
    }
    
    setupEventHandlers() {
        if (!this.socket) {return;}
        
        // Глобальная отладка всех WS событий
        this.socket.onAny((eventName, ...args) => {
            console.log(`[WS События] Получено: ${eventName}`, args);
        });
        
    this.socket.on('connect', () => {
            
            this.isConnected = true;
            this.reconnectAttempts = 0;
            try { window.__WEBSOCKETS_CONNECTED = true; } catch(_){}
        // No manual heartbeat: Socket.IO handles ping/pong internally
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
                            try { window.__WS_TOPIC_SUBSCRIBED?.add?.(topic); } catch(_){}
                            try { window.__WS_PENDING_SUBSCRIPTIONS?.delete?.(topic); } catch(_){}
                        }
                    });
                }
            } catch(_) {}
            try {
                const info = window.__wsDebug?.();
                console.log('[WS DEBUG] connected=', !!info?.connected, 'topics=', info?.topics);
            } catch(_){}
        });
        
    this.socket.on('disconnect', (reason) => {
            
            this.isConnected = false;
            this.clearHeartbeat();
            try { window.__WEBSOCKETS_CONNECTED = false; } catch(_){}
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
                try { console.log('[Реалтайм] Получен topic_update:', payload); } catch(_){ }
                // Транслируем событие на DOM
                this.handleTopicUpdate(payload);
                __wsEmit('ws:topic_update', payload || {});
            });

        // Событие завершения матча (содержит optional results_block для мгновенного UX)
        this.socket.on('match_finished', (payload) => {
            try {
                if(!payload || !payload.home || !payload.away) {return;}
                const { home, away } = payload;
                // Удаляем live-бейджи и кнопку на открытом экране (если админ)
                try {
                    document.querySelectorAll('.live-badge').forEach(b=>{
                        const wrap = b.closest('#ufo-match-details');
                        if(wrap) {b.remove();}
                    });
                    const btn=document.getElementById('md-finish-btn'); if(btn) {btn.style.display='none';}
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
                // КРИТИЧНО: Обновляем кэш завершенных матчей для корректной работы isLiveNow
                try {
                    const finStore = (window.__FINISHED_MATCHES = window.__FINISHED_MATCHES || {});
                    const mkKey = (mm) => {
                        try {
                            const dateStr = (mm?.datetime || mm?.date || '').toString().slice(0, 10);
                            return `${(mm.home || '').toLowerCase().trim()}__${(mm.away || '').toLowerCase().trim()}__${dateStr}`;
                        } catch(_) {
                            return `${(mm.home || '').toLowerCase().trim()}__${(mm.away || '').toLowerCase().trim()}__`;
                        }
                    };
                    const matchKey = mkKey({ home, away, datetime: new Date().toISOString() });
                    finStore[matchKey] = true;
                    
                    // Также попробуем найти точный ключ из расписания если есть дата
                    try {
                        const schedule = JSON.parse(localStorage.getItem('schedule:tours') || 'null');
                        if(schedule?.data?.tours) {
                            schedule.data.tours.forEach(t => {
                                (t.matches || []).forEach(m => {
                                    if(m.home === home && m.away === away) {
                                        const exactKey = mkKey(m);
                                        finStore[exactKey] = true;
                                    }
                                });
                            });
                        }
                    } catch(_) {}
                } catch(_) {}
                // Немедленно обновляем UI прогнозов для удаления live-статуса
                try {
                    // Удаляем live бейджи из прогнозов
                    const predCards = document.querySelectorAll('.match-card[data-home]');
                    predCards.forEach(card => {
                        const cardHome = card.dataset.home;
                        const cardAway = card.dataset.away;
                        if(cardHome === home && cardAway === away) {
                            const liveBadges = card.querySelectorAll('.live-badge');
                            liveBadges.forEach(b => b.remove());
                            // Блокируем ставки если есть кнопки
                            const betBtns = card.querySelectorAll('.bet-btn');
                            betBtns.forEach(btn => {
                                btn.disabled = true;
                                btn.style.opacity = '0.5';
                            });
                        }
                    });
                } catch(_) {}
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
                // НОВОЕ: Мгновенное обновление статистики (топ-10 по Г+П)
                try {
                    if (typeof window.loadStatsViaStore === 'function') { window.loadStatsViaStore(); }
                    else if (typeof window.loadStatsTable === 'function') { window.loadStatsTable(); }
                    else if (typeof window.renderScorersTable === 'function') { 
                        window.renderScorersTable(true); // force refresh
                    }
                } catch(_) {}
                // Принудительное обновление кэшей расписания и результатов для синхронизации
                try { 
                    localStorage.removeItem('league:schedule'); 
                    localStorage.removeItem('league:results');
                    localStorage.removeItem('schedule:tours');
                    localStorage.removeItem('betting:tours'); // ВАЖНО: инвалидируем кэш прогнозов
                } catch(_){}
                // Дополнительно обновляем результаты если не было results_block
                if(!payload.results_block){
                    setTimeout(()=>{
                        try { this.triggerDataRefresh('schedule'); } catch(_){}
                    }, 300);
                }
                // Если открыта вкладка прогнозов — принудительно перезагружаем
                try {
                    const predTab = document.querySelector('.nav-item[data-tab="predictions"]');
                    const isPredActive = predTab && predTab.classList.contains('active');
                    if(isPredActive && window.loadTours && typeof window.loadTours === 'function') {
                        setTimeout(() => { try { window.loadTours(); } catch(_) {} }, 100);
                    }
                } catch(_) {}
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
            console.log('[Реалтайм] Обработка topic_update:', payload);
            if (!payload || typeof payload !== 'object') {return;}
            const reason = payload.reason || payload.change_type || '';
            const topic = payload.topic || '';
            console.log('[Реалтайм] Обрабатываем обновление топика - сущность:', payload.entity, 'топик:', topic, 'причина:', reason);
            
            // Точечный триггер обновления статистики матча по WS (без ожидания polling)
            try {
                if (payload.entity === 'match_stats' && payload.home && payload.away) {
                    console.log('[Реалтайм] Отправляем matchStatsRefresh для:', payload.home, 'против', payload.away);
                    const ev = new CustomEvent('matchStatsRefresh', { detail: { home: payload.home, away: payload.away } });
                    document.dispatchEvent(ev);
                }
            } catch(_){}
            
            // Обновление составов/событий: избегаем лишних рефетчей, чтобы не затирать локальные правки администратора
            try {
                if ((payload.entity === 'match_events' || payload.entity === 'match_events_removed') && payload.home && payload.away) {
                    const { home, away } = payload;
                    console.log('[Реалтайм] match_events topic_update:', home, 'vs', away);

                    // Если в topic_update уже переданы полные события — применяем их напрямую без refetch
                    const __ffDirectTopicEvents = (function(){
                        try { return (localStorage.getItem('feature:ws_topic_update_direct_events') ?? '1') !== '0'; } catch(_) { return true; }
                    })();
                    if (__ffDirectTopicEvents && payload.events && window.__MatchEventsRegistry) {
                        try {
                            window.__MatchEventsRegistry.updateEventsCache(home, away, payload.events);
                            const ev = new CustomEvent('eventsRegistryUpdate', {
                                detail: {
                                    home, away,
                                    type: 'match_events',
                                    reason: payload.reason || 'topic_update',
                                    timestamp: Date.now(),
                                    events: payload.events
                                }
                            });
                            document.dispatchEvent(ev);

                            // При открытых деталях матча попробуем мягко обновить видимые ростеры
                            const matchDetailsPane = document.getElementById('ufo-match-details');
                            if (matchDetailsPane && matchDetailsPane.style.display !== 'none') {
                                const curHome = matchDetailsPane.getAttribute('data-match-home') || matchDetailsPane.getAttribute('data-match-key') || '';
                                const curAway = matchDetailsPane.getAttribute('data-match-away') || '';
                                // Если это тот же матч — точечный ререндер, если есть API
                                if ((curHome && curAway && curHome===home && curAway===away) || (!curHome && !curAway)) {
                                    try { if (typeof window.renderMatchRosters === 'function') { window.renderMatchRosters(home, away, payload.events); } } catch(_){}
                                }
                            }
                        } catch(_){ /* no-op */ }
                        // Ничего больше не делаем — источник истины уже применён
                        return;
                    }

                    // Иначе НЕ делаем немедленный refetch — ждём нормализованное событие data_changed: 'match_events'
                    // Это устраняет гонку: topic_update -> refetch vs data_changed -> registry update
                }
            } catch(_){}
            // Полный сброс: чистим локальные отметки голосований и восстанавливаем UI
            if (reason === 'full_reset') {
                // 1) Удаляем локальные ключи голосования
                try {
                    const toDel = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (!k) {continue;}
                        if (k.startsWith('voted:') || k.startsWith('voteAgg:')) {toDel.push(k);}
                    }
                    toDel.forEach(k => { try { localStorage.removeItem(k); } catch(_){} });
                } catch(_) {}

                // 2) Восстанавливаем кнопки и сбрасываем подтверждение на всех видимых виджетах голосования
                try {
                    document.querySelectorAll('.vote-inline').forEach(wrap => {
                        try {
                            const btns = wrap.querySelector('.vote-inline-btns');
                            const confirm = wrap.querySelector('.vote-confirm');
                            if (confirm) {confirm.textContent = '';}
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
                                    .then(agg => { try { if (typeof wrap.__applyAgg === 'function') {wrap.__applyAgg(agg);} } catch(_){} })
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
        if (!patch) {return;}
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

                if (!home || !away) {return;}

                const incomingV = (fields && fields.odds_version != null) ? Number(fields.odds_version) : null;
                if (incomingV != null) {
                    const cur = this._getOddsVersion(home, away);
                    if (incomingV < cur) { return; }
                    if (incomingV > cur) { this._setOddsVersion(home, away, incomingV); }
                }
                // Пробрасываем событие вниз по UI. Поле fields может содержать odds и/или markets.
                const onlyOdds = {}; let markets = undefined;
                try {
                    Object.keys(fields||{}).forEach(k => {
                        if (k === 'markets') { markets = fields.markets; }
                        else if (k !== 'odds_version') { onlyOdds[k] = fields[k]; }
                    });
                } catch(_) {}
                const payload = { homeTeam: home, awayTeam: away, date, odds_version: incomingV, odds: onlyOdds, markets };
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
    
    // Manual heartbeat removed — using Socket.IO internal ping/pong
    
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
        try {
            const sh = (typeof data?.score_home === 'number') ? data.score_home : null;
            const sa = (typeof data?.score_away === 'number') ? data.score_away : null;
            if (sh != null && sa != null) {
                this.showNotification(`${home} ${sh} : ${sa} ${away}`);
            }
        } catch(_) {}
    }
    
    updateUI(dataType, data, timestamp) {
        switch (dataType) {
            case 'league_table':
                this.refreshLeagueTable();
                break;
                
            case 'results':
                // КРИТИЧНО: Мгновенное обновление результатов
                try {
                    console.log('[Реалтайм] Получено обновление результатов:', data);
                    if (data && data.results) {
                        // Обновляем localStorage кэш
                        localStorage.setItem('results', JSON.stringify({ data, ts: Date.now() }));
                        
                        // Мгновенное обновление UI результатов если открыта вкладка
                        const pane = document.getElementById('league-pane-results');
                        if (pane && window.League && typeof window.League.renderResults === 'function') {
                            console.log('[Реалтайм] Обновляем UI результатов');
                            window.League.renderResults(pane, { results: data.results });
                        }
                        
                        // Уведомляем компоненты об обновлении результатов
                        const event = new CustomEvent('resultsUpdate', { 
                            detail: { results: data.results, timestamp: Date.now() } 
                        });
                        document.dispatchEvent(event);
                    }
                } catch(error) {
                    console.error('[Реалтайм] Ошибка обновления результатов:', error);
                }
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
            case 'leader-goal-assist':
            case 'stats_table':
                // Мгновенное обновление таблицы статистики (Г+П)
                try {
                    if (typeof window.loadStatsViaStore === 'function') { window.loadStatsViaStore(); }
                    else if (typeof window.loadStatsTable === 'function') { window.loadStatsTable(); }
                    else if (typeof window.renderScorersTable === 'function') { 
                        window.renderScorersTable(true); // force refresh
                    }
                } catch(_) {}
                break;
            case 'match_events':
                // НОВОЕ: Улучшенная обработка событий матча в реальном времени
                try {
                    console.log('[Реалтайм] Получено обновление событий матча:', data);
                    if (data && data.home && data.away) {
                        // КРИТИЧНО: Обновляем кэш событий в системе синхронизации
                        if (window.__MatchEventsRegistry && data.events) {
                            window.__MatchEventsRegistry.updateEventsCache(data.home, data.away, data.events);
                        }
                        
                        // Отправляем единое событие для всех компонентов
                        const event = new CustomEvent('eventsRegistryUpdate', { 
                            detail: { 
                                home: data.home, 
                                away: data.away, 
                                type: 'match_events',
                                reason: data.reason,
                                timestamp: Date.now(),
                                events: data.events || {}
                            } 
                        });
                        document.dispatchEvent(event);
                        
                        // Обновляем UI деталей матча если открыт
                        const matchDetailsPane = document.getElementById('ufo-match-details');
                        if (matchDetailsPane && matchDetailsPane.style.display !== 'none') {
                            // Проверяем что это тот же матч
                            const currentHome = matchDetailsPane.getAttribute('data-match-home');
                            const currentAway = matchDetailsPane.getAttribute('data-match-away');
                            if (currentHome === data.home && currentAway === data.away) {
                                // Перерендер rosters с новыми событиями
                                try {
                                    if (typeof window.renderMatchRosters === 'function') {
                                        window.renderMatchRosters(data.home, data.away, data.events);
                                    }
                                } catch(_) {}
                            }
                        }
                    }
                } catch(err) {
                    console.error('[Реалтайм] Ошибка обработки событий матча:', err);
                }
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
            if(!data) {return;}
            // Проверяем, есть ли на странице что-то связанное с матчем (ростер или карточка матча)
            const selectorMatchCard = `[data-match-home="${data.home}"][data-match-away="${data.away}"]`;
            const rosterPresent = document.querySelector('.roster-table') || document.querySelector('.team-roster-table') || document.querySelector(selectorMatchCard);
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
        // ЕДИНЫЙ ПУТЬ: обновляем только стор; DOM обновится через ScoreDOMAdapter / подписчиков
        const sh = (typeof data?.score_home === 'number') ? data.score_home : null;
        const sa = (typeof data?.score_away === 'number') ? data.score_away : null;
        if (sh == null || sa == null) { return; }
                // --- SCORE UPDATE LOGGING (race diagnostics) ---
                try {
                        if (!window.__scoreUpdates) { window.__scoreUpdates = []; }
                } catch(_) {}
                const ts = Date.now();
                let prevStoreScore = null;
                try {
                        if (window.MatchesStoreAPI) {
                                const existingKey = window.MatchesStoreAPI.findMatchByTeams(home, away);
                                if (existingKey) {
                                        const entry = window.MatchesStoreAPI.getMatch(existingKey);
                                        if (entry?.score) { prevStoreScore = { home: entry.score.home, away: entry.score.away, txt: `${entry.score.home} : ${entry.score.away}` }; }
                                }
                        }
                } catch(_) {}
        try {
            if (window.MatchesStoreAPI) {
                // Гарантируем наличие записи и сразу кладём счёт
                const k = window.MatchesStoreAPI.addOrMergeMatch ? window.MatchesStoreAPI.addOrMergeMatch({ home, away, score: { home: sh, away: sa } }) : (function(){
                  let tmp = window.MatchesStoreAPI.findMatchByTeams(home, away);
                  if(!tmp){ window.MatchesStoreAPI.updateMatch((home.toLowerCase().trim()+"__"+away.toLowerCase().trim()), { home, away, score_home: sh, score_away: sa }); tmp = window.MatchesStoreAPI.findMatchByTeams(home, away); }
                  return tmp;
                })();
                if (k) {
                  window.MatchesStoreAPI.updateMatch(k, { home, away, score_home: sh, score_away: sa });
                                    try {
                                        const after = window.MatchesStoreAPI.getMatch(k);
                                        const newScoreTxt = after?.score ? `${after.score.home} : ${after.score.away}` : null;
                                        const changed = !prevStoreScore || (prevStoreScore.home !== sh || prevStoreScore.away !== sa);
                                        const rec = { ts, source: 'realtime-updates.updateMatchScore', home, away, newScore: { home: sh, away: sa }, prev: prevStoreScore, matchKey: k, changed };
                                        window.__scoreUpdates.push(rec);
                                        if (window.__scoreUpdates.length > 400) { window.__scoreUpdates.splice(0, window.__scoreUpdates.length - 400); }
                                        if (window.localStorage?.getItem('debug:score_log') === '1') {
                                            // Цветной лог для визуальной диагностики
                                            const color = changed ? 'color:#22c55e' : 'color:#9ca3af';
                                            console.log('%c[ScoreUpdate]', color, rec);
                                        }
                                    } catch(_) {}
                }
            } else {
                // Fallback: если стора нет, оставляем прежнее поведение (минимально) — лёгкая инлайновая подсветка
                const txt = `${sh} : ${sa}`;
                const matchElements = document.querySelectorAll(`[data-match-home="${home}"][data-match-away="${away}"]`);
                matchElements.forEach(el => { const scoreElement = el.querySelector('.match-score') || el.querySelector('.score'); if(scoreElement && scoreElement.textContent !== txt){ scoreElement.textContent = txt; scoreElement.classList.add('score-updated'); setTimeout(()=>{ try { scoreElement.classList.remove('score-updated'); } catch(_){} }, 2000);} });
                try { const mdPane=document.getElementById('ufo-match-details'); if(mdPane && mdPane.style.display!=='none'){ const curH=mdPane.getAttribute('data-match-home')||''; const curA=mdPane.getAttribute('data-match-away')||''; if(curH===home && curA===away){ const scoreEl=document.getElementById('md-score'); if(scoreEl && scoreEl.textContent!==txt){ scoreEl.textContent=txt; } } } } catch(_){}
                                try {
                                    const rec = { ts, source: 'realtime-updates.updateMatchScore:fallback', home, away, newScore: { home: sh, away: sa }, prev: prevStoreScore, matchKey: null, changed: true };
                                    window.__scoreUpdates.push(rec);
                                    if (window.__scoreUpdates.length > 400) { window.__scoreUpdates.splice(0, window.__scoreUpdates.length - 400); }
                                    if (window.localStorage?.getItem('debug:score_log') === '1') { console.log('%c[ScoreUpdate]', 'color:#f59e0b', rec); }
                                } catch(_) {}
            }
        } catch(e){ /* silent */ }
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
            if(!topic || typeof topic!== 'string') {return;}
            console.log('[Реалтайм] Вызов subscribeTopic:', topic, 'топики включены:', this.topicEnabled, 'подключен:', this.isConnected);
            // Кладём в очередь всегда (на случай вызова до готовности socket)
            this.pendingTopics.add(topic);
            try {
                window.__PENDING_WS_TOPICS__ = window.__PENDING_WS_TOPICS__ || new Set();
                window.__PENDING_WS_TOPICS__.add(topic);
                // дублируем в глобальную Map с таймстампом
                window.__WS_PENDING_SUBSCRIPTIONS = window.__WS_PENDING_SUBSCRIPTIONS || new Map();
                window.__WS_PENDING_SUBSCRIPTIONS.set(topic, Date.now());
                // Анти-дребезг: запомним время последней локальной подписки
                window.__WS_LAST_SUBSCRIBE_TS = window.__WS_LAST_SUBSCRIBE_TS || new Map();
            } catch(_) {}
            if(!this.topicEnabled) {
                console.warn('[Реалтайм] Подписки на топики отключены');
                return;
            }
            // Анти-дребезг отправки: если уже подписаны глобально или недавно отправляли — не дублируем
            try {
                if (window.__WS_TOPIC_SUBSCRIBED?.has?.(topic)) { return; }
                const lastTs = window.__WS_LAST_SUBSCRIBE_TS?.get?.(topic) || 0;
                if (Date.now() - lastTs < 1500) { return; }
            } catch(_) {}
            if(this.socket && this.isConnected && !this.subscribedTopics.has(topic)){
                console.log('[Реалтайм] Отправляем подписку на топик:', topic);
                this.socket.emit('subscribe', { topic });
                this.subscribedTopics.add(topic);
                console.log('[Реалтайм] Подписались на топик:', topic, 'Всего подписок:', this.subscribedTopics.size);
                try { window.__WS_TOPIC_SUBSCRIBED?.add?.(topic); } catch(_){}
                try { window.__WS_PENDING_SUBSCRIPTIONS?.delete?.(topic); } catch(_){}
                try { window.__WS_LAST_SUBSCRIBE_TS?.set?.(topic, Date.now()); } catch(_) {}
                try { window.RealtimeStore && window.RealtimeStore.update(s => { if (!Array.isArray(s.topics)) {s.topics = [];} if (!s.topics.includes(topic)) {s.topics.push(topic);} }); } catch(_){}
            } else {
                console.log('[Реалтайм] Не можем подписаться сейчас - сокет:', !!this.socket, 'подключен:', this.isConnected, 'уже подписан:', this.subscribedTopics.has(topic));
            }
        } catch(e) {
            console.error('[Реалтайм] Ошибка subscribeTopic:', e);
        }
    }
    unsubscribeTopic(topic){
        try {
            if(!topic || typeof topic!== 'string') {return;}
            try { this.pendingTopics.delete(topic); } catch(_) {}
            try { this.subscribedTopics.delete(topic); } catch(_) {}
            try { window.__PENDING_WS_TOPICS__?.delete?.(topic); } catch(_) {}
            try { window.__WS_TOPIC_SUBSCRIBED?.delete?.(topic); } catch(_){}
            try { window.__WS_PENDING_SUBSCRIPTIONS?.delete?.(topic); } catch(_){}
            if(!this.topicEnabled) {return;}
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
            if(!topic) {return false;}
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
