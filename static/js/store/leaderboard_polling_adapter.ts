// leaderboard_polling_adapter.ts
// Адаптер для управления polling и prefetch логикой лидерборда через стор

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

  // Polling логика
  const setupPolling = async () => {
    await waitForStore();

    if (!window.LeaderboardStore) {
      return;
    }

    const store = window.LeaderboardStore as ExtendedLeaderboardStore;

    const LB_POLL_MS = 60000; // 60 секунд
    const LB_JITTER_MS = 4000; // джиттер
    let pollingTimer: number | null = null;
    let prefetched = false;

    // Функция проверки видимости панели
    const isPaneVisible = (key: string): boolean => {
      const pane = document.getElementById(`leader-pane-${key}`);
      if (!pane) return false;
      if (document.hidden) return false;
      const cs = window.getComputedStyle(pane);
      return cs && cs.display !== 'none' && cs.visibility !== 'hidden';
    };

    // Остановка polling
    const stopPolling = () => {
      if (pollingTimer) {
        clearTimeout(pollingTimer);
        pollingTimer = null;
      }
      store.setPollingState(false);
    };

    // Запуск polling для активной вкладки
    const startPolling = (activeTab: string) => {
      stopPolling();

      if (!['predictors', 'rich', 'server'].includes(activeTab)) {
        return; // Призы не требуют частого обновления
      }

      store.setPollingState(true);

      const tick = async () => {
        try {
          const state = store.get();
          const currentActiveTab = state.activeTab;

          if (isPaneVisible(currentActiveTab)) {
            // Обновляем только активную вкладку
            if (currentActiveTab === 'predictors' && window.loadLBPredictors) {
              await window.loadLBPredictors({ forceRevalidate: true, skipIfNotUpdated: true });
            } else if (currentActiveTab === 'rich' && window.loadLBRich) {
              await window.loadLBRich({ forceRevalidate: true, skipIfNotUpdated: true });
            } else if (currentActiveTab === 'server' && window.loadLBServer) {
              await window.loadLBServer({ forceRevalidate: true, skipIfNotUpdated: true });
            }
          }
        } catch (error) {
          console.error('[LeaderboardStore] Polling error:', error);
        }

        // Планируем следующий тик
        const delay = LB_POLL_MS + Math.floor(Math.random() * LB_JITTER_MS);
        pollingTimer = setTimeout(tick, delay);
      };

      // Первый запуск с небольшой задержкой
      pollingTimer = setTimeout(tick, 1200);
    };

    // Prefetch неактивных вкладок
    const prefetchLeaderboards = () => {
      if (prefetched) return;
      prefetched = true;

      setTimeout(() => {
        const tryPrefetch = async (category: 'rich' | 'server' | 'prizes') => {
          try {
            if (store.isDataFresh(category, 60000)) {
              return; // Данные свежие
            }

            // Загружаем данные в фоне
            if (category === 'rich' && window.loadLBRich) {
              await window.loadLBRich();
            } else if (category === 'server' && window.loadLBServer) {
              await window.loadLBServer();
            } else if (category === 'prizes' && window.loadLBPrizes) {
              await window.loadLBPrizes();
            }
          } catch (error) {
            console.error(`[LeaderboardStore] Prefetch ${category} error:`, error);
          }
        };

        // Префетчим неактивные вкладки
        const state = store.get();
        if (state.activeTab !== 'rich') tryPrefetch('rich');
        if (state.activeTab !== 'server') tryPrefetch('server');
        if (state.activeTab !== 'prizes') tryPrefetch('prizes');
      }, 1400);
    };

    // Подписываемся на изменения activeTab в сторе
    store.subscribe(state => {
      const activeTab = state.activeTab;

      // Перезапускаем polling для новой активной вкладки
      if (['predictors', 'rich', 'server'].includes(activeTab)) {
        startPolling(activeTab);
      } else {
        stopPolling();
      }
    });

    // Обработка изменения видимости страницы
    document.addEventListener('visibilitychange', () => {
      const state = store.get();

      if (document.hidden) {
        stopPolling();
      } else {
        // Возобновляем polling для активной вкладки
        const activeTab = state.activeTab;
        if (['predictors', 'rich', 'server'].includes(activeTab)) {
          startPolling(activeTab);
        }
      }
    });

    // Отслеживаем переключение вкладок в DOM
    const tabs = document.querySelectorAll('#leader-subtabs .subtab-item');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabKey = tab.getAttribute('data-ltab');
        if (tabKey) {
          store.setActiveTab(tabKey as 'predictors' | 'rich' | 'server' | 'prizes');
        }
      });
    });

    // Инициализируем polling для первой вкладки
    const initialState = store.get();
    if (['predictors', 'rich', 'server'].includes(initialState.activeTab)) {
      startPolling(initialState.activeTab);
    }

    // Запускаем prefetch
    prefetchLeaderboards();

    console.log('[LeaderboardStore] Polling adapter initialized');
  };

  // Запускаем настройку polling когда DOM готов
  const initialize = () => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(setupPolling, 300);
      });
    } else {
      setTimeout(setupPolling, 300);
    }
  };

  initialize();
})();
