// profile-achievements.js
// Загрузка и рендер достижений
(function () {
  if (window.ProfileAchievements) {
    return;
  }
  const tg = window.Telegram?.WebApp || null;
  const badgesContainer = document.getElementById('badges');
  const achievementPlaceholder = document.getElementById('achievement-placeholder');
  let _loadedOnce = false;

  function renderAchievements(achievements) {
    if (achievementPlaceholder) {
      achievementPlaceholder.remove();
    }
    if (!badgesContainer) {
      return;
    }
    badgesContainer.innerHTML = '';
    if (!achievements || !achievements.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:12px; color:var(--gray); font-size:12px;';
      empty.textContent = 'Пока нет достижений';
      badgesContainer.appendChild(empty);
      return;
    }
    const slugify = s =>
      (s || '')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[\s_/]+/g, '-')
        .replace(/[^a-z0-9\-]/g, '');
    const stateFromTier = a => {
      // Показываем визуальный уровень по best_tier (перманентно достигнутый), если он есть
      const t =
        typeof a.best_tier === 'number' && a.best_tier > 0
          ? a.best_tier
          : typeof a.tier === 'number'
            ? a.tier
            : null;
      if (a.unlocked === false || t === 0) {
        return 'locked';
      }
      if (t === 1) {
        return 'bronze';
      }
      if (t === 2) {
        return 'silver';
      }
      if (t === 3) {
        return 'gold';
      }
      if (a.icon === 'bronze') {
        return 'bronze';
      }
      if (a.icon === 'silver') {
        return 'silver';
      }
      if (a.icon === 'gold') {
        return 'gold';
      }
      return a.unlocked ? 'bronze' : 'locked';
    };
    const setAchievementIcon = (imgEl, a) => {
      const key = a.key || a.code || a.group || a.iconKey || slugify(a.name || '');
      const base = '/static/img/achievements/';
      const state = stateFromTier(a);
      const candidates = [];
      // 1) Приоритет: явный URL с бэкенда
      if (a.icon_url) {
        candidates.push(a.icon_url);
      }
      // 2) Групповые спрайты вида group-state
      if (key) {
        candidates.push(`${base}${slugify(key)}-${state}.png`);
      }
      if (key && a.icon) {
        candidates.push(`${base}${slugify(key)}-${slugify(a.icon)}.png`);
      }
      // 3) Общие bronze/silver/gold/locked
      candidates.push(`${base}${state}.png`);
      // 4) Плейсхолдер
      candidates.push(`${base}placeholder.png`);
      // 5) SVG варианты
      const svgFallbacks = candidates.map(p => p.replace(/\.png$/i, '.svg'));
      svgFallbacks.forEach(s => {
        if (!candidates.includes(s)) {
          candidates.push(s);
        }
      });
      let i = 0;
      const next = () => {
        if (i >= candidates.length) {
          return;
        }
        imgEl.onerror = () => {
          i++;
          next();
        };
        imgEl.src = candidates[i];
      };
      next();
    };
    const descFor = a => {
      try {
        switch (a.group) {
          case 'streak':
            return `Дней подряд`;
          case 'credits':
            return `Кредитов накоплено`;
          case 'level':
            return `Достигнут уровень`;
          case 'invited':
            return `Друзей приглашено`;
          case 'betcount':
            return `Ставок сделано`;
          case 'betwins':
            return `Ставок выиграно`;
          case 'bigodds':
            return `Макс. выигранный кэф`;
          case 'markets':
            return `Разных рынков использовано`;
          case 'weeks':
            return `Активных недель`;
          default:
            return a.description || a.desc || '';
        }
      } catch (_) {
        return a.description || '';
      }
    };
    // Расширенное описание (для кнопки "Подробнее"). Всегда возвращает текст.
    const longDescFor = a => {
      try {
        switch (a.group) {
          case 'streak':
            return 'Поддерживайте ежедневную активность без пропусков. Чем длиннее серия входов, тем выше ваш уровень достижения.';
          case 'credits':
            return 'Накопите указанное количество кредитов. Кредиты зарабатываются за активность и другие достижения.';
          case 'level':
            return 'Повышайте уровень, участвуя в активности платформы и выполняя задачи. Каждый новый уровень открывает больше возможностей.';
          case 'invited':
            return 'Приглашайте друзей по вашей реферальной ссылке. Прогресс растёт за каждого присоединившегося пользователя.';
          case 'betcount':
            return 'Совершайте ставки на матчи. Достижение повышается по мере роста количества совершённых ставок.';
          case 'betwins':
            return 'Выигрывайте ставки. Чем больше выигранных ставок, тем выше прогресс.';
          case 'bigodds':
            return 'Побеждайте с высокими коэффициентами. Чем выше максимальный выигранный коэффициент вашей ставки, тем выше ранг достижения.';
          case 'markets':
            return 'Используйте разные типы рынков (исход, тоталы, форы и др.) в ставках. Разнообразие рынков повышает прогресс.';
          case 'weeks':
            return 'Оставайтесь активны из недели в неделю. Делайте хотя бы одну ставку в новые недели, чтобы повышать уровень.';
          default: {
            const txt =
              a.full_description ||
              a.fullDesc ||
              a.long_description ||
              a.longDesc ||
              a.description ||
              a.desc;
            return txt || 'Описание недоступно.';
          }
        }
      } catch (_) {
        return a.description || a.desc || 'Описание недоступно.';
      }
    };
    achievements.forEach(a => {
      const card = document.createElement('div');
      card.className = 'achievement-card';
      if (!a.unlocked) {
        card.classList.add('locked');
      }
      const img = document.createElement('img');
      img.alt = a.name || '';
      setAchievementIcon(img, a);
      const name = document.createElement('div');
      name.className = 'badge-name';
      name.textContent = a.name || '';
      const req = document.createElement('div');
      req.className = 'badge-requirements';
      const fullDescText = longDescFor(a);
      // Контейнер полного описания
      const fullDescEl = document.createElement('div');
      fullDescEl.className = 'achv-desc';
      fullDescEl.textContent = fullDescText;
      fullDescEl.setAttribute('data-open', '0');
      // Кнопка Подробнее
      const toggleBtn = document.createElement('div');
      toggleBtn.className = 'achv-desc-toggle';
      toggleBtn.textContent = 'Подробнее';
      toggleBtn.setAttribute('role', 'button');
      toggleBtn.tabIndex = 0;
      const toggle = () => {
        const opened = fullDescEl.getAttribute('data-open') === '1';
        if (opened) {
          fullDescEl.setAttribute('data-open', '0');
          toggleBtn.textContent = 'Подробнее';
        } else {
          fullDescEl.setAttribute('data-open', '1');
          toggleBtn.textContent = 'Скрыть';
        }
      };
      toggleBtn.addEventListener('click', e => {
        e.stopPropagation();
        toggle();
      });
      toggleBtn.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });

      // Улучшенное отображение прогресса и требований (используем server all_targets/next_target)
      const hasProgressFields =
        a.value !== undefined && Array.isArray(a.all_targets) && a.all_targets.length > 0;
      if (hasProgressFields) {
        const currentValue = Number(a.value || 0);
        const targets = a.all_targets.slice();
        // Если есть перманентно достигнутый уровень (best_tier ≥ 1), показываем прогресс к СЛЕДУЮЩЕЙ цели,
        // а не к ближайшей относительно текущего значения. Например, для лестницы [7,30,120]
        // и best_tier=1 (бронза) — denominator должен быть 30.
        let nextTarget;
        const bestTier = Number(a.best_tier || 0);
        if (Number.isFinite(bestTier) && bestTier >= 1) {
          // Индекс следующей цели соответствует best_tier (1→вторая ступень и т.д.)
          nextTarget = bestTier >= targets.length ? null : Number(targets[bestTier]);
        } else if (a.next_target !== undefined && a.next_target !== null) {
          nextTarget = Number(a.next_target);
        } else {
          // Fallback: ближайшая цель больше текущего значения
          for (let i = 0; i < targets.length; i++) {
            const t = Number(targets[i]);
            if (currentValue < t) {
              nextTarget = t;
              break;
            }
          }
          if (nextTarget === undefined) {
            nextTarget = null;
          }
        }
        // Лестница целей для подробностей (перенесено под кнопку "Подробнее")
        const ladderText = `Цели: ${targets.join('/')}`;

        // Текст прогресса
        const baseDesc = descFor(a);
        if (nextTarget === null) {
          req.textContent = `${baseDesc} ✅ Выполнено (${currentValue})`;
        } else {
          req.textContent = `${baseDesc}: ${currentValue}/${nextTarget}`;
        }

        // Прогресс-бар относительно ближайшей цели
        const progressContainer = document.createElement('div');
        progressContainer.className = 'achv-progress-container';
        const progressBar = document.createElement('div');
        progressBar.className = 'achv-progress-bar';
        const denom = nextTarget || targets[targets.length - 1];
        const progressPercent = Math.max(
          0,
          Math.min(100, denom ? (currentValue / denom) * 100 : 0)
        );
        progressBar.style.width = progressPercent + '%';
        progressContainer.appendChild(progressBar);
        // Добавим цели внутрь блока подробностей
        const targetsEl = document.createElement('div');
        targetsEl.style.cssText = 'margin-top:8px; font-size:12px; color:var(--gray)';
        targetsEl.textContent = ladderText;
        fullDescEl.appendChild(targetsEl);
        card.append(img, name, req, progressContainer, toggleBtn, fullDescEl);
      } else {
        // Нет числового прогресса — просто описание
        req.textContent = `${descFor(a)}`;
        // Если цели есть — переносим их в подробности
        if (Array.isArray(a.all_targets) && a.all_targets.length) {
          const targetsEl = document.createElement('div');
          targetsEl.style.cssText = 'margin-top:8px; font-size:12px; color:var(--gray)';
          targetsEl.textContent = `Цели: ${a.all_targets.join('/')}`;
          fullDescEl.appendChild(targetsEl);
        }
        card.append(img, name, req, toggleBtn, fullDescEl);
      }

      badgesContainer.appendChild(card);
    });
  }

  function fetchAchievements() {
    // Если есть универсальная утилита fetchEtag — используем её
    if (window.fetchEtag) {
      const initData = tg?.initData || '';
      const params = initData ? { initData } : null;
      return window
        .fetchEtag('/api/achievements', {
          cacheKey: 'achievements:v1',
          swrMs: 30000,
          params,
          extract: j => (Array.isArray(j.achievements) ? j.achievements : []),
        })
        .then(res => {
          if (!_loadedOnce) {
            renderAchievements(res.data);
            _loadedOnce = true;
          } else if (res.updated) {
            renderAchievements(res.data);
          }
          return res.data;
        })
        .catch(err => {
          console.error('achievements load error', err);
          // fallback: если в localStorage что-то было (fetchEtag уже сам вернёт), иначе пусто
          return [];
        });
    }
    // Fallback: старая реализация (если по какой-то причине fetchEtag не подключился)
    const LS_KEY = 'achievements:v1';
    const SWR_MAX_AGE = 30 * 1000;
    const now = Date.now();
    let cached = null;
    try {
      cached = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    } catch (_) {}
    const hasFresh = cached && now - (cached.ts || 0) < SWR_MAX_AGE && Array.isArray(cached.data);
    if (hasFresh && !_loadedOnce) {
      _loadedOnce = true;
      renderAchievements(cached.data);
    }
    const etag = cached?.etag || null;
    const initData = tg?.initData || '';
    const q = new URLSearchParams();
    if (initData) {
      q.set('initData', initData);
    }
    const url = '/api/achievements' + (q.toString() ? '?' + q.toString() : '');
    return fetch(url, { headers: etag ? { 'If-None-Match': etag } : {} })
      .then(r =>
        r.status === 304 && cached ? { achievements: cached.data, version: etag } : r.json()
      )
      .then(j => {
        const newE = j.version || null;
        const arr = Array.isArray(j.achievements) ? j.achievements : [];
        try {
          localStorage.setItem(LS_KEY, JSON.stringify({ etag: newE, data: arr, ts: Date.now() }));
        } catch (_) {}
        if (!_loadedOnce || !hasFresh) {
          renderAchievements(arr);
          _loadedOnce = true;
        }
        return arr;
      })
      .catch(err => {
        console.error('achievements load error', err);
        if (!_loadedOnce) {
          _loadedOnce = true;
          renderAchievements(cached?.data || []);
        }
        return cached?.data || [];
      });
  }
  // Автозагрузка при готовности профиля и при клике на вкладку "Достижения"
  window.addEventListener('profile:user-loaded', () => {
    try {
      const active = document.querySelector('.subtab-item.active[data-psub="badges"]');
      if (active) {
        fetchAchievements();
      }
    } catch (_) {}
  });
  document.addEventListener('click', e => {
    const tab = e.target.closest('.subtab-item[data-psub="badges"]');
    if (tab) {
      setTimeout(() => fetchAchievements(), 30);
    }
  });
  // Если вкладка активна сразу (по умолчанию)
  document.addEventListener('DOMContentLoaded', () => {
    const active = document.querySelector('.subtab-item.active[data-psub="badges"]');
    if (active) {
      fetchAchievements();
    }
  });

  window.ProfileAchievements = {
    fetchAchievements,
    renderAchievements,
    forceReload: () => {
      _loadedOnce = false;
      return fetchAchievements();
    },
  };
})();
