// leaderboard_adapter.ts
// Адаптер для интеграции лидерборда в profile.js с LeaderboardStore под feature flag

import type { StoreApi } from './core';

// Типы для расширенного LeaderboardStore API
interface ExtendedLeaderboardStore extends StoreApi<LeaderboardState> {
  updatePredictors: (data: { items: LeaderboardPredictorItem[]; etag?: string }) => void;
  updateRich: (data: { items: LeaderboardRichItem[]; etag?: string }) => void;
  updateServer: (data: { items: LeaderboardServerItem[]; etag?: string }) => void;
  updatePrizes: (data: { items: LeaderboardPrizeItem[]; etag?: string }) => void;
  setActiveTab: (tab: 'predictors' | 'rich' | 'server' | 'prizes') => void;
  setPollingState: (isPolling: boolean) => void;
  isDataFresh: (category: 'predictors' | 'rich' | 'server' | 'prizes', ttlMs?: number) => boolean;
}

// Расширяем Window для интеграции с profile.js
declare global {
  interface Window {
    loadLBPredictors?: (opts?: { forceRevalidate?: boolean; skipIfNotUpdated?: boolean }) => void;
    loadLBRich?: (opts?: { forceRevalidate?: boolean; skipIfNotUpdated?: boolean }) => void;
    loadLBServer?: (opts?: { forceRevalidate?: boolean; skipIfNotUpdated?: boolean }) => void;
    loadLBPrizes?: (opts?: { forceRevalidate?: boolean; skipIfNotUpdated?: boolean }) => void;
    escapeHtml?: (str: string) => string;
  }
}

(() => {
  // Проверяем feature flag
  const FEATURE_FLAG = 'feature:leaderboard_store';
  const isEnabled = () => {
    try {
      return localStorage.getItem(FEATURE_FLAG) === '1';
    } catch (_) {
      return false;
    }
  };

  if (!isEnabled()) {
    return; // Выходим, если feature flag не включён
  }

  // Ждём готовности LeaderboardStore
  const waitForStore = () => {
    return new Promise<void>(resolve => {
      if (window.LeaderboardStore) {
        resolve();
        return;
      }

      const check = () => {
        if (window.LeaderboardStore) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  };

  // Утилита для escape HTML (fallback если нет в profile.js)
  const escapeHtml = (str: string): string => {
    if (window.escapeHtml) {
      return window.escapeHtml(str);
    }
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };

  // Интеграция с существующим кодом лидерборда
  const integrateWithLegacy = async () => {
    await waitForStore();

    if (!window.LeaderboardStore) {
      return;
    }

    const store = window.LeaderboardStore as ExtendedLeaderboardStore;

    // Подписываемся на изменения в сторе для автообновления UI
    store.subscribe(state => {
      // Обновляем UI только для активной вкладки
      const activeTab = state.activeTab;

      if (activeTab === 'predictors' && state.predictors.items.length > 0) {
        renderPredictorsTable(state.predictors.items, state.predictors.lastUpdated);
      } else if (activeTab === 'rich' && state.rich.items.length > 0) {
        renderRichTable(state.rich.items, state.rich.lastUpdated);
      } else if (activeTab === 'server' && state.server.items.length > 0) {
        renderServerTable(state.server.items, state.server.lastUpdated);
      } else if (activeTab === 'prizes' && state.prizes.items.length > 0) {
        renderPrizesTable(state.prizes.items, state.prizes.lastUpdated);
      }
    });

    // Функции рендеринга UI
    const renderPredictorsTable = (
      items: LeaderboardPredictorItem[],
      lastUpdated: number | null
    ) => {
      const table = document.querySelector('#lb-predictors tbody') as HTMLTableSectionElement;
      const updated = document.getElementById('lb-predictors-updated');

      if (!table) return;

      table.innerHTML = '';
      items.forEach((item, idx) => {
        const tr = document.createElement('tr');
        if (idx === 0) tr.classList.add('rank-1');
        if (idx === 1) tr.classList.add('rank-2');
        if (idx === 2) tr.classList.add('rank-3');
        tr.innerHTML = `<td>${idx + 1}</td><td>${escapeHtml(item.display_name)}</td><td>${item.bets_total}</td><td>${item.bets_won}</td><td>${item.winrate}%</td>`;
        table.appendChild(tr);
      });

      if (updated && lastUpdated) {
        try {
          updated.textContent = `Обновлено: ${new Date(lastUpdated).toLocaleString()}`;
        } catch (_) {}
      }
    };

    const renderRichTable = (items: LeaderboardRichItem[], lastUpdated: number | null) => {
      const table = document.querySelector('#lb-rich tbody') as HTMLTableSectionElement;
      const updated = document.getElementById('lb-rich-updated');

      if (!table) return;

      table.innerHTML = '';
      items.forEach((item, idx) => {
        const tr = document.createElement('tr');
        if (idx === 0) tr.classList.add('rank-1');
        if (idx === 1) tr.classList.add('rank-2');
        if (idx === 2) tr.classList.add('rank-3');
        tr.innerHTML = `<td>${idx + 1}</td><td>${escapeHtml(item.display_name)}</td><td>${item.credits}</td>`;
        table.appendChild(tr);
      });

      if (updated && lastUpdated) {
        try {
          updated.textContent = `Обновлено: ${new Date(lastUpdated).toLocaleString()}`;
        } catch (_) {}
      }
    };

    const renderServerTable = (items: LeaderboardServerItem[], lastUpdated: number | null) => {
      const table = document.querySelector('#lb-server tbody') as HTMLTableSectionElement;
      const updated = document.getElementById('lb-server-updated');

      if (!table) return;

      table.innerHTML = '';
      items.forEach((item, idx) => {
        const tr = document.createElement('tr');
        if (idx === 0) tr.classList.add('rank-1');
        if (idx === 1) tr.classList.add('rank-2');
        if (idx === 2) tr.classList.add('rank-3');
        tr.innerHTML = `<td>${idx + 1}</td><td>${escapeHtml(item.display_name)}</td><td>${item.total_score}</td><td>${item.matches_played}</td>`;
        table.appendChild(tr);
      });

      if (updated && lastUpdated) {
        try {
          updated.textContent = `Обновлено: ${new Date(lastUpdated).toLocaleString()}`;
        } catch (_) {}
      }
    };

    const renderPrizesTable = (items: LeaderboardPrizeItem[], lastUpdated: number | null) => {
      const table = document.querySelector('#lb-prizes tbody') as HTMLTableSectionElement;
      const updated = document.getElementById('lb-prizes-updated');

      if (!table) return;

      table.innerHTML = '';
      items.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${escapeHtml(item.period)}</td><td>${escapeHtml(item.winner)}</td><td>${item.prize_amount}</td><td>${escapeHtml(item.category)}</td>`;
        table.appendChild(tr);
      });

      if (updated && lastUpdated) {
        try {
          updated.textContent = `Обновлено: ${new Date(lastUpdated).toLocaleString()}`;
        } catch (_) {}
      }
    };

    // Перехватываем и переопределяем функции загрузки лидерборда
    const createLoaderFunction = (
      category: 'predictors' | 'rich' | 'server' | 'prizes',
      apiUrl: string,
      cacheKey: string,
      updateMethod: 'updatePredictors' | 'updateRich' | 'updateServer' | 'updatePrizes'
    ) => {
      return async (opts?: { forceRevalidate?: boolean; skipIfNotUpdated?: boolean }) => {
        const forceRevalidate = !!opts?.forceRevalidate;
        const skipIfNotUpdated = !!opts?.skipIfNotUpdated;

        try {
          // Проверяем, есть ли свежие данные в сторе
          if (!forceRevalidate && store.isDataFresh(category, 60000)) {
            const state = store.get();
            const categoryData = state[category];

            if (skipIfNotUpdated) {
              return; // Данные свежие, ничего не делаем
            }

            // Обновляем UI с данными из стора
            if (category === 'predictors')
              renderPredictorsTable(
                categoryData.items as LeaderboardPredictorItem[],
                categoryData.lastUpdated
              );
            else if (category === 'rich')
              renderRichTable(
                categoryData.items as LeaderboardRichItem[],
                categoryData.lastUpdated
              );
            else if (category === 'server')
              renderServerTable(
                categoryData.items as LeaderboardServerItem[],
                categoryData.lastUpdated
              );
            else if (category === 'prizes')
              renderPrizesTable(
                categoryData.items as LeaderboardPrizeItem[],
                categoryData.lastUpdated
              );

            return;
          }

          // Загружаем данные через fetchEtag
          if (window.fetchEtag) {
            const result = await window.fetchEtag(apiUrl, {
              cacheKey,
              swrMs: 60000,
              extract: (j: any) => j,
              forceRevalidate,
            });

            if (skipIfNotUpdated && !result.updated) {
              return; // Данные не обновились
            }

            const items = result.data?.items || [];
            const etag = result.etag;

            // Сохраняем в стор
            (store as any)[updateMethod]({ items, etag });
          } else {
            // Fallback на прямой fetch
            console.warn('[LeaderboardStore] fetchEtag not available, using fallback');
          }
        } catch (error) {
          console.error(`[LeaderboardStore] ${category} load error:`, error);
        }
      };
    };

    // Создаём функции загрузки
    window.loadLBPredictors = createLoaderFunction(
      'predictors',
      '/api/leaderboard/top-predictors',
      'lb:predictors',
      'updatePredictors'
    );
    window.loadLBRich = createLoaderFunction(
      'rich',
      '/api/leaderboard/top-rich',
      'lb:rich',
      'updateRich'
    );
    window.loadLBServer = createLoaderFunction(
      'server',
      '/api/leaderboard/server-leaders',
      'lb:server',
      'updateServer'
    );
    window.loadLBPrizes = createLoaderFunction(
      'prizes',
      '/api/leaderboard/prizes',
      'lb:prizes',
      'updatePrizes'
    );

    // Отслеживаем переключение вкладок
    const tabs = document.querySelectorAll('#leader-subtabs .subtab-item');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabKey = tab.getAttribute('data-ltab') as 'predictors' | 'rich' | 'server' | 'prizes';
        if (tabKey) {
          store.setActiveTab(tabKey);
        }
      });
    });

    // Инициализируем данные из стора, если они есть
    const currentState = store.get();
    if (currentState.predictors.items.length > 0) {
      renderPredictorsTable(currentState.predictors.items, currentState.predictors.lastUpdated);
    }

    console.log('[LeaderboardStore] Adapter integrated');
  };

  // Запускаем интеграцию когда DOM готов
  const initialize = () => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(integrateWithLegacy, 200);
      });
    } else {
      setTimeout(integrateWithLegacy, 200);
    }
  };

  initialize();
})();
