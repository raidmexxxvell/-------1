import type { StoreApi } from './core';

(() => {
  const init: UserState = { id: null, name: null, role: 'guest', flags: {} };
  const user: StoreApi<UserState> = window.Store.createStore<UserState>('user', init, {
    persistKey: 'store:user',
    persistPaths: ['id', 'name', 'role', 'flags'],
    ttlMs: 1000 * 60 * 60 * 24 * 7,
  });
  window.UserStore = user;
})();
