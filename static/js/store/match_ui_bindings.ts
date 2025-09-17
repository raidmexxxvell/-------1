import type { StoreApi } from './core';

// Minimal types aligned with matches.ts (kept local to avoid tight coupling)
type MatchInfo = { home: string; away: string; date?: string };
type MatchScore = { home: number; away: number };
type MatchEvent = { t?: number; kind?: string; team?: string; side?: 'home'|'away'; teamName?: string };
type MatchStats = { home?: Record<string, any>; away?: Record<string, any>; [k: string]: any };
type MatchEntry = { info?: MatchInfo | null; score?: MatchScore | null; events?: MatchEvent[]; stats?: MatchStats | null; lastUpdated?: number | null };
type MatchesState = { map: Record<string, MatchEntry> };


(() => {
  // Feature flag: enable via localStorage key 'feature:match_ui_store' = '1'
  try {
    const ff = (localStorage.getItem('feature:match_ui_store') === '1');
    if (!ff) return;
  } catch { return; }

  const detailsEl = () => document.getElementById('ufo-match-details') as HTMLElement | null;
  const nameEl = (id: string) => document.getElementById(id) as HTMLElement | null;
  // Legacy рендер событий/статистики остаётся в существующих модулях
  // (profile-match-roster-events.js и profile-match-stats.js)

  function getVisible(el: HTMLElement | null): boolean {
    return !!el && el.style.display !== 'none';
  }

  // Heuristic: find current match key by matching home/away names; prefer most recently updated
  function findCurrentMatchKey(state: MatchesState): string | null {
    const homeName = nameEl('md-home-name')?.textContent?.trim() || '';
    const awayName = nameEl('md-away-name')?.textContent?.trim() || '';
    if (!homeName || !awayName) return null;
    let bestKey: string | null = null;
    let bestTs = -1;
    for (const [k, v] of Object.entries(state.map || {})) {
      const h = v.info?.home?.trim() || '';
      const a = v.info?.away?.trim() || '';
      if (!h || !a) continue;
      if (h.toLowerCase() === homeName.toLowerCase() && a.toLowerCase() === awayName.toLowerCase()) {
        const ts = typeof v.lastUpdated === 'number' ? v.lastUpdated : 0;
        if (ts > bestTs) { bestTs = ts; bestKey = k; }
      }
    }
    return bestKey;
  }

  function renderScore(score: MatchScore | null | undefined): void {
    const scoreEl = nameEl('md-score');
    if (!scoreEl) return;
    const h = (score && typeof score.home === 'number') ? score.home : null;
    const a = (score && typeof score.away === 'number') ? score.away : null;
    scoreEl.textContent = (h != null && a != null) ? `${h} : ${a}` : '— : —';
  }

  function applyFromState(state: MatchesState): void {
    const panel = detailsEl();
    if (!getVisible(panel)) return;
    const key = findCurrentMatchKey(state);
    if (!key) return;
    const entry = state.map[key] || null;
    renderScore(entry?.score || null);
    // События и статистика обновляются существующими модулями legacy через WS (без дублирования UI)
  }

  // Initial apply and subscribe
  if (window.MatchesStore) {
    try {
      applyFromState(window.MatchesStore.get());
      window.MatchesStore.subscribe(applyFromState);
    } catch {}
  }

  // Observe visibility changes to re-apply when details pane opens
  try {
    const target = document.body || document.documentElement;
    const mo = new MutationObserver(() => {
      try { if (getVisible(detailsEl())) applyFromState(window.MatchesStore?.get() || { map: {} }); } catch {}
    });
    mo.observe(target, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });
  } catch {}
})();
