# Анализ кодовой базы: Лига Обнинска (Актуализировано)

> Дата актуализации: 2025-09-12  
> Текущая версия `app.py`: ~11860 строк (добавлена система логирования действий администратора)  
> Последние ключевые изменения: реализована полная система логирования действий администратора с подробным отслеживанием операций, новая вкладка "Логи" в админ-панели, интеграция с существующими админскими эндпоинтами для завершения матчей, перехода/отката сезонов.

Добавление (2025‑09‑13): корректность статуса матчей (МСК)
- Эндпоинт `GET /api/match/status/get` теперь принимает параметр `date=YYYY-MM-DD` (необязательный) и использует его при сопоставлении расписания и ручных флагов `live/finished` по локальной дате (МСК). Это исключает редкие ложные `finished` до начала матча из-за старых флагов.
- Клиент (`static/js/profile-match-live-score.js`, `static/js/profile-match-advanced.js`) передаёт `date` при проверке статуса, что устраняет расхождения между устройствами.
- В резолвере времени матча нормализованы названия команд: регистр, пробелы и `ё→е`.
 - Полный сброс: `POST /api/admin/full-reset` теперь также очищает таблицы `match_flags`, `match_specials` и `match_stats`, чтобы после «Полного сброса» не оставались статусы `finished/live` и зафиксированные спецсобытия от старых матчей.

Примечание (2025‑09‑08): добавлена комплексная система логирования администратора включающая:
- Таблицу `admin_logs` для хранения детальной информации о каждом действии
- Утилиту `AdminActionLogger` для централизованного логирования
- API endpoint `/api/admin/logs` для получения логов с фильтрацией и пагинацией
- Новую вкладку "Логи" в админ-панели с удобным интерфейсом просмотра
- Интеграцию логирования в ключевые админские операции (завершение матчей, переход сезонов)
- Подробное описание операций на простом языке с указанием затронутых сущностей и результатов

Дополнения (UX/Realtime):
- Клик по команде в Прогнозах открывает экран команды: глобальный делегат переводит на вкладку «Лига» и вызывает `TeamPage.openTeam(name)` (profile-team.js).
- Экран команды `#ufo-team` скрывается при переключении нижних вкладок и подвкладок НЛО, чтобы не «прилипать» под расписанием (profile.js).
- При live‑изменении счёта (`POST /api/match/score/set`) выполняется лёгкая инвалидация `league_table` и `schedule` через SmartInvalidator (без пересчёта/расчёта ставок). Клиент обновляет таблицу через `RealtimeUpdater` → `League.refreshTable()`.
 - Инициализация таблицы: если в активном сезоне ещё нет завершённых матчей, `/api/league-table` собирает состав участников из snapshot `schedule` и показывает до 9 команд с нулевой статистикой (PTS/GD = 0), чтобы таблица не была пустой.
 - Живая таблица во время матча: клиент сперва запрашивает `/api/league-table/live` (Cache-Control: no-store); при 404/ошибке падает на обычную `/api/league-table`. Live‑проекция накладывает текущие счёта из `MatchScore` на базовую агрегацию и помечает payload полем `live: true`.

## 📁 Структура проекта

```
├── app.py                      # Основное Flask-приложение (монолит, кандидат на декомпозицию)
├── config.py                   # Конфигурация приложения
├── wsgi.py                     # WSGI-точка входа для production
├── requirements.txt            # Python зависимости
├── render.yaml                 # Конфигурация деплоя на Render
├── api/                        # API маршруты (модульная архитектура)
│   ├── admin.py               # Административные эндпоинты
│   ├── betting.py             # API ставок
│   ├── monitoring.py          # Мониторинг системы
│   └── security_test.py       # Тестирование безопасности
├── core/                      # Ядро приложения
├── database/                  # Слой работы с данными
│   ├── database_api.py        # API для работы с PostgreSQL
│   ├── database_models.py     # SQLAlchemy модели
│   └── database_schema.sql    # SQL схема БД
├── utils/                     # Утилиты и хелперы
│   ├── security.py            # Безопасность и валидация
│   ├── decorators.py          # Декораторы (auth, rate limiting)
│   ├── monitoring.py          # Система мониторинга
│   ├── middleware.py          # Middleware для Flask
│   ├── betting.py             # Утилиты для ставок
│   ├── sheets.py              # Интеграция с Google Sheets
│   └── admin_logger.py        # Логирование действий администратора
├── optimizations/             # Оптимизации производительности
│   ├── multilevel_cache.py    # Многоуровневый кэш
│   ├── background_tasks.py    # Фоновые задачи
│   ├── websocket_manager.py   # WebSocket менеджер
│   ├── smart_invalidator.py   # Умная инвалидация кэша
│   └── optimized_sheets.py    # Оптимизированная работа с Sheets
├── scripts/                   # Скрипты инициализации
│   ├── init_database.py       # Инициализация БД
│   ├── create_admin_logs.py   # Создание таблицы логов админа
│   └── create_admin_logs_table.sql # SQL миграция для логов
├── static/                    # Статические файлы
│   ├── css/                   # Стили
│   │   ├── style.css          # Основные стили
│   │   ├── blb.css            # Тема BLB League
│   │   ├── splash.css         # Стили splash-экрана
│   │   └── database-ui.css    # Стили для БД интерфейса (включая логи)
│   ├── js/                    # JavaScript модули
│   │   ├── profile.js         # Основной модуль профиля
│   │   ├── predictions.js     # Модуль ставок
│   │   ├── league.js          # Лига и турнирная таблица
│   │   ├── admin.js           # Админ-панель
│   │   ├── admin-enhanced.js  # Расширенная админ-панель (с логами)
│   │   ├── realtime-updates.js # Real-time обновления
│   │   ├── profile-*.js       # Модульные компоненты профиля
│   │   └── telegram-patch.js  # Интеграция с Telegram WebApp
│   └── img/                   # Изображения и иконки
└── templates/                 # HTML шаблоны
    ├── index.html             # Основной шаблон SPA
    └── admin_dashboard.html   # Админ-панель (включая вкладку логов)
```

### Принципы организации кода (актуально)

## 🧭 Быстрая навигация по ключевым функциям (куда смотреть в коде)

- Real-time и топики
    - Server batching/patch: `optimizations/websocket_manager.py` → методы `emit_to_topic_batched`, `get_metrics`
    - Публикация событий: `optimizations/smart_invalidator.py` → `publish_topic`, Redis канал `app:topic`
    - Клиентский приём патчей: `static/js/realtime-updates.js` → обработчик `data_patch`
    - Фичефлаги WS: чтение в `templates/index.html`, логика pre-probe в `static/js/profile.js`
    - PROGRESS топик админского массового обновления: `topic='admin_refresh'` — события `progress_update` с payload `{type:'progress'| 'complete', step?, index?, total?, status?, duration_ms?, summary?}` генерируются эндпоинтом `/api/admin/refresh-all`.

- Ставки и коэффициенты
    - Размещение ставки: `app.py` → `/api/betting/place`
    - Ленты туров/коэффициентов: `app.py` → `/api/betting/tours` (добавляет `odds_version`)
    - Версии коэффициентов: `app.py` → `_get_odds_version`, `_bump_odds_version`
    - Политика округления коэффициентов: сервер вычисляет и форматирует коэффициенты с точностью 2 знака по правилу ROUND_HALF_UP (Decimal), клиент отображает через `toFixed(2)`. В «Мои ставки» показывается коэффициент, зафиксированный на момент размещения ставки (строка), что исключает рассинхрон вида 1.63 vs 1.62.
    - Клиент (ставки): `static/js/predictions.js` (WS + ETag‑fallback пуллинг 3.5–4.7с)

- Детали матча и статистика
    - Серверный ETag: `app.py` → `/api/match-details` через `etag_json`
    - Клиентский загрузчик: `static/js/match-details-fetch.js` → `window.fetchMatchDetails`
    - Пуллинг статов: `static/js/profile-match-stats.js` (10–15с, ETag)
    - Анти‑фликер после админских правок: `static/js/profile-match-advanced.js`
        - Унифицированная финализация матча: сервис `services/match_finalize.py` → `finalize_match_core()` вызывается из:
                - `POST /api/match/status/set` (когда `status=finished`, с параметром `settle_open_bets=True`)
                - `POST /api/match/settle` (после ручного расчёта ставок, `settle_open_bets=False` — ставки уже обработаны локально)
            Поведение раньше: две почти идентичные ветки кода в `app.py` (дублирование ~450+ строк) — риск расхождений, сложнее вносить изменения.
            Сейчас: единая функция шагов:
                1) Upsert финального счёта в snapshot `results` (+ инвалидация `results`, WS оповещение, очистка `team-overview:*` ETag)
                2) Автофикс спецрынков (penalty/redcard) → 0 если не установлен
                3) (опционально) массовый settle открытых ставок (`_settle_open_bets`) + синхронизация турнирной таблицы (через внутренние вызовы)
                4) Применение составов и событий в расширенную схему (`_apply_lineups_to_adv_stats`)
                5) Идемпотентная локальная агрегация `TeamPlayerStats` (через `MatchStatsAggregationState`) + пересбор `SCORERS_CACHE` и снапшота `stats-table`
                6) Обновление снапшота `schedule` (удаление завершённого матча из активных)
                7) Пересборка снапшота `league-table` и широковещательная нотификация
            Идемпотентность: повторный вызов не удваивает `games/goals/...` за счёт флагов `lineup_counted` и `events_applied` в таблице `MatchStatsAggregationState`.
            Архитектурная цель: изолировать доменную логику матча от монолита `app.py` и подготовить почву для дальнейшего вынесения в пакет `services/`.

- Лидерборды и достижения
    - Серверные эндпоинты (ETag): `app.py` → `/api/leaderboard/*`, `/api/achievements` (legacy `/api/stats-table` → 410 GONE). `goal-assist` использует `etag_json` с core_filter для стабильного ETag (исключает updated_at).
    - Goal+Assist кэш: двухуровневый (in-memory + Redis namespace `leaderboards:goal-assist`, TTL = LEADER_TTL). Инвалидация вызывается при финализации матча (services/match_finalize.py) перед динамическим апдейтом per-team stats. WebSocket нотификация `leader-goal-assist` (reason=invalidate) может использоваться клиентом для ускоренного refetch.
    - API `/api/achievements`: добавлено поле `best_tier` (наивысший достигнутый уровень), сохранены `all_targets` и `next_target` для клиентского прогресса.
    - Клиентские вызовы: `static/js/profile.js` (leaderboards) и `static/js/profile-achievements.js`
    - Рендер достижений: бейдж (иконка/цвет) определяется по `best_tier`; список «Цели: <all_targets.join('/')>» показывается внутри секции «Подробнее» (скрыт в кратком описании); прогресс остаётся в краткой части как `value/next_target`.
    - Универсальная утилита SWR/ETag: `static/js/etag-fetch.js`
    - Поведение обновления: лидерборды обновляются через ETag‑пуллинг каждые ~60с с джиттером, отменяется при скрытии вкладки и при переходе на другие сабвкладки (реализовано в `static/js/profile.js`).
    - Заголовок свежести: сервер добавляет `X-Updated-At` в ответы 200/304; клиент (через `etag-fetch.js`) при 304 использует `headerUpdatedAt`, чтобы обновить лейбл «Обновлено» без перезагрузки тела.

- Страница команды (новое)
        - API: `GET /api/team/overview?name=...` — агрегированные показатели по команде за все сезоны (W/D/L, GF/GA, clean sheets, last5), а также:
                - `recent` — два последних завершённых матча: `{date, opponent, score, result}`
                - `tournaments` — число уникальных турниров, в которых команда участвовала
                - `cards` — суммарно `{ yellow, red }`
            Кэш: `etag_json` (`public, max-age=60, stale-while-revalidate=300`, `X-Updated-At`).
    - Клиент: `static/js/profile-team.js` — `TeamPage.openTeam(name)` загружает данные, обновляет «Обновлено» по `headerUpdatedAt` даже при 304. В блоке статистики добавлен заголовок «Статистика» и динамическая русская плюрализация подписи к количеству матчей (матч / матча / матчей).
    - Навигация: разметка в `templates/index.html` — панель `#ufo-team` с сабвкладками «Обзор/Матчи/Состав» (последние две — заглушки).
    - Точки входа: клики по элементам с `data-team-name` (название и логотип) в расписании/результатах/таблице и «Прогнозах». Карточка «Игра недели» по клику открывает детали матча (а не экран команды).
    - Возврат «Назад» на экране команды учитывает контекст: возвращает в детали матча, если переход был из них; иначе — в исходную подвкладку лиги.

- Новости
    - Публичный API: `app.py` → `GET /api/news`
    - Админ CRUD: `app.py` → `/api/admin/news` (initData + ADMIN_USER_ID)
    - Инвалидация и прогрев: `optimizations/multilevel_cache.py` → `invalidate_pattern`

- Сезонный reset и составы команд
    - Season rollover: `app.py` → `POST /api/admin/season/rollover`
    - Season rollback: `api/admin.py` → `POST /api/admin/season/rollback` (dry/force)
    - Persistent roster: `app.py` → сохранение составов, синхронизация с `team_roster`
    - Массовое обновление снапшотов: `POST /api/admin/refresh-all` — последовательный запуск `_sync_league_table`, `_sync_stats_table`, `_sync_schedule`, `_sync_results`, `_sync_betting_tours` с WebSocket прогрессом.
    - Публичные составы: `app.py` → `GET /api/match/lineups?match_id=...`

- Кэширование и ETag
    - Универсальный ответ: `app.py` → `_json_response`
    - Обёртка с ETag: `app.py` → `etag_json`
    - Многоуровневый кэш: `optimizations/multilevel_cache.py`

Проект использует **многослойную архитектуру** с элементами **модульной организации**:
- **API Layer**: Разделение эндпоинтов по доменам (betting, admin, monitoring)
- **Business Logic Layer**: Основная логика в `app.py` с утилитами в `utils/`
- **Data Layer**: Отдельный слой для работы с данными (`database/`)
- **Optimization Layer**: Специализированный слой для производительности
- **Frontend**: Модульная JavaScript архитектура с разделением по функциональности

## 🛠 Технологический стек

| Категория | Технология | Версия | Назначение |
|-----------|------------|--------|------------|
| **Backend Framework** | Flask | 2.3.3 | Основной веб-фреймворк |
| **Database** | PostgreSQL | - | Основная БД (через SQLAlchemy 2.0.36) |
| **ORM** | SQLAlchemy | 2.0.36 | Работа с базой данных |
| **Cache** | Redis | 5.0.1 | Многоуровневый кэш (in-memory + Redis) |
| **WebSockets** | Flask-SocketIO | 5.3.6 | Real-time коммуникация |
| **External API** | Google Sheets API | gspread 6.0.0 | Интеграция с таблицами |
| **Authentication** | Telegram WebApp | - | Авторизация через Telegram |
| **Security** | Various | - | Rate limiting, CSRF, validation |
| **Deployment** | Gunicorn | 21.2.0 | Production WSGI сервер (через wsgi.py) |
| **Migrations** | Alembic | 1.13.2 | Миграции (подключено, требует инициализации) |
| **Sanitize** | Bleach | 6.1.0 | Очистка HTML (план: новости) |
| **Rate Limit** | flask-limiter | 3.5.0 | Лимиты запросов |
| **Monitoring** | psutil | 5.9.8 | Системный мониторинг |
| **Frontend** | Vanilla JS | ES6+ | Без фреймворков |
| **Styling** | CSS3 | - | Custom CSS с темизацией |

### Языки программирования
- **Python 3.12+** - Backend
- **JavaScript ES6+** - Frontend
- **CSS3** - Стилизация
- **SQL** - База данных
- **HTML5** - Разметка

## 📊 Google Sheets: админские операции (импорт/экспорт/ремонт)

Назначение: Google Sheets используется только для админских синхронизаций данных (DB-only чтение на публичных путях). Поддерживаются:

- POST `/api/admin/google/import-schedule` — импорт расписания из листа расписания в БД (snapshot schedule + инвалидация кэшей).
- POST `/api/admin/google/export-all` — экспорт актуальных данных в таблицу: пользователи, ставки, турнирная таблица, а также расширенные вкладки статистики:
    - По каждой команде создаётся лист `team_{НазваниеКоманды}` c колонками: `player_id, first_name, last_name, matches, yellow, red, assists, goals, goal_plus_assist` и сортировкой по `goal_plus_assist desc, matches asc, goals desc`.
    - Создаётся глобальная вкладка `ГОЛ+ПАС` с объединённым рейтингом игроков по лиге по тем же правилам сортировки.
    - Источник данных: при наличии расширенной схемы (PlayerStatistics/MatchEvent/TeamComposition) используется она. Дополнительно включён оверлей по агрегированной таблице `TeamPlayerStats`: даже при отсутствии расширенной схемы и/или несовпадениях имён, экспорт заполняет листы `team_*` и глобальную `ГОЛ+ПАС` по данным `TeamPlayerStats` (игры/голы/пасы/карточки, goal+assist) — исключает нули и обеспечивает актуальность для команд вроде «Обнинск», «Дождь». Если и `TeamPlayerStats` недоступна, применяется безопасный fallback на `team_roster` с улучшениями: дедуп имён (case-insensitive), разделение full name на `first_name`/`last_name`, попытка сопоставления с `Player.id` по шаблонам «Фамилия Имя» и «Имя Фамилия» (и осторожный contains‑fallback) для заполнения `player_id` и корректного сплита.
- POST `/api/admin/google/repair-users-sheet` — универсальный «ремонт» листов (удаление дублей) с параметром `sheet`:
    - `users` — дедуп по `user_id` (колонка A), сохраняется последняя запись.
    - `bets` — дедуп по `id` (колонка A).
    - `achievements`, `referrals` — дедуп по `user_id`, если есть `updated_at`, сохраняется самая свежая запись.
    - Любой иной лист (например, `ТАБЛИЦА`) — удаление идентичных строк (полное совпадение ячеек).
    - Ответ возвращает сводку: `deduped_rows` и до 10 примеров удалённых дублей в `removed_examples` для аудита.

UI админ‑панели (`templates/admin_dashboard.html` + `static/js/admin-enhanced.js`):
- Во вкладке «Сервис» рядом с кнопками импорта/экспорта добавлен выпадающий список выбора листа (`#repair-sheet-select`) и кнопка «Почистить дубли».
- Поддерживаемые значения: `users`, `achievements`, `referrals`, `bets`, `ТАБЛИЦА`.
- При выполнении операций используется Telegram initData и проверка `ADMIN_USER_ID` на сервере.
 - В модальном окне импорта расписания добавлена кнопка «Импорт из Google → заполнить matches», которая вызывает `POST /api/admin/google/import-schedule`, показывает статус операции и по завершении перезагружает список матчей. Это облегчает первичное заполнение БД и устранение ошибки `schedule_unavailable` перед dry‑run/apply.

Переменные окружения для Sheets:
- `GOOGLE_CREDENTIALS_B64` или `GOOGLE_SHEETS_CREDENTIALS` (raw JSON) — учётные данные сервис‑аккаунта.
- `SHEET_ID` или `SPREADSHEET_ID` — ID таблицы.
- Экспорт автоматически создаёт недостающие листы (ensure_worksheet) и очищает лист перед записью (clear_worksheet) для консистентности данных.
  
Дополнительно:
- Admin-only endpoint `POST /api/admin/leaderboards/refresh` выполняет принудительный refresh/инвалидацию лидербордов и сбрасывает in-memory ETag — полезно при `ENABLE_SCHEDULER=0` и `LEADER_PRECOMPUTE_ENABLED=0`.

### Живая турнирная таблица (live)

Назначение: показывать пользователям «проекцию» турнирной таблицы в процессе идущих матчей без ожидания финального засета.

- Endpoint: `GET /api/league-table/live`
- Контракт ответа: как у обычной таблицы, дополнительно `live: true` и `updated_at`.
- Алгоритм: строится базовая агрегация (finished/settled результаты, участники из snapshot `schedule`), затем накладываются текущие счёта из `MatchScore` для матчей в статусах in‑progress/ongoing.
- Кэширование: `Cache-Control: no-store` (всегда свежие данные); обычная таблица остаётся под `etag_json` и кэшем.
- Клиент: `static/js/league.js` сначала пытается `fetch('/api/league-table/live', {cache:'no-store'})`, при ошибке делает fallback на `/api/league-table`. WebSocket‑инвалидация (`data_patch`/`data_changed`) триггерит перезагрузку live‑таблицы.

## 🏗 Архитектурные паттерны и новые подсистемы

Новые элементы (Q3 2025):
1. Сезонный «deep reset» (dry / soft / full / deep): расширенная очистка и пересбор данных.
2. Очистка колонок B,D расписания в Google Sheets при deep reset (строки 2..300).
3. CRUD новостей + публичный `/api/news` (кэш + ETag MD5) + прогрев.
4. Прогрев кэша после операций (новости, сезонный сброс).
5. Помощник `_get_news_session()` для плавной миграции к `DatabaseManager`.
6. (DEPRECATED) Ранее: snapshot стратегия `/api/stats-table` (ETag + fallback генерация из игроков/событий). Удалено: заменено динамическими per-team таблицами `team_stats_<team_id>` и глобальным `/api/leaderboard/goal-assist`.
7. `invalidate_pattern` для массового сброса (e.g. `cache:news`).
8. ETag также для статистических эндпоинтов.
9. Persistent roster (`team_roster`): хранение последних подтверждённых составов команды с дедупликацией (case-insensitive) и автосинхронизацией при сохранении матчевого состава.

### 1. Модульная архитектура API

```python
# api/betting.py - Пример модульной организации
def init_betting_routes(app, get_db, SessionLocal, User, Bet, 
                       parse_and_verify_telegram_init_data, 
                       _build_betting_tours_payload, ...):
    """Инициализация маршрутов ставок с внедрением зависимостей"""
    
    @betting_bp.route('/place', methods=['POST'])
    def api_betting_place():
        """Размещение ставки"""
        try:
            parsed = parse_and_verify_telegram_init_data(request.form.get('initData', ''))
            if not parsed or not parsed.get('user'):
                return jsonify({'error': 'Недействительные данные'}), 401
            
            # Бизнес-логика размещения ставки
            return jsonify({'status': 'success'})
        except Exception as e:
            app.logger.error(f"Betting place error: {e}")
            return jsonify({'error': 'Не удалось разместить ставку'}), 500
```

### 2. Система декораторов для безопасности

```python
# utils/decorators.py
@app.route('/api/betting/place', methods=['POST'])
@require_telegram_auth()
@rate_limit(max_requests=5, time_window=60)
@validate_input(
    initData={'type':'string','required':True,'min_length':1},
    market={'type':'string','required':True,'min_length':1},
    stake='int'
)
def api_betting_place():
    # Обработчик уже получает валидированные данные
    pass
```

### 3. Многоуровневое кэширование (расширено)

Алгоритм now:
1. Memory (TTL per type) → свежо? вернуть.
2. Redis (pickle) → hydrate memory.
3. Loader (если задан) → сохранить в оба уровня.
4. Инвалидация точечная (`invalidate`) и по шаблону (`invalidate_pattern`).

TTL примеры: league_table 300s/1800s, news 120s/300s.

Публикация новостей вызывает: инвалидация `cache:news` + прогрев `limit:5:offset:0`.

Предвычисление лидербордов (precompute):
- Отдельный фоновый поток с интервалом `LEADER_PRECOMPUTE_SEC` (60с по умолчанию) строит JSON‑payload'ы для: `top-predictors`, `top-rich`, `server-leaders`, `prizes` и сохраняет их в Redis (тип кэша `leaderboards`).
- Эндпоинты `/api/leaderboard/*` теперь сначала читают предвычисленные данные из Redis (быстрый путь), и только при отсутствии — используют DB snapshot/внутренние кэши.
- Env‑флаги:
    - `LEADER_PRECOMPUTE_ENABLED=1` — включить фоновый прогрев
    - `LEADER_PRECOMPUTE_SEC=60` — период прогрева в секундах

### 3a. ETag поверх кэша
Публичные ответы сериализуются (sorted keys, UTF-8) → MD5 → `ETag`. Клиент при совпадении отправляет `If-None-Match`, сервер отдаёт 304.

### 4. Паттерн Repository для работы с данными (актуален)

```python
# database/database_models.py
class Tournament(Base):
    __tablename__ = 'tournaments'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    season = Column(String(100), nullable=False)
    status = Column(String(50), default='active')
    
    # Relationships
    matches = relationship("Match", back_populates="tournament")
```

### 4a. Real-time патчи и версионность коэффициентов (актуализировано)

Назначение: уменьшить трафик и задержки при live‑обновлениях через компактные WebSocket‑патчи, сохраняя согласованность коэффициентов.

Канал и формат события
- Событие: `data_patch`
- Формат:
    - `{ type: 'data_patch', entity: 'match'|'odds', id: { home, away, date }, fields: { ... } }`
    - Идентификатор матча: `id = { home: string, away: string, date: string }`

Что шлёт сервер сейчас
- entity `match`: при изменении счёта и специальных рынков (penalty/redcard)
    - `fields`: `score_home`, `score_away`, `penalty_yes`, `redcard_yes` (по ситуации)
    - Всегда добавляется `odds_version` (инкрементируется при влияющих изменениях)
- entity `odds`: при изменении коэффициентов после ставки пользователя
    - `fields`: полный снэпшот рынков: `odds` (ключи `home,draw,away`) и `markets` (`totals`: массив `{line, odds:{over,under}}`; `specials`: `{ penalty: {available, odds:{yes,no}}, redcard: {available, odds:{yes,no}} }`).
    - Отправляется с задержкой (debounce) для группировки нескольких ставок в одно обновление.
- В payload туров (`/api/betting/tours`) для каждого матча присутствует `odds_version` (инициализация версии на клиенте)

Снапшот `results`:
- Обновляется в `POST /api/match/settle` при наличии финального счёта в `MatchScore` (upsert записи в массиве `results`, обновление `updated_at`). Старые записи по тому же матчу перезаписываются; отдельная история версий не ведётся.
 - При ручном расчёте через `/api/match/settle` больше не блокируем расчёт ставок проверкой `match_datetime > now` (исправление проблемы «ставки остаются open» из‑за рассинхрона часовых поясов). Если время матча в будущем, но админ явно завершил матч, спецрынки будут финализированы (не зафиксированные события трактуются как «Нет»), а линии 1x2 и totals рассчитаются только если счёт/тотал доступны. Авторасчёт фоновой функцией `_settle_open_bets` сохраняет прежнюю защиту.
 - Расписание: `last_finished_tour` теперь считается только для полностью завершённых туров (раньше любая сыгранная игра помечала тур как завершённый и вытесняла его из top‑3 списка). Добавлен оверлей счётов из snapshot `results` в расписание и результаты (если Google Sheet ещё не обновлён) — пользователи сразу видят итоговый счёт.
 - Прогнозы (betting-tours): матч исчезает из списка сразу после старта; следующий тур появляется только когда все матчи текущего тура уже стартовали (раньше требовалось завершение или появлялся слишком рано/поздно).
 - Инвалидация: после апдейта снапшота `results` теперь очищаются ключи `team-overview:*`, чтобы страница команды сразу показывала свежую статистику без ожидания TTL.

Как ведёт себя клиент (static/js/realtime-updates.js, static/js/predictions.js)
- Подписывается на WebSocket-топики `predictions_page` и `match_odds_{match_id}`.
- Поддерживает локальную карту версий коэффициентов per‑match (в памяти)
- Если во входящем патче `fields.odds_version` меньше уже известной версии — изменения рынков/коэффициентов игнорируются (защита от регрессии)
- Поля состояния матча (счёт, specials) применяются всегда для `entity: 'match'`
- При получении `entity: 'odds'` динамически обновляет коэффициенты на кнопках ставок (П1/Х/П2) без перезагрузки страницы.
 - При получении `entity: 'odds'` динамически обновляет коэффициенты на кнопках ставок (П1/Х/П2), тоталов (Over/Under с линиями) и спецрынков (Да/Нет) без перезагрузки страницы.

Мини‑контракт полей
- `entity: 'match'`: `fields` могут содержать `score_home`, `score_away`, `penalty_yes`, `redcard_yes`, всегда допустим `odds_version`
- `entity: 'odds'`: `fields` содержат `home`, `draw`, `away` и опционально `odds_version`
 - `entity: 'odds'`: `fields` содержат `odds` (home/draw/away), `markets` (totals/specials) и `odds_version`.

Стабильность и будущее развитие
- Версии поддерживаются в памяти на сервере (`_ODDS_VERSION`, `_get_odds_version`, `_bump_odds_version` в `app.py`)
- Метод отправки патчей: `optimizations/websocket_manager.py: notify_patch_debounced` и `emit_to_topic_batched`.
- Пакетирование частых изменений реализовано через `emit_to_topic_batched` с задержкой ~3.5с.
 - Прогресс админского обновления (`/api/admin/refresh-all`): сервер шлёт в топик `admin_refresh` события:
     - `{type:'progress', step:<имя>, index:n, total:m, status:'start'|'done', duration_ms?, error?}`
     - По завершении: `{type:'complete', summary:[{name,status,duration_ms,error?},...], total_duration_ms}`
     Клиент (`static/js/admin-enhanced.js`) динамически обновляет блок прогресса и отписывается после завершения.

#### Fallback без WebSockets (free tier Render)
 Прогнозы/ставки (коэффициенты): модуль `static/js/predictions.js` при отключённых WS выполняет ETag‑опрос `/api/betting/tours` каждые ~3.5–4.7 секунды и обновляет подписи кнопок П1/Х/П2, тоталов и спецрынков у видимых карточек матчей (без полного рендера). Пуллинг останавливается при переключении на под‑вкладку «Мои ставки», при скрытии вкладки, а также при уходе со страницы.

```javascript
 Прогнозы/ставки (клиент): добавлен fallback ETag‑пуллинг коэффициентов (3–5с) при выключенных WebSocket. Обновляются только кнопки П1/Х/П2 на карточках. Версионность odds_version сохраняется.
 Детали матча (админ): устранён визуальный «фликер» переключателей событий (жёлтая/красная/гол/ассист) — после локального админского изменения подавляется авто‑перерисовка составов в течение ~8 секунд, чтобы избежать скачков UI при приходе фонового опроса.
// static/js/profile.js - Основной модуль
(() => {
    // Глобальный rate limiter для fetch запросов
    const originalFetch = window.fetch.bind(window);
    const cfg = Object.assign({ tokensPerSec: 20, bucketCapacity: 20 }, 
                              window.__FETCH_LIMITS__ || {});
    
    // Кастомизация fetch с rate limiting
    window.fetch = (input, init) => new Promise((resolve, reject) => {
        queue.push({ run: () => originalFetch(input, init).then(resolve, reject) });
        schedule();
    });
})();

## 🔄 Недавние изменения (сентябрь 2025)

### 2025-09-12 (Deprecation stats-table)
- Удалены эндпоинты `/api/stats-table` и `/api/stats-table/refresh` (теперь 410 GONE с подсказкой на `/api/leaderboard/goal-assist`).
- Отключена фоновая задача `_sync_stats_table`, удалены метрики и WebSocket уведомления для `stats_table`.
- Удалены клиентские вызовы refresh (admin.js, profile-match-admin.js, profile-match-advanced.js).
- Таб «Статистика» использует только динамический агрегированный goal+assist лидерборд.
- Упрощены фоновые задачи: меньше конкурирующих снапшотов → снижение нагрузки I/O и кэша.

### 2025-09-07 (UX и логирование)
- Достижения: «Цели» (лестницы all_targets) перенесены внутрь блока «Подробнее» в `static/js/profile-achievements.js`; в краткой карточке остался только прогресс `value/next_target` и бейдж уровня по `best_tier`.
- Splash: скрытие экрана теперь оркестрируется реальными событиями предзагрузки. `static/js/profile-ads-featured.js` диспатчит `preload:ads-ready` после инициализации карусели и `preload:topmatch-ready` после построения карточки «матча недели». `static/js/splash.js` слушает `preload:news-ready`, `preload:ads-ready`, `preload:topmatch-ready` и завершает показ, когда готовы новости И (реклама ИЛИ матч недели).
- Логирование: снижен шум от предупреждений «No match found» при расчёте тоталов — в `_get_match_total_goals` сообщение переведено в INFO и логируется один раз на пару команд (dedup); предупреждения по некорректному формату счёта сохранены как WARNING.

### 2025-09-13 (Fix: admin orders + refactor shop helpers)

- Исправлен баг: API для получения списка заказов админом был реализован в теле функции, но не зарегистрирован как маршрут — добавлен корректный декоратор `@app.route('/api/admin/orders', methods=['POST'])`, теперь админ‑панель получает список заказов корректно.
- Вынос: логика магазина (каталог, нормализация позиций, хелпер логирования) вынесена из `app.py` в новый модуль `services/shop_helpers.py`. В `app.py` оставлены вызовы; поведение API не изменилось.
- Добавлен структурированный логгер `shop_order` (через `log_shop_order_event`) — логирует попытки оформления, ошибки и успешные заказы (best‑effort fallback на `current_app.logger`).

Полезность:
- Снижение размера монолитного `app.py` — проще читать и вносить изменения.
- Упрощена модульная тестируемость: теперь можно покрыть `services/shop_helpers.py` unit‑тестами.

Рекомендуемые следующие шаги:
- Настроить обработчик (Handler) для логгера `shop_order` — ротация в файл и retention (например, `RotatingFileHandler`).
- (Опционально) Создать таблицу аудита `shop_order_audit` для гарантированной трассировки событий заказов.
- Добавить unit/integration тесты для `api_shop_checkout` и `services/shop_helpers.py`.

### 2025-09-04
### 2025-09-11 (Hotfix betting settlement)
- Исправлено: ошибка `can't compare offset-naive and offset-aware datetimes` при авторасчёте ставок. Теперь в `services/betting_settle.py` все сравнения времени матча приводят `now` к naive UTC (Bet.match_datetime хранится без tz). Это устраняет падение `psycopg.OperationalError` сценария фонового settle при запросе `/api/betting/tours`.
### 2025-09-11 (Service extraction – шаг 1)
- Вынесены три сервисных модуля в `services/` без изменения бизнес-логики:
    - `betting_settle.py` → `settle_open_bets` (массовый расчёт открытых ставок). Ранее `_settle_open_bets` в `app.py` (~глубокая зона файла).
    - `adv_lineups.py` → `apply_lineups_to_adv_stats` (идемпотентное применение составов к расширенной схеме статистики, выставление `lineup_counted`).
    - `snapshots.py` → `snapshot_get/snapshot_set` (унифицированные retry 3 попытки + backoff 100–300 ms, JSON сериализация, централизованный логгер). Ранее `_snapshot_get/_snapshot_set` в `app.py`.
- Обновлён `services/__init__.py` для экспорта новых функций (с защитой try/except при раннем импорте).

### 2025-09-12 (Этап 1.2a – Read-only составы команд)
- Добавлена ORM-модель `TeamRoster` (read-only использование существующей таблицы, без DDL изменений)
- Эндпоинт: `GET /api/admin/teams/<int:team_id>/roster` — возвращает игроков команды из `team_roster` с:
    - Сплитом `full_name` → `first_name`, `last_name` (простое разделение по первому пробелу; оставшиеся части аккумулируются в last_name)
    - Дедупликацией игроков (case-insensitive)
    - Placeholder статистикой: `goals=0, assists=0, yellow_cards=0, red_cards=0`
- UI: в таблице команд добавлена кнопка «Состав», открывающая компактное модальное окно с таблицей игроков
- CSS: внедрён компактный адаптивный стиль (`#team-roster-modal`) — sticky header, плотные строки, улучшенная читаемость на мобильных
- Подготовка к нормализации игроков: модалка отделена от будущего CRUD; текущая реализация не изменяет бизнес-логику матчей/статистики
- Следующий шаг (1.2b): полноценные master-данные `players` (CRUD + миграция из `team_roster`), затем интеграция реальной статистики (1.2c)

### 2025-09-12 (Этап 1.2b промежуточный – динамическая статистика per team)
- Добавлены динамические таблицы статистики формата `team_stats_<team_id>` (создаются лениво)
- Структура каждой таблицы: `player_id (PK)`, `first_name`, `last_name`, `matches_played`, `goals`, `assists`, `yellow_cards`, `red_cards`, `last_updated`
- Эндпоинт `/api/admin/teams/<id>/roster` теперь:
    - гарантирует наличие таблицы (CREATE IF NOT EXISTS)
    - при первом обращении инициализирует строки из `team_roster` (все счётчики = 0)
    - возвращает реальные поля статистики вместо placeholder 0
- Хук после финализации матча (`finalize_match_core`) обновляет только две затронутые команды:
    - инкрементирует `matches_played` (уникально per match per player)
    - goals / assists / yellow_cards / red_cards из событий матча
    - UPSERT через `ON CONFLICT(player_id)` (наращивание счётчиков)
- Попытка сопоставить `player_id` выполняется через поиск в `team_roster` по (team, lower(player)); если не найдено — теперь автоматически ДОБАВЛЯЕМ запись в `team_roster` (раньше: hash fallback; УСТРАНЕНО) и используем реальный id.
- Плюсы подхода: изоляция обновлений, отсутствие изменения глобальной схемы; Минусы: усложнённая аналитика (множественные таблицы) — запланировано перепроектирование при переходе к нормализованным `players`
- Цель: уменьшить размер `app.py`, подготовить почву для внедрения метрик (latency, failures) и повторного использования снапшот‑логики в будущих модулях (e.g. leaderboard precompute или новостные дайджесты).
- Изменений в API контракте и схемах БД нет. Идемпотентные флаги `lineup_counted` и транзакционные границы сохранены.
- Следующий шаг (план): заменить внутренние вызовы в `finalize_match_core` на эти сервисы через DI; добавить lightweight unit тесты для settle (парсинг selection, edge cases totals, specials fallback). 

- Splash экран: добавлен числовой индикатор прогресса (0–100%) под полосой загрузки.
- Введён stage API `window.splashStages` (profile → 70%, data → 90%, finish → 100%) + `setSplashProgress` для ручной коррекции.
- Устранён горизонтальный скролл: убраны full-bleed стили у `.subtabs`, ограничены `profile-top-area`, инсет для нижней навигации.
- UI: увеличен размер шрифта заголовка «Новости», добавлены боковые отступы нижнему меню.
- Частичная унификация match-details: обработчик в `league.js` переведён на `fetchMatchDetails` (сохранён fallback для legacy зон).
- Миграция `/api/schedule` и `/api/results` на универсальный `fetchEtag` (клиент). Серверный `etag_json` для них — в плане.
- Добавлен пилотный retry (OperationalError / SSL EOF) для `/api/betting/my-bets`: dispose engine → пересоздание сессии (основа для будущего централизованного helper).

#### 2025-09-12 (Дополнение: идемпотентность динамических статов)
Добавлена таблица маркеров `dynamic_team_stats_applied (home, away, applied_at)`:
- Цель: исключить повторное инкрементирование статистики `team_stats_<team_id>` при повторном вызове `finalize_match_core` (idempotent design)
- Логика: перед UPSERT инкрементами выполняется SELECT; при наличии записи — пропускаем блок апдейта.
- Поведение: безопасно для конкуренции (INSERT ON CONFLICT DO NOTHING), не требует блокировок.
- Побочный эффект: снижение риска дублирования при ручном повторном завершении матча.

### 2025-09-06 (краткое обновление)

#### 2025-09-12 (Решение: отказ от master-таблицы players)
Принято осознанное решение не вводить на данном этапе отдельную нормализованную таблицу `players`.

Аргументы:
- Текущие бизнес-задачи закрываются: нужен только просмотр составов и кумулятивная статистика гол+пас+карточки по игрокам внутри своей команды.
- `team_roster` + `team_stats_<team_id>` обеспечивают постоянное накопление без сложной миграции и CRUD UI.
- Сокращение времени разработки и риска ошибок при миграции имен (case/spacing вариации).

Компромиссы и последствия:
- Нет глобального Player.id для объединения статистики при переходе игрока между командами.
- Сложнее строить сквозные лидерборды по всем командам (требуется объединять N таблиц `team_stats_*`).
- Отсутствуют поля (позиция, номер, статус, дата рождения) — пока не нужны.

Митигирующие меры:
- Авто-добавление в `team_roster` при появлении нового имени в событиях гарантирует непрерывность статистики.
- Возможность позднего «внедрения без боли»: можно добавить `players` позже и проставить surrogate ключи, не меняя уже существующие таблицы (путём backfill + mapping слой).

Рекомендация (future opt-in): если появится задача статистики по сезонам/трансферам — подготовить миграционный скрипт, формирующий `players` и связывающий `team_stats_<team_id>.player_id` с новой таблицей через mapping.

#### 2025-09-12 (Новый глобальный лидерборд goal+assist)
Добавлен эндпоинт `GET /api/leaderboard/goal-assist`:
- Источник данных: объединение всех динамических таблиц `team_stats_<team_id>`.
- Алгоритм: сбор всех игроков → вычисление `goal_plus_assist = goals + assists` → сортировка по (`goal_plus_assist desc`, `matches_played asc`, `goals desc`, `first_name asc`) → срез top N (до 50).
- Кэширование: `etag_json` (ключ `leader-goal-assist`), TTL как у других лидербордов; поддерживается SWR.
- Идемпотентная инвалидация: при финализации матча (после обновления двух команд) сбрасывается кэш через `invalidate('leaderboards','goal-assist')`.
- Преимущество: независимость от устаревшей агрегирующей таблицы `TeamPlayerStats`, мгновенное отражение статистики из командных таблиц.
- Небольшие фронтенд-правки и согласования текста:
    - `body.profile-mode` toggled при входе/выходе из профиля — устраняет отступы вокруг full-bleed фона шапки профиля.
    - Аватар в центре профиля сдвинут вниз через правило `.profile-header.profile-centered .profile-avatar { margin-top: 24px }` чтобы располагаться под декоративным элементом.
    - Устранён горизонтальный скролл: `.subtabs` ограничены по ширине внутри контейнера и full-bleed элементы пересмотрены.
    - Текст нижней навигации унифицирован — под иконкой всегда отображается «Лига», иконка визуально меняется в зависимости от выбранной лиги.
    - Согласованы подписи лиги в drawer/shelf и шаблонах (`index.html`, `static/js/profile.js`).
- Пилотный DB retry для `/api/betting/my-bets` отмечен как внедренный; задача по вынесению в централизованный helper остаётся в backlog.

### 2025-09-06 (вечер, актуализация)
        - Серверный etag_json:
            - Применён к `/api/schedule` и `/api/results` (единые заголовки, 304 поведение, core_filter).
            - `/api/match-details` переписан на etag_json с private Cache-Control, сохранён локальный TTL-кэш и форма ответа (version=etag).
            - `/api/betting/tours` переведён на etag_json с `public, max-age=300, stale-while-revalidate=300`; core_filter исключает служебные поля, учитывается только `{tours}`.
- Централизованный DB retry helper:
    - Добавлен `_db_retry_read(session, query_callable, attempts=2, backoff_base=0.1)`.
    - `POST /api/betting/my-bets` переведён на использование helper (идентичное поведение, меньше дублирования).
    - Расширено покрытие retry на чтения в leaderboards, achievements и lineups (admin/public/extended) — безопасно, без изменения формата ответов.
    - Добавлены лёгкие метрики и логирование: `_DB_RETRY_METRICS` (calls/success/failures/retries) и label для атрибуции.
    - Убрано дублирование в leaderboards: введены helpers `_lb_weekly_predictor_rows`, `_lb_all_users`, `_lb_monthly_baseline_rows` (поведение без изменений).
    ✔ Защита `/health/db-retry-metrics`: доступ только для администратора или по секретному ключу

    - Поддержаны 2 способа авторизации:
        1) HTTP-заголовок `X-METRICS-KEY` со значением `METRICS_SECRET` (env)
        2) Валидный Telegram `initData` и совпадение `user.id` с `ADMIN_USER_ID`
    - Конфигурация: переменные окружения `ADMIN_USER_ID`, `METRICS_SECRET`

Примечания по логированию (2025-09-07)
- Функция `_get_match_total_goals`: «No match found» — INFO (однократно на (home,away)), malformed score — WARNING. Это сокращает шум логов при обработке результатов без влияния на выявление аномалий.

### 2025-09-03
- Автозагрузка новостей при старте SPA: `profile.js` вызывает `loadNews()` на `DOMContentLoaded`.
- Достижения: добавлены длинные описания и кнопка «Подробнее» (`profile-achievements.js`), убраны placeholder'ы.
- Стили: `.achv-desc`, `.achv-desc-toggle`, унификация прогресс-баров достижений.
- Улучшено debug-логирование при рендеринге достижений.

Эти правки повышают UX (первый запуск быстрее воспринимается пользователем), уменьшают визуальный шум и готовят почву для дальнейшей оптимизации загрузки (интеграция splashStages в реальные точки завершения данных).
```

## ⚡ Обновление производительности (2025-09-06)

- Введён быстрый JSON-рендер на сервере (orjson) в универсальном helper `etag_json`, а также точечно в `/api/news` и `/api/stats-table`. Контракты ответов не изменены. Теперь orjson включён как обязательная зависимость (requirements), но fallback на стандартный json сохранён для dev/CI деградации.
- Лёгкие метрики ETag per-endpoint: `etag_json` собирает `requests`, `etag_requests`, `memory_hits`, `builds`, `served_200`, `served_304`, `hit_ratio`. Экспорт: `/health/etag-metrics` (admin-only, `X-METRICS-KEY` или Telegram initData), поддерживает фильтр `?prefix=leader-`.
- Пример: получить только лидеры — запрос `GET /health/etag-metrics?prefix=leader-` с заголовком `X-METRICS-KEY: $METRICS_SECRET` вернёт `by_key` с полями и `hit_ratio` по каждому ключу (`leader-top-predictors`, `leader-top-rich`, ...).
- Безопасный cap в лидербордах: `LEADERBOARD_ITEMS_CAP` (env, по умолчанию 100) — применяется к `/api/leaderboard/top-predictors`, `/api/leaderboard/top-rich`, `/api/leaderboard/server-leaders` на всех источниках (Redis snapshot / DB snapshot / in-memory cache / fresh build). Контракты не изменены.
- Добавлен заголовок `Vary: Accept-Encoding` в `after_request` для корректного кэширования при включённой компрессии (gzip/br).
- Включена фоновая очистка протухших записей in-memory кэша (`MultiLevelCache.cleanup_expired()`) каждые 5 минут — снижает риск роста памяти.
- В `etag_json` добавлена периодическая зачистка устаревших записей (sweep) — контролируемый размер локального ETag-кэша.

### 2025-09-06 (PR-2 / PR-3 статус)

- [x] PR-2: topic-based publish pipeline — реализована публикация topic-сообщений из `optimizations/smart_invalidator.py` в канал Redis `app:topic` и локальная отправка в `optimizations/websocket_manager.py`.
- [x] PR-2a: frontend flags и autosubscribe — добавлены env-флаги `WEBSOCKETS_ENABLED` и `WS_TOPIC_SUBSCRIPTIONS_ENABLED`, клиент делает pre-probe перед подключением Socket.IO и автоподписывается на `match:{home}__{away}__{date}:details` при открытии экрана.
- [x] PR-3: server-side per-topic batching/debounce — `optimizations/websocket_manager.py` получил буферизацию по топикам, агрегацию `data_patch` полей и приоритетный bypass для критичных событий (гол/красная карточка). По умолчанию debounce ≈180ms; priority>0 отправляет немедленно.

Короткие ссылки на код (локально в репозитории):
- `optimizations/smart_invalidator.py` — `publish_topic(topic,event,payload,priority=0)` и подписчик Redis теперь слушает `app:topic`.
- `optimizations/websocket_manager.py` — `emit_to_topic_batched(topic,event,data,priority,delay_ms)` и метрики `ws_messages_sent/ws_messages_batched/ws_messages_bypass`.
- `static/js/profile-match-advanced.js`, `static/js/profile-match-stats.js` — polling fallback (details 5s + ETag, stats 10-15s + ETag) и lifecycle cancellation.

Примечание: Реализация безопасна для бесплатного Render-слоя — WebSocket включается через флаги, а при выключенном WS используется ETag-подход с опросом.

План Этап 2 (безопасные улучшения):
- Подстроить TTL в `optimizations/multilevel_cache.py` для `schedule`/`results` с акцентом на снижение холодных загрузок — выполнено.
- Мягкий debounce (~250мс) на стороне сервера перед широковещательными WebSocket-патчами — реализовано (с безопасным fallback на прямую отправку).
- Привести оставшиеся тяжёлые `jsonify` к быстрому `_json_response` точечно (без изменения форматов).

## 🎨 UI/UX и стилизация

### Подходы к стилизации

1. **CSS Custom Properties (CSS Variables)**
```css
:root {
    /* UFO League Theme (default) */
    --bg: #0f1720;
    --card: #111827;
    --accent1: linear-gradient(135deg, #ffb86b, #6c8cff);
    --primary: #6c8cff;
    --transition: all 0.3s ease;
}

/* BLB League Theme */
body.blb-theme {
    --bg: #0a1128;
    --accent1: linear-gradient(135deg, #7a5f26, #eebb11);
    --primary: #eebb11;
}
```

2. **Модульная структура стилей**
- `style.css` - основные стили и темы
- `splash.css` - стили загрузочного экрана  
- `blb.css` - специфичные стили для BLB лиги
- `database-ui.css` - стили административного интерфейса

3. **Адаптивный дизайн**
```css
body {
    touch-action: manipulation; /* отключение pinch-zoom */
    padding: 16px 0 64px; /* без боковых полей */
    min-height: 100vh;
}

@media (max-width: 768px) {
    /* Оптимизация для мобильных устройств */
}
```

### Темизация
Проект поддерживает **динамическую смену тем**:
- **UFO League** (по умолчанию) - космическая тема с градиентами
- **BLB League** - золотисто-синяя корпоративная тема

### Доступность (a11y)
- Семантическая разметка HTML5
- ARIA-атрибуты для интерактивных элементов
- Контрастные цвета для текста
- Поддержка клавиатурной навигации

## ✅ Качество кода

### Системы валидации и безопасности

```python
# utils/security.py
class InputValidator:
    TEAM_NAME_PATTERN = re.compile(r'^[а-яА-Яa-zA-Z0-9\s\-_\.]{1,50}$')
    SCORE_PATTERN = re.compile(r'^\d{1,2}:\d{1,2}$')
    
    @classmethod
    def validate_team_name(cls, name: str) -> tuple[bool, str]:
        """Валидация названия команды"""
        if not name or not isinstance(name, str):
            return False, "Team name is required"
        # ... дополнительная валидация
        return True, name
```

### Обработка ошибок

```python
# utils/middleware.py
class ErrorHandlingMiddleware:
    def __init__(self, app):
        self.app = app
        self.app.register_error_handler(Exception, self.handle_exception)
    
    def handle_exception(self, e):
        """Централизованная обработка ошибок"""
        # Логирование, мониторинг, отправка уведомлений
        return jsonify({'error': 'Internal server error'}), 500
```

### Rate Limiting

```python
# utils/decorators.py
def rate_limit(max_requests: int = 100, time_window: int = 60):
    """Декоратор для ограничения частоты запросов"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Проверка лимитов через Redis
            if not rate_limiter.is_allowed(request.remote_addr, max_requests, time_window):
                return jsonify({'error': 'Too many requests'}), 429
            return f(*args, **kwargs)
        return decorated_function
    return decorator
```

### Качество JavaScript кода

- **Модульная архитектура** - разделение по файлам функциональности
- **Throttling для UI событий** - предотвращение spam-кликов
- **Централизованное управление состоянием** через глобальные объекты
- **Кэширование данных** в localStorage с TTL

## 🔧 Ключевые компоненты (обновлено)

### 1. Система ставок (Betting System)

**Назначение**: Полнофункциональная система букмекерских ставок

```python
# Пример размещения ставки
@app.route('/api/betting/place', methods=['POST'])
@require_telegram_auth()
@rate_limit(max_requests=5, time_window=60)
def api_betting_place():
    market = request.form.get('market', '1x2')  # 1x2, totals, penalty, redcard
    selection = request.form.get('selection', '')  # home, draw, away, over_X, under_X
    stake = int(request.form.get('stake', 0))
    
    # Валидация лимитов
    if stake < BET_MIN_STAKE or stake > BET_MAX_STAKE:
        return jsonify({'error': f'Ставка должна быть от {BET_MIN_STAKE} до {BET_MAX_STAKE}'}), 400
```

**API**:
- `POST /api/betting/place` - размещение ставки
- `GET /api/betting/tours` - получение доступных матчей
- `POST /api/betting/my-bets` - история ставок пользователя

### 2. Админ-панель управления составами (обновлено 2025-09-03, актуализация)

**Назначение**: Упрощенное управление составами команд через веб-интерфейс

```javascript
// static/js/admin-enhanced.js - Массовое добавление игроков (упрощённый вариант)
function updateTeamLineup(team){
    const textarea = document.getElementById(`${team}-main-lineup-input`);
    const lines = textarea.value.split('\n').map(l=>l.trim()).filter(Boolean);
    if(!lines.length){ showToast('Введите список игроков','error'); return; }
    // Валидация дублей
    const counts = lines.reduce((a,l)=>{const k=l.toLowerCase();a[k]=(a[k]||0)+1;return a;},{});
    const dups = Object.entries(counts).filter(([_,c])=>c>1).map(([k])=>k);
    if(dups.length){ textarea.classList.add('has-dup'); showToast('Дубликаты: '+dups.join(', '),'error',6000); return; }
    textarea.classList.remove('has-dup');
    currentLineups[team].main = lines.map(name => ({ name })); // только имя
    textarea.value='';
    renderLineups();
}
```

**Ключевые улучшения (актуально)**:
- Убран логотип из header админ-панели (больше рабочей площади)
- Массовый ввод составов через одиночный textarea (bulk paste)
- Только основные составы без запасных (упрощённая модель)
- Полностью удалена автоматическая нумерация (только имена)
- Inline валидация дублей (case-insensitive) + визуальная подсветка
- Toast‑уведомления вместо alert (ненавязчивый UX)
- WebSocket событие `lineups_updated` после сохранения (моментальный push)
- Публичный клиент обновляет только соответствующий матч (селективный fetch)
- Persistent roster: при сохранении матчевых составов содержимое основных составов синхронизируется в таблицу `team_roster` (добавление новых, удаление исключённых)
- Fallback логика: если у матча нет сохранённых составов — используются последние сохранённые из `team_roster`
- Новая точка `GET /api/match/lineups?match_id=...` (DB-first) для публичного клиента
- Дедупликация: имена нормализуются (trim + collapse spaces + lower) для уникальности
- Визуальное выделение проблемных строк (CSS класс `has-dup` / `dup-player`)

**API / Realtime (обновлено)**:
- `POST /api/admin/match/{id}/lineups/save` — сохранение (emit `lineups_updated` + синхронизация `team_roster`)
- `POST /api/admin/match/{id}/lineups` — получение текущих матчевых составов (с fallback к `team_roster`)
- `GET /api/match/lineups?match_id=...` — публичные составы (match-specific или fallback roster)
- `POST /api/admin/season/rollover` — сброс/переключение сезона (dry/soft/full/deep)
- `POST /api/admin/season/rollback` — откат к предыдущему сезону (dry/force), переключает active на предыдущий турнир без восстановления legacy-данных
- WebSocket: событие `lineups_updated` → клиент вызывает `GET /api/match/lineups` (DB-first, без обращения к Sheets)
- Нормализация: при сохранении имена приводятся к lower для ключей, хранится оригинальный вариант для отображения.

### 3. Многоуровневая система кэширования

**Назначение**: Снижение нагрузки на БД и Google Sheets API

```python
class MultiLevelCache:
    def get(self, cache_type: str, identifier: str = '', loader_func: Optional[Callable] = None):
        # Уровень 1: Memory cache (самые частые данные)
        if cache_type in ['league_table', 'schedule']:
            memory_data = self._get_from_memory(cache_type, identifier)
            if memory_data and not self._is_expired(memory_data):
                return memory_data['value']
        
        # Уровень 2: Redis cache (средние данные)
        if self.redis_client:
            redis_data = self._get_from_redis(cache_type, identifier)
            if redis_data:
                return redis_data
        
        # Уровень 3: Database/Sheets (загрузка данных)
        if loader_func:
            fresh_data = loader_func()
            self._set_cache(cache_type, identifier, fresh_data)
            return fresh_data
```

### 3. Telegram WebApp Integration

**Назначение**: Аутентификация и интеграция с Telegram

```javascript
// static/js/telegram-patch.js
const tg = window.Telegram?.WebApp;

// Конфигурация WebApp
tg.ready();
tg.expand();
tg.enableClosingConfirmation();

// Обработка back button для полноэкранного видео
tg.BackButton.onClick(() => {
    const streamPane = document.getElementById('md-pane-stream');
    if (streamPane && streamPane.classList.contains('fs-mode')) {
        streamPane.classList.remove('fs-mode');
        enableSwipes();
    }
});
```

### 4. Real-time обновления

**Назначение**: WebSocket-соединения для live-обновлений

```python
# optimizations/websocket_manager.py
class WebSocketManager:
    def notify_data_change(self, data_type: str, data: dict = None):
        """Уведомляет всех подключенных пользователей об изменении данных"""
        message = {
            'type': 'data_update',
            'data_type': data_type,  # 'league_table', 'match_score', etc.
            'timestamp': data.get('updated_at', ''),
            'data': data
        }
        self.socketio.emit('data_update', message, broadcast=True)

    def notify_match_finished(self, payload: dict):
        """Отправляет событие завершения матча с опциональным блоком результатов"""
        self.socketio.emit('match_finished', payload, broadcast=True)
```

#### Событие `match_finished` (новое ускорение UX)

Назначение: мгновенное распространение факта завершения матча + финального счёта и (если доступен) актуального блока результатов без дополнительного HTTP-запроса.

Откуда вызывается: после успешного `/api/match/settle` (установка `MatchFlags.status='finished'`). Сервер извлекает snapshot `results` → инлайн вкладывает в payload как `results_block`.

Пример payload:
```json
{
  "type": "match_finished",
  "home": "Team A",
  "away": "Team B",
  "score_home": 2,
  "score_away": 1,
  "results_block": {
    "results": [ { "home":"Team A", "away":"Team B", "score_home":2, "score_away":1, "date":"2025-09-11T18:30:00Z" } ],
    "updated_at": "2025-09-11T19:05:14Z",
    "version": "<etag>"
  }
}
```

Клиент (`static/js/realtime-updates.js`):
- Удаляет live-индикацию, скрывает кнопку завершения (если присутствует), убирает матч из расписания.
- Если `results_block` присутствует — кэширует `localStorage.results` и моментально перерисовывает панель «Результаты».
- Если блока нет — запускает отложенный refresh результатов (fallback).
- Всегда вызывает фоновый `refreshSchedule()` для консистентности.

Идемпотентность: повторная доставка события безопасна (перерисовка с теми же данными). Конфликт с time-based live эвристикой исключён ранней установкой флага `finished`.

Метрика (потенциал): latency от POST `/api/match/settle` до UI обновления (<500ms цель) — может собираться через расширение `ws_messages_sent`.

Edge cases:
- Отсутствие snapshot `results` → событие без `results_block` (клиент выполнит обычный fetch).
- Ошибка парсинга на клиенте → последующие регулярные механизмы (ручной переход или периодический refresh) восстановят консистентность.

### 5. Система безопасности

### 6. Подсистема новостей
Админ CRUD: `GET/POST/PUT/DELETE /api/admin/news` (Telegram initData + сравнение `ADMIN_USER_ID`).  
Публичное API: `GET /api/news?limit=5&offset=0` (кэш + ETag).  
Ключи кэша: `cache:news:limit:{L}:offset:{O}`.  
После мутации: `invalidate_pattern('cache:news')` + прогрев базового сегмента.

Пример публичного ответа:
```json
{"news":[{"id":1,"title":"Старт сезона","content":"...","created_at":"2025-09-02T10:00:00Z"}],"version":"md5hash"}
```

### 7. Сезонный deep reset
Режимы: dry (аудит), soft (лёгкая очистка кэшей), full (пересоздание сезонных данных), deep (full + чистка колонок Sheets + расширенная очистка + прогрев).  
Используются ограничения на импорт расписания (до ~300 строк) и выборочная очистка колонок B,D (минимизация потери вспомогательных данных).

### 8. Snapshot статистики
`/api/stats-table` → если snapshot найден → отдаём с ETag, иначе собираем из игроков/событий. Позволяет изолировать тяжёлую агрегацию.
 
Исправление агрегации TeamPlayerStats (2025-09-07)
- В накопителе TeamPlayerStats ключом используется реальное название команды (из матча), а не метки 'home'/'away'. Это исключает дублирование и обеспечивает корректную сезонную персистентность статистики.

### 9. ETag паттерн
Стабильная сериализация JSON (sort_keys) → md5 → `ETag` + `Cache-Control: public, max-age=120, stale-while-revalidate=60` (новости) / более длительные для статистики. Дополнительно сервер добавляет `X-Updated-At` как в 200, так и в 304, чтобы клиент мог обновить лейблы свежести без повторной загрузки тела.

### 10. Прогрев кэша
После CRUD новостей и deep reset — синхронный прогрев ключевых срезов для снижения латентности первого запроса.

**Назначение**: Комплексная защита от атак и валидация данных

```python
# utils/security.py
class TelegramSecurity:
    def verify_init_data(self, init_data: str, bot_token: str) -> Optional[Dict]:
        """Проверка подлинности данных от Telegram WebApp"""
        try:
            parsed = parse_qs(init_data)
            hash_value = parsed.get('hash', [''])[0]
            
            # Создаем строку для проверки подписи
            data_check_string = '\n'.join([f"{k}={v[0]}" for k, v in sorted(parsed.items()) if k != 'hash'])
            
            # Вычисляем HMAC
            secret_key = hashlib.sha256(bot_token.encode()).digest()
            expected_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
            
            return expected_hash == hash_value
        except Exception:
            return False
```

## 📋 Выводы и рекомендации

### Сильные стороны (актуализировано)

1. **Модульная архитектура** - хорошее разделение ответственности между компонентами
2. **Комплексная система безопасности** - rate limiting, валидация, CSRF защита
3. **Производительность** - многоуровневое кэширование, оптимизация запросов
4. **Интеграция с Telegram** - полноценная поддержка WebApp API
5. **Real-time функциональность** - WebSocket для живых обновлений
6. **Гибкая система ставок** - поддержка различных типов ставок и рынков

### Области для улучшения (расширено)

1. **Тестирование**
   ```python
   # Рекомендация: Добавить unit-тесты
   def test_betting_place():
       """Тест размещения ставки"""
       with app.test_client() as client:
           response = client.post('/api/betting/place', data={
               'market': '1x2',
               'selection': 'home',
               'stake': 100
           })
           assert response.status_code == 200
   ```

2. **TypeScript миграция** фронтенда.
3. **Документация API** (OpenAPI via apispec / flask-smorest).
4. **Структурированные логи** + корелляция запросов.
5. **CI/CD**: GitHub Actions (lint, tests, security scan).
6. **Декомпозиция app.py** на модули (news, season_reset, snapshots, auth).
7. **Валидация схем** (Pydantic / Marshmallow) вместо ручной проверки.
8. **Sanitization (bleach)** для HTML в новостях.
9. **Alembic ревизии** — зафиксировать текущую схему.
10. **Feature flags** через ENV для экспериментальных подсистем.
11. Унификация нормализации имён игроков (вынести helper вместо inline кода в endpoint сохранения составов).
12. Централизованный helper для DB retry/backoff (пилот реализован, нужно обобщить + экспоненциальную задержку).
13. Завершить замену legacy блоков match-details на `fetchMatchDetails` (поиск по репо: старые прямые fetch к `/api/match-details`).
14. Применить серверный `etag_json` к `/api/schedule`, `/api/results`, `/api/match-details`.
15. Интегрировать вызовы `splashStages.profile/data/finish` в реальные завершения загрузки модулей (achievements, schedule, results, lineups) вместо искусственного интервала.

### Уровень сложности
**Senior-friendly** - проект требует глубокого понимания:
- Архитектурных паттернов
- Систем безопасности
- Производительности и оптимизации
- Integration с внешними API
- Real-time коммуникации

### Технические долги (обновлено)

1. **Монолит app.py** ~9.6K строк.
2. **Sheets зависимость** (расписание) — нужна деградация при недоступности API + постепенная миграция в БД.
3. **Retry / backoff** для внешних сервисов отсутствует.
4. **Инвалидация кэша** — разрозненные паттерны, стоит централизовать.
5. **Нет тестового окружения** (фикстуры Redis/Sheets).
6. **Отсутствуют Alembic ревизии** (риск дрейфа схемы) — особенно для новой таблицы `team_roster` (создаётся ad-hoc).
7. **Отсутствует sanitization для новостей** (XSS риск при рендере).
8. inline DDL (CREATE TABLE IF NOT EXISTS team_roster) в обработчике — требуется вынести в миграцию.

## 🔐 Переменные окружения
| Переменная | Назначение | Обязательно |
|------------|------------|------------|
| `DATABASE_URL` | Подключение PostgreSQL | Да |
| `REDIS_URL` | Redis для кэша | Нет (fallback memory) |
| `BOT_TOKEN` | Telegram Bot токен | Да |
| `ADMIN_USER_ID` | Telegram ID супер-админа | Да |
| `GOOGLE_SHEETS_KEY`/creds | Доступ к Sheets | Да (для импорта) |
| `SEASON_RESET_LOCK_TTL` | TTL блокировки reset (опц.) | Нет |

## 🚀 Быстрый старт (актуализировано)
```bash
pip install -r requirements.txt
export DATABASE_URL=postgresql+psycopg://user:pass@host/db
export BOT_TOKEN=123:abc
export ADMIN_USER_ID=123456789
python app.py  # или gunicorn -w 1 -k geventwebsocket.gunicorn.workers.GeventWebSocketWorker wsgi:app
```

## ✅ Контроль актуальности
- News CRUD — реализовано и задокументировано.
- ETag `/api/news`, `/api/stats-table` — учтено.
- Deep reset — описан.
- Прогрев и инвалидация кэша — отражено.
- DatabaseManager (lazy) — добавлено.
- Alembic — отмечено (не инициализирован).

### Оптимизация JSON-ответов (сентябрь 2025)
- Все тяжёлые публичные и админские эндпоинты, возвращающие большие JSON, переведены на быстрый рендер через _json_response (orjson) — библиотека объявлена обязательной; fallback лишь аварийный.
- Ошибочные и мелкие ответы оставлены на jsonify для совместимости.
- Исправлены синтаксические ошибки и выравнивание try/except/finally после рефакторинга.

## 🔄 Следующие шаги (топ‑5)
1. Завершить унификацию match-details (все вызовы → `fetchMatchDetails`) и применить `etag_json` к schedule/results/match-details.
2. Вынести news / reset / snapshots / roster (lineups) из `app.py` (декомпозиция монолита).
3. Добавить bleach-sanitization контента новостей (XSS защита перед публичным рендером).
4. Инициализировать Alembic и первую ревизию (включая `team_roster`).
5. Настроить CI (lint + pytest stub) + каркас для unit тестов ставок.
6. (Связано) Централизованный DB retry/backoff helper и замена локального пилота.
7. Интеграция splashStages со стадиями фактической загрузки (убрать «фиктивный» прогресс там где возможно).

---

Документ обновлён и расширен в соответствии с текущим состоянием репозитория.

Проект демонстрирует **enterprise-уровень** разработки с акцентом на производительность, безопасность и масштабируемость.

## Быстрые приоритеты: Real-time efficiency & UX (краткое резюме)

Цель: мгновенная отзывчивость клиента при минимальной нагрузке на сервер.

Топ‑приоритеты (MVP, 1–3 недели):
- Topic-based WS subscriptions (match:{id}, team:{id}, leaderboard:{type}) — селективный broadcast.
- Redis pub/sub + per-topic routing — быстрая селективная инвалидация и нотификация.
- Delta-encoding (patches) для WS + MessagePack (опционально) — отправлять только изменённые поля.
- Server-side batching (100–250ms) для мелких frequent-ивентов + QoS (high/low).
- Client optimistic updates + rollback для операций пользователя (ставки, чек-ин).
- Observability: ETag hit ratio, WS msgs/min, median payload gen time, %304 — обязательные метрики для принятия решений.

MVP шаги:
1. Внедрить topic routing + Redis listener — минимальный набор серверных изменений.
2. Реализовать patch format и клиентское применение/фоллбек (resync по ETag при reconnect).
3. Добавить batching для match events и приоритизацию критичных событий.
4. Включить метрики и сделать канареечный rollout новых механизмов.

Критерии успеха (через 2 недели):
- Снижение WS сообщений/мин на ≥30% при стабильном workload.
- ETag cache hit ratio > 70% для основных GET.
- Median generation time payload < 150ms для критичных endpoints.

