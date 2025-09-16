import type { StoreApi } from './core';

(() => {
  const init: UIState = { activeTab: 'home', theme: 'ufo', modals: {} };
  const ui: StoreApi<UIState> = window.Store.createStore<UIState>('ui', init, {
    persistKey: 'store:ui',
    persistPaths: ['activeTab','theme'],
    ttlMs: 1000 * 60 * 60 * 24 * 14
  });

  function setActiveTab(tab: string){ ui.update(s => { s.activeTab = tab; }); }
  function setTheme(theme: string){ ui.update(s => { s.theme = theme; }); }

  window.UIStore = Object.assign({}, ui, { setActiveTab, setTheme });
})();
