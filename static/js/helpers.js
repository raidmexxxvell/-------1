// Хелпер для синхронизации расписания и betting:tours
// Гарантирует, что голосование показывается для всех актуальных матчей

export function syncScheduleAndBettingTours(schedule, bettingTours) {
  // schedule: объект с расписанием (tours, matches)
  // bettingTours: объект с турами для ставок (tours, matches)
  if (!schedule || !bettingTours) {
    return;
  }
  const now = new Date();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const maxAhead = 6 * DAY_MS;
  // Используем унифицированную функцию из match-utils.js
  const matchKey =
    window.MatchUtils?.matchKey ||
    function (m) {
      const h = (m.home || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, '').trim();
      const a = (m.away || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, '').trim();
      let d = m.date || m.datetime || '';
      if (d && d.length > 10) {
        d = d.slice(0, 10);
      }
      return `${h}__${a}__${d}`;
    };
  // Собираем все будущие матчи из расписания (6 дней вперёд)
  const upcomingMatches = [];
  (schedule.tours || []).forEach(t =>
    (t.matches || []).forEach(m => {
      let dateStr = m.date || m.datetime || '';
      if (dateStr && dateStr.length > 10) {
        dateStr = dateStr.slice(0, 10);
      }
      const matchDate = dateStr ? new Date(dateStr) : null;
      if (!matchDate || isNaN(matchDate.getTime())) {
        return;
      }
      const diff = matchDate - now;
      if (diff < 0 || diff > maxAhead) {
        return;
      }
      upcomingMatches.push({ ...m, _date: matchDate });
    })
  );
  if (!upcomingMatches.length) {
    return;
  }

  // Найти ближайший тур в bettingTours (по дате первого матча)
  let bestTourIdx = -1;
  let bestTourDate = null;
  (bettingTours.tours || []).forEach((t, idx) => {
    const firstMatch = (t.matches || [])[0];
    let dateStr = firstMatch ? firstMatch.date || firstMatch.datetime || '' : '';
    if (dateStr && dateStr.length > 10) {
      dateStr = dateStr.slice(0, 10);
    }
    const matchDate = dateStr ? new Date(dateStr) : null;
    if (!matchDate || isNaN(matchDate.getTime())) {
      return;
    }
    if (matchDate >= now && (!bestTourDate || matchDate < bestTourDate)) {
      bestTourDate = matchDate;
      bestTourIdx = idx;
    }
  });
  // Если нет подходящего тура — создаём временный тур только если есть матчи
  if (bestTourIdx === -1 && upcomingMatches.length) {
    bettingTours.tours = bettingTours.tours || [];
    bettingTours.tours.unshift({
      title: 'Ближайший тур',
      matches: [],
      isVirtual: true,
    });
    bestTourIdx = 0;
  }
  if (bestTourIdx === -1) {
    return;
  }

  // Собираем ключи уже существующих матчей в bettingTours
  const existingKeys = new Set();
  (bettingTours.tours || []).forEach(t =>
    (t.matches || []).forEach(m => {
      existingKeys.add(matchKey(m));
    })
  );

  // Добавляем только отсутствующие матчи в ближайший тур
  let changed = false;
  upcomingMatches.forEach(m => {
    const key = matchKey(m);
    if (!existingKeys.has(key)) {
      bettingTours.tours[bestTourIdx].matches.push(m);
      changed = true;
    }
  });
  if (changed) {
    try {
      localStorage.setItem('betting:tours', JSON.stringify(bettingTours));
    } catch (_) {}
    try {
      window.League && window.League.refreshSchedule && window.League.refreshSchedule();
    } catch (_) {}
  }
  return changed;
}
