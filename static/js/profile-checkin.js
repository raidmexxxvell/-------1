// profile-checkin.js
// Ежедневный чек-ин: рендер календаря, получение награды, анимации
(function () {
  if (window.ProfileCheckin) {
    return;
  }
  const tg = window.Telegram?.WebApp || null;
  const elements = {
    checkinDays: document.getElementById('checkin-days'),
    checkinBtn: document.getElementById('checkin-btn'),
    checkinStatus: document.getElementById('checkin-status'),
    currentStreak: document.getElementById('current-streak'),
  };

  function getUser() {
    return (
      (window.ProfileUser && window.ProfileUser.getLastUser && window.ProfileUser.getLastUser()) ||
      null
    );
  }

  function renderCheckinSection(user) {
    if (!user || !elements.checkinDays) {
      return;
    }
    elements.checkinDays.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];
    const lastCheckin = (user.last_checkin_date || '').split('T')[0];
    const checkedToday = lastCheckin === today;
    // Определяем был ли пропуск (более 1 календарного дня)
    let gapBroken = false;
    if (lastCheckin && !checkedToday) {
      try {
        const dLast = new Date(lastCheckin + 'T00:00:00Z');
        const dToday = new Date(today + 'T00:00:00Z');
        const diffDays = Math.floor((dToday - dLast) / 86400000);
        if (diffDays > 1) {
          gapBroken = true;
        } // streak сброшен
      } catch (_) {}
    }
    const mod = (user.consecutive_days || 0) % 7;
    const completedCount = checkedToday ? (mod === 0 ? 7 : mod) : mod;
    // Если серия сброшена gapBroken, активный день всегда 1
    const activeDay = gapBroken ? 1 : checkedToday ? null : mod + 1;
    if (elements.currentStreak) {
      elements.currentStreak.textContent = user.consecutive_days || 0;
    }
    for (let i = 1; i <= 7; i++) {
      const d = document.createElement('div');
      d.className = 'checkin-day';
      d.textContent = i;
      if (!gapBroken) {
        if (i <= completedCount) {
          d.classList.add('completed');
        } else if (activeDay && i === activeDay) {
          d.classList.add('active');
        }
      } else {
        // При сбросе показываем только первый день как active-reset
        if (i === 1) {
          d.classList.add('active', 'reset-start');
        }
      }
      elements.checkinDays.appendChild(d);
    }
    if (gapBroken && !checkedToday) {
      if (elements.checkinBtn) {
        elements.checkinBtn.disabled = false;
      }
      if (elements.checkinStatus) {
        elements.checkinStatus.textContent = 'Серия прервана — начните заново';
        elements.checkinStatus.style.color = 'var(--warning, #ffb347)';
      }
    } else if (checkedToday) {
      if (elements.checkinBtn) {
        elements.checkinBtn.disabled = true;
      }
      if (elements.checkinStatus) {
        elements.checkinStatus.textContent = '✅ Награда получена сегодня';
      }
    } else {
      if (elements.checkinBtn) {
        elements.checkinBtn.disabled = false;
      }
      if (elements.checkinStatus) {
        elements.checkinStatus.textContent = '';
      }
    }
  }

  function uiError(msg) {
    try {
      window.showAlert?.(msg, 'error');
    } catch (_) {}
    if (elements.checkinStatus) {
      elements.checkinStatus.textContent = msg;
      elements.checkinStatus.style.color = 'var(--danger)';
      setTimeout(() => {
        if (elements.checkinStatus) {
          elements.checkinStatus.textContent = '';
          elements.checkinStatus.style.color = '';
        }
      }, 3000);
    }
  }
  function uiSuccess(msg) {
    try {
      window.showAlert?.(msg, 'success');
    } catch (_) {}
    if (elements.checkinStatus) {
      elements.checkinStatus.textContent = msg;
      elements.checkinStatus.style.color = 'var(--success)';
      setTimeout(() => {
        if (elements.checkinStatus) {
          elements.checkinStatus.textContent = '';
          elements.checkinStatus.style.color = '';
        }
      }, 2000);
    }
  }

  // Анимируем прирост, опционально принимая снапшот пользователя ДО применённой награды,
  // чтобы избежать двойного визуального увеличения (fetchUserData после сохранения в БД придёт позже)
  function animateStats(xpGain, creditsGain, baseUser) {
    try {
      const xpElement =
        document.querySelector('.stat-value[data-stat="xp"]') || document.getElementById('xp');
      const creditsElement =
        document.querySelector('.stat-value[data-stat="credits"]') ||
        document.getElementById('credits');
      // Получаем текущие значения профиля (для корректного расчёта прогресса уровня)
      const user =
        baseUser ||
        (window.ProfileUser &&
          window.ProfileUser.getLastUser &&
          window.ProfileUser.getLastUser()) ||
        null;
      if (window.CounterAnimation && user) {
        const baseLevel = Math.max(1, user.level || 1);
        const baseCurXp = Math.max(0, user.current_xp != null ? user.current_xp : user.xp || 0);
        const applyFn =
          window.XPUtils && XPUtils.applyGain
            ? XPUtils.applyGain
            : function (level, cur, gain) {
                let lvl = Math.max(1, level || 1);
                let curXp = Math.max(0, cur || 0);
                let left = gain;
                while (left > 0) {
                  const need = lvl * 100;
                  const toNext = need - curXp;
                  if (left < toNext) {
                    curXp += left;
                    left = 0;
                    return { lvl, cur: curXp, need };
                  }
                  left -= toNext;
                  lvl += 1;
                  curXp = 0;
                  if (lvl > 500) {
                    return { lvl: 500, cur: 0, need: 500 * 100 };
                  }
                }
                return { lvl, cur: curXp, need: lvl * 100 };
              };
        const endMeta = applyFn(baseLevel, baseCurXp, xpGain);
        if (xpElement) {
          const duration = 1200;
          const start = performance.now();
          function frame(now) {
            const p = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            const m = applyFn(baseLevel, baseCurXp, xpGain * eased);
            xpElement.textContent = `${Math.round(m.cur)}/${m.need}`;
            try {
              const bar = document.getElementById('xp-progress');
              if (bar) {
                bar.style.width = `${Math.min(100, (m.cur / m.need) * 100)}%`;
              }
            } catch (_) {}
            try {
              const lvlEl = document.getElementById('level');
              const clEl = document.getElementById('current-level');
              if (lvlEl) {
                lvlEl.textContent = m.lvl;
              }
              if (clEl) {
                clEl.textContent = m.lvl;
              }
            } catch (_) {}
            if (p < 1) {
              requestAnimationFrame(frame);
            } else {
              xpElement.textContent = `${Math.round(endMeta.cur)}/${endMeta.need}`;
            }
          }
          requestAnimationFrame(frame);
        }
        if (creditsElement) {
          const curCr = parseInt((creditsElement.textContent || '0').replace(/\D/g, '')) || 0;
          window.CounterAnimation.animate(creditsElement, curCr, curCr + creditsGain, 1200, v =>
            Math.round(v).toLocaleString()
          );
        }
      } else if (window.CounterAnimation) {
        // fallback прежнее поведение
        if (xpElement) {
          const parts = xpElement.textContent.split('/');
          const curXP = parseInt(parts[0]) || 0;
          window.CounterAnimation.animate(
            xpElement,
            curXP,
            curXP + xpGain,
            1200,
            v => `${Math.round(v)}/${parts[1] || 100}`
          );
        }
        if (creditsElement) {
          const curCr = parseInt((creditsElement.textContent || '0').replace(/\D/g, '')) || 0;
          window.CounterAnimation.animate(creditsElement, curCr, curCr + creditsGain, 1200, v =>
            Math.round(v).toLocaleString()
          );
        }
      }
      if (window.UIAnimations) {
        if (xpElement) {
          window.UIAnimations.pulse(xpElement);
        }
        if (creditsElement) {
          window.UIAnimations.pulse(creditsElement);
        }
      }
    } catch (e) {
      console.warn('animateStats fail', e);
    }
  }

  function showRewardAnimation(xp, credits, baseUser) {
    return new Promise(resolve => {
      if (!elements.checkinStatus) {
        resolve();
        return;
      }
      const after = () => {
        if (elements.checkinStatus) {
          elements.checkinStatus.textContent = 'Награда получена!';
          elements.checkinStatus.style.color = 'var(--success)';
          setTimeout(() => {
            if (elements.checkinStatus) {
              elements.checkinStatus.textContent = '';
              elements.checkinStatus.style.color = '';
            }
          }, 3000);
        }
        // Анимация чисел из снапшота baseUser -> baseUser + gain
        animateStats(xp, credits, baseUser);
        // Резолвим после завершения счётчиков (примерно 1.3с)
        setTimeout(resolve, 1300);
      };
      if (window.RewardAnimation) {
        try {
          window.RewardAnimation.show(document.body, xp, credits).then(after).catch(after);
        } catch (_) {
          after();
        }
      } else {
        elements.checkinStatus.innerHTML = `<div class="reward-animation">+${xp} XP | +${credits} кредитов</div>`;
        setTimeout(() => {
          if (elements.checkinStatus) {
            elements.checkinStatus.textContent = 'Награда получена!';
          }
        }, 2000);
        // Для упрощения сразу запускаем numeric анимацию
        animateStats(xp, credits, baseUser);
        setTimeout(resolve, 1300);
      }
    });
  }

  let _checkinPending = false;
  function handleCheckin() {
    if (!elements.checkinBtn) {
      return;
    }
    // Guard от повторного нажатия пока идёт запрос / анимация
    if (_checkinPending) {
      return;
    }
    _checkinPending = true;
    elements.checkinBtn.setAttribute('data-blocking', '1');
    elements.checkinBtn.disabled = true;
    if (elements.checkinStatus) {
      elements.checkinStatus.textContent = 'Обработка...';
    }
    if (!tg || !tg.initDataUnsafe?.user) {
      uiError('Невозможно выполнить чекин без Telegram WebApp');
      if (elements.checkinBtn) {
        elements.checkinBtn.disabled = false;
      }
      return;
    }
    const fd = new FormData();
    fd.append('initData', tg.initData || '');
    // Снимок пользователя ДО начисления (для корректной одноразовой анимации)
    const baseUser =
      window.ProfileUser && window.ProfileUser.getLastUser && window.ProfileUser.getLastUser()
        ? { ...window.ProfileUser.getLastUser() }
        : null;
    fetch('/api/checkin', { method: 'POST', body: fd })
      .then(res => {
        if (res.status === 401) {
          uiError('Ошибка авторизации');
          throw new Error('unauth');
        }
        return res.json();
      })
      .then(data => {
        if (!data) {
          return;
        }
        if (data.status === 'already_checked') {
          if (elements.checkinStatus) {
            elements.checkinStatus.textContent = '✅ Награда получена сегодня';
          }
          return;
        }
        return showRewardAnimation(data.xp, data.credits, baseUser).then(() =>
          window.ProfileUser.fetchUserData()
        );
      })
      .then(u => {
        if (u) {
          renderCheckinSection(u);
        }
      })
      .catch(err => {
        console.error('checkin err', err);
        uiError('Ошибка получения награды');
        if (elements.checkinBtn) {
          elements.checkinBtn.disabled = false;
        }
      })
      .finally(() => {
        _checkinPending = false;
        if (elements.checkinBtn) {
          elements.checkinBtn.removeAttribute('data-blocking');
          if (!elements.checkinBtn.disabled) {
            /* краткий debounce */ elements.checkinBtn.setAttribute('data-throttle', '2000');
          }
        }
      });
  }

  function attach() {
    if (elements.checkinBtn) {
      // Устанавливаем throttle и предотвращение двойного клика
      elements.checkinBtn.setAttribute('data-throttle', '2000');
      elements.checkinBtn.addEventListener('click', handleCheckin);
    }
  }

  // Событие из ProfileUser
  window.addEventListener('profile:user-loaded', e => {
    try {
      renderCheckinSection(e.detail);
    } catch (_) {}
  });
  // Если данные уже загружены к моменту старта
  document.addEventListener('DOMContentLoaded', () => {
    const u = getUser();
    if (u) {
      renderCheckinSection(u);
    }
    attach();
  });

  window.ProfileCheckin = { renderCheckinSection, handleCheckin };
  try {
    window.ProfileCheckin.animateStats = animateStats;
  } catch (_) {}
})();
