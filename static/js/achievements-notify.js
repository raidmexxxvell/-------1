// achievements-notify.js
// Лёгкий индикатор новых достижений: красная точка на профиле и анимация при входе
(function(){
  try {
    if (window.AchievementsNotify) return;
    const tg = window.Telegram?.WebApp || null;
    const LS_BEST_KEY = 'ach:best:v1'; // { [group]: best_tier }
    const LS_PENDING_KEY = 'ach:pending:v1'; // { xp, credits, items:[{group,tier,name,icon}] }

    // Карта наград по тиру (должна соответствовать серверу)
    const REWARDS_BY_TIER = {
      1: { xp: 200, credits: 1000 },
      2: { xp: 500, credits: 5000 },
      3: { xp: 1000, credits: 10000 }
    };

  function readBest(){ try { return JSON.parse(localStorage.getItem(LS_BEST_KEY)||'{}'); } catch(_) { return {}; } }
  function hasBestBaseline(){ try { return localStorage.getItem(LS_BEST_KEY) != null; } catch(_) { return false; } }
    function writeBest(map){ try { localStorage.setItem(LS_BEST_KEY, JSON.stringify(map||{})); } catch(_) {} }
    function readPending(){ try { return JSON.parse(localStorage.getItem(LS_PENDING_KEY)||'null'); } catch(_) { return null; } }
    function writePending(p){ try { if (p) localStorage.setItem(LS_PENDING_KEY, JSON.stringify(p)); else localStorage.removeItem(LS_PENDING_KEY); } catch(_) {} }

    function getActiveTab(){
      try {
        // Предпочтение стору, иначе по DOM
        if (window.UIStore?.get) return window.UIStore.get().activeTab || '';
        const el = document.querySelector('.nav-item.active');
        return el ? (el.getAttribute('data-tab')||'') : '';
      } catch(_) { return ''; }
    }

    function addProfileDot(){
      try {
        const navItem = document.querySelector('.nav-item[data-tab="profile"]'); if (!navItem) return;
        let badge = navItem.querySelector('.nav-badge');
        if (!badge){ badge = document.createElement('div'); badge.className = 'nav-badge nav-badge--dot'; navItem.appendChild(badge); }
        // Для «точки» не пишем текст
        badge.textContent = '';
      } catch(_) {}
    }
    function removeProfileDot(){ try { document.querySelector('.nav-item[data-tab="profile"] .nav-badge')?.remove(); } catch(_) {} }

    function summarizeUnlocks(achievements){
      const prev = readBest();
      const hadBaseline = hasBestBaseline();
      const nextBest = { ...prev };
      const unlocked = [];
      (achievements||[]).forEach(a => {
        const g = a.group || a.key || a.code; if (!g) return;
        const oldTier = Number(prev[g] || 0);
        const newTier = Number(a.best_tier || a.tier || 0);
        if (newTier > 0) nextBest[g] = newTier;
        if (hadBaseline && newTier > oldTier){
          unlocked.push({ group: g, tier: newTier, name: a.name||g, icon: a.icon||null });
        }
      });
      writeBest(nextBest);
      if (!unlocked.length) return null;
      // Сервер выдаёт награду только за конечный тир (не суммирует промежуточные)
      let totalXp = 0, totalCr = 0;
      unlocked.forEach(u => { const r = REWARDS_BY_TIER[u.tier] || {xp:0, credits:0}; totalXp += (r.xp||0); totalCr += (r.credits||0); });
      return { xp: totalXp, credits: totalCr, items: unlocked };
    }

    function ensureBackgroundCheck(){
      // Раз в 3 минуты опрашиваем достижения, когда не на профиле (If-None-Match + ETag → дёшево)
      if (!window.fetchEtag) return; // дождёмся утилиты
      let timer = null;
      function tick(){
        try {
          if (getActiveTab() === 'profile') return; // не тратим сеть на профиле
          const initData = tg?.initData || '';
          const params = initData ? { initData } : null;
          window.fetchEtag('/api/achievements', {
            cacheKey: 'achievements:v1',
            swrMs: 60000,
            params,
            forceRevalidate: true,
            extract: j => Array.isArray(j.achievements) ? j.achievements : []
          }).then(({ data, updated }) => {
            if (!data) return;
            const summary = summarizeUnlocks(data);
            if (summary && getActiveTab() !== 'profile'){
              writePending(summary); addProfileDot();
            }
          }).catch(()=>{});
        } finally {}
      }
      timer = setInterval(tick, 180000);
    }

    // Реагируем на любые успешные загрузки достижений (в том числе из экрана профиля)
    window.addEventListener('etag:success', (e) => {
      try {
        const d = e.detail || {}; if (d.cacheKey !== 'achievements:v1') return;
        const summary = summarizeUnlocks(d.data||[]);
        if (summary){
          if (getActiveTab() === 'profile') {
            // На профиле — сразу покажем
            showPending(summary);
          } else {
            writePending(summary); addProfileDot();
          }
        }
      } catch(_) {}
    }, { passive:true });

    function slugify(s){ try { return (s||'').toString().trim().toLowerCase().replace(/[\s_/]+/g,'-').replace(/[^a-z0-9\-]/g,''); } catch(_) { return ''; } }
    function buildIconCandidates(item){
      const base = '/static/img/achievements/';
      const tierMap = {1:'bronze', 2:'silver', 3:'gold'};
      const state = tierMap[item.tier] || (item.icon||'bronze');
      const key = item.key || item.code || item.group || slugify(item.name||'');
      const candidates = [];
      if (key) candidates.push(`${base}${slugify(key)}-${state}.png`);
      if (key && item.icon) candidates.push(`${base}${slugify(key)}-${slugify(item.icon)}.png`);
      candidates.push(`${base}${state}.png`);
      candidates.push(`${base}placeholder.png`);
      // svg варианты
      candidates.slice().forEach(p => { if (/\.png$/i.test(p)) { const s = p.replace(/\.png$/i, '.svg'); if (!candidates.includes(s)) candidates.push(s); } });
      return candidates;
    }
    function resolveIconUrl(item){
      return new Promise((resolve) => {
        const list = buildIconCandidates(item);
        let i = 0;
        function tryNext(){
          if (i >= list.length) { resolve(null); return; }
          const img = new Image();
          img.onload = () => resolve(list[i]);
          img.onerror = () => { i++; tryNext(); };
          img.src = list[i];
        }
        tryNext();
      });
    }

    async function showPending(custom){
      const pending = custom || readPending();
      if (!pending) return;
      // Формируем заголовок и картинку превью
      let title = 'Достижение разблокировано!';
      let subtitle = '';
      let img = '';
      try {
        const first = pending.items && pending.items[0];
        if (pending.items?.length > 1) {
          title = 'Новые достижения!';
          subtitle = pending.items.map(it => `${it.name || it.group} (${it.tier})`).slice(0,3).join(', ');
          img = await resolveIconUrl(first) || '';
        } else if (first) {
          const tierName = {1:'Бронза',2:'Серебро',3:'Золото'}[first.tier] || '';
          title = `Достижение: ${first.name || first.group}`;
          subtitle = tierName ? `Уровень: ${tierName}` : '';
          img = await resolveIconUrl(first) || '';
        }
      } catch(_) {}

      // Снимок пользователя ДО (для красивой анимации чисел)
      const baseUser = (window.ProfileUser && window.ProfileUser.getLastUser && window.ProfileUser.getLastUser()) ? { ...window.ProfileUser.getLastUser() } : null;
      if (window.RewardAnimation){
        try { window.RewardAnimation.show(document.body, pending.xp||0, pending.credits||0, { title, subtitle, imageUrl: img }).catch(()=>{}); } catch(_) {}
      }
      try {
        if (window.ProfileCheckin?.animateStats){ window.ProfileCheckin.animateStats(pending.xp||0, pending.credits||0, baseUser); }
      } catch(_){ }
      // Обновим профиль и сбросим индикаторы
      try { window.ProfileUser?.fetchUserData?.(); } catch(_) {}
      writePending(null); removeProfileDot();
    }

    // При переходе на вкладку профиля — показать анимацию, если есть
    document.addEventListener('click', (e) => {
      const nav = e.target && e.target.closest?.('.nav-item[data-tab="profile"]');
      if (!nav) return;
      setTimeout(() => { const p = readPending(); if (p) showPending(p); }, 100);
    }, { passive:true });

    // Автопоказ при загрузке профиля если уже есть pending
    document.addEventListener('DOMContentLoaded', () => { if (getActiveTab()==='profile'){ const p=readPending(); if(p) showPending(p); } });

    // Стартуем фоновую проверку
    document.addEventListener('DOMContentLoaded', ensureBackgroundCheck, { once:true });

    window.AchievementsNotify = { summarizeUnlocks, showPending, addProfileDot, removeProfileDot };
  } catch(e) { console.warn('achievements-notify init failed', e); }
})();
