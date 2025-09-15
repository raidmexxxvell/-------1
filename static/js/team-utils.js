// static/js/team-utils.js
// Унифицированные утилиты команд: нормализация имени, цвет, логотипы, фабрика DOM
(function(){
  if (window.TeamUtils) return; // idempotent
  const LOGO_BASE = '/static/img/team-logos/';
  function normalizeTeamName(raw){
    try {
      return (raw||'').toString().trim().toLowerCase()
        .replace(/ё/g,'е')
        .replace(/фк/g,'')
        .replace(/fc|fk/g,'')
        .replace(/\s+/g,'')
        .replace(/[^a-z0-9а-я]+/gi,'');
    } catch(_) { return ''; }
  }
  function getTeamColor(name){
    const norm = normalizeTeamName(name);
    const map = {
      'полет': '#fdfdfc',
      'дождь': '#292929',
      'киборги': '#f4f3fb',
  'фкобнинск': '#eb0000',
  'обнинск': '#eb0000',
      'ювелиры': '#333333',
      'звезда': '#a01818',
  'фкsetka4real': '#000000',
  'setka4real': '#000000',
      'серпантин': '#141098',
      'креатив': '#98108c'
    };
    return map[norm] || '#3b82f6';
  }
  // Кэш уже найденных валидных URL логотипов: key -> url
  const _logoCache = new Map();
  const _pending = new Map(); // key -> Promise<url>
  function _abs(u){
    try { const a = document.createElement('a'); a.href = u; return a.href; } catch(_) { return u; }
  }
  function _sameSrc(a,b){
    try { return _abs(a||'') === _abs(b||'') || (a||'').endsWith(b||'') || (b||'').endsWith(a||''); } catch(_) { return a===b; }
  }
  function resolveLogoUrl(teamName){
    const name = (teamName||'').trim();
    const norm = normalizeTeamName(name);
    const key = norm || '__default__';
    if (_logoCache.has(key)) return Promise.resolve(_logoCache.get(key));
    if (_pending.has(key)) return _pending.get(key);
    const candidates = [];
    if (norm){
      // 1) вариант с приставкой "фк" (если исходное имя не начиналось с фк)
      if (!norm.startsWith('фк')) {
        candidates.push(LOGO_BASE + encodeURIComponent('фк' + norm + '.png'));
        candidates.push(LOGO_BASE + encodeURIComponent('фк' + norm + '.webp'));
      }
      // 2) основной нормализованный
      candidates.push(LOGO_BASE + encodeURIComponent(norm + '.png'));
      candidates.push(LOGO_BASE + encodeURIComponent(norm + '.webp'));
      // 3) нормализованный с дефисами (иногда имена в ассетах могут быть с дефисом между словами)
      try { if (norm.includes('')) { const dashed = norm.replace(/\s+/g,'-'); if (dashed && dashed!==norm){ candidates.push(LOGO_BASE + encodeURIComponent(dashed + '.png')); candidates.push(LOGO_BASE + encodeURIComponent(dashed + '.webp')); } } } catch(_){ }
    }
    // 4) сырой оригинал (с пробелами → подчеркивания) — если ассет назван вручную
    if (name){
      const rawBase = name.toLowerCase().replace(/ё/g,'е').trim();
      const rawUnderscore = rawBase.replace(/\s+/g,'_');
      const rawCollapsed = rawBase.replace(/\s+/g,'');
      ['png','webp'].forEach(ext => {
        candidates.push(LOGO_BASE + encodeURIComponent(rawBase + '.' + ext));
        candidates.push(LOGO_BASE + encodeURIComponent(rawUnderscore + '.' + ext));
        candidates.push(LOGO_BASE + encodeURIComponent(rawCollapsed + '.' + ext));
      });
    }
    // 5) fallback default
    candidates.push(LOGO_BASE + 'default.png');
    // Уникализируем
    const uniq = [];
    const seen = new Set();
    candidates.forEach(c=>{ if(!seen.has(c)){ seen.add(c); uniq.push(c); }});
    const p = new Promise((resolve)=>{
      let i=0;
      const tryNext=()=>{
        if (i>=uniq.length){ resolve(LOGO_BASE + 'default.png'); return; }
        const url = uniq[i++];
        const test = new Image();
        test.onload = ()=>{ _logoCache.set(key, url); resolve(url); };
        test.onerror = ()=>{ tryNext(); };
        test.src = url;
      };
      tryNext();
    }).finally(()=>{ _pending.delete(key); });
    _pending.set(key, p);
    return p;
  }
  function setTeamLogo(imgEl, teamName){
    try { imgEl.loading='lazy'; imgEl.decoding='async'; } catch(_) {}
    const norm = normalizeTeamName(teamName||'');
    const key = norm || '__default__';
    // Если уже устанавливали для этого ключа и src непустой — не трогаем (избегаем мерцания при повторных вызовах)
    try {
      if (imgEl.dataset && imgEl.dataset.teamLogoKey === key && imgEl.getAttribute('src')) return;
    } catch(_) {}
    // Если нет текущего src — сразу показываем default как placeholder (не будет пустого слота)
    if (!imgEl.getAttribute('src')) imgEl.setAttribute('src', LOGO_BASE + 'default.png');
    resolveLogoUrl(teamName).then((url)=>{
      // Устанавливаем только если отличается, чтобы не перезагружать изображение
      if (!_sameSrc(imgEl.getAttribute('src'), url)) imgEl.setAttribute('src', url);
      try { if (imgEl.dataset) imgEl.dataset.teamLogoKey = key; } catch(_) {}
    });
  }
  function createTeamWithLogo(teamName, options={}){
    const { showLogo=true, logoSize='20px', className='team-with-logo', textClassName='team-name', logoClassName='team-logo'} = options;
    const container = document.createElement('span');
    container.className = className;
    container.style.display='inline-flex';
    container.style.alignItems='center';
    container.style.gap='6px';
    if (showLogo){
      const img = document.createElement('img');
      img.className = logoClassName;
      img.alt = teamName||'';
      img.style.width=logoSize; img.style.height=logoSize; img.style.objectFit='contain'; img.style.borderRadius='2px';
      setTeamLogo(img, teamName);
      container.appendChild(img);
    }
    const nameEl = document.createElement('span'); nameEl.className=textClassName; nameEl.textContent=teamName||''; container.appendChild(nameEl);
    return container;
  }
  window.TeamUtils = { normalizeTeamName, getTeamColor, setTeamLogo, createTeamWithLogo };
  // Глобальные шорткаты (сохранить обратную совместимость)
  try { window.getTeamColor = getTeamColor; } catch(_) {}
  try { window.setTeamLogo = setTeamLogo; } catch(_) {}
  try { window.createTeamWithLogo = createTeamWithLogo; } catch(_) {}
})();
