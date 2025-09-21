// WS listeners: map WebSocket events into Store slices (soft integration, optional dist)
// - updates RealtimeStore (connected/reconnects/topics)
// - maps odds patches into OddsStore with versioning guard

import type { StoreApi } from './core';

interface RealtimeState {
  connected: boolean;
  reconnects: number;
  topics?: string[];
}

interface OddsState {
  map: Record<string, { value: number; version: number; lastUpdated: number }>;
}

(function(){
  if (typeof window === 'undefined') return;

  // Connection state events
  window.addEventListener('ws:connected', (e: Event) => {
    try {
      const d = (e as CustomEvent).detail || {};
      (window as any).RealtimeStore?.update((s: any) => { s.connected = true; s.reconnects = Number(d.reconnects||0); });
    } catch(_) {}
  });
  window.addEventListener('ws:disconnected', (e: Event) => {
    try {
      const d = (e as CustomEvent).detail || {};
      (window as any).RealtimeStore?.update((s: any) => { s.connected = false; s.reconnects = (s.reconnects||0)+1; });
    } catch(_) {}
  });

  // Topic updates (optional topics array maintenance)
  window.addEventListener('ws:topic_update', (e: Event) => {
    try {
      const p = (e as CustomEvent).detail || {};
      const topic = String(p.topic||p.channel||'').trim();
      if (!topic) return;
      (window as any).RealtimeStore?.update((s: any) => {
        const set = new Set(s.topics||[]);
        set.add(topic);
        s.topics = Array.from(set);
      });
      // Лидерборды/статистика лиги: мгновенное обновление таблицы статистики
      const ent = String(p.entity||'');
      if (ent === 'leaderboards' || ent === 'leader-goal-assist' || topic === 'leaderboards') {
        try { (window as any).loadStatsViaStore?.(); } catch(_) {}
        try { (window as any).loadStatsTable?.(); } catch(_) {}
      }
    } catch(_) {}
  });

  // Дополнительно: если прилетает патч данных о лидербордах — обновим таблицу
  window.addEventListener('ws:data_patch', (e: Event) => {
    try {
      const p = (e as CustomEvent).detail || {} as any;
      const t = String(p?.type || p?.data_type || p?.entity || '');
      if (t === 'leader-goal-assist') {
        try { (window as any).loadStatsViaStore?.(); } catch(_) {}
        try { (window as any).loadStatsTable?.(); } catch(_) {}
      }
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
      (window as any).OddsStore?.update((s: any) => {
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
      if (!(window as any).MatchesStore) return;

      if (p.entity === 'match') {
        const id = p.id || {}; const fields = p.fields || {};
        const home = id.home || p.home || fields.home || '';
        const away = id.away || p.away || fields.away || '';
        const date = id.date || p.date || '';
        if (!home || !away) return;
        const key = `${home}_${away}_${date||''}`;
        const score_home = fields.score_home; const score_away = fields.score_away;
        (window as any).MatchesStore.update((s: any) => {
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
        (window as any).MatchesStore.update((s: any) => {
          const cur = s.map[key] || { info: { id: key, home, away, date }, score: null, events: [], lastUpdated: null };
          // простая слияние: добавляем новые события в конец, избегая дублей по (t,kind,team)
          const eventsArray = cur.events || []; // защита от undefined
          const seen = new Set(eventsArray.map((ev: any) => `${ev.t}|${ev.kind}|${ev.team||ev.teamName||ev.side||''}`));
          for (const ev of incoming) {
            const sig = `${ev.t}|${ev.kind}|${ev.team||ev.teamName||ev.side||''}`;
            if (!seen.has(sig)) { eventsArray.push(ev); seen.add(sig); }
          }
          cur.events = eventsArray; // обновляем массив
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
        (window as any).MatchesStore.update((s: any) => {
          const cur = s.map[key] || { info: { id: key, home, away, date }, score: null, events: [], lastUpdated: null } as any;
          cur.stats = Object.assign({}, cur.stats || {}, fields?.stats || fields || {});
          cur.lastUpdated = Date.now();
          s.map[key] = cur;
        });
      }

      // optional: match_rosters patch (новое добавление)
      if (p.entity === 'match_rosters' || p.entity === 'rosters') {
        const id = p.id || {}; const fields = p.fields || {};
        const home = id.home || p.home || fields.home || '';
        const away = id.away || p.away || fields.away || '';
        const date = id.date || p.date || '';
        if (!home || !away) return;
        const key = `${home}_${away}_${date||''}`;
        (window as any).MatchesStore.update((s: any) => {
          const cur = s.map[key] || { info: { id: key, home, away, date }, score: null, events: [], lastUpdated: null } as any;
          // Обновляем составы
          if (fields.rosters) {
            (cur as any).rosters = fields.rosters;
          } else if (fields.home_roster || fields.away_roster) {
            (cur as any).rosters = (cur as any).rosters || { home: [], away: [] };
            if (fields.home_roster) (cur as any).rosters.home = fields.home_roster;
            if (fields.away_roster) (cur as any).rosters.away = fields.away_roster;
          }
          cur.lastUpdated = Date.now();
          s.map[key] = cur;
        });
      }
    } catch(_) {}
  });
})();
