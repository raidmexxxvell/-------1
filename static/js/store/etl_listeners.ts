// Adapters for mapping ETag results into Store slices without changing UI business logic
// Phase 1: League schedule only (safe)

import type { StoreApi } from './core';

declare global {
  interface Window {
    LeagueStore?: StoreApi<LeagueState>;
  }
}

// Listen globally for etag:success events and map known cacheKeys into stores
(function(){
  if (typeof window === 'undefined') return;
  const handler = (ev: Event) => {
    const e = ev as CustomEvent<{ cacheKey: string; data: any; etag?: string|null; headerUpdatedAt?: string|null }>;
    if (!e || !e.detail) return;
    const { cacheKey, data, etag } = e.detail;

    // Map: league schedule
    if (cacheKey === 'league:schedule' && window.LeagueStore){
      try {
        const tours = Array.isArray(data?.tours) ? data.tours : (data || []);
        window.LeagueStore.update(s => { s.schedule.tours = tours; s.schedule.lastUpdated = Date.now(); s.schedule.etag = etag ?? null; });
      } catch(_) {}
    }
  };
  window.addEventListener('etag:success', handler);
})();
