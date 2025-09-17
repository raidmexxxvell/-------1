// WS listeners: map WebSocket events into Store slices (soft integration, optional dist)
// - updates RealtimeStore (connected/reconnects/topics)
// - maps odds patches into OddsStore with versioning guard

import type { StoreApi } from './core';

declare global {
  interface Window {
    RealtimeStore?: StoreApi<RealtimeState>;
    OddsStore?: StoreApi<OddsState>;
  }
}

(function(){
  if (typeof window === 'undefined') return;

  // Connection state events
  window.addEventListener('ws:connected', (e: Event) => {
    try {
      const d = (e as CustomEvent).detail || {};
      window.RealtimeStore?.update(s => { s.connected = true; s.reconnects = Number(d.reconnects||0); });
    } catch(_) {}
  });
  window.addEventListener('ws:disconnected', (e: Event) => {
    try {
      const d = (e as CustomEvent).detail || {};
      window.RealtimeStore?.update(s => { s.connected = false; s.reconnects = (s.reconnects||0)+1; });
    } catch(_) {}
  });

  // Topic updates (optional topics array maintenance)
  window.addEventListener('ws:topic_update', (e: Event) => {
    try {
      const p = (e as CustomEvent).detail || {};
      const topic = String(p.topic||p.channel||'').trim();
      if (!topic) return;
      window.RealtimeStore?.update(s => {
        const set = new Set(s.topics||[]);
        set.add(topic);
        s.topics = Array.from(set);
      });
    } catch(_) {}
  });

  // Odds patches: write to OddsStore with version guard
  window.addEventListener('ws:odds', (e: Event) => {
    try {
      const d = (e as CustomEvent).detail || {};
      const key = (d.homeTeam && d.awayTeam && d.date)
        ? `${d.homeTeam}_${d.awayTeam}_${d.date}`
        : (d.key || null);
      if (!key) return;
      const incomingV = typeof d.odds_version === 'number' ? d.odds_version : 0;
      window.OddsStore?.update(s => {
        const cur = s.map[key]?.version || 0;
        if (incomingV < cur) return; // ignore stale
        const value = typeof d.odds?.value === 'number' ? d.odds.value : (typeof d.odds === 'number' ? d.odds : 0);
        s.map[key] = { value, version: incomingV, lastUpdated: Date.now() };
      });
    } catch(_) {}
  });
})();
