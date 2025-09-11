# Roadmap проекта **Liga Obninska** — Расширённая и Нормализованная версия

> Полная, структурированная дорожная карта — готовый к использованию файл для docs/roadmap.md

---

## 🧭 Легенда статусов

* ✅ — выполнено
* 🟨 — частично / в процессе
* ⬜ — запланировано

**Приоритет влияния**

* 🔴 — высокое влияние
* 🔵 — среднее влияние
* ⚪ — низкое влияние

> Примечание: легенда сохранена из исходных материалов — используется везде в документе.

---

## Краткое резюме проекта

Liga Obninska — веб-приложение для футбольной лиги с системой ставок, Telegram WebApp, real-time компонентами, PostgreSQL + Redis, SPA на JavaScript.

---
## 📁 Актуальная структура проекта

```
├── app.py                      # Основное Flask-приложение (монолит)
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
├── services/                  # Сервисный слой (бизнес-логика)
│   ├── adv_lineups.py
│   ├── betting_helpers.py
│   ├── betting_service.py
│   ├── betting_settle.py
│   ├── match_finalize.py
│   ├── snapshots.py
├── static/                    # Статические файлы
│   ├── css/                   # Стили
│   ├── img/                   # Изображения и иконки
│   └── js/                    # JavaScript модули
├── templates/                 # HTML шаблоны
│   ├── index.html             # Основной шаблон SPA
│   └── admin_dashboard.html   # Админ-панель
├── docs/                      # Документация
│   ├── project.md             # Карта проекта, история изменений
│   └── roadmap.md             # Дорожная карта (этот файл)
├── db_indexes.sql             # Индексы для БД
```

---

Этот документ представляет собой компактную и расширенную дорожную карту, основанную на аудите кода и истории изменений. Он содержит целевые задачи, детализированные шаги реализации, зависимости, критерии приёма, тест-кейсы и предложения по rollout/канареечным запускам.

---

# Содержание

1. Техническая оптимизация (критично)
2. Real-time & UX
3. API, документация и контракты
4. Безопасность и валидация
5. Мониторинг и наблюдаемость
6. Управление командами и матчами
7. Кэш, инвалидация и background jobs
8. Монетизация: подписки
9. Геймификация и социальные функции
10. Quality gates и тестирование
11. Зависимости между задачами
12. Acceptance criteria и чеклисты
13. Процесс внедрения (план релиза)
14. Приложения: примеры конфигов, полезные сниппеты

---

## 1. 🛠️ Техническая оптимизация (критично)

### Описание

Раздел объединяет всё, что касается архитектурной декомпозиции, стабильности, производительности и подготовки к масштабированию.

### 1.1 Оптимизация БД: индексы и предотвращение N+1 — 🔴

* Статус: ⬜
* Цель: уменьшить время ответа критичных запросов и количество лишних запросов.

Шаги:

1. Собрать профили запросов (slow queries, top-N by time) из production/стейдж, используя pg\_stat\_statements или логинг.
2. Добавить индексы по часто фильтруемым колонкам (bet.user\_id, match.date, match.status, player.id, leaderboard.user\_id и т.д.).
3. Исправить N+1 в ORM-слое: применять selectinload / joinedload (SQLAlchemy) или явные JOINs.
4. Использовать bulk inserts/updates для массовых операций (миграция итогов матчей, пересчёт stats).
5. Создать Alembic ревизии: отдельно для каждого DDL изменения.

Критерий приёма:

* Время выполнения критичных запросов снизилось (фиксируйте baseline до изменений).
* Отсутствует массовое использование N+1 в отчетах линтера SQL.

---

### 1.2 Централизованный retry & транзиентная устойчивость — 🔵

* Статус: 🟨 (пилот для /api/betting/my-bets внедрён)
* Что сделать: создать db/retry.py helper с exponential backoff и метриками (метрики для мониторинга: attempts, failures, last\_error). Внедрить в критичные чтения (leaderboards, achievements, my-bets).

Критерий приёма:

* Retry работает для известных transient ошибок; логи показывают попытки и метрики.

---

## 2. ⚡ Real-time & UX

### 2.1 Topic-based WebSocket routing и batching — 🔵

* Статус: 🟨 (инфраструктура topic routing и batched emit реализованы)

Ключевые компоненты:

* websocket\_manager.emit\_to\_topic\_batched(topic, payload) — буферы per-topic.
* Redis pub/sub канал app\:topic для мульти-инстансных публикаций.
* Клиентская логика: подписка на match:{id}\:details и patch/apply/resync.

Patch формат (контракт):

```
{ type: patch|full, topic: match:123, v: 42, fields: { score: 1:0, odds: ... } }
```

Edge-cases:

* Out-of-order patches — клиент игнорирует если v старее.
* Burst protection — hard cap на размер patch; при превышении отправлять full.

Критерий приёма:

* Патчи приходят и применяются корректно. При reconnect — resync через etag\_json.

---

### 2.2 Немедленные live-обновления в match-details — 🔵

* Статус: ✅ (реализовано событие `match_finished` + инлайн results_block)
* При загрузке match-details клиент автоматически подписывается. Если WS недоступен — fallback poll 5s / 10-15s с ETag.

Дополнение (2025-09-11):
* Событие `match_finished` доставляет финальный счёт и опционально `results_block` (актуальный snapshot результатов) ⇒ исключён лишний HTTP fetch.
* Ручное завершение матча сразу снимает live‑метку и скрывает кнопку «Завершить матч».
* При отсутствии блока результатов клиент выполняет отложенный refresh (safety fallback).
* Прежняя эвристика time-window больше не может «возродить» live‑статус: установлен флаг MatchFlags.status.

Критерий приёма:

* Обновление счёта и исчезновение кнопки <500ms после admin action.
* 0 дополнительных запросов за результатами при наличии `results_block`.
* При потере пакетов клиент делает full resync через существующие механизмы.

---

### 2.3 UI/UX мелкие улучшения

* Splash stages — интеграция stage API в реальные загрузки.
* Убрать мерцание счёта, оптимизировать анимации.
* Тёмная тема: базовая поддержка + переключатель в профиле (сохранение в localStorage).

---

## 3. 📚 API, документация и контракты

### 3.1 OpenAPI / Swagger — 🔵

* Задача: автоматическая генерация спецификации API, единый формат ответов { status, data, error }.

Реализация:

* Использовать flask-smorest или apispec с Marshmallow/Pydantic схемами.
* Экспонировать /docs для интерактивной проверки.

Критерий приёма:

* Поля ответа согласованы; фронтенд проходит с ожидаемыми схемами.

---

## 4. 🔐 Безопасность и валидация

### 4.1 Централизованные декораторы и middleware — 🔵

* Что: require\_auth, require\_admin, rate-limiter middleware, input sanitization.
* Валидация: перенос валидации payload на уровень схем (Marshmallow/Pydantic).
* Sanitization: использовать bleach для контента новостей/описаний.

Критерий приёма:

* Публичные endpoint'ы валидируются, XSS риск снижен, логирование не размещает PII.

---

## 5. 📡 Мониторинг и наблюдаемость

### 5.1 Метрики ETag/WS/кэш

* Внедрено: сбор etag\_requests, etag\_hits, memory\_hits, payload\_build\_ms, ws\_messages\_sent, ws\_messages\_batched.
* Экспорты: /health/etag-metrics (admin-only), /health/perf (admin-only).

Критерий приёма:

* Метрики доступны в JSON; пороговые алерты настроены.

---

## 6. ⚽ Управление командами и матчами

### 6.1 Lineups и persistent roster — 🔵

* Реализовано: captain lineups, team\_roster таблица, дедупликация.
* План: Alembic миграция для team\_roster и единый helper нормализации имён.

### 6.2 Экспорт в Google Sheets — 🔵

* DB-first endpoint GET /api/match/lineups?match\_id=... реализован.
* Экспорт: split ФИО, сопоставление Player.id, сортировка.

### 6.3 Rollover сезона — 🔵

* POST /api/admin/season/rollover с dry-run, soft/deep, pre/post snapshots, rate-limit и логом аудита.
* Фоновые прогревы кэша после rollover.

Критерий приёма:

* Rollover выполняется корректно; можно откатить dry-run; основные кэши инвалированы.

---

## 7. 🧠 Кэш, инвалидация и background jobs

### 7.1 Multilevel cache (Redis + in-memory LRU) — 🔴

* Что сделать: заменить process-local caches на Redis-backed multilevel cache. Использовать smart\_invalidator и pub/sub события: match\:update, news\:mutate, bets\:new.

### 7.2 Precompute / Background snapshots — 🔵

* Precompute leaderboards и heavy payloads (запись в Redis). Фоновые задачи обновляют payload каждую LEADER\_PRECOMPUTE\_SEC.

### 7.3 Инвалидация и паттерны

* Ввести central registry для invalidate\_pattern → publish via Redis.

Критерий приёма:

* Корректная инвалидация после write-операций; отсутствие рассинхронизации.

---

## 8. 🛍️ Монетизация: подписки (4 уровня)

* Статус: план — ⬜
* Структура: Free / Basic / Mid / Premium. Поля в User: subscription\_level, daily\_bet\_limit.
* Требуется: middleware для проверки лимитов, флаги доступа, подготовка к биллингу (ЮKassa).

Критерий приёма:

* Уровни доступа работают, лимиты применяются корректно.

---

## 9. 🎮 Геймификация и социальные функции

* Достижения: аналитик недели, марафонец, верный болельщик — precompute и background начисления.
* Комментарии: simple comments таблица с базовой модерацией.
* Мини-команды и викторины: lightweight features for retention.

Критерий приёма:

* Автоматическое начисление достижений; уведомления приходят через Telegram WebApp.

---

## 10. 🧪 Quality gates и тестирование

* Требования CI: flake8/ruff, unit tests на сервисы, integration tests для Redis pub/sub и WS batching.
* Smoke тесты: critical endpoints, rollover, leaderboards, betting flow.
* Manual QA: flow for match-details (admin update → client update), offline/WS fallback.

---

## 11. Зависимости между задачами

1. Рефакторинг приложения — первый шаг; облегчает внедрение кэша, миграций и тестов.
2. Оптимизация БД и Кэш — выполнять совместно (индексы ↔ инвалидация patterns).
3. Документация API — параллельно с рефакторингом, готова до фронтенд-работ.
4. Real-time — контрактные изменения должны быть согласованы.

---

## 12. Acceptance criteria и чеклисты

Сводный релиз-чеклист:

* [ ] Все критичные unit тесты и smoke-запросы проходят.
* [ ] Метрики latency/caching показывают улучшение по выбранным сценарием.
* [ ] OpenAPI доступен по /docs и соответствует контрактам.
* [ ] WS patch/ full flow протестирован (unit + integration).
* [ ] Alembic-маршруты созданы для всех DDL изменений.
* [ ] Инвалидация кэша в продакшене не приводит к рассинхронизации.

## Вложения и дополнительные материалы

* docs/project.md — история изменять на актуальную информацию после каждой выполненной задачи.