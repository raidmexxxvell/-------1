// xp-utils.js
// Единая логика расчёта уровня и прогресса XP
(function(){
  if (window.XPUtils) return;
  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
  // Рассчитать порог для уровня lvl (для перехода на следующий)
  function threshold(lvl){ lvl = Math.max(1, Math.floor(lvl||1)); return lvl * 100; }
  // Нормализовать данные пользователя к отображаемым значениям
  function getProgress(level, xp){
    const lvl = Math.max(1, Math.floor(level||1));
    const need = threshold(lvl);
    const cur = clamp(Math.floor(xp||0), 0, need);
    return { lvl, cur, need, pct: need ? clamp((cur/need)*100, 0, 100) : 0 };
  }
  // Применить прирост XP с учётом переходов уровней; допускает дробный gain
  function applyGain(level, currentXp, gain){
    let lvl = Math.max(1, Math.floor(level||1));
    let curXp = Math.max(0, currentXp||0);
    let left = Math.max(0, gain||0);
    while (left > 0){
      const need = threshold(lvl);
      const toNext = need - curXp;
      if (left < toNext){ curXp += left; left = 0; return { lvl, cur: curXp, need }; }
      left -= toNext; lvl += 1; curXp = 0;
      if (lvl > 500) { return { lvl: 500, cur: 0, need: threshold(500) }; }
    }
    return { lvl, cur: curXp, need: threshold(lvl) };
  }
  window.XPUtils = { threshold, getProgress, applyGain };
})();
