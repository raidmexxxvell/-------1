import type { StoreApi } from './core';

// Minimal types aligned with matches.ts (kept local to avoid tight coupling)
type MatchInfo = { home: string; away: string; date?: string };
type MatchScore = { home: number; away: number };
type MatchEntry = { info?: MatchInfo | null; score?: MatchScore | null; lastUpdated?: number | null };
type MatchesState = { map: Record<string, MatchEntry> };


(() => {
  // Feature flag: enable via localStorage key 'feature:match_ui_store' = '1'
  try {
    const ff = (localStorage.getItem('feature:match_ui_store') === '1');
    if (!ff) return;
  } catch { return; }

  const detailsEl = () => document.getElementById('ufo-match-details') as HTMLElement | null;
  const nameEl = (id: string) => document.getElementById(id) as HTMLElement | null;
  const bodyEl = () => (detailsEl()?.querySelector('.modal-body') as HTMLElement | null) || detailsEl();

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

  function ensureEventsContainer(): HTMLElement | null {
    const parent = bodyEl();
    if (!parent) return null;
    let el = parent.querySelector('#md-events') as HTMLElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = 'md-events';
      el.setAttribute('role', 'feed');
      el.setAttribute('aria-live', 'polite');
      el.style.marginTop = '8px';
      el.style.padding = '8px 10px';
      el.style.border = '1px solid rgba(255,255,255,0.08)';
      el.style.borderRadius = '8px';
      el.style.background = 'rgba(255,255,255,0.03)';
      const title = document.createElement('div');
      title.textContent = 'События матча';
      title.style.fontWeight = '800';
      title.style.fontSize = '13px';
      title.style.marginBottom = '6px';
      const list = document.createElement('ul');
      list.id = 'md-events-list';
      list.style.listStyle = 'none';
      list.style.margin = '0';
      list.style.padding = '0';
      el.appendChild(title);
      el.appendChild(list);
      parent?.appendChild(el);
    }
    return el;
  }

  function renderEvents(events: any[] | undefined | null): void {
    const host = ensureEventsContainer();
    if (!host) return;
    const list = host.querySelector('#md-events-list') as HTMLElement | null;
    if (!list) return;
    const items = Array.isArray(events) ? events.slice(-30) : [];
    list.innerHTML = '';
    for (const ev of items) {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.gap = '8px';
      li.style.padding = '4px 0';

      const t = typeof ev?.t === 'number' ? ev.t : null;
      const kind = String(ev?.kind || 'event');
      const left = document.createElement('div');
      left.style.minWidth = '36px';
      left.style.opacity = '.8';
      left.textContent = t != null ? `${t}'` : '—';

      const right = document.createElement('div');
      right.style.flex = '1 1 auto';
      right.textContent = kind;

      li.appendChild(left);
      li.appendChild(right);
      list.appendChild(li);
    }
  }

  function applyFromState(state: MatchesState): void {
    const panel = detailsEl();
    if (!getVisible(panel)) return;
    const key = findCurrentMatchKey(state);
    if (!key) return;
    const entry = state.map[key] || null;
    renderScore(entry?.score || null);
    // events (best-effort)
    try { renderEvents((entry as any)?.events || []); } catch {}
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
