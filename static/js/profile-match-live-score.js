// Live status badge + score polling & admin inline score controls (without finish)
(function () {
  function setup(match, refs) {
    const scoreEl = refs.scoreEl;
    const dtEl = refs.dtEl;
    const mdPane = refs.mdPane;
    if (!scoreEl || !dtEl || !mdPane) {
      return {};
    }

    // STATE: центральное состояние с сигнатурой как в статистике
    const state = {
      etag: null,
      sig: null, // сигнатура счета для защиты от дубликатов
      timer: null,
      busy: false,
      cancelled: false,
      noFetchUntil: 0, // временная блокировка fetch после админ-действий
      lastAdminAction: 0, // timestamp последнего админ-действия
      // КРИТИЧНО: Сохраняем актуальный счет в state для инкрементов (принцип статистики)
      currentScore: { home: 0, away: 0 },
    };
    try {
      refs.mdPane.__liveScoreState = state;
    } catch (_) {}
    try {
      window.MatchLiveScore.state = state;
    } catch (_) {}

    let scorePoll = null;
    let pollWatch = null;
    let adminScoreCtrlsAdded = false;
    const isAdmin = (() => {
      try {
        const adminId = document.body.getAttribute('data-admin');
        const currentId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id
          ? String(window.Telegram.WebApp.initDataUnsafe.user.id)
          : '';
        return !!(adminId && currentId && String(adminId) === currentId);
      } catch (_) {
        return false;
      }
    })();

    // Генерация сигнатуры счета (как в статистике)
    const generateScoreSig = (sh, sa) => {
      try {
        return `${Number(sh) || 0}:${Number(sa) || 0}`;
      } catch (_) {
        return '0:0';
      }
    };

    // КРИТИЧНО: Инициализируем currentScore из DOM при загрузке
    const initCurrentScore = () => {
      try {
        const currentText = scoreEl.textContent || '';
        const match = currentText.match(/(\d+)\s*:\s*(\d+)/);
        if (match) {
          state.currentScore.home = parseInt(match[1], 10) || 0;
          state.currentScore.away = parseInt(match[2], 10) || 0;
          console.log(
            '[LiveScore] Инициализирован счет из DOM:',
            state.currentScore.home,
            ':',
            state.currentScore.away
          );
        }
      } catch (e) {
        console.warn('[LiveScore] Ошибка инициализации счета:', e);
      }
    };

    // Инициализируем счет при загрузке
    initCurrentScore();

    const applyScore = (sh, sa) => {
      try {
        if (sh == null || sa == null) return false;
        if (
          typeof sh !== 'number' ||
          typeof sa !== 'number' ||
          !Number.isFinite(sh) ||
          !Number.isFinite(sa) ||
          sh < 0 ||
          sa < 0
        )
          return false;
        const newSig = generateScoreSig(sh, sa);
        if (state.sig && newSig === state.sig) return false; // уже отображено
        const txt = `${sh} : ${sa}`;
        // Меняем только если реально отличается или плейсхолдер
        const cur = (scoreEl.textContent || '').trim();
        if (cur !== txt) {
          scoreEl.textContent = txt;
        }
        state.sig = newSig;
        state.currentScore.home = sh;
        state.currentScore.away = sa;
        return true;
      } catch {
        return false;
      }
    };

    // fetchScore удалён – счёт теперь обновляется только из стора / WebSocket патч -> стор
    const fetchScore = () => {};
    const ensureAdminCtrls = () => {
      try {
        if (adminScoreCtrlsAdded) {
          return;
        }
        const adminId = document.body.getAttribute('data-admin');
        const currentId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id
          ? String(window.Telegram.WebApp.initDataUnsafe.user.id)
          : '';
        const isAdmin = !!(adminId && currentId && String(adminId) === currentId);
        if (!isAdmin) {
          return;
        }
        if (mdPane.querySelector('.admin-score-ctrls')) {
          adminScoreCtrlsAdded = true;
          return;
        }
        const mkBtn = t => {
          const b = document.createElement('button');
          b.className = 'details-btn';
          b.textContent = t;
          b.style.padding = '2px 8px';
          b.style.minWidth = 'unset';
          return b;
        };
        const row = document.createElement('div');
        row.className = 'admin-score-ctrls';
        row.style.marginTop = '6px';
        row.style.display = 'flex';
        row.style.gap = '10px';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'center';
        const left = document.createElement('div');
        left.style.display = 'flex';
        left.style.gap = '6px';
        const right = document.createElement('div');
        right.style.display = 'flex';
        right.style.gap = '6px';
        const hMinus = mkBtn('−');
        const hPlus = mkBtn('+');
        const aMinus = mkBtn('−');
        const aPlus = mkBtn('+');
        left.append(hMinus, hPlus);
        right.append(aMinus, aPlus);
        const center =
          scoreEl.parentElement ||
          dtEl.parentElement ||
          mdPane.querySelector('.match-modal-header .center');
        const spacer = document.createElement('div');
        spacer.style.width = '8px';
        row.append(left, spacer, right);
        try {
          center.appendChild(row);
        } catch (_) {}
        const tg = window.Telegram?.WebApp || null;

        // КРИТИЧНО: Заменяем parseScore() на state-based подход (принцип статистики)
        const getCurrentScore = () => {
          return [state.currentScore.home, state.currentScore.away];
        };

        const postScore = async (sh, sa) => {
          try {
            console.log('[LiveScore] Отправляем новый счет:', sh, ':', sa);

            const fd = new FormData();
            fd.append('initData', tg?.initData || '');
            fd.append('home', match.home || '');
            fd.append('away', match.away || '');
            fd.append('score_home', String(Math.max(0, sh)));
            fd.append('score_away', String(Math.max(0, sa)));

            const r = await fetch('/api/match/score/set', { method: 'POST', body: fd });
            const d = await r.json().catch(() => ({}));

            if (!r.ok || d?.error) {
              throw new Error(d?.error || 'Ошибка сохранения');
            }

            // КРИТИЧНО: Локально применяем счёт ТОЛЬКО если сервер подтвердил
            if (typeof d.score_home === 'number' && typeof d.score_away === 'number') {
              const applied = applyScore(d.score_home, d.score_away);
              if (applied) {
                console.log(
                  '[LiveScore] Счет подтвержден сервером и применен:',
                  d.score_home,
                  ':',
                  d.score_away
                );

                // Обновляем timestamps для защиты
                state.lastAdminAction = Date.now();
                const protectMs = window.__ADMIN_PROTECTION_MS || 15000;
                state.noFetchUntil = Date.now() + Number(protectMs);

                // Маркируем админское изменение
                try {
                  const host = document.getElementById('ufo-match-details');
                  if (host) {
                    host.setAttribute('data-admin-last-change-ts', String(Date.now()));
                  }
                } catch (_) {}

                // Уведомляем другие компоненты через WebSocket-совместимое событие
                try {
                  const payload = {
                    home: match.home,
                    away: match.away,
                    score_home: d.score_home,
                    score_away: d.score_away,
                    timestamp: Date.now(),
                    source: 'admin',
                  };
                  const event = new CustomEvent('scoreUpdatedByAdmin', {
                    detail: {
                      ...payload,
                    },
                  });
                  document.dispatchEvent(event);
                  // Unified событие
                  const ev2 = new CustomEvent('matchScoreUpdate', { detail: payload });
                  document.dispatchEvent(ev2);
                } catch (_) {}
              }
            } else {
              console.warn('[LiveScore] Сервер не вернул корректный счет:', d);
            }
          } catch (e) {
            console.error('[LiveScore] Ошибка postScore:', e);
            window.showAlert?.(e?.message || 'Не удалось сохранить счёт', 'error');
          }
        };
        hMinus.addEventListener('click', () => {
          const [h, a] = getCurrentScore();
          postScore(Math.max(0, h - 1), a);
        });
        hPlus.addEventListener('click', () => {
          const [h, a] = getCurrentScore();
          postScore(h + 1, a);
        });
        aMinus.addEventListener('click', () => {
          const [h, a] = getCurrentScore();
          postScore(h, Math.max(0, a - 1));
        });
        aPlus.addEventListener('click', () => {
          const [h, a] = getCurrentScore();
          postScore(h, a + 1);
        });
        adminScoreCtrlsAdded = true;
      } catch (_) {}
    };

    // Подписка на стор: единый источник истины
    let storeUnsub = null;
    let storeRetryAttempts = 0;
    let storeRetryTimer = null;
    const scheduleStoreRetry = () => {
      try {
        if (storeRetryTimer) {
          clearTimeout(storeRetryTimer);
        }
      } catch (_) {}
      const backoffMs = 350 + Math.min(4, storeRetryAttempts) * 250;
      storeRetryTimer = setTimeout(subscribeStore, backoffMs);
    };
    const subscribeStore = () => {
      try {
        if (storeUnsub) {
          return;
        }
        const storeApi = window.MatchesStoreAPI;
        if (!storeApi || !match?.home || !match?.away) return;
        const dateSeed = (match?.datetime || match?.date || '').toString().slice(0, 10);
        try {
          const payload = { home: match.home || '', away: match.away || '', date: dateSeed };
          let seedScore = null;
          try {
            const txt = (scoreEl.textContent || '').trim();
            const m = txt.match(/(\d+)\s*:\s*(\d+)/);
            if (m) {
              seedScore = { home: Number(m[1]), away: Number(m[2]) };
            } else if (
              state.sig &&
              typeof state.currentScore.home === 'number' &&
              typeof state.currentScore.away === 'number'
            ) {
              seedScore = { home: state.currentScore.home, away: state.currentScore.away };
            }
          } catch (_) {}
          if (seedScore && Number.isFinite(seedScore.home) && Number.isFinite(seedScore.away)) {
            payload.score = seedScore;
          }
          if (typeof storeApi.addOrMergeMatch === 'function') {
            storeApi.addOrMergeMatch(payload);
          } else if (typeof storeApi.ensureMatch === 'function') {
            const keyEnsured = storeApi.ensureMatch(payload.home, payload.away, payload.date);
            if (payload.score) {
              try {
                storeApi.updateMatch(keyEnsured, {
                  home: payload.home,
                  away: payload.away,
                  date: payload.date,
                  score_home: payload.score.home,
                  score_away: payload.score.away,
                });
              } catch (_) {}
            }
          }
        } catch (_) {}
        const key = storeApi.findMatchByTeams(match.home, match.away);
        if (!key) {
          storeRetryAttempts += 1;
          if (storeRetryAttempts <= 5) {
            console.log(
              '[LiveScore] Матч не найден в сторе, повторная попытка подписки',
              storeRetryAttempts
            );
            scheduleStoreRetry();
          } else {
            console.warn(
              '[LiveScore] Не удалось найти матч в сторе после нескольких попыток:',
              match.home,
              match.away
            );
          }
          return;
        }
        storeRetryAttempts = 0;
        try {
          if (storeRetryTimer) {
            clearTimeout(storeRetryTimer);
            storeRetryTimer = null;
          }
        } catch (_) {}
        // Первичная гидратация
        const entry = storeApi.getMatch(key);
        if (
          entry?.score &&
          typeof entry.score.home === 'number' &&
          typeof entry.score.away === 'number'
        ) {
          applyScore(entry.score.home, entry.score.away);
        }
        storeUnsub = storeApi.subscribe(st => {
          try {
            const e2 = st.map[key];
            if (
              e2?.score &&
              typeof e2.score.home === 'number' &&
              typeof e2.score.away === 'number'
            ) {
              applyScore(e2.score.home, e2.score.away);
            }
          } catch (_) {}
        });
        console.log('[LiveScore] Подписка на стор активна для', key);
      } catch (e) {
        console.warn('[LiveScore] Не удалось подписаться на стор:', e);
      }
    };
    subscribeStore();

    // Cleanup при отмене
    const originalCancel = mdPane.__scoreSetupCancel || (() => {});
    mdPane.__scoreSetupCancel = () => {
      state.cancelled = true;
      try {
        if (state.timer) {
          clearTimeout(state.timer);
        }
      } catch (_) {}
      try {
        if (scorePoll) {
          clearInterval(scorePoll);
        }
      } catch (_) {}
      try {
        if (pollWatch) {
          clearInterval(pollWatch);
        }
      } catch (_) {}
      try {
        if (storeUnsub) {
          storeUnsub();
          storeUnsub = null;
        }
      } catch (_) {}
      try {
        if (storeRetryTimer) {
          clearTimeout(storeRetryTimer);
          storeRetryTimer = null;
        }
      } catch (_) {}
      originalCancel();
    };

    // Вычисляем WS-топик деталей матча, как в profile-match-advanced.js
    const __wsTopics = (() => {
      try {
        const h = (match?.home || '').toLowerCase().trim();
        const a = (match?.away || '').toLowerCase().trim();
        const raw = match?.date
          ? String(match.date)
          : match?.datetime
            ? String(match.datetime)
            : '';
        const d = raw ? raw.slice(0, 10) : '';
        return [
          `match:${h}__${a}__${d}:details`, // with_date
          `match:${h}__${a}__:details`, // no_date (fallback)
        ];
      } catch (_) {
        return [];
      }
    })();

    const isWsActive = () => {
      try {
        if (!window.__WEBSOCKETS_ENABLED__) {
          return false;
        }
        if (!__wsTopics.length) {
          return false;
        }
        // Глобальные флаги приоритетнее: если подписан хотя бы один из вариантов — считаем активным
        const sub = window.__WS_TOPIC_SUBSCRIBED;
        if (window.__WEBSOCKETS_CONNECTED && sub && typeof sub.has === 'function') {
          for (const t of __wsTopics) {
            if (sub.has(t)) {
              return true;
            }
          }
        }
        const ru = window.realtimeUpdater;
        if (
          ru &&
          typeof ru.getTopicEnabled === 'function' &&
          ru.getTopicEnabled() &&
          typeof ru.hasTopic === 'function'
        ) {
          for (const t of __wsTopics) {
            if (ru.hasTopic(t)) {
              return true;
            }
          }
        }
        return false;
      } catch (_) {
        return false;
      }
    };

    fetch(
      `/api/match/status/get?home=${encodeURIComponent(match.home || '')}&away=${encodeURIComponent(match.away || '')}&date=${encodeURIComponent((match?.datetime || match?.date || '').toString().slice(0, 10))}`
    )
      .then(r => r.json())
      .then(async s => {
        const localLive = (() => {
          try {
            return window.MatchUtils?.isLiveNow ? window.MatchUtils.isLiveNow(match) : false;
          } catch (_) {
            return false;
          }
        })();
        const serverLive = s?.status === 'live';
        const finished = s?.status === 'finished';
        // Админу позволяем работать, если локально матч идёт, даже если сервер ошибочно вернул finished
        if (serverLive || (isAdmin && localLive)) {
          // Вставим бейдж live в UI
          try {
            const exists = dtEl.querySelector('.live-badge');
            if (!exists) {
              const live = document.createElement('span');
              live.className = 'live-badge';
              const dot = document.createElement('span');
              dot.className = 'live-dot';
              const lbl = document.createElement('span');
              lbl.textContent = 'Матч идет';
              live.append(dot, lbl);
              dtEl.appendChild(live);
            }
          } catch (_) {}
          // Если счёта нет — показываем 0:0
          try {
            if (scoreEl.textContent.trim() === '— : —') {
              scoreEl.textContent = '0 : 0';
            }
          } catch (_) {}
          // Админ: если сервер не live, но локально live — мягко выставим live (инициализируем счёт)
          // Admin bootstrap без прямого fetch счёта: статус live можно активировать вручную через UI при необходимости
          // Polling удалён – WebSocket -> Store -> подписка

          ensureAdminCtrls();
        }
      })
      .catch(() => {});
    return {
      cleanup() {
        try {
          if (state.timer) {
            clearTimeout(state.timer);
          }
        } catch (_) {}
        try {
          if (pollWatch) {
            clearInterval(pollWatch);
          }
        } catch (_) {}
        try {
          mdPane.querySelectorAll('.admin-score-ctrls').forEach(n => n.remove());
        } catch (_) {}
      },
    };
  }
  window.MatchLiveScore = { setup };
})();

// DEV-ONLY: перехватчик fetch для трассировки источников запросов к score/get
// Включается флагом localStorage.setItem('debug:trace_score_fetch','1')
(function () {
  try {
    if (localStorage.getItem('debug:trace_score_fetch') !== '1') {
      return;
    }
    const orig = window.fetch;
    window.fetch = function (input, init) {
      try {
        const url = typeof input === 'string' ? input : input?.url || '';
        if (/\/api\/match\/score\/get/.test(url)) {
          console.warn('[TRACE score/get]', url);
          console.trace();
        }
      } catch (_) {}
      return orig.apply(this, arguments);
    };
    console.log('[DEV] fetch interceptor for score/get enabled');
  } catch (_) {}
})();
