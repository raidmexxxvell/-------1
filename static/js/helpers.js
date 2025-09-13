// Хелпер для синхронизации расписания и betting:tours
// Гарантирует, что голосование показывается для всех актуальных матчей

export function syncScheduleAndBettingTours(schedule, bettingTours) {
  // schedule: объект с расписанием (tours, matches)
  // bettingTours: объект с турами для ставок (tours, matches)
  if (!schedule || !bettingTours) return;
  const now = new Date();
  const DAY_MS = 24*60*60*1000;
  const maxAhead = 6 * DAY_MS;
  // Собираем все матчи из расписания, которые идут в ближайшие 6 дней и не в прошлом
  const upcomingMatches = [];
  (schedule.tours||[]).forEach(t => (t.matches||[]).forEach(m => {
    const dateStr = m.date || m.datetime || '';
    const matchDate = dateStr ? new Date(dateStr) : null;
    if (!matchDate || isNaN(matchDate.getTime())) return;
    const diff = matchDate - now;
    if (diff < 0 || diff > maxAhead) return; // только будущие и не дальше 6 дней
    upcomingMatches.push({ ...m, _date: matchDate });
  }));
  if (!upcomingMatches.length) return;

  // Найти ближайший тур в bettingTours (по дате первого матча)
  let bestTourIdx = -1;
  let bestTourDate = null;
  (bettingTours.tours||[]).forEach((t, idx) => {
    const firstMatch = (t.matches||[])[0];
    const dateStr = firstMatch ? (firstMatch.date || firstMatch.datetime || '') : '';
    const matchDate = dateStr ? new Date(dateStr) : null;
    if (!matchDate || isNaN(matchDate.getTime())) return;
    if (matchDate >= now && (!bestTourDate || matchDate < bestTourDate)) {
      bestTourDate = matchDate;
      bestTourIdx = idx;
    }
  });
  // Если нет подходящего тура — можно создать временный тур (опционально)
  if (bestTourIdx === -1) {
    // Создаём временный тур для ближайших матчей
    bettingTours.tours = bettingTours.tours || [];
    bettingTours.tours.unshift({
      title: 'Ближайший тур',
      matches: [],
      isVirtual: true
    });
    bestTourIdx = 0;
  }

  // Собираем ключи уже существующих матчей в bettingTours
  const existingKeys = new Set();
  (bettingTours.tours||[]).forEach(t => (t.matches||[]).forEach(m => {
    const key = `${(m.home||'').toLowerCase().trim()}__${(m.away||'').toLowerCase().trim()}__${String(m.date||m.datetime||'').slice(0,10)}`;
    existingKeys.add(key);
  }));

  // Добавляем только отсутствующие матчи в ближайший тур
  let changed = false;
  upcomingMatches.forEach(m => {
    const key = `${(m.home||'').toLowerCase().trim()}__${(m.away||'').toLowerCase().trim()}__${String(m.date||m.datetime||'').slice(0,10)}`;
    if (!existingKeys.has(key)) {
      bettingTours.tours[bestTourIdx].matches.push(m);
      changed = true;
    }
  });
  return changed;
}
