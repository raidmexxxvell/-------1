# State: схема стора и правила использования

Этот документ описывает текущие принципы и схему централизованного стора на клиенте. Используется как руководство при внедрении новых срезов состояния (например, teams.players и stats.playerTournamentStats).

Основные принципы
- Источник истины — стор. UI читает только из стора, сетевые операции и WS — диспатчат экшены/обновляют стор.
- Персистируются только: `user`, `shop`, часть `ui` (theme, activeTab). Остальное — TTL или in-memory.
- Все сетевые операции проходят через `etag-fetch.js` с использованием caching keys и ETag.
- Реалтайм-обновления (WS) маппятся в патчи стора и не обновляют DOM напрямую.

Новая структура стора (обновлено 27.09.2025)
- teamRosters — нормализованные составы команд с TTL и метаданными (ключ: team_id → TeamRosterState).
	- TeamRosterState: { players: RosterPlayer[], source: 'normalized' | 'legacy', tournamentId: number | null, fetchedAt: ISOString }.
	- RosterPlayer: { id, player_id, team_id, full_name, first_name, last_name, username, position, primary_position, jersey_number, status, is_captain, joined_at, updated_at, stats?, legacy? }.
	- RosterPlayer.stats: { tournament_id, matches_played, goals, assists, goal_actions, yellow_cards, red_cards }.
	- RosterPlayer.legacy: { row_id, source } — присутствует только для записей из legacy таблицы `team_roster`.
- stats.playerTournamentStats — per-player per-tournament статистика (ключ: player_id → PlayerTournamentStats). Тип PlayerTournamentStats: { id, player_id, tournament_id, team_id, games, goals, assists, yellow_card, red_card, created_at, updated_at }.

Ключи кэша (recommended)
- `team:${teamId}:players` — список игроков команды
- `stats:playerTournament:${tournamentId}` — статистика игроков по турниру

Feature flags
- `feature:team_roster_store` — включает Nano Store `teamRosters` для админских UI (команды, трансферы) и публичных экранов. При включении работает dual-read/double-write, legacy данные остаются fallback. `AdminEnhanced` синхронизирует окно «Состав» и модуль трансферов через стор.

WS topics
- `team:roster:<team_id>` — уведомления об изменениях roster
- `player:stats:<tournament_id>` — обновления статистики игроков

Интеграция с UI
- Окно «Состав команды» (`admin-enhanced.js`) использует `teamRosters` с кэшированием (60 сек) и показывает источник данных, статистику и признак legacy. Кнопка «Обновить» форсирует refetch и обновление Nano Store.
- Модуль трансферов (`admin-transfers.js`) читает тех же игроков через `AdminRosterStore.ensureTeamRoster`, блокирует операции для legacy записей без `player_id`, и шлёт корректные `team_player_id`/`player_id` в API.
- Для legacy сценария (флаг выключен) сохраняется fallback на прямой fetch `/api/admin/teams/<id>/roster`.

Требования к разработчику
- Все новые файлы стора писать на TypeScript в `static/js/store/*.ts`.
- Для взаимодействия с legacy-кодом добавлять `.d.ts` декларации, если нужно.

Документация и миграция
- При изменении стора обновлять `docs/state.md` и отмечать в `docs/roadmap.md` прогресс.

