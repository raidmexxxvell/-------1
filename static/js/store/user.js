// User store: persisted basic user info (no secrets)
(function(){
  const init = { id: null, name: null, role: 'guest', flags: {} };
  const user = window.Store.createStore('user', init, {
    persistKey: 'store:user',
    persistPaths: ['id','name','role','flags'],
    ttlMs: 1000 * 60 * 60 * 24 * 7 // 7d
  });
  window.UserStore = user;
})();
