// static/js/store/predictions_ui_bindings.ts
// UI bindings for Predictions components to subscribe to PredictionsStore changes
// Provides automatic UI updates when store state changes

// Импортируем PredictionsStore (браузерный ESM: явное .js)
import './predictions.js';
import type { StoreApi } from './core';

// Дополнительные глобальные объявления для Predictions API
declare global {
  interface Window {
    PredictionsStore?: StoreApi<PredictionsState>;
    PredictionHelpers?: {
      isMyBetsCacheValid(ttlMs?: number): boolean;
      getCachedMyBets(ttlMs?: number): MyBet[] | null;
      setCachedMyBets(bets: MyBet[], ttlMs?: number): void;
      clearMyBetsCache(): void;
    };
    MatchUtils?: {
      formatDateTime(datetime: string): string;
    };
  }
}

(function () {
  if (!window.Store || typeof window === 'undefined') return;

  // Feature flag проверка
  const isEnabled = () => {
    try {
      return localStorage.getItem('feature:predictions_ui_store') === '1';
    } catch (_) {
      return false;
    }
  };

  // Селекторы DOM элементов
  const getMyBetsElement = () => document.getElementById('my-bets');
  const getPredictionsPane = () => document.getElementById('pred-pane-mybets');
  const getPredTours = () => document.getElementById('pred-tours');

  // Отслеживание состояния для предотвращения ненужных ре-рендеров
  let lastMyBetsRender = 0;
  let lastPredictionsRender = 0;

  function renderMyBetsFromStore(state: PredictionsState): void {
    if (!isEnabled()) return;

    const myBetsEl = getMyBetsElement();
    if (!myBetsEl) return;

    // Проверяем, изменились ли данные
    const currentHash = state.myBets
      ? JSON.stringify(state.myBets.bets).length + state.myBets.lastUpdated
      : 0;
    if (currentHash === lastMyBetsRender) return;

    lastMyBetsRender = currentHash;

    if (!state.myBets || !state.myBets.bets.length) {
      myBetsEl.innerHTML = '<div class="schedule-empty">Ставок нет</div>';
      return;
    }

    const list = document.createElement('div');
    list.className = 'bets-list';

    state.myBets.bets.forEach(bet => {
      const card = document.createElement('div');
      card.className = 'bet-card';

      const top = document.createElement('div');
      top.className = 'bet-top';

      const title = document.createElement('div');
      title.className = 'bet-title';
      title.textContent = `${bet.home} vs ${bet.away}`;

      const when = document.createElement('div');
      when.className = 'bet-when';
      when.textContent = bet.datetime ? formatDateTime(bet.datetime) : '';

      top.append(title, when);

      // Локализованный вывод исхода
      const selDisp = bet.selection_display || bet.selection;
      const marketDisp = bet.market_display || 'Исход';

      const mid = document.createElement('div');
      mid.className = 'bet-mid';
      mid.textContent = `${marketDisp}: ${selDisp} | Кф: ${bet.odds || '-'} | Ставка: ${bet.stake}`;

      const status = document.createElement('div');
      status.className = `bet-status ${bet.status}`;

      // Локализация статусов
      let statusText: string = bet.status;
      if (bet.status === 'open') statusText = 'Открыта';
      else if (bet.status === 'won') statusText = 'Выиграна';
      else if (bet.status === 'lost') statusText = 'Проиграна';

      // Добавляем сумму выигрыша для выигранных ставок
      if (bet.status === 'won' && bet.winnings) {
        statusText += ` (+${bet.winnings} кр.)`;
      }

      status.textContent = statusText;
      card.append(top, mid, status);
      list.appendChild(card);
    });

    // Batch DOM update
    myBetsEl.innerHTML = '';
    myBetsEl.appendChild(list);
  }

  function renderPredictionsItemsFromStore(state: PredictionsState): void {
    if (!isEnabled()) return;

    const toursEl = getPredTours();
    if (!toursEl) return;

    // Проверяем изменения в items
    const currentHash = JSON.stringify(state.items).length;
    if (currentHash === lastPredictionsRender) return;

    lastPredictionsRender = currentHash;

    // Здесь можно добавить логику рендеринга списка прогнозов
    // Пока что это заглушка, так как основной рендеринг остается в predictions.js
    console.log('Predictions items updated:', state.items.length);
  }

  function handlePredictionsStoreUpdate(state: PredictionsState): void {
    try {
      renderMyBetsFromStore(state);
      renderPredictionsItemsFromStore(state);
    } catch (err) {
      console.error('Error in predictions store update handler:', err);
    }
  }

  // Подписка на изменения PredictionsStore
  if (window.PredictionsStore && typeof window.PredictionsStore.subscribe === 'function') {
    window.PredictionsStore.subscribe(handlePredictionsStoreUpdate);

    // Первоначальный рендеринг
    const initialState = window.PredictionsStore.get();
    if (initialState) {
      handlePredictionsStoreUpdate(initialState);
    }
  }

  // Утилита форматирования времени (fallback если MatchUtils не доступен)
  function formatDateTime(datetime: string): string {
    if (window.MatchUtils && typeof window.MatchUtils.formatDateTime === 'function') {
      return window.MatchUtils.formatDateTime(datetime);
    }

    try {
      const date = new Date(datetime);
      return (
        date.toLocaleDateString('ru-RU') +
        ' ' +
        date.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    } catch (_) {
      return datetime || '';
    }
  }

  // Экспорт функций для внешнего использования
  try {
    (window as any).PredictionsUIBindings = {
      renderMyBetsFromStore,
      renderPredictionsItemsFromStore,
      isEnabled,
    };
  } catch (_) {}
})();
