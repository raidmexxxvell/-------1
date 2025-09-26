(Проверка правил — ОК)

Цель: собрать структурированный набор тест-кейсов и рекомендаций для областей с наибольшей нагрузкой и критическими сценариями:
- «Детали матча» (match details)
- Реaltime / WebSocket (WS)
- Кэш-инвалидация (MultiLevelCache / SmartCacheInvalidator)
- Бизнес-процессы, связанные со ставками, расчётом результатов и статистикой (settlement, leaderboard, stats)

Кратко: этот документ содержит приоритетные тест-кейсы, предусловия, шаги воспроизведения, критерии приёмки, рекомендации по фикстурам и автоматизации, а также набор сценариев для нагрузочного тестирования.

Затронутые компоненты (основные):
- optimizations/websocket_manager.py (emit, batching, debounce)
- optimizations/multilevel_cache.py (get/set/invalidate/try_acquire)
- optimizations/smart_invalidator.py (invalidation rules, pub/sub)
- services/betting_settle.py и services/match_finalize.py (расчёт ставок)
- database/database_api.py и database/database_models.py (эндпоинты и модели)
- static/js/store/matches.ts, realtime-updates.js, etag-fetch.js (frontend bindings)
- templates/match_details и соответствующие JS модули (UI)

Соответствие roadmap: секции 1, 3, 5 и 12 (Match Details, Realtime & Caching, Betting / Settlement).

Влияние на метрики:
- Retention: 🔵 среднее — быстрые, корректные обновления live повышают удержание зрителей
- Engagement: 🔴 высокое — live-обновления и корректные лидеры влияют на активность пользователей
- Revenue: 🔴 высокое — корректность расчёта ставок и недопущение двойных начислений критичны
- Tech Stability: 🔴 высокое — инвалидация кэшей и idempotent settlement защищают от регрессий

Рекомендуемый набор тестов
--------------------------
1) Match Details — функциональные тесты (priority: high)

- TC-MD-01: Загрузка страницы деталей матча
	- Предусловие: в БД есть матч с id=XXX, заполнены составы, score и events
	- Шаги: GET /api/match/<id>/details или рендер шаблона
	- Ожидаемо: все ключевые поля (teams, score, time, events[], lineup) присутствуют; etag заголовок установлен
	- Критерий приёмки: UI/Store получает корректную структуру; HTTP 200

- TC-MD-02: Последовательность событий матча (order/duplication)
	- Предусловие: существуют 3 события для матча с последовательными timestamp
	- Шаги: получить детали, затем отправить три WS-события match_event (в том же порядке и в другом порядке)
	- Ожидаемо: итоговый events[] в store и DB отражает корректный хронологический порядок, дубликаты отфильтрованы
	- Edge cases: повторные события, события с запозданием, одинаковые timestamps

- TC-MD-03: Подмена состава (substitution) и влияние на статистику
	- Шаги: отправить событие substitution через WS, проверить что active lineup обновился
	- Ожидаемо: UI показывает замену, статистика игрока обновляется (minutes played)

- TC-MD-04: ETag + conditional fetch on stale
	- Шаги: получить match details (etag1), влить внешний патч (WS) который меняет события, выполнить conditional GET с If-None-Match=etag1
	- Ожидаемо: сервер возвращает 200 с новым etag (или 304 если не изменился). Store синхронизирован.

2) Realtime / WebSocket — интеграционные тесты (priority: high)

- TC-WS-01: Установление соединения и подписка на topic match:<id>
	- Шаги: подключиться клиентом WS (тестовый клиент), подписаться на topic
	- Ожидаемо: подтверждение подписки, heartbeat/ping работают

- TC-WS-02: Передача score patch и debounce/batching
	- Шаги: отправить 5 быстрых обновлений score за 200ms
	- Ожидаемо: WebSocketManager применяет дебаунс/батч и отправляет ограниченное число сообщений; UI получает консистентный финальный счёт
	- Acceptance: на клиент пришёл не более N пакетов (N = ожидаемая батч-логика), итоговый score соответствует последнему событию

- TC-WS-03: Отсутствие гонок при параллельных WS и ETag обновлениях
	- Шаги: одновременно отправить WS-патч и запустить ETag refetch
	- Ожидаемо: Order of events согласован (store не откатывается), нет состояния «blink»

- TC-WS-04: Авторизация и правка админ-эндпоинтов через WS/HTTP (если применимо)
	- Шаги: попытаться выполнить admin-action по WS без прав; затем с правами
	- Ожидаемо: без прав — отказ 403; с правами — действие выполнено и рассылается подписанным клиентам

3) Cache & Invalidation — unit + integration (priority: high)

- TC-CACHE-01: Простая set/get/invalidate
	- Шаги: cache.set('match:123', payload); cache.get('match:123') -> payload; cache.invalidate('match:123'); cache.get -> miss
	- Acceptance: TTLs корректно применяются, значение удалено

- TC-CACHE-02: Pattern invalidation
	- Шаги: добавить keys match:123:..., match:123:events..., вызвать invalidate_pattern('match:123:*')
	- Ожидаемо: все соответствующие ключи инвалированы

- TC-CACHE-03: try_acquire lock (thundering herd prevention)
	- Шаги: параллельные процессы вызывают try_acquire('match:123:load')
	- Ожидаемо: только один получает lock==True, остальные получают False и повторяют с backoff

- TC-CACHE-04: Cross-instance invalidation via Redis pub/sub
	- Шаги: в инстансе A вызвать invalidator.publish_topic('match_update', payload), инстанс B слушает и инвалирует локальные кэши
	- Ожидаемо: ключи в инстансе B инвалированы, WS-уведомление отправлено при необходимости

4) Bets / Settlement / Business flows — end-to-end и idempotency (priority: critical)

- TC-BETS-01: Settlement happy path
	- Предусловие: матч в live, есть ставки разного типа (win/draw/prop)
	- Шаги: перевести матч в finished, вызвать settlement pipeline (admin endpoint / background task)
	- Ожидаемо: ставки рассчитаны по правилам, балансы пользователей обновлены, транзакции в БД созданы, WS-уведомления отправлены
	- Acceptance: суммы в ledgers/transactions соответствуют рассчитанным выплатам; нет дубликатов

- TC-BETS-02: Idempotent settlement
	- Шаги: дважды вызвать settlement на одном и том же матче (или запустить параллельные задачи)
	- Ожидаемо: вторая попытка не создает дубликатов выплат/транзакций; операция либо пропускается, либо возвращает status 'already_processed'

- TC-BETS-03: Rollback / failure during settlement
	- Шаги: симулировать ошибку в середине расчёта (например, падение транзакционного блока)
	- Ожидаемо: транзакция откатывается, нет частичных выплат; логирование ошибки и retry при необходимой конфигурации

5) Statistics / Leaderboards (priority: high)

- TC-STATS-01: Пересчёт статистики после событий
	- Шаги: отправить события гол/пас/карточка; запустить stats refresh
	- Ожидаемо: leaderboard обновлён, топ N изменился согласно новым данным, ETag/Cache обновлены и отправлены WS-патчи

- TC-STATS-02: Consistency between DB and cached leaderboards
	- Шаги: создать несинхронизированное состояние (DB модифицирован вручную), вызвать invalidator и refresh
	- Ожидаемо: cache и DB консистентны

6) End-to-end сценарии (связки) — critical flows

- TC-E2E-01: Live events → UI → Settlement
	- Сценарий: гол в матче → WS event → UI и cache обновлены → матч завершён → settlement pipeline запускается → пользователи получают выплаты и уведомления
	- Acceptance: все шаги выполнены корректно и в правильном порядке; пользовательские балансы корректны

- TC-E2E-02: High-frequency patch burst
	- Сценарий: при пиковой нагрузке (10k WS событий/минута) проверить, что batching/debounce и cache locks предотвращают перегрузку и сохраняют порядковость
	- Инструменты: нагрузочное тестирование (k6 / locust) — смотреть latency, error rate, reconnects

Технические рекомендации для автоматизации тестов
------------------------------------------------
- Типы тестов: unit (pytest, fast), integration (pytest + fixtures: DB, Redis mock), e2e (playwright / Selenium + headless browser) и staging smoke tests (на render.com)
- Фикстуры и моки:
	- Flask app fixture (app, app_context, test_client)
	- DB fixture: transactional tests (rollback) или test database (Postgres) с alembic миграциями; для быстрых интеграций можно использовать sqlite + SQLAlchemy, но проверять несовместимости типов
	- Redis: fakeredis или redis-mock для pub/sub и key operations
	- WebSocket: использовать тестовый SocketIO client или мок WebSocketManager (DummyWS) для unit-тестов
	- Background tasks: запускать BackgroundTaskManager в тестовом режиме (не-daemon) и ждать завершения
- Маркеры pytest: @pytest.mark.unit, @pytest.mark.integration, @pytest.mark.e2e, @pytest.mark.slow
- Секреты и окружение: ENV переменные для режимов тестирования (TESTING=1, REDIS_URL=fake://)

Примеры файлов/структуры тестов (рекомендуется):
- tests/unit/test_multilevel_cache.py
- tests/unit/test_smart_invalidator.py
- tests/integration/test_match_details_api.py
- tests/integration/test_websocket_flow.py
- tests/e2e/test_match_live_settlement.py

Нагрузочное тестирование
-----------------------
- Минимум: k6 сценарий, который имитирует N параллельных WS-подключений и отправляет live events + HTTP запросы финиша матча
- Метрики: p95 latency, error rate, reconnect rate, CPU/Memory, Redis latency
- Цели: убедиться, что при expected_peak (по данным метрик) система не теряет событий, и settlement выполняется в пределах SLA

Edge cases и случаи для тестирования на границах
------------------------------------------------
- Частично пришедшие события (потеря пакета) — система должна корректно восстановить состояние при refetch/ETag
- Дубликаты событий (идемпотентность обработки)
- Конкурентные попытки settlement
- Failover инстанса (инстанс B принимает pub/sub invalidation) — гарантировать eventual consistency
- Большие payloads (много событий за одну пачку)

Критерии приёмки тестового пакета
---------------------------------
- Уровень покрываемости: unit + integration для всех основных функций (match details, cache, invalidator, settlement) — минимум 80% на критические модули
- Все новые unit-tests должны запускаться локально и в CI без доступа к production сервисам (использовать моки/faker)
- E2E тесты — на staging (Render) с автоматическими smoke checks

Дальше (следующие шаги и приоритеты)
----------------------------------
1. Реализовать фикстуры pytest для Flask app + DB + Redis (высокий приоритет)
2. Написать unit-tests для всех методов в optimizations/* (memory only) — уже начато (см. tests/test_multilevel_cache.py)
3. Создать integration-тесты для settlement (с тестовой БД и моком WS)
4. Настроить CI pipeline: unit → integration → staging smoke → manual approval → production deploy

Кратко о логике ДО/ПОСЛЕ (простой язык)
- ДО: Реaltime-обновления и инвалидация кэшей частично тестировались вручную; отсутствовал формализованный набор тест-кейсов для сквозных сценариев ставок и расчётов.
- ПОСЛЕ: Есть формализованный набор тест-кейсов, рекомендации по фикстурам и автоматизации, приоритеты для QA и разработчиков. Это позволит воспроизводить регрессии, защищать расчёт выплат и улучшить стабильность live-потока.

Если хотите — я могу:
- добавить шаблоны pytest-фикстур (app/redis/db) и один skeleton теста для TC-E2E-01;
- подготовить k6-сценарий для TC-E2E-02;
- или сразу добавить в репозиторий несколько тестов из списка (начнём с unit/integration).
