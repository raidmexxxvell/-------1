import type { StoreApi } from './core';

declare global {
  interface PredictionItem {
    id: string;
    matchId: string;
    market: string;
    options: any[];
  }
  interface MyBet {
    id: string;
    home: string;
    away: string;
    datetime?: string;
    selection: string;
    selection_display?: string;
    market_display?: string;
    odds: number;
    stake: number;
    status: 'open' | 'won' | 'lost';
    winnings?: number;
  }
  interface MyBetsCache {
    bets: MyBet[];
    lastUpdated: number;
    ttl: number;
  }
  interface PredictionsState {
    items: PredictionItem[];
    myVotes: Record<string, any>;
    myBets: MyBetsCache | null;
    ttl: number | null;
  }
  interface Window {
    PredictionsStore?: StoreApi<PredictionsState>;
  }
}

(() => {
  const init: PredictionsState = { items: [], myVotes: {}, myBets: null, ttl: null };
  const predictions = window.Store.createStore<PredictionsState>('predictions', init);
  window.PredictionsStore = predictions;

  // Глобальные хелперы для работы с MyBets кэшем
  const PredictionHelpers = {
    // Проверяет валидность кэша myBets
    isMyBetsCacheValid(ttlMs: number = 2 * 60 * 1000): boolean {
      const state = predictions.get();
      if (!state.myBets || !state.myBets.lastUpdated) return false;
      return Date.now() - state.myBets.lastUpdated < ttlMs;
    },

    // Получает myBets из кэша или null если кэш невалидный
    getCachedMyBets(ttlMs: number = 2 * 60 * 1000): MyBet[] | null {
      if (!this.isMyBetsCacheValid(ttlMs)) return null;
      const state = predictions.get();
      return state.myBets?.bets || null;
    },

    // Сохраняет myBets в кэш стора
    setCachedMyBets(bets: MyBet[], ttlMs: number = 2 * 60 * 1000): void {
      predictions.update(state => {
        state.myBets = {
          bets: bets,
          lastUpdated: Date.now(),
          ttl: ttlMs,
        };
      });
    },

    // Очищает кэш myBets
    clearMyBetsCache(): void {
      predictions.update(state => {
        state.myBets = null;
      });
    },
  };

  // Экспортируем хелперы глобально для использования в predictions.js
  try {
    (window as any).PredictionHelpers = PredictionHelpers;
  } catch (_) {}
})();
