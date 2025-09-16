import type { StoreApi } from './core';

declare global {
  interface ShopCartItem { id: string; title: string; price: number; qty: number }
  interface ShopOrder { id: string; items: ShopCartItem[]; total: number; createdAt: number }
  interface ShopState { cart: ShopCartItem[]; orders: ShopOrder[]; ttl: number | null }
  interface Window { ShopStore?: StoreApi<ShopState> }
}

(() => {
  const init: ShopState = { cart: [], orders: [], ttl: null };
  const shop = window.Store.createStore<ShopState>('shop', init, {
    persistKey: 'store:shop',
    persistPaths: ['cart','orders','ttl'],
    ttlMs: 1000 * 60 * 60 * 24 * 14
  });
  window.ShopStore = shop;
})();
