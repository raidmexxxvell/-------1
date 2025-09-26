// static/js/admin-feature-flags.js
// Система feature flags для опасных административных операций

(function () {
  'use strict';

  // Ключи feature flags в localStorage для опасных операций
  const DANGEROUS_OPERATIONS = {
    'feature:admin:season_reset': 'Полный сброс сезона',
    'feature:admin:order_delete': 'Удаление заказов',
    'feature:admin:news_delete': 'Удаление новостей',
    'feature:admin:team_delete': 'Удаление команд',
    'feature:admin:event_remove': 'Удаление событий матчей',
    'feature:admin:user_data_repair': 'Починка пользовательских данных',
    'feature:admin:force_refresh': 'Принудительное обновление кэша',
  };

  // Проверка разрешения для опасной операции
  function isDangerousOperationAllowed(operation) {
    try {
      const flag = localStorage.getItem(operation);
      return flag === '1' || flag === 'true';
    } catch (_) {
      return false;
    }
  }

  // Включение опасной операции с подтверждением
  function enableDangerousOperation(operation, description) {
    const confirmed = confirm(
      `⚠️ ОПАСНАЯ ОПЕРАЦИЯ: ${description}\n\n` +
        `Это действие может повлиять на данные пользователей.\n` +
        `Убедитесь, что вы понимаете последствия.\n\n` +
        `Включить операцию "${operation}"?`
    );

    if (confirmed) {
      try {
        localStorage.setItem(operation, '1');
        console.log(`[ADMIN] Включена опасная операция: ${operation}`);
        return true;
      } catch (_) {
        return false;
      }
    }
    return false;
  }

  // Отключение опасной операции
  function disableDangerousOperation(operation) {
    try {
      localStorage.removeItem(operation);
      console.log(`[ADMIN] Отключена опасная операция: ${operation}`);
    } catch (_) {}
  }

  // Показать статус всех feature flags
  function showFeatureFlagsStatus() {
    const status = Object.entries(DANGEROUS_OPERATIONS)
      .map(([flag, desc]) => {
        const enabled = isDangerousOperationAllowed(flag);
        return `${enabled ? '✅' : '❌'} ${desc} (${flag})`;
      })
      .join('\n');

    alert(`📋 Статус feature flags:\n\n${status}`);
  }

  // Обёртка для опасных операций с проверкой feature flag
  function withDangerousOperationCheck(operation, description, callback) {
    return function (...args) {
      if (!isDangerousOperationAllowed(operation)) {
        const enable = enableDangerousOperation(operation, description);
        if (!enable) {
          console.warn(`[ADMIN] Операция "${operation}" заблокирована feature flag`);
          try {
            window.showAlert?.(
              `Операция заблокирована.\nДля выполнения включите feature flag: ${operation}`,
              'warning'
            );
          } catch (_) {
            alert(`Операция заблокирована.\nДля выполнения включите feature flag: ${operation}`);
          }
          return;
        }
      }

      console.log(`[ADMIN] Выполнение опасной операции: ${operation}`);
      return callback.apply(this, args);
    };
  }

  // Кнопка управления feature flags в админ-панели
  function createFeatureFlagsControls() {
    const adminSections = document.querySelectorAll('.admin-section');
    if (adminSections.length === 0) {
      return;
    }

    const flagsSection = document.createElement('div');
    flagsSection.className = 'admin-section';
    flagsSection.style.borderColor = '#d97706';
    flagsSection.innerHTML = `
      <h3 style="color: #d97706;">⚠️ Feature Flags (Опасные операции)</h3>
      <div class="admin-controls">
        <button id="show-flags-status" class="action-btn" style="background: #0369a1;">Показать статус</button>
        <button id="enable-all-flags" class="action-btn danger" style="background: #dc2626;">Включить все (осторожно!)</button>
        <button id="disable-all-flags" class="action-btn" style="background: #059669;">Отключить все</button>
      </div>
      <p class="help-text" style="color: #d97706;">
        Feature flags защищают от случайного выполнения опасных операций.
        Операции включаются по требованию с подтверждением.
      </p>
    `;

    // Вставляем в начало первой секции
    const firstSection = adminSections[0];
    firstSection.parentNode.insertBefore(flagsSection, firstSection);

    // Обработчики событий
    document.getElementById('show-flags-status')?.addEventListener('click', showFeatureFlagsStatus);

    document.getElementById('enable-all-flags')?.addEventListener('click', () => {
      const confirmed = confirm(
        '⚠️ КРАЙНЕ ОПАСНО!\n\n' +
          'Вы собираетесь включить ВСЕ опасные операции.\n' +
          'Это полностью отключает защиту от случайных действий.\n\n' +
          'Продолжить?'
      );
      if (confirmed) {
        Object.keys(DANGEROUS_OPERATIONS).forEach(op => {
          localStorage.setItem(op, '1');
        });
        try {
          window.showAlert?.('Все feature flags включены!', 'warning');
        } catch (_) {
          alert('Все feature flags включены!');
        }
      }
    });

    document.getElementById('disable-all-flags')?.addEventListener('click', () => {
      Object.keys(DANGEROUS_OPERATIONS).forEach(op => {
        localStorage.removeItem(op);
      });
      try {
        window.showAlert?.('Все feature flags отключены', 'success');
      } catch (_) {
        alert('Все feature flags отключены');
      }
    });
  }

  // Защита существующих опасных операций
  function protectExistingOperations() {
    // Защита кнопки полного сброса
    const fullResetBtn = document.getElementById('admin-full-reset');
    if (fullResetBtn) {
      const originalClick = fullResetBtn.onclick;
      fullResetBtn.onclick = withDangerousOperationCheck(
        'feature:admin:season_reset',
        'Полный сброс сезона (удаление всех временных данных)',
        originalClick || function () {}
      );
    }

    // Защита кнопок удаления заказов (если есть обработчики)
    document.querySelectorAll('[data-action="delete-order"]').forEach(btn => {
      const originalClick = btn.onclick;
      btn.onclick = withDangerousOperationCheck(
        'feature:admin:order_delete',
        'Удаление заказа (необратимое действие)',
        originalClick || function () {}
      );
    });

    // Защита админ-операций в admin-enhanced.js
    if (window.deleteTeam) {
      const originalDeleteTeam = window.deleteTeam;
      window.deleteTeam = withDangerousOperationCheck(
        'feature:admin:team_delete',
        'Удаление команды из системы',
        originalDeleteTeam
      );
    }
  }

  // Глобальный перехват fetch запросов для опасных операций
  function interceptDangerousFetches() {
    if (window.__ADMIN_FETCH_INTERCEPTED__) {
      return;
    }
    window.__ADMIN_FETCH_INTERCEPTED__ = true;

    const originalFetch = window.fetch;
    window.fetch = function (url, options) {
      // Проверяем опасные API endpoints
      if (typeof url === 'string') {
        // Удаление событий матчей
        if (url.includes('/api/match/events/remove')) {
          if (!isDangerousOperationAllowed('feature:admin:event_remove')) {
            const enable = enableDangerousOperation(
              'feature:admin:event_remove',
              'Удаление событий матча (необратимое действие)'
            );
            if (!enable) {
              console.warn(`[ADMIN] Заблокирован запрос: ${url}`);
              return Promise.reject(
                new Error('Операция заблокирована feature flag: feature:admin:event_remove')
              );
            }
          }
        }

        // Удаление новостей
        if (url.match(/\/api\/admin\/news\/\d+/) && options?.method === 'DELETE') {
          if (!isDangerousOperationAllowed('feature:admin:news_delete')) {
            const enable = enableDangerousOperation(
              'feature:admin:news_delete',
              'Удаление новостей из системы'
            );
            if (!enable) {
              console.warn(`[ADMIN] Заблокирован запрос: ${url}`);
              return Promise.reject(
                new Error('Операция заблокирована feature flag: feature:admin:news_delete')
              );
            }
          }
        }

        // Операции сброса сезона
        if (url.includes('/api/admin/season-rollover') || url.includes('/api/admin/full-reset')) {
          if (!isDangerousOperationAllowed('feature:admin:season_reset')) {
            const enable = enableDangerousOperation(
              'feature:admin:season_reset',
              'Полный сброс данных сезона'
            );
            if (!enable) {
              console.warn(`[ADMIN] Заблокирован запрос: ${url}`);
              return Promise.reject(
                new Error('Операция заблокирована feature flag: feature:admin:season_reset')
              );
            }
          }
        }

        // Операции починки данных
        if (url.includes('/api/admin/google/repair-users-sheet')) {
          if (!isDangerousOperationAllowed('feature:admin:user_data_repair')) {
            const enable = enableDangerousOperation(
              'feature:admin:user_data_repair',
              'Починка пользовательских данных в Google Sheets'
            );
            if (!enable) {
              console.warn(`[ADMIN] Заблокирован запрос: ${url}`);
              return Promise.reject(
                new Error('Операция заблокирована feature flag: feature:admin:user_data_repair')
              );
            }
          }
        }

        // Принудительное обновление кэша
        if (url.includes('/refresh') && options?.method === 'POST') {
          if (!isDangerousOperationAllowed('feature:admin:force_refresh')) {
            const enable = enableDangerousOperation(
              'feature:admin:force_refresh',
              'Принудительное обновление кэша данных'
            );
            if (!enable) {
              console.warn(`[ADMIN] Заблокирован запрос: ${url}`);
              return Promise.reject(
                new Error('Операция заблокирована feature flag: feature:admin:force_refresh')
              );
            }
          }
        }
      }

      // Продолжаем выполнение если проверка пройдена
      return originalFetch.apply(this, arguments);
    };

    console.log('[ADMIN] Feature flags: установлен перехват fetch запросов');
  }

  // Инициализация при загрузке админ-панели
  function initAdminFeatureFlags() {
    // Проверяем, что мы в админ-панели
    const adminTab = document.getElementById('tab-admin');
    if (!adminTab) {
      return;
    }

    createFeatureFlagsControls();
    protectExistingOperations();
    interceptDangerousFetches();

    console.log('[ADMIN] Feature flags система инициализирована');
  }

  // Экспорт для глобального использования
  window.AdminFeatureFlags = {
    isDangerousOperationAllowed,
    enableDangerousOperation,
    disableDangerousOperation,
    withDangerousOperationCheck,
    showFeatureFlagsStatus,
    DANGEROUS_OPERATIONS,
  };

  // Автоинициализация
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminFeatureFlags);
  } else {
    initAdminFeatureFlags();
  }
})();
