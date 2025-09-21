// Adapters for mapping ETag results into Store slices without changing UI business logic
// Phase 1: League schedule only (safe)

import type { StoreApi } from './core';

declare global {
  interface Window {
    LeagueStore?: StoreApi<LeagueState>;
    PredictionsStore?: StoreApi<PredictionsState>;
    OddsStore?: StoreApi<OddsState>;
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
        // Детект «смены сезона»: если минимальный тур стал 1 (или снизился), чистим локальные ключи голосования
        try {
          const prevMarkerRaw = localStorage.getItem('season:marker');
          const prevMarker = prevMarkerRaw ? JSON.parse(prevMarkerRaw) : null;
          const minTour = (() => {
            let mt = Infinity;
            for (const t of (tours||[])){
              const v = typeof t?.tour === 'number' ? t.tour : (parseInt(String(t?.tour), 10) || NaN);
              if (!Number.isNaN(v)) mt = Math.min(mt, v);
            }
            return Number.isFinite(mt) ? mt : null;
          })();
          const marker = { minTour: minTour ?? null };
          const changed = !prevMarker || (typeof prevMarker.minTour === 'number' && typeof marker.minTour === 'number' ? (marker.minTour < prevMarker.minTour) : (!!marker.minTour && prevMarker.minTour == null));
          if (changed && marker.minTour === 1){
            // Очистка ключей голосования
            try {
              const keys = Object.keys(localStorage);
              for (const k of keys){ if (k.startsWith('voted:') || k.startsWith('voteAgg:')) localStorage.removeItem(k); }
            } catch(_){/* noop */}
          }
          try { localStorage.setItem('season:marker', JSON.stringify(marker)); } catch(_){/* noop */}
        } catch(_){/* noop */}
        window.LeagueStore.update(s => { s.schedule.tours = tours; s.schedule.lastUpdated = Date.now(); s.schedule.etag = etag ?? null; });
      } catch(_) {}
    }

    // Map: league table
    if (cacheKey === 'league:table' && window.LeagueStore){
      try {
        // API может отдавать таблицу в разных обёртках:
        //  - объект с полем values
        //  - прямой массив
        //  - объект с полем table
        const table = Array.isArray((data as any)?.values)
          ? (data as any).values
          : (Array.isArray(data) ? (data as any) : ((data as any)?.table || []));
        window.LeagueStore.update(s => { s.table = Array.isArray(table) ? table : []; });
      } catch(_) {}
    }

    // Map: league stats (не затирать UI пустыми массивами — сохраняем последнюю удачную выборку)
    if (cacheKey === 'league:stats' && window.LeagueStore){
      try {
        const stats = Array.isArray(data) ? data : (data?.stats || []);
        // Если пришёл пустой массив — пропускаем обновление (оставляем прежние данные)
        if (!Array.isArray(stats) || stats.length === 0) return;
        window.LeagueStore.update(s => { s.stats = stats; });
      } catch(_) {}
    }

    // Map: predictions list (+ optional odds versions)
    if (cacheKey === 'predictions:list'){
      try {
        if (window.PredictionsStore){
          const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
          window.PredictionsStore.update(s => { s.items = items; s.ttl = Date.now() + 5*60*1000; });
        }
        // Optional: map basic odds versions if present in payload
        if (window.OddsStore && data && Array.isArray(data.odds)){
          const arr = data.odds as any[];
          window.OddsStore.update(s => {
            for (const o of arr){
              const key = o?.key || o?.id || null; if (!key) continue;
              const version = typeof o?.version === 'number' ? o.version : (typeof o?.odds_version === 'number' ? o.odds_version : 0);
              const value = typeof o?.value === 'number' ? o.value : (typeof o?.odds === 'number' ? o.odds : 0);
              s.map[key] = { value, version, lastUpdated: Date.now() };
            }
          });
        }
      } catch(_) {}
    }
  };
  window.addEventListener('etag:success', handler);
})();
