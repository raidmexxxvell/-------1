// Хелпер для синхронизации расписания и betting:tours
// Гарантирует, что голосование показывается для всех актуальных матчей

export function syncScheduleAndBettingTours(schedule, bettingTours) {
  // schedule: объект с расписанием (tours, matches)
  // bettingTours: объект с турами для ставок (tours, matches)
  if (!schedule || !bettingTours) return;
  const scheduleMatches = new Set();
  (schedule.tours||[]).forEach(t => (t.matches||[]).forEach(m => {
    const key = `${(m.home||'').toLowerCase().trim()}__${(m.away||'').toLowerCase().trim()}__${String(m.date||m.datetime||'').slice(0,10)}`;
    scheduleMatches.add(key);
  }));
  // Добавляем в betting:tours все матчи из расписания, если их нет
  let changed = false;
  (schedule.tours||[]).forEach(t => (t.matches||[]).forEach(m => {
    const key = `${(m.home||'').toLowerCase().trim()}__${(m.away||'').toLowerCase().trim()}__${String(m.date||m.datetime||'').slice(0,10)}`;
    let found = false;
    (bettingTours.tours||[]).forEach(bt => (bt.matches||[]).forEach(bm => {
      const bkey = `${(bm.home||'').toLowerCase().trim()}__${(bm.away||'').toLowerCase().trim()}__${String(bm.date||bm.datetime||'').slice(0,10)}`;
      if (bkey === key) found = true;
    }));
    if (!found) {
      // Добавляем матч в betting:tours (в первый тур)
      if (bettingTours.tours && bettingTours.tours.length > 0) {
        bettingTours.tours[0].matches.push(m);
        changed = true;
      }
    }
  }));
  return changed;
}
