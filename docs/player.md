# Анализ текущей реализации составов / ростеров

Документ собирает все найденные связи и текущую логику работы с составами (lineups/rosters) в проекте. Он нужен как референс перед миграцией на новую модель `players` + `player_tournament_stats` и для планирования изменений в админ-UI.

Дата анализа: 26.09.2025

---

## Краткое резюме

- Текущая реализация хранит составы матчей в таблице `match_lineups` (ORM-модель `MatchLineupPlayer`) — записи содержат текстовое поле `player` (имя), `jersey_number`, `position` и флаг `is_captain`.
- Есть агрегирующая/статистическая таблица `team_player_stats` (модель `TeamPlayerStats`) с полями просмотров/голов/пасов и т.д. — она использовалась для быстрых статистик.
- Backend предоставляет API для CRUD составов и массового импорта: `/api/lineup/add`, `/api/lineup/remove`, `/api/lineup/list`, `/api/lineup/bulk_set`.
- Фронтенд (админ) использует `templates/admin_dashboard.html` и `static/js/admin-enhanced.js` для управления командами и для открытия модального окна «Состав команды» (`openTeamRoster`) и Match Details (bulk-lineup textarea).
- Клиентский рендер состава и управление событиями матча реализованы в `static/js/profile-match-roster-events.js` (рендер таблицы roster + управление событиями гол/пас/карта) и `static/js/profile-team.js` (страница команды, lazy-load roster через `/api/team/roster`).
- Механика управления защищена: эндпоинты записи используют проверку Telegram `initData` и сравнение user id с `ADMIN_USER_ID` (админ имеет права).

---

## Файлы и точки входа — что найдено (подробно)

Backend (Flask `app.py`):
- Таблицы / модели (фрагменты):
  - `MatchLineupPlayer` → таблица `match_lineups`
    - Поля: `id, home, away, team ('home'|'away'), player (Text), jersey_number, position ('starting_eleven'|'substitute'), is_captain, created_at`
    - Индексы: `idx_lineup_match_team_player`, `idx_lineup_match_team_jersey`.
  - `TeamPlayerStats` → таблица `team_player_stats`
    - Поля: `team, player, games, goals, assists, yellows, reds, updated_at`.

- API (эндпоинты управления составами):
  - POST `/api/lineup/add` — добавление / обновление строки в `match_lineups`. Валидирует Telegram initData; проверяет ADMIN_USER_ID; принимает поля `home`, `away`, `team`, `player`, `jersey_number`, `position`, `is_captain`.
  - POST `/api/lineup/remove` — удаление конкретного игрока из `match_lineups` по `home/away/team/player`.
  - GET `/api/lineup/list` — возвращает составы для пары (home, away) в виде `{home:{starting_eleven:[], substitutes:[]}, away:{...}}`.
  - POST `/api/lineup/bulk_set` — массовая загрузка состава (режим replace|append), поддерживает опции first11_policy и т.п.

Примечания по backend:
- Логика ориентирована на хранение текстовых имён игроков в `match_lineups` (legacy approach). Это значит, что сейчас нет единого `players.id` в этих эндпоинтах — поля `player` содержат строку.
- Есть места в `app.py`, где агрегирование статистик опирается на `match_lineups` и `match_player_events`.

Файлы фронтенда и шаблоны:
- `templates/admin_dashboard.html` — содержит:
  - Match Details modal с textarea `home-main-lineup-input` и `away-main-lineup-input` + кнопки "Обновить состав" и "Сохранить состав".
  - Team Roster modal (`team-roster-modal`) с таблицей `team-roster-table` и кнопками открытия.
- `static/js/admin-enhanced.js` — основной админский скрипт. В нём:
  - Функция `openTeamRoster(teamId, teamName)` загружает `/api/admin/teams/${teamId}/roster` и рендерит список игроков в модальном окне. Комментарии в коде указывают на поддержку legacy форматов (team_stats_<id> и др.).
  - Функции обновления, удаления, открытия модалей, батч-операции и `updateTeamLineup('home'|'away')`.
  - Экспорт API в `window.AdminEnhanced` с методами: `openTeamRoster`, `updateTeamLineup`, `removePlayer`, и т.д.
- `static/js/profile-match-roster-events.js` — модуль, который рендерит roster table на странице матча, добавляет UI для изменения событий (гол/пас/карта) и вызывает `/api/match/events/add` или `/api/match/events/remove` (через registry или напрямую). Он также умеет подтягивать `/api/match/lineups` (через кнопку "Обновить состав").
- `static/js/profile-team.js` — отвечает за страницу команды в публичной части, использует `fetchEtag` и endpoint `/api/team/roster` или `/api/team/overview` для загрузки roster и отображения статистики. Ротер загружается лениво при фокусе вкладки "Roster".

Другие места (связанные):
- `static/js/realtime-updates.js` — содержит логику подписки на события, комментарии указывают на возможную отправку обновлений состава/статистики через WS.
- `templates/index.html` — содержит субтабы для team (включая подтабу roster).

---

## Текущее поведение и ограничения

- Игроки в match-level составах хранятся как plain text (строки) в `match_lineups.player`.
- Есть `team_player_stats`, где `player` также — текстовое поле; индекс `idx_team_player_unique` по (team, player) поддерживает уникальность на уровне строки.
- Отсутствует централизованная таблица `players` с уникальными `player_id`. Это усложняет:
  - отслеживание одного и того же игрока между турнирами/командами;
  - нормальные SQL-агрегации по `player_id` для лидербордов;
  - обновление информации игрока в одном месте.

---

## Рекомендации по миграции/замене на новую модель (с учётом предыдущих обсуждений)

Цель: сохранить совместимость, минимизировать регрессии, обеспечить возможность фильтрации статистики по турнирам.

1) Новая модель БД (предложение):
   - `players` (master table):
     - id (PK, UUID/integer)
     - team_id (nullable FK → teams.id) — текущее/основное приписывание
     - first_name, last_name, name (full), number, position (nullable)
     - created_at, updated_at

   - `player_tournament_stats` (seasonal stats):
     - id (PK)
     - player_id (FK → players.id)
     - tournament_id (FK → tournaments.id)
     - team_id (FK → teams.id) — snapshot команды в турнире
     - games, goals, assists, yellow_card, red_card, other metrics
     - created_at, updated_at

2) Миграционный скрипт (порядок действий):
   - Создать таблицы `players` и `player_tournament_stats` в новой миграции.
   - Экспорт/парсинг существующих `match_lineups.player` значений, нормализовать имена (trim, cleanup) и создать записи в `players` с минимальными данными (name, number NULL если нет).
   - Создать записи `player_tournament_stats` для текущих сезонов, если есть агрегированные данные в `team_player_stats` или `match_player_events`.
   - Не удалять legacy таблицы сразу — пока поддерживать dual-read: чтение как из legacy (`match_lineups`) так и из новой (`players`, `player_tournament_stats`).

3) Изменения в Backend API (пошагово):
   - Обновить GET `/api/lineup/list` так, чтобы при наличии feature-flag `feature:team_roster_store` возвращался набор игроков с `player_id` и ссылкой на `players` (вместо чистого текста). При выключенном флаге — старое поведение.
   - Добавить CRUD endpoints для `players`:
     - GET `/api/admin/teams/:id/roster` → может возвращать `players` списка команды (новый API уже вызывается в админ-скрипте).
     - POST `/api/players` — создать игрока (админ)
     - PATCH `/api/players/:id` — редактировать
     - DELETE `/api/players/:id` — удалить (soft delete под флагом)
   - Обновить `/api/lineup/add` / `/api/lineup/bulk_set` чтобы они могли принимать `player_id` (при наличии) либо fallback на `player` string (совместимость).

4) UI-изменения (админ):
   - Обновить `window.AdminEnhanced.openTeamRoster` (в `static/js/admin-enhanced.js`):
     - Переключиться на новый endpoint `/api/admin/teams/${teamId}/roster` который вернёт список `players` с `id, first_name, last_name, number, stats`.
     - Реализовать формы создания/редактирования игрока прямо в модальном окне (inline modal), поле `position` — nullable.
     - Для массового импорта оставить textarea bulk, но при сохранении конвертировать строки в `players` (через batch endpoint `/api/players/batch`).

5) Стор и realtime:
   - Добавить срезы `teams.players` и `stats.playerTournamentStats` в централизованный стор.
   - Поддержать WS патчи для `player_stats` и `players` (topic `player:stats:<tournament_id>` или `team:roster:<team_id>`).

6) Тестирование и rollout:
  ```markdown
  # Анализ и рекомендации по ростерам / игрокам — оптимизация для масштабирования

  Документ собран 26.09.2025 и обновлён для практической миграции на единую, масштабируемую модель игроков и per-tournament статистики.

  Цель: заменить текущие фрагментарные хранилища (текстовые имена в lineup/roster + динамические team_stats_<id>) на одну согласованную модель `players` + `player_tournament_stats`, упростить логику (меньше дублирования), сохранить совместимость UI и гарантировать тестирование после каждого шага.

  ---

  ## Ключевые выводы из текущей реализации

  - В кодовой базе сосуществуют legacy-подходы и нормализованная модель:
    - legacy: `team_roster` (строки team, player) и динамические таблицы `team_stats_<team_id>` (персистентная per-team статистика с player_id = id из `team_roster`). Админ API читает/инициализирует эти таблицы лениво.
    - нормализованная: `players`, `team_compositions`, `match_events`, `player_statistics` (per-tournament) — эти модели уже определены в `database/database_models.py` и обладают всеми связями.

  - Проблема: двойственные идентификаторы (legacy roster id ≠ players.id) и дублирование логики для подсчёта статистики усложняют развитие и добавление новых турниров.

  ---

  ## Рекомендованная целевая модель (минимальная, scalable)

  1) players (master)
  - id: integer PK
  - telegram_id: BIGINT, nullable
  - first_name, last_name
  - position (nullable)
  - =is_active, created_at, updated_at

  2) player_tournament_stats
  - id PK
  - player_id FK → players.id
  - tournament_id FK → tournaments.id
  - team_id FK → teams.id (snapshot команды в рамках турнира)
  - matches_played, goals_scored, assists, yellow_cards, red_cards, total_points (computed or stored)
  - last_updated

  3) team_compositions (match-level binding)
  - match_id, team_id, player_id, position, jersey_number, is_captain, substituted_in/out, yellow/red counts

  4) match_events
  - match_id, player_id, team_id, event_type, minute, assisted_by_player_id

  Пояснение: общая идея — все CRUD операции администратора и события матча должны работать с `players.id` и записывать события/составы в `team_compositions`/`match_events`. Аггрегация per-tournament — в `player_tournament_stats` (обновляется триггерами или фоновой job). Это упрощает лидерборды и поддержку нескольких турниров.

  ---

  ## Принципы миграции и рефакторинга (что важно соблюдать)

  - Малые, атомарные изменения. После каждого шага запускать автоматические и ручные тесты. Выкатку на прод — только после прохождения всех тестов на staging.
  - Делать бэкапы БД перед изменением схемы и до удаления legacy-таблиц.
  - Временный dual-write допускается только как инструмент для бесшовного перехода, но код, реализующий dual-write, должен быть простым и хорошо протестированным — цель убрать его как можно быстрее.
  - Удалять legacy‑функции и динамические таблицы только после полной валидации данных (агрегаты и UI совпадают).
  - Там, где возможна производительность, предпочитать SQL-агрегации по player_id и индексы по (tournament_id, total_points) для быстрых лидербордов.

  ---

  ## Пошаговый план работ (с тестами после каждого шага)

  Важно: вы просили не вводить отдельные feature-flags — поэтому план ориентирован на последовательные правки с прямым тестированием после каждой итерации. Dual-write допускается как временная мера, но реализуется и сразу тестируется.

  Шаг 0 — подготовка
  - Сделать дамп БД / снимок перед любыми изменениями.
  - Подготовить staging с реальными данными (минимально — snapshot prod).
  - Убедиться, что автотесты запускаются локально/staging (unit + интеграционные).

  Тесты после 0 шага:
  - smoke: GET `/api/admin/teams`, GET `/api/admin/teams/<id>/roster`, GET `/api/team/roster` — ответы 200.

  Шаг 1 — создать таблицы и mapping (non-destructive)
  - Добавить миграцию, создающую `players` и `player_tournament_stats` (и вспомогательную таблицу `legacy_roster_mapping`):
    - legacy_roster_mapping(legacy_roster_id INTEGER, player_id INTEGER, map_score FLOAT, created_at)
  - Написать и выполнить скрипт, который пробегает по уникальным именам в `team_roster` и пытается аккуратно сопоставить с существующими `players` (по telegram_id, username, exact full name). Для несопоставленных — создать новые записи `players` (split name→first/last).
  - Заполнить `legacy_roster_mapping` для каждой совпавшей/созданной записи.

  Тесты после шага 1:
  - unit: запустить миграционный скрипт на копии БД и проверить, что mapping покрывает 100% уникальных строк team_roster.
  - spot-check: N случайных legacy id — подтвердить что имя соответствует players record.

  Шаг 2 — read-from-normalized (без изменения записей)
  - Реализовать альтернативный (параллельный) код в `/api/admin/teams/<id>/roster` и `/api/team/roster` который читает данные через `players` + `player_tournament_stats` (или собирает stats из `match_events` + `team_compositions` и группирует по players.id). Не менять существующую ветку по умолчанию — добавить новую реализацию внутри того же эндпойнта, переключаемую конфигом (но без необходимости внешнего флага — код сначала будет включён только на staging).

  Тесты после шага 2:
  - сравнение payload: старый ответ vs новый (отличаться могут поля internal_id). Для каждой команды проверить совпадение суммарных чисел: total_goals, total_assists, total_matches для top-N игроков.
  - интеграционный: открыть админ-модал «Состав» и вручную сверить строки.

  Шаг 3 — dual-write при create/update (контролируемое)
  - В точках записи (админ-UI import, `/api/admin/players/transfer`, `/api/lineup/bulk_set`) добавить запись в `players` и `team_compositions` (new data) параллельно с legacy `team_roster` и `team_stats_<id>` (если legacy код ещё активен). Сделать это в одной транзакции там, где возможно, или в двух шагах с компенсирующей логикой.

  Тесты после шага 3:
  - функциональные: добавить/удалить игрока через админку — убедиться, что изменения отражены в `team_roster` и в `players` + `team_compositions`.
  - согласованность: запустить скрипт, который для 100% игроков проверит, что если запись есть в legacy team_stats_<id>, то есть соответствующий players + player_tournament_stats (или эквивалент агрегированных значений).

  Шаг 4 — переключение записи на normalized-only
  - После прохождения тестов и стабильности — перестать писать в legacy таблицы; все новые изменения писать в normalized модели. Рекомендуется держать на период мониторинга read-fallback (старый read code), но записи идут только в normalized.

  Тесты после шага 4:
  - regression: full сценарий CRUD админа + создание матча + добавление событий → проверить что player_statistics корректно обновляются (через триггеры или background job).

  Шаг 5 — миграция старой статистики и удаление legacy
  - Перенести все данные из `team_stats_<id>` в `player_tournament_stats` через mapping `legacy_roster_mapping` → players.id (или пересчитать агрегаты из match_events/team_compositions).
  - После валидации удалить `team_stats_<id>` и таблицу `team_roster` и связанные триггеры/функции.

  Тесты после шага 5:
  - полное сравнение агрегатов до/после (total goals/assists/cards для каждого турнира) — результаты должны совпадать.
  - E2E: публичные и админ-страницы отображают то же, что и до миграции.

  ---

  ## Рекомендации по оптимизации и удалению дублирующего кода

  - Убрать динамику создания `team_stats_<id>` и функции `_ensure_team_stats_table`, `update_player_statistics` и триггеры, когда весь код перейдёт на `player_tournament_stats` и агрегирование из match_events/team_compositions. Эти функции и таблицы — основное дублирование.
  - Удалить (или пометить deprecated) следующие участки после валидации:
    - функции/SQL, создающие/инициализирующие `team_stats_<id>` (в `app.py`), и сопутствующие индексы.
    - endpoint `api/admin/players/transfer` можно упростить: перевод игрока должен обновлять players.team_id и переносить/пересчитать `player_tournament_stats`, но логика удаления/вставки в legacy team_roster после удаления legacy не нужна.
  - Консолидировать логику событий матча — использовать `match_events` и `team_compositions` как единственный источник правды для пересчёта статистики.
  - Упростить admin JS: удалить ветви, которые парсят legacy `player` string и опираться на `player.id` и `first_name/last_name`.
  - Индексы:
    - `player_tournament_stats` → index on (tournament_id, total_points DESC)
    - `team_compositions` → index on (match_id, team_id, player_id)
    - `match_events` → index on (match_id, player_id)

  ---

  ## Порядок правок по файлам (конкретно)

  - `database/`:
    - добавить миграцию SQL / Alembic script: `players`, `player_tournament_stats`, `legacy_roster_mapping`.
    - удалить динамические `team_stats_<id>` и функции только в финальной стадии.

  - `app.py`:
    - добавить helper-скрипты миграции и batch endpoints для создания players из team_roster.
    - добавить чтение roster через players + player_tournament_stats (альтернативная ветка в `/api/admin/teams/<id>/roster` и `/api/team/roster`).
    - консолидировать места, где сейчас есть дублирующие обновления статистики.

  - `static/js/admin-enhanced.js`:
    - упростить `openTeamRoster` для работы с новым payload.
    - заменить парсинг строк на CRUD по `players`.

  - `static/js/profile-match-roster-events.js` и `static/js/profile-team.js`:
    - читать и отображать normalized roster. При адресатах событий — использовать player_id.

  - `templates/admin_dashboard.html`:
    - при необходимости упростить разметку modal и формы под новые поля (first_name/last_name/position).

  ---

  ## Набор автоматических тестов (минимум) для запуска после каждой итерации

  1. Unit tests
  - миграционный скрипт: проверка корректного создания `players` из `team_roster` на fixture DB.

  2. Integration tests
  - create player via API → verify players table + roster reflect change.
  - transfer player → verify player_tournament_stats updated or preserved.

  3. E2E / Smoke tests (Playwright)
  - открыть админ-дэшборд → открыть modal «Состав» → добавить/удалить игрока → проверить список.
  - публичная страница команды → проверить, что roster соответствует admin view.

  4. Data consistency tests
  - сравнение агрегатов (goals/assists/cards) для всех турниров до/после миграции.

  ---

  ## Короткое резюме (задачи на ближайшие шаги)

  1. Написать миграцию + `legacy_roster_mapping` и запустить на staging (Шаг 1). Проверить автоматическими тестами.
  2. Реализовать parallel-read (Шаг 2) и запустить сравнение «старый» vs «новый» payloads.
  3. Сделать dual-write в точках записи и протестировать (Шаг 3).
  4. Переключиться на normalized-only запись, затем аккуратно удалить legacy-часть (Шаги 4–5).

  Если хотите — могу начать прямо с реализации Шага 1: напишу миграционный скрипт (в `scripts/`), unit-tests и запуск smoke на staging-копии БД. Напишите, приступать ли.

  ```
