// Enhanced event synchronization and conflict resolution
(function () {
  'use strict';

  // Глобальный реестр состояния событий для предотвращения race conditions
  window.__MatchEventsRegistry = window.__MatchEventsRegistry || {
    // Кэш последних известных событий: matchKey -> events object
    eventsCache: new Map(),
    // Pending операции: requestId -> promise
    pendingOps: new Map(),
    // Последние timestamps обновлений: matchKey -> timestamp
    lastUpdates: new Map(),
    // Conflict resolution queue
    conflictQueue: [],
  };

  const registry = window.__MatchEventsRegistry;

  // Генерация ключа матча
  function getMatchKey(home, away) {
    return `${(home || '').toLowerCase().trim()}__${(away || '').toLowerCase().trim()}`;
  }

  // Генерация ключа события
  function getEventKey(home, away, team, player, type) {
    const matchKey = getMatchKey(home, away);
    return `${matchKey}:${team}:${(player || '').toLowerCase().trim()}:${type}`;
  }

  // Синхронная проверка состояния события
  function getCurrentEventState(home, away, team, player, type) {
    const matchKey = getMatchKey(home, away);
    const cached = registry.eventsCache.get(matchKey);
    if (!cached) return null;

    const side = team === 'home' ? 'home' : 'away';
    const events = cached[side] || [];

    // Подсчитываем события данного типа для игрока
    let count = 0;
    events.forEach(event => {
      if (
        (event.player || '').toLowerCase().trim() === (player || '').toLowerCase().trim() &&
        event.type === type
      ) {
        count++;
      }
    });

    return count;
  }

  // Обновление кэша событий
  function updateEventsCache(home, away, events) {
    const matchKey = getMatchKey(home, away);
    registry.eventsCache.set(matchKey, events);
    registry.lastUpdates.set(matchKey, Date.now());

    console.log('[EventsRegistry] Обновлен кэш событий для матча:', matchKey, events);
  }

  // Обработчик WebSocket обновлений событий
  function handleEventUpdate(data) {
    try {
      if (!data || !data.home || !data.away) return;

      console.log('[EventsRegistry] Получено WebSocket обновление событий:', data);

      // Если есть полные события в payload - обновляем кэш
      if (data.events) {
        updateEventsCache(data.home, data.away, data.events);
      }

      // Уведомляем UI о необходимости обновления
      const event = new CustomEvent('eventsRegistryUpdate', {
        detail: {
          home: data.home,
          away: data.away,
          type: data.entity,
          reason: data.reason,
          timestamp: Date.now(),
        },
      });
      document.dispatchEvent(event);
    } catch (error) {
      console.error('[EventsRegistry] Ошибка обработки WebSocket обновления:', error);
    }
  }

  // Улучшенная функция для админских операций с событиями
  function performEventOperation(home, away, team, player, type, operation, minute = null) {
    const eventKey = getEventKey(home, away, team, player, type);

    // Проверяем, есть ли уже pending операция для этого события
    if (registry.pendingOps.has(eventKey)) {
      console.warn('[EventsRegistry] Операция уже выполняется для события:', eventKey);
      return registry.pendingOps.get(eventKey);
    }

    // Получаем текущее состояние БЕЗ изменения локального кэша
    const currentCount = getCurrentEventState(home, away, team, player, type) || 0;
    const wantedCount = operation === 'add' ? currentCount + 1 : Math.max(0, currentCount - 1);

    console.log('[EventsRegistry] Выполняется операция:', {
      eventKey,
      operation,
      currentCount,
      wantedCount,
    });

    // Создаем promise для операции
    const operationPromise = (async () => {
      try {
        const fd = new FormData();
        const tg = window.Telegram?.WebApp;
        fd.append('initData', tg?.initData || '');
        fd.append('home', home);
        fd.append('away', away);
        fd.append('team', team);
        fd.append('player', player);
        fd.append('type', type);
        if (minute !== null) {
          fd.append('minute', String(minute));
        }

        const url = operation === 'add' ? '/api/match/events/add' : '/api/match/events/remove';
        const response = await fetch(url, { method: 'POST', body: fd });
        const result = await response.json();

        if (result.error) {
          throw new Error(result.error);
        }

        console.log('[EventsRegistry] Операция завершена успешно:', eventKey, result);

        // ВАЖНО: НЕ обновляем локальный кэш здесь - ждем WebSocket уведомления
        // Это устраняет race condition когда локальное изменение конфликтует с WebSocket

        return result;
      } catch (error) {
        console.error('[EventsRegistry] Ошибка выполнения операции:', eventKey, error);
        throw error;
      } finally {
        // Очищаем pending операцию
        registry.pendingOps.delete(eventKey);
      }
    })();

    // Сохраняем promise операции
    registry.pendingOps.set(eventKey, operationPromise);

    return operationPromise;
  }

  // Подписка на WebSocket события
  document.addEventListener('DOMContentLoaded', () => {
    // Слушаем обновления событий матча
    document.addEventListener('matchEventsUpdate', event => {
      handleEventUpdate(event.detail.data);
    });

    console.log('[EventsRegistry] Система синхронизации событий инициализирована');
  });

  // Экспортируем API
  window.__MatchEventsRegistry.getCurrentEventState = getCurrentEventState;
  window.__MatchEventsRegistry.updateEventsCache = updateEventsCache;
  window.__MatchEventsRegistry.performEventOperation = performEventOperation;
  window.__MatchEventsRegistry.getMatchKey = getMatchKey;
})();
