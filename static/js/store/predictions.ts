import type { StoreApi } from './core';

declare global {
  interface PredictionItem { id: string; matchId: string; market: string; options: any[] }
  interface PredictionsState { items: PredictionItem[]; myVotes: Record<string, any>; ttl: number | null }
  interface Window { PredictionsStore?: StoreApi<PredictionsState> }
}

(() => {
  const init: PredictionsState = { items: [], myVotes: {}, ttl: null };
  const predictions = window.Store.createStore<PredictionsState>('predictions', init);
  window.PredictionsStore = predictions;
})();
