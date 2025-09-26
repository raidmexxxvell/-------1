import type { StoreApi } from './core';

declare global {
  // Типы для элементов лидерборда
  interface LeaderboardPredictorItem {
    display_name: string;
    bets_total: number;
    bets_won: number;
    winrate: number;
    rank?: number;
  }

  interface LeaderboardRichItem {
    display_name: string;
    credits: number;
    rank?: number;
  }

  interface LeaderboardServerItem {
    display_name: string;
    total_score: number;
    matches_played: number;
    rank?: number;
  }

  interface LeaderboardPrizeItem {
    period: string;
    winner: string;
    prize_amount: number;
    category: string;
  }

  // Состояние лидерборда
  interface LeaderboardState {
    // Прогнозисты (топ по винрейту)
    predictors: {
      items: LeaderboardPredictorItem[];
      lastUpdated: number | null;
      etag?: string | null;
    };

    // Богатство (топ по кредитам)
    rich: {
      items: LeaderboardRichItem[];
      lastUpdated: number | null;
      etag?: string | null;
    };

    // Сервер (топ игроков)
    server: {
      items: LeaderboardServerItem[];
      lastUpdated: number | null;
      etag?: string | null;
    };

    // Призы
    prizes: {
      items: LeaderboardPrizeItem[];
      lastUpdated: number | null;
      etag?: string | null;
    };

    // Общие настройки
    activeTab: 'predictors' | 'rich' | 'server' | 'prizes';
    isPolling: boolean;
    lastGlobalUpdate: number | null;
  }

  interface Window {
    LeaderboardStore?: StoreApi<LeaderboardState> & {
      updatePredictors: (data: { items: LeaderboardPredictorItem[]; etag?: string }) => void;
      updateRich: (data: { items: LeaderboardRichItem[]; etag?: string }) => void;
      updateServer: (data: { items: LeaderboardServerItem[]; etag?: string }) => void;
      updatePrizes: (data: { items: LeaderboardPrizeItem[]; etag?: string }) => void;
      setActiveTab: (tab: 'predictors' | 'rich' | 'server' | 'prizes') => void;
      setPollingState: (isPolling: boolean) => void;
      isDataFresh: (
        category: 'predictors' | 'rich' | 'server' | 'prizes',
        ttlMs?: number
      ) => boolean;
    };
  }
}

(() => {
  const init: LeaderboardState = {
    predictors: {
      items: [],
      lastUpdated: null,
      etag: null,
    },
    rich: {
      items: [],
      lastUpdated: null,
      etag: null,
    },
    server: {
      items: [],
      lastUpdated: null,
      etag: null,
    },
    prizes: {
      items: [],
      lastUpdated: null,
      etag: null,
    },
    activeTab: 'predictors',
    isPolling: false,
    lastGlobalUpdate: null,
  };

  // Создаём стор без персистенции (данные лидерборда всегда свежие)
  const leaderboard = window.Store.createStore<LeaderboardState>('leaderboard', init);

  // Добавляем удобные методы для работы с лидербордом
  const leaderboardApi = {
    ...leaderboard,

    // Обновление прогнозистов
    updatePredictors(data: { items: LeaderboardPredictorItem[]; etag?: string }) {
      leaderboard.update(state => {
        state.predictors.items = data.items.map((item, index) => ({ ...item, rank: index + 1 }));
        state.predictors.lastUpdated = Date.now();
        state.predictors.etag = data.etag || null;
        state.lastGlobalUpdate = Date.now();
      });
    },

    // Обновление богатства
    updateRich(data: { items: LeaderboardRichItem[]; etag?: string }) {
      leaderboard.update(state => {
        state.rich.items = data.items.map((item, index) => ({ ...item, rank: index + 1 }));
        state.rich.lastUpdated = Date.now();
        state.rich.etag = data.etag || null;
        state.lastGlobalUpdate = Date.now();
      });
    },

    // Обновление сервера
    updateServer(data: { items: LeaderboardServerItem[]; etag?: string }) {
      leaderboard.update(state => {
        state.server.items = data.items.map((item, index) => ({ ...item, rank: index + 1 }));
        state.server.lastUpdated = Date.now();
        state.server.etag = data.etag || null;
        state.lastGlobalUpdate = Date.now();
      });
    },

    // Обновление призов
    updatePrizes(data: { items: LeaderboardPrizeItem[]; etag?: string }) {
      leaderboard.update(state => {
        state.prizes.items = data.items;
        state.prizes.lastUpdated = Date.now();
        state.prizes.etag = data.etag || null;
        state.lastGlobalUpdate = Date.now();
      });
    },

    // Установка активной вкладки
    setActiveTab(tab: 'predictors' | 'rich' | 'server' | 'prizes') {
      leaderboard.update(state => {
        state.activeTab = tab;
      });
    },

    // Управление состоянием polling
    setPollingState(isPolling: boolean) {
      leaderboard.update(state => {
        state.isPolling = isPolling;
      });
    },

    // Проверка свежести данных
    isDataFresh(category: 'predictors' | 'rich' | 'server' | 'prizes', ttlMs = 60000): boolean {
      const state = leaderboard.get();
      const categoryData = state[category];

      if (!categoryData.lastUpdated) {
        return false;
      }

      return Date.now() - categoryData.lastUpdated < ttlMs;
    },
  };

  window.LeaderboardStore = leaderboardApi;
})();
