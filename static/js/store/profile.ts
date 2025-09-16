import type { StoreApi } from './core';

declare global {
  interface Achievement { id: string; name: string; unlocked: boolean; ts?: number }
  interface ProfileState { achievements: Achievement[]; badges: string[]; lastUpdated: number | null }
  interface Window { ProfileStore?: StoreApi<ProfileState> }
}

(() => {
  const init: ProfileState = { achievements: [], badges: [], lastUpdated: null };
  const profile = window.Store.createStore<ProfileState>('profile', init);
  window.ProfileStore = profile;
})();
