// UI store: persisted bits of UI state
(function(){
  const init = { activeTab: 'home', theme: 'ufo', modals: {} };
  const ui = window.Store.createStore('ui', init, {
    persistKey: 'store:ui',
    persistPaths: ['activeTab','theme'],
    ttlMs: 1000 * 60 * 60 * 24 * 14 // 14d
  });

  // convenience helpers
  function setActiveTab(tab){ ui.update(s => { s.activeTab = tab; }); }
  function setTheme(theme){ ui.update(s => { s.theme = theme; }); }

  window.UIStore = Object.assign({}, ui, { setActiveTab, setTheme });
})();
