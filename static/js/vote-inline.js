// vote-inline.js
// Унифицированный helper для полосы голосования П1 / X / П2
(function () {
  if (window.VoteInline) {
    return;
  }
  const VoteAgg = window.__VoteAgg;
  const MatchState = window.MatchState;
  function keyFrom(obj) {
    try {
      const raw = obj.date ? String(obj.date) : obj.datetime ? String(obj.datetime) : '';
      const d = raw ? raw.slice(0, 10) : '';
      return `${(obj.home || '').toLowerCase().trim()}__${(obj.away || '').toLowerCase().trim()}__${d}`;
    } catch (_) {
      return `${(obj.home || '').toLowerCase()}__${(obj.away || '').toLowerCase()}__`;
    }
  }
  function create(opts) {
    const { home, away, date, datetime, getTeamColor } = opts || {};
    if (!home || !away) {
      return null;
    }
    const voteKey = keyFrom({ home, away, date: date || datetime });
    const wrap = document.createElement('div');
    wrap.className = 'vote-inline';
    const title = document.createElement('div');
    title.className = 'vote-title';
    title.textContent = 'Голосование';
    const bar = document.createElement('div');
    bar.className = 'vote-strip';
    const segH = document.createElement('div');
    segH.className = 'seg seg-h';
    const segD = document.createElement('div');
    segD.className = 'seg seg-d';
    const segA = document.createElement('div');
    segA.className = 'seg seg-a';
    bar.append(segH, segD, segA);
    const legend = document.createElement('div');
    legend.className = 'vote-legend';
    legend.innerHTML = '<span>П1</span><span>X</span><span>П2</span>';
    const btns = document.createElement('div');
    btns.className = 'vote-inline-btns';
    const confirm = document.createElement('div');
    confirm.className = 'vote-confirm';
    confirm.style.fontSize = '12px';
    confirm.style.color = 'var(--success)';
    try {
      segH.style.background = getTeamColor ? getTeamColor(home) : '#4caf50';
      segA.style.background = getTeamColor ? getTeamColor(away) : '#ff9800';
      segD.style.background = '#8e8e93';
    } catch (_) {}
    wrap.append(title, bar, legend, btns, confirm);
    wrap.dataset.voteKey = voteKey;
    wrap.dataset.home = home;
    wrap.dataset.away = away;
    wrap.dataset.date = (date || datetime || '').toString().slice(0, 10);
    const applyAgg = agg => {
      try {
        // Значения с сервера
        let h = Number(agg?.home || 0),
          d = Number(agg?.draw || 0),
          a = Number(agg?.away || 0);
        let sum = Math.max(0, h + d + a);
        // Текущее локальное (оптимистичное) состояние — не даём регрессировать к нулю
        const st = MatchState?.get(voteKey);
        const sv = st && st.votes ? st.votes : null;
        const ssum = Math.max(0, (sv?.h || 0) + (sv?.d || 0) + (sv?.a || 0));
        if (ssum > sum) {
          // Если локальная сумма больше, используем локальные значения (сервер ещё не догнал)
          h = Number(sv?.h || 0);
          d = Number(sv?.d || 0);
          a = Number(sv?.a || 0);
          sum = Math.max(1, h + d + a);
        } else {
          sum = Math.max(1, sum);
        }
        const ph = Math.round((h * 100) / sum),
          pd = Math.round((d * 100) / sum),
          pa = Math.round((a * 100) / sum);
        if (segH.style.width !== ph + '%') {
          segH.style.width = ph + '%';
        }
        if (segD.style.width !== pd + '%') {
          segD.style.width = pd + '%';
        }
        if (segA.style.width !== pa + '%') {
          segA.style.width = pa + '%';
        }
        MatchState?.set(voteKey, { votes: { h, d, a, total: h + d + a }, lastAggTs: Date.now() });

        // Обновим UI «проголосовано/кнопки» по факту наличия моего голоса
        try {
          if (agg && Object.prototype.hasOwnProperty.call(agg, 'my_choice') && !agg.my_choice) {
            // Сервер сообщил отсутствие моего голоса → сбрасываем локальную отметку и показываем кнопки
            try {
              localStorage.removeItem('voted:' + voteKey);
            } catch (_) {}
            btns.style.display = '';
            confirm.textContent = '';
            btns.querySelectorAll('button').forEach(b => (b.disabled = false));
          } else if (agg && agg.my_choice) {
            // Есть зафиксированный голос → скрываем кнопки и подтверждаем
            btns.querySelectorAll('button').forEach(x => {
              x.disabled = true;
            });
            btns.style.display = 'none';
            confirm.textContent = 'Ваш голос учтён';
            try {
              localStorage.setItem('voted:' + voteKey, '1');
            } catch (_) {}
          }
        } catch (_) {}
      } catch (_) {
        segH.style.width = '33%';
        segD.style.width = '34%';
        segA.style.width = '33%';
      }
    };
    const optimistic = code => {
      try {
        const st = MatchState?.get(voteKey) || { votes: { h: 0, d: 0, a: 0, total: 0 } };
        const v = st.votes || { h: 0, d: 0, a: 0, total: 0 };
        if (code === 'home') {
          v.h++;
        } else if (code === 'away') {
          v.a++;
        } else {
          v.d++;
        }
        v.total = v.h + v.d + v.a;
        const sum = Math.max(1, v.total);
        segH.style.width = Math.round((v.h * 100) / sum) + '%';
        segD.style.width = Math.round((v.d * 100) / sum) + '%';
        segA.style.width = Math.round((v.a * 100) / sum) + '%';
        MatchState?.set(voteKey, { votes: v, lastAggTs: Date.now() });
      } catch (_) {}
    };
    const mkBtn = (code, text) => {
      const b = document.createElement('button');
      b.className = 'details-btn';
      b.textContent = text;
      b.addEventListener(
        'click',
        async () => {
          optimistic(code);
          try {
            const fd = new FormData();
            fd.append('initData', window.Telegram?.WebApp?.initData || '');
            fd.append('home', home);
            fd.append('away', away);
            const dkey = (date ? String(date) : datetime ? String(datetime) : '').slice(0, 10);
            fd.append('date', dkey);
            fd.append('choice', code);
            const r = await fetch('/api/vote/match', { method: 'POST', body: fd });
            if (!r.ok) {
              throw 0;
            }
            let payload = null;
            try {
              payload = await r.json();
            } catch (_) {
              payload = null;
            }
            btns.querySelectorAll('button').forEach(x => (x.disabled = true));
            confirm.textContent = 'Ваш голос учтён';
            btns.style.display = 'none';
            // Небольшая задержка, чтобы БД точно отдала обновлённые агрегаты
            setTimeout(() => {
              VoteAgg?.fetchAgg(home, away, date || datetime).then(applyAgg);
            }, 400);
            // МГНОВЕННОЕ обновление коэффициентов на карточке, если сервер уже отдал новые odds/markets
            try {
              if (payload && (payload.odds || payload.markets)) {
                const matchId = `${home}_${away}_${dkey}`;
                const oddsEvent = new CustomEvent('bettingOddsUpdate', {
                  detail: {
                    homeTeam: home,
                    awayTeam: away,
                    date: dkey,
                    odds_version: payload.odds_version,
                    odds: payload.odds || {},
                    markets: payload.markets || {},
                  },
                });
                document.dispatchEvent(oddsEvent);
              }
            } catch (_) {}
            try {
              localStorage.setItem('voted:' + voteKey, '1');
            } catch (_) {}
          } catch (_) {}
        },
        { once: true }
      );
      return b;
    };
    btns.append(mkBtn('home', 'За П1'), mkBtn('draw', 'За X'), mkBtn('away', 'За П2'));
    try {
      if (localStorage.getItem('voted:' + voteKey) === '1') {
        btns.style.display = 'none';
        confirm.textContent = 'Ваш голос учтён';
      }
    } catch (_) {}
    // Восстановим из MatchState если есть
    try {
      const st = MatchState?.get(voteKey);
      if (st && st.votes) {
        const v = st.votes;
        const sum = Math.max(1, v.total || v.h + v.d + v.a);
        segH.style.width = Math.round((v.h * 100) / sum) + '%';
        segD.style.width = Math.round((v.d * 100) / sum) + '%';
        segA.style.width = Math.round((v.a * 100) / sum) + '%';
      }
    } catch (_) {}
    // Ленивая загрузка
    const doFetch = () => {
      VoteAgg?.fetchAgg(home, away, date || datetime).then(applyAgg);
    };
    if (window.IntersectionObserver) {
      const io = new window.IntersectionObserver(
        ents => {
          ents.forEach(e => {
            if (e.isIntersecting) {
              doFetch();
              io.unobserve(wrap);
            }
          });
        },
        { root: null, rootMargin: '200px', threshold: 0.01 }
      );
      io.observe(wrap);
    } else {
      doFetch();
    }
    wrap.__applyAgg = applyAgg;
    return wrap;
  }
  window.VoteInline = { create };
})();
