# State: схема стора и правила использования

Этот документ описывает текущие принципы и схему централизованного стора на клиенте. Используется как руководство при внедрении новых срезов состояния (например, teams.players и stats.playerTournamentStats).

Основные принципы
- Источник истины — стор. UI читает только из стора, сетевые операции и WS — диспатчат экшены/обновляют стор.
- Персистируются только: `user`, `shop`, часть `ui` (theme, activeTab). Остальное — TTL или in-memory.
- Все сетевые операции проходят через `etag-fetch.js` с использованием caching keys и ETag.
- Реалтайм-обновления (WS) маппятся в патчи стора и не обновляют DOM напрямую.

Новая структура стора (добавлено в 2025-09)
- teams.players — список игроков по командам (ключ: team_id → Player[]). Тип Player: { id, team_id, name, number, position, created_at, updated_at }.
- stats.playerTournamentStats — per-player per-tournament статистика (ключ: player_id → PlayerTournamentStats[]). Тип PlayerTournamentStats: { id, player_id, tournament_id, team_id, games, goals, assists, yellow_card, red_card, created_at, updated_at }.

Ключи кэша (recommended)
- `team:${teamId}:players` — список игроков команды
- `stats:playerTournament:${tournamentId}` — статистика игроков по турниру

Feature flags
- `feature:team_roster_store` — переключает чтение/запись roster между legacy и новым стором. При включении рекомендуется dual-read и опционально dual-write на этапе миграции.

WS topics
- `team:roster:<team_id>` — уведомления об изменениях roster
- `player:stats:<tournament_id>` — обновления статистики игроков

Интеграция с UI
- Админ-модали (admin_dashboard.html) должны подписываться на `teams.players` и обновлять UI через реактивные подписки (nanostores) или через биндинги store→legacy bridge, пока флаг выключен.

Требования к разработчику
- Все новые файлы стора писать на TypeScript в `static/js/store/*.ts`.
- Для взаимодействия с legacy-кодом добавлять `.d.ts` декларации, если нужно.

Документация и миграция
- При изменении стора обновлять `docs/state.md` и отмечать в `docs/roadmap.md` прогресс.

