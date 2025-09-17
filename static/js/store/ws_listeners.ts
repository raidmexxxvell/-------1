// WS listeners: map WebSocket events into Store slices (soft integration, optional dist)
// - updates RealtimeStore (connected/reconnects/topics)
// - maps odds patches into OddsStore with versioning guard

import type { StoreApi } from './core';

declare global {
  interface Window {
    RealtimeStore?: StoreApi<RealtimeState>;
    OddsStore?: StoreApi<OddsState>;
    MatchesStore?: StoreApi<MatchesState>;
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

  // Generic data patches: match score/events → MatchesStore
  window.addEventListener('ws:data_patch', (e: Event) => {
    try {
      const p = (e as CustomEvent).detail || {};
      if (!p || !p.entity) return;
      if (!window.MatchesStore) return;

      if (p.entity === 'match') {
        const id = p.id || {}; const fields = p.fields || {};
        const home = id.home || p.home || fields.home || '';
        const away = id.away || p.away || fields.away || '';
        const date = id.date || p.date || '';
        if (!home || !away) return;
        const key = `${home}_${away}_${date||''}`;
        const score_home = fields.score_home; const score_away = fields.score_away;
        window.MatchesStore.update(s => {
          const cur = s.map[key] || { info: { id: key, home, away, date }, score: null, events: [], lastUpdated: null };
          if (score_home !== undefined || score_away !== undefined) {
            const prev = cur.score || { home: 0, away: 0 } as any;
            cur.score = { home: score_home ?? prev.home, away: score_away ?? prev.away } as any;
          }
          cur.lastUpdated = Date.now();
          s.map[key] = cur;
        });
      }

      if (p.entity === 'match_events' || p.entity === 'match_events_removed') {
        const id = p.id || {}; const fields = p.fields || {};
        const home = id.home || p.home || fields.home || '';
        const away = id.away || p.away || fields.away || '';
        const date = id.date || p.date || '';
        if (!home || !away) return;
        const key = `${home}_${away}_${date||''}`;
        // events array expected in fields.events or p.events
        const incoming = Array.isArray(fields.events) ? fields.events : (Array.isArray(p.events) ? p.events : []);
        if (!incoming.length) return;
        window.MatchesStore.update(s => {
          const cur = s.map[key] || { info: { id: key, home, away, date }, score: null, events: [], lastUpdated: null };
          // простая слияние: добавляем новые события в конец, избегая дублей по (t,kind,team)
          const seen = new Set(cur.events.map(ev => `${ev.t}|${ev.kind}|${ev.team||ev.teamName||ev.side||''}`));
          for (const ev of incoming) {
            const sig = `${ev.t}|${ev.kind}|${ev.team||ev.teamName||ev.side||''}`;
            if (!seen.has(sig)) { cur.events.push(ev); seen.add(sig); }
          }
          cur.lastUpdated = Date.now();
          s.map[key] = cur;
        });
      }

      // optional: match_stats patch
      if (p.entity === 'match_stats') {
        const id = p.id || {}; const fields = p.fields || {};
        const home = id.home || p.home || fields.home || '';
        const away = id.away || p.away || fields.away || '';
        const date = id.date || p.date || '';
        if (!home || !away) return;
        const key = `${home}_${away}_${date||''}`;
        window.MatchesStore.update(s => {
          const cur = s.map[key] || { info: { id: key, home, away, date }, score: null, events: [], lastUpdated: null } as any;
          cur.stats = Object.assign({}, cur.stats || {}, fields?.stats || fields || {});
          cur.lastUpdated = Date.now();
          s.map[key] = cur;
        });
      }
    } catch(_) {}
  });
})();
