// WS listeners: map WebSocket events into Store slices (soft integration, optional dist)
// - updates RealtimeStore (connected/reconnects/topics)
// - maps odds patches into OddsStore with versioning guard

import type { StoreApi } from './core';

interface RealtimeState {
  connected: boolean;
  reconnects: number;
  topics?: string[];
}

interface OddsState {
  map: Record<string, { value: number; version: number; lastUpdated: number }>;
}

(function () {
  if (typeof window === 'undefined') return;

  // Connection state events
  window.addEventListener('ws:connected', (e: Event) => {
    try {
      const d = (e as CustomEvent).detail || {};
      (window as any).RealtimeStore?.update((s: any) => {
        s.connected = true;
        s.reconnects = Number(d.reconnects || 0);
      });
    } catch (_) {}
  });
  window.addEventListener('ws:disconnected', (e: Event) => {
    try {
      const d = (e as CustomEvent).detail || {};
      (window as any).RealtimeStore?.update((s: any) => {
        s.connected = false;
        s.reconnects = (s.reconnects || 0) + 1;
      });
    } catch (_) {}
  });

  // Data patch events - интеграция с __MatchEventsRegistry (стабильный источник)
  window.addEventListener('ws:data_patch', (e: Event) => {
    try {
      const patch = (e as CustomEvent).detail || {};
      console.log('[WS Listeners] Processing data_patch:', patch);

      // Обработка патчей матчей
      if (patch.entity === 'match' && patch.id?.home && patch.id?.away) {
        const { home, away } = patch.id;
        const fields = patch.fields || {};

        // КРИТИЧНО: Обновляем __MatchEventsRegistry если есть события
        if ((fields.events || fields.rosters) && (window as any).__MatchEventsRegistry) {
          try {
            const registry = (window as any).__MatchEventsRegistry;
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
              console.log('[WS Listeners] Обновляем счет через WebSocket:', sh, ':', sa);
              // Уважаем admin protection window, если активен на открытом экране
              try {
                const ls = (window as any).MatchLiveScore;
                const mdPane = document.getElementById('ufo-match-details');
                const isVisible = !!mdPane && mdPane.style.display !== 'none';
                if (ls && isVisible) {
                  const st = (ls as any).state || (mdPane as any).__liveScoreState;
                  const protectedNow =
                    st && typeof st.noFetchUntil === 'number' && Date.now() < st.noFetchUntil;
                  if (protectedNow) {
                    console.log(
                      '[WS Listeners] Пропускаем ws-score обновление — admin protection активен'
                    );
                    return;
                  }
                }
              } catch (_) {}

              // Отправляем централизованное событие для всех score компонентов
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

              // Legacy поддержка: обновляем DOM элементы напрямую (как в стабильном коммите)
              const matchElements = document.querySelectorAll(
                `[data-match-home="${home}"][data-match-away="${away}"]`
              );
              const newScoreText = `${sh} : ${sa}`;

              matchElements.forEach((element: Element) => {
                const scoreElement =
                  element.querySelector('.match-score') || element.querySelector('.score');
                if (scoreElement && scoreElement.textContent?.trim() !== newScoreText) {
                  scoreElement.textContent = newScoreText;
                  // Добавляем анимацию как в стабильном коммите
                  scoreElement.classList.add('score-updated');
                  setTimeout(() => {
                    try {
                      scoreElement.classList.remove('score-updated');
                    } catch (_) {}
                  }, 2000);
                }
              });

              // Также обновляем основной элемент счета в деталях матча
              const scoreEl = document.getElementById('md-score');
              if (scoreEl && scoreEl.textContent?.trim() !== newScoreText) {
                scoreEl.textContent = newScoreText;
                console.log('[WS Listeners] Обновлен основной счет:', newScoreText);
              }
            }
          } catch (e) {
            console.error('[WS Listeners] Ошибка обновления счета:', e);
          }
        }

        // ЕДИНЫЙ ИСТОЧНИК: обновляем MatchesStore через API (findMatchByTeams → updateMatch)
        try {
          if ((window as any).MatchesStoreAPI && fields) {
            let matchKey = (window as any).MatchesStoreAPI.findMatchByTeams(home, away);
            if (!matchKey) {
              // Конструируем ключ из id, если предоставлен сервером
              const id = patch.id || {};
              const date = id.date || fields.date || '';
              matchKey = `${home}_${away}_${date || ''}`;
            }
            (window as any).MatchesStoreAPI.updateMatch(matchKey, {
              home,
              away,
              date: patch.id?.date || fields.date || '',
              ...fields,
            });
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
        if ((window as any).__MatchEventsRegistry && patch.events) {
          try {
            const registry = (window as any).__MatchEventsRegistry;
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
  window.addEventListener('ws:topic_update', (e: Event) => {
    try {
      const p = (e as CustomEvent).detail || {};
      const topic = String(p.topic || p.channel || '').trim();
      if (!topic) return;
      (window as any).RealtimeStore?.update((s: any) => {
        const set = new Set(s.topics || []);
        set.add(topic);
        s.topics = Array.from(set);
      });
      // Лидерборды/статистика лиги: мгновенное обновление таблицы статистики
      const ent = String(p.entity || '');
      if (ent === 'leaderboards' || ent === 'leader-goal-assist' || topic === 'leaderboards') {
        try {
          (window as any).loadStatsViaStore?.();
        } catch (_) {}
        try {
          (window as any).loadStatsTable?.();
        } catch (_) {}
      }
    } catch (_) {}
  });

  // Дополнительно: если прилетает патч данных о лидербордах — обновим таблицу
  window.addEventListener('ws:data_patch', (e: Event) => {
    try {
      const p = (e as CustomEvent).detail || ({} as any);
      const t = String(p?.type || p?.data_type || p?.entity || '');
      if (t === 'leader-goal-assist') {
        try {
          (window as any).loadStatsViaStore?.();
        } catch (_) {}
        try {
          (window as any).loadStatsTable?.();
        } catch (_) {}
      }
    } catch (_) {}
  });

  // Odds patches: write to OddsStore with version guard
  window.addEventListener('ws:odds', (e: Event) => {
    try {
      const d = (e as CustomEvent).detail || {};
      const key =
        d.homeTeam && d.awayTeam && d.date
          ? `${d.homeTeam}_${d.awayTeam}_${d.date}`
          : d.key || null;
      if (!key) return;
      const incomingV = typeof d.odds_version === 'number' ? d.odds_version : 0;
      (window as any).OddsStore?.update((s: any) => {
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
  window.addEventListener('ws:data_patch', (e: Event) => {
    try {
      const p = (e as CustomEvent).detail || {};
      if (!p || !p.entity) return;
      if (!(window as any).MatchesStore) return;

      if (p.entity === 'match') {
        const id = p.id || {};
        const fields = p.fields || {};
        const home = id.home || p.home || fields.home || '';
        const away = id.away || p.away || fields.away || '';
        const date = id.date || p.date || '';
        if (!home || !away) return;
        try {
          const api = (window as any).MatchesStoreAPI;
          if (api) {
            let key = api.findMatchByTeams(home, away);
            if (!key) key = `${home}_${away}_${date || ''}`;
            api.updateMatch(key, { home, away, date, ...fields });
          }
        } catch (_) {}
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
        (window as any).MatchesStore.update((s: any) => {
          const cur = s.map[key] || {
            info: { id: key, home, away, date },
            score: null,
            events: [],
            lastUpdated: null,
          };
          // простая слияние: добавляем новые события в конец, избегая дублей по (t,kind,team)
          const eventsArray = cur.events || []; // защита от undefined
          const seen = new Set(
            eventsArray.map(
              (ev: any) => `${ev.t}|${ev.kind}|${ev.team || ev.teamName || ev.side || ''}`
            )
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
        (window as any).MatchesStore.update((s: any) => {
          const cur =
            s.map[key] ||
            ({
              info: { id: key, home, away, date },
              score: null,
              events: [],
              lastUpdated: null,
            } as any);
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
        (window as any).MatchesStore.update((s: any) => {
          const cur =
            s.map[key] ||
            ({
              info: { id: key, home, away, date },
              score: null,
              events: [],
              lastUpdated: null,
            } as any);
          // Обновляем составы
          if (fields.rosters) {
            (cur as any).rosters = fields.rosters;
          } else if (fields.home_roster || fields.away_roster) {
            (cur as any).rosters = (cur as any).rosters || { home: [], away: [] };
            if (fields.home_roster) (cur as any).rosters.home = fields.home_roster;
            if (fields.away_roster) (cur as any).rosters.away = fields.away_roster;
          }
          cur.lastUpdated = Date.now();
          s.map[key] = cur;
        });
      }
    } catch (_) {}
  });
})();
