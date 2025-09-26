'use strict';
// WS listeners: map WebSocket events into Store slices (soft integration, optional dist)
// - updates RealtimeStore (connected/reconnects/topics)
// - maps odds patches into OddsStore with versioning guard
Object.defineProperty(exports, '__esModule', { value: true });
(function () {
  if (typeof window === 'undefined') return;
  // Connection state events
  window.addEventListener('ws:connected', e => {
    try {
      const d = e.detail || {};
      window.RealtimeStore?.update(s => {
        s.connected = true;
        s.reconnects = Number(d.reconnects || 0);
      });
    } catch (_) {}
  });
  window.addEventListener('ws:disconnected', e => {
    try {
      const d = e.detail || {};
      window.RealtimeStore?.update(s => {
        s.connected = false;
        s.reconnects = (s.reconnects || 0) + 1;
      });
    } catch (_) {}
  });
  // Data patch events - интеграция с __MatchEventsRegistry (стабильный источник)
  window.addEventListener('ws:data_patch', e => {
    try {
      const patch = e.detail || {};
      console.log('[WS Listeners] Processing data_patch:', patch);
      // Обработка патчей матчей
      if (patch.entity === 'match' && patch.id?.home && patch.id?.away) {
        const { home, away } = patch.id;
        const fields = patch.fields || {};
        // КРИТИЧНО: Обновляем __MatchEventsRegistry если есть события
        if ((fields.events || fields.rosters) && window.__MatchEventsRegistry) {
          try {
            const registry = window.__MatchEventsRegistry;
            if (fields.events) {
              console.log('[WS Listeners] Updating MatchEventsRegistry cache:', fields.events);
              registry.updateEventsCache(home, away, fields.events);
            }
          } catch (e) {
            console.warn('[WS Listeners] Failed to update MatchEventsRegistry:', e);
          }
        }
        // Обновляем счет БЕЗ МЕРЦАНИЯ (принцип из стабильного коммита)
        if (fields.score_home !== undefined || fields.score_away !== undefined) {
          try {
            const sh = fields.score_home;
            const sa = fields.score_away;
            if (typeof sh === 'number' && typeof sa === 'number') {
              console.log('[WS Listeners] Счёт патч (websocket) → стор событие:', sh, ':', sa);
              const scoreEvent = new CustomEvent('matchScoreUpdate', {
                detail: {
                  home,
                  away,
                  score_home: sh,
                  score_away: sa,
                  timestamp: Date.now(),
                  source: 'websocket',
                },
              });
              document.dispatchEvent(scoreEvent);
              // DOM больше напрямую не трогаем (единый подписчик на стор обновит UI)
            }
          } catch (e) {
            console.error('[WS Listeners] Ошибка подготовки события matchScoreUpdate:', e);
          }
        }
        // Обновляем MatchesStore для совместимости
        try {
          if (window.MatchesStoreAPI) {
            const matchKey = window.MatchesStoreAPI.findMatchByTeams(home, away);
            if (matchKey && fields) {
              window.MatchesStoreAPI.updateMatch(matchKey, fields);
            }
          }
        } catch (_) {}
      }
      // Обработка событий матчей (match_events, match_rosters)
      if (
        (patch.entity === 'match_events' || patch.entity === 'match_rosters') &&
        patch.home &&
        patch.away
      ) {
        const { home, away } = patch;
        // Обновляем __MatchEventsRegistry
        if (window.__MatchEventsRegistry && patch.events) {
          try {
            const registry = window.__MatchEventsRegistry;
            console.log('[WS Listeners] Updating events cache from patch:', patch.events);
            registry.updateEventsCache(home, away, patch.events);
          } catch (e) {
            console.warn('[WS Listeners] Failed to update events cache:', e);
          }
        }
        // Отправляем событие для UI компонентов
        const event = new CustomEvent('eventsRegistryUpdate', {
          detail: {
            home,
            away,
            type: patch.entity,
            reason: patch.reason || 'ws_patch',
            timestamp: Date.now(),
            events: patch.events || {},
          },
        });
        document.dispatchEvent(event);
      }
    } catch (error) {
      console.error('[WS Listeners] Error processing data_patch:', error);
    }
  });
  // Topic updates (optional topics array maintenance)
  window.addEventListener('ws:topic_update', e => {
    try {
      const p = e.detail || {};
      const topic = String(p.topic || p.channel || '').trim();
      if (!topic) return;
      window.RealtimeStore?.update(s => {
        const set = new Set(s.topics || []);
        set.add(topic);
        s.topics = Array.from(set);
      });
      // Лидерборды/статистика лиги: мгновенное обновление таблицы статистики
      const ent = String(p.entity || '');
      if (ent === 'leaderboards' || ent === 'leader-goal-assist' || topic === 'leaderboards') {
        try {
          window.loadStatsViaStore?.();
        } catch (_) {}
        try {
          window.loadStatsTable?.();
        } catch (_) {}
      }
    } catch (_) {}
  });
  // Дополнительно: если прилетает патч данных о лидербордах — обновим таблицу
  window.addEventListener('ws:data_patch', e => {
    try {
      const p = e.detail || {};
      const t = String(p?.type || p?.data_type || p?.entity || '');
      if (t === 'leader-goal-assist') {
        try {
          window.loadStatsViaStore?.();
        } catch (_) {}
        try {
          window.loadStatsTable?.();
        } catch (_) {}
      }
    } catch (_) {}
  });
  // Odds patches: write to OddsStore with version guard
  window.addEventListener('ws:odds', e => {
    try {
      const d = e.detail || {};
      const key =
        d.homeTeam && d.awayTeam && d.date
          ? `${d.homeTeam}_${d.awayTeam}_${d.date}`
          : d.key || null;
      if (!key) return;
      const incomingV = typeof d.odds_version === 'number' ? d.odds_version : 0;
      window.OddsStore?.update(s => {
        const cur = s.map[key]?.version || 0;
        if (incomingV < cur) return; // ignore stale
        const value =
          typeof d.odds?.value === 'number'
            ? d.odds.value
            : typeof d.odds === 'number'
              ? d.odds
              : 0;
        s.map[key] = { value, version: incomingV, lastUpdated: Date.now() };
      });
    } catch (_) {}
  });
  // Generic data patches: match score/events → MatchesStore
  window.addEventListener('ws:data_patch', e => {
    try {
      const p = e.detail || {};
      if (!p || !p.entity) return;
      if (!window.MatchesStore) return;
      if (p.entity === 'match') {
        const id = p.id || {};
        const fields = p.fields || {};
        const home = id.home || p.home || fields.home || '';
        const away = id.away || p.away || fields.away || '';
        const date = id.date || p.date || '';
        if (!home || !away) return;
        const key = `${home}_${away}_${date || ''}`;
        const score_home = fields.score_home;
        const score_away = fields.score_away;
        window.MatchesStore.update(s => {
          const cur = s.map[key] || {
            info: { id: key, home, away, date },
            score: null,
            events: [],
            lastUpdated: null,
          };
          if (score_home !== undefined || score_away !== undefined) {
            const prev = cur.score || { home: 0, away: 0 };
            cur.score = { home: score_home ?? prev.home, away: score_away ?? prev.away };
          }
          cur.lastUpdated = Date.now();
          s.map[key] = cur;
        });
      }
      if (p.entity === 'match_events' || p.entity === 'match_events_removed') {
        const id = p.id || {};
        const fields = p.fields || {};
        const home = id.home || p.home || fields.home || '';
        const away = id.away || p.away || fields.away || '';
        const date = id.date || p.date || '';
        if (!home || !away) return;
        const key = `${home}_${away}_${date || ''}`;
        // events array expected in fields.events or p.events
        const incoming = Array.isArray(fields.events)
          ? fields.events
          : Array.isArray(p.events)
            ? p.events
            : [];
        if (!incoming.length) return;
        window.MatchesStore.update(s => {
          const cur = s.map[key] || {
            info: { id: key, home, away, date },
            score: null,
            events: [],
            lastUpdated: null,
          };
          // простая слияние: добавляем новые события в конец, избегая дублей по (t,kind,team)
          const eventsArray = cur.events || []; // защита от undefined
          const seen = new Set(
            eventsArray.map(ev => `${ev.t}|${ev.kind}|${ev.team || ev.teamName || ev.side || ''}`)
          );
          for (const ev of incoming) {
            const sig = `${ev.t}|${ev.kind}|${ev.team || ev.teamName || ev.side || ''}`;
            if (!seen.has(sig)) {
              eventsArray.push(ev);
              seen.add(sig);
            }
          }
          cur.events = eventsArray; // обновляем массив
          cur.lastUpdated = Date.now();
          s.map[key] = cur;
        });
      }
      // optional: match_stats patch
      if (p.entity === 'match_stats') {
        const id = p.id || {};
        const fields = p.fields || {};
        const home = id.home || p.home || fields.home || '';
        const away = id.away || p.away || fields.away || '';
        const date = id.date || p.date || '';
        if (!home || !away) return;
        const key = `${home}_${away}_${date || ''}`;
        window.MatchesStore.update(s => {
          const cur = s.map[key] || {
            info: { id: key, home, away, date },
            score: null,
            events: [],
            lastUpdated: null,
          };
          cur.stats = Object.assign({}, cur.stats || {}, fields?.stats || fields || {});
          cur.lastUpdated = Date.now();
          s.map[key] = cur;
        });
      }
      // optional: match_rosters patch (новое добавление)
      if (p.entity === 'match_rosters' || p.entity === 'rosters') {
        const id = p.id || {};
        const fields = p.fields || {};
        const home = id.home || p.home || fields.home || '';
        const away = id.away || p.away || fields.away || '';
        const date = id.date || p.date || '';
        if (!home || !away) return;
        const key = `${home}_${away}_${date || ''}`;
        window.MatchesStore.update(s => {
          const cur = s.map[key] || {
            info: { id: key, home, away, date },
            score: null,
            events: [],
            lastUpdated: null,
          };
          // Обновляем составы
          if (fields.rosters) {
            cur.rosters = fields.rosters;
          } else if (fields.home_roster || fields.away_roster) {
            cur.rosters = cur.rosters || { home: [], away: [] };
            if (fields.home_roster) cur.rosters.home = fields.home_roster;
            if (fields.away_roster) cur.rosters.away = fields.away_roster;
          }
          cur.lastUpdated = Date.now();
          s.map[key] = cur;
        });
      }
    } catch (_) {}
  });
})();
