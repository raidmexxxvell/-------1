// App store: global app flags
(function () {
  const init = { ready: false, startedAt: Date.now() };
  const app = window.Store.createStore('app', init, {
    /* no persist */
  });
  // expose helpers
  window.AppStore = app;
})();
