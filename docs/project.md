# Анализ фронтенд кодовой базы: Лига Обнинска

## 📁 Структура проекта

Схематичное дерево (до 3-го уровня):

- app.py — основной Flask-приложение, REST/WS API, шаблоны и статика
- wsgi.py — entrypoint с ранним gevent monkey-patch
- render.yaml — конфигурация деплоя на Render
- requirements.txt — зависимости Python
- api/
  - admin.py — административные эндпоинты (логирование, операции с заказами, матчи)
  - betting.py — ставки и рынки
  - monitoring.py, security_test.py — мониторинг/безопасность (blueprints)
- database/
  - database_api.py — API-роуты для новой БД-схемы
  - database_models.py — ORM-модели SQLAlchemy
  - database_schema.sql — SQL-схема
- optimizations/
  - multilevel_cache.py — многослойный кэш (in-memory/Redis)
  - websocket_manager.py — менеджер событий WS (topic-based + batching)
  - optimized_sheets.py, background_tasks.py — синхронизация и фоновые задачи
- services/
  - shop_helpers.py — магазин (каталог, нормализация корзины)
  - betting_settle.py, match_finalize.py, snapshots.py — доменная логика
- static/
  - css/ — глобальные стили, темы, splash
  - js/ — крупный набор модулей Vanilla JS по фичам (profile-*, league, predictions, realtime, etag-fetch и т.д.)
  - img/ — ассеты (логотипы лиг, иконки, фоны профиля)
- templates/
  - index.html — основной интерфейс SPA (Vanilla JS), подключение всех модулей
  - admin_dashboard.html — административные экраны
- utils/ — валидаторы, middleware, метрики, (исторически) интеграции с внешними источниками данных
- docs/ — документация (текущий файл)

Назначение директорий:
- templates — серверные шаблоны Jinja, в основном единственная страница `index.html` работает как «SPA на скриптах» без сборщика.
- static/js — модули фронтенда разбиты по фичам (профиль, прогнозы, таблицы, лидеры, магазин, real-time и т.д.).
- static/css — глобальные стили и темы на CSS-переменных, без препроцессоров.
- api, services, database, optimizations — серверные слои API/домен/ORM/оптимизации, данные для фронта приходят из этих эндпоинтов.

Принципы организации кода:
- Feature-based (по фичам): множество модулей `profile-*`, `match-*`, `predictions-*`, `shop.js`, `league.js` и т.д.
- Горизонтальная «плитка» функциональных модулей, без явного сборщика/фреймворка компонентов.
- Общие утилиты вынесены отдельно (`etag-fetch.js`, `helpers.js`, `match-utils.js`, `team-utils.js`).

## 🛠 Технологический стек

- Фреймворк: Flask 2.3.3 (сервер) + Vanilla JavaScript (клиент)
- Языки: Python 3.12 (сервер), JavaScript (ES6+), HTML, CSS
- Реалтайм: Socket.IO (клиент 4.7.2 через CDN) + flask-socketio 5.3.6
- БД: PostgreSQL (SQLAlchemy 2.x), Alembic
- Кэш/очереди: Redis (через собственный multilevel cache), in-memory батчинг WS
- Сериализация: orjson (сервер), JSON на клиенте + ETag
- Деплой: Render (gunicorn + geventwebsocket worker), wsgi.py с ранним monkey-patching
- Сборка фронтенда: отсутствует (без Webpack/Vite), статическая раздача файлов из `static/`
- CSS: чистый CSS, дизайн через CSS Custom Properties (темы), без Sass/Less/Tailwind
- Управление состоянием: локально в модулях + LocalStorage (SWR/ETag кэш), in-memory структуры (Map)

Основные зависимости (по requirements.txt — сервер):
- flask, flask-compress — бэкенд и gzip/br-сжатие
- flask-socketio, python-socketio — realtime-канал
- SQLAlchemy, alembic — БД и миграции
- psycopg[binary] — драйвер PostgreSQL
- orjson — быстрая JSON-сериализация для ответов
- gspread, google-auth — (исторические) зависимости для админ‑импорта/экспорта; клиентская часть и публичные эндпоинты работают только от БД
- gevent, gevent-websocket — worker для WS
- redis — кэш и pub/sub (в рамках оптимизаций)

Версии клиентских библиотек:
- Socket.IO client 4.7.2 (подключается через CDN в шаблоне)

Инструменты сборки/развертывания:
- Без JS-бандлера. Деплой через Render с gunicorn-командой и gevent websocket worker.
- Подключение фронтенд-скриптов: шаблоны используют стратегию "dist-first" для файлов стора (`/static/js/dist/store/*.js`) с резервным падением на легаси (`/static/js/store/*.js`) при отсутствии собранных файлов. Это позволяет постепенно включать TypeScript без поломки существующего кода.
 - Render build: во время деплоя запускается компиляция TypeScript (`npx tsc -p tsconfig.json`) с выводом в `static/js/dist`. Подключение `dist` происходит как ES‑модули (`type="module"`), при отсутствии поддержки модулей автоматически используется fallback на legacy. Проверить можно в DevTools → Network: должны появляться запросы к `/static/js/dist/store/*.js`.

## 🏗 Архитектура

Подход к компонентной архитектуре (клиент):
- Без фреймворка компонентов. UI размечен в `index.html` блоками «вкладок» и «подвкладок» (табов), логика подключается через специализированные модули.
- Каждый модуль инкапсулирует собственные функции рендеринга/загрузки/обработки UI. Примеры: `league.js` (таблица/статистика/расписание), `profile-*.js` (профиль, достижения, лайв-скоры, события), `predictions.js`, `shop.js`.

Паттерны разделения логики:
- Утилиты для сети и кэша: `etag-fetch.js` реализует SWR-подобный подход с ETag/If-None-Match и LocalStorage.
- Реалтайм слой: `realtime-updates.js` инкапсулирует Socket.IO, с topic-based подписками, батчингом событий и локальным версионированием коэффициентов.
- Хелперы DOM/отрисовки: `league.js` использует batchAppend и виртуализацию туров/матчей для плавного рендеринга.

Пример: SWR + ETag fetch (5–10 строк)

```js
// Использование утилиты SWR/ETag (сторонний код: static/js/etag-fetch.js)
fetchEtag('/api/leaderboard/predictors', {
  cacheKey: 'lb:predictors',
  swrMs: 60000,
  extract: j => j.items || []
}).then(({ data, updated }) => {
  if (updated) renderPredictors(data);
});
```

Управление состоянием приложения:
- Без централизованного сторинга. Состояние хранится в:
  - in-memory структурах модулей (Map, простые объекты) — например, `RealtimeUpdater.oddsVersions`, `MatchState` в `league.js`;
  - LocalStorage для кэшей и отметок пользователя (например, голосования, результаты ETag).
- Для интеракций между модулями используются события DOM (CustomEvent) и глобальные объекты, экспортируемые в `window.*` (например, `window.League`, `window.__VoteAgg`).

Организация API-слоя и работа с данными:
- HTTP REST с ETag и Cache-Control; ответы часто содержат `version` (ETag) и `updated_at` для клиента.
- Важные публичные эндпоинты: таблица, статистика, расписание/результаты, детали матча, ставки, магазин.
- Реалтайм-канал WS: события `data_patch`, `topic_update`, `match_finished`, `live_update` с минимальными патчами и идентификаторами сущностей.

Паттерны роутинга и навигации:
- SPA с табами: переключение вкладок через классы и `display:none` в DOM (см. `index.html`).
- Fallback-навигация (`nav-fallback.js`) активируется на некоторых WebView, если основной код не инициализировался.

Обработка ошибок и loading-состояний:
- Простой текстовый лоадер и скелетоны блоков.
- Ошибки сетевых запросов в `etag-fetch.js` возвращают кэш (если есть), иначе пробрасывают исключение.
- Админ-оверлей ошибок подключается динамически только для владельца (по Telegram user id) через `error-overlay.js` (см. вставку в шаблоне).

## 🎨 UI/UX и стилизация

- Подход к стилизации: чистый CSS, дизайн построен на CSS Custom Properties (`:root` и альтернативная тема `body.blb-theme`).
- Нет внешней дизайн-системы; присутствует общий визуальный язык: карточки, «панели лиги», подтабы, таблицы.
- Адаптивность: mobile-first, контейнер фиксирует ширину до 600px; off-canvas панели/полки, ориентационный оверлей с медиа-запросами.
- Темизация: через переключение классов на `body` и использование переменных. Основная тема «UFO», вторичная — «BLB».
- Доступность (a11y): используются aria-атрибуты в модальных диалогах (`aria-modal`, `role="dialog"`), `aria-live` для новостей; при этом нет системной проверки фокуса/ловушек фокуса — есть потенциал для улучшений.

## ✅ Качество кода

- Линтеры/форматтеры: в репозитории не обнаружены конфигурации ESLint/Prettier/Stylelint для фронтенда.
- Соглашения: имена модулей по фичам, единый нейминг `profile-*`, `match-*`, `league`, `helpers`, `*_utils`. Внутри модулей стиль в целом единообразен.
- TypeScript: не используется.
- Тесты: юнит/интеграционные/e2e тесты для фронтенда отсутствуют.
- Документация в коде: у ключевых утилит присутствуют JSDoc-комментарии (например, `RealtimeUpdater`), у многих модулей — короткие заголовки/комментарии.

Вывод: фронтенд — зрелая Vanilla JS кодовая база без сборщика. Ключевой акцент — производительность рендеринга и экономия сети.

## 🔧 Ключевые компоненты

1) etag-fetch.js — SWR + ETag локальный клиентский кэш
- Назначение: минимизировать запросы и трафик; поддержка If-None-Match и LocalStorage для свежих данных.
- Мини-API: `fetchEtag(url, { cacheKey, swrMs, extract, headers, params, forceRevalidate }) → { data, etag, fromCache, updated }`.
- Пример (8 строк):
```js
fetchEtag('/api/schedule', {
  cacheKey: 'league:schedule',
  swrMs: 30000,
  extract: j => (j.tours || j?.data?.tours || [])
}).then(({ data }) => renderSchedulePane(data));
```
- Зависимости: стандартный fetch, LocalStorage.

2) realtime-updates.js — RealtimeUpdater (Socket.IO)
- Роль: подключение WS, reconnect с backoff, топиковые подписки, патчи данных, версия коэффициентов.
- Основные методы: `initSocket()`, `setupEventHandlers()`, `handleDataPatch()`, `refresh*`, `subscribeTopic(topic)`.
- Пример (фрагмент 12 строк):
```js
this.socket.on('data_patch', (patch) => {
  const { entity, id, fields } = patch || {};
  if (entity === 'odds') {
    const { home, away, date } = typeof id === 'string'
      ? (() => { const [h,a,d]=id.split('_'); return {home:h, away:a, date:d}; })()
      : (id || {});
    const incomingV = fields?.odds_version ?? null;
    if (incomingV != null && incomingV > this._getOddsVersion(home, away))
      this._setOddsVersion(home, away, incomingV);
    this.refreshBettingOdds({ homeTeam: home, awayTeam: away, date, odds: { ...(fields||{}) } });
  }
});
```
- Интеграции: серверные события `data_patch`, `topic_update`, localStorage (инвалидация кэшей), DOM события.

3) league.js — рендер лиги, виртуализация и батчинг DOM
- Роль: отрисовка таблиц/статы, расписания и карточек матчей; batched append; виртуализация туров.
- Пример (фрагмент 12 строк):
```js
function batchAppend(parent, nodes, batchSize = 20) {
  let i = 0;
  function step() {
    if (i >= nodes.length) return;
    const frag = document.createDocumentFragment();
    for (let k = 0; k < batchSize && i < nodes.length; k++, i++)
      frag.appendChild(nodes[i]);
    parent.appendChild(frag);
    (window.requestAnimationFrame || window.setTimeout)(step, 0);
  }
  step();
}
```
- Зависимости: утилиты `team-utils.js`, `match-utils.js`, глобальный `window.MatchState`, `window.__VoteAgg`.

4) nav-fallback.js — аварийная навигация вкладок
- Назначение: обеспечить переключение вкладок на «капризных» WebView, если основной код не поднялся.
- Пример (8 строк):
```js
const nav = document.querySelectorAll('.nav-item');
nav.forEach(it => {
  it.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    it.classList.add('active');
    const tab = it.getAttribute('data-tab');
    ['home','ufo','predictions','leaderboard','shop','admin','profile']
      .forEach(id=>{ const el = document.getElementById('tab-'+id); if (el) el.style.display = (tab===id?'':'none'); });
  }, { passive:true });
});
```

5) profile-* (достижения, лайв-матч, события)
- Модули семейства `profile-*.js` организуют экран профиля, check-in, бэйджи, live-данные по матчу, админ-панели матча.
- Общие зависимости: те же утилиты сети/кэша, WS-уведомления, рендер таблиц.

6) admin-transfers.js — система управления трансферами игроков
- Роль: полный цикл управления переводами игроков между командами в административной панели.
- Функции: поиск по всем командам, накопление переводов в очереди, пакетное сохранение, автоматическое создание новостей.
- API интеграция: `/api/admin/players/transfer` (единичный перевод), `/api/admin/transfers/news` (создание новости).
- Управление данными: обновление `team_roster` и динамических таблиц `team_stats_<id>` с сохранением статистики игроков.
- Пример использования (админ-панель → Управление игроками):
  - Поиск игрока по имени во всех командах
  - Добавление перевода в очередь (игрок → новая команда)
  - Пакетное сохранение всех переводов с созданием новости о трансферах
- Интеграция с `admin-enhanced.js` через глобальный объект `window.TransferManager`.

## 🧩 Паттерны и best practices

- Сеть/кэш:
  - SWR + ETag, опциональный If-None-Match → 304, возврат последних данных из кэша при оффлайне/ошибке.
  - Локальные ключи кэша по фичам: `league:schedule`, `lb:predictors`, `voteAgg:...`.
- Реалтайм и поведение UI:
  - Topic-based подписки (feature-flag), батчинг WS-событий и сглаживание нагрузки (delay_ms при эмитах на сервере).
  - Версионирование odds с фильтрацией устаревших патчей.
  - Мягкая инвалидация кэшей и точечные рефетчи по событиям (`match_finished`, `match_events`).
- Рендеринг и производительность:
  - Постраничная/частичная отрисовка: batchAppend, requestAnimationFrame/requestIdleCallback.
  - Виртуализация туров (держать ограниченное число DOM-блоков одновременно).
  - Ленивая загрузка изображений и декодирование (`loading=lazy`, `decoding=async`).
- Асинхронность и отказоустойчивость:
  - Экспоненциальный backoff при reconnect WS.
  - Защитные try/catch вокруг не-критичных участков (DOM, localStorage, JSON parse).
- Валидация данных:
  - На клиенте — минимальная (стабильность рендера, проверка типов), на сервере — строгая (decorators: validate_input и т.д.).
- Локализация:
  - Интерфейс на русском; инфраструктуры i18n нет (потенциал улучшения).

## 🧰 Инфраструктура разработки

- package.json: отсутствует (нет нодовых зависимостей/бандлера).
- Среда разработки: чистый Flask static + CDN; для продакшна — Render (autoDeploy), gunicorn+gevent-websocket.
- CI/CD: явно не настроен (кроме авто-деплоя Render), pre-commit hooks не обнаружены.
- Docker: в репозитории не найден.

## 📋 Выводы и рекомендации

Сильные стороны:
- Производительная отрисовка: батчинг/виртуализация, минимизация reflow.
- Экономия сети: ETag/SWR, точечные WS-патчи, версионирование данных.
- Простая эксплуатация: без бандлера, статическая раздача, чистая архитектура модулей по фичам.
- Хорошая интеграция с серверной оптимизацией (кэш-инвалидатор, topic-based WS, gzip/br).

Зоны роста:
- Отсутствуют линтеры/форматтеры и типизация — повысить надёжность с ESLint + Prettier; опционально TypeScript (миграция поэтапно).
- Тестирование фронтенда отсутствует — добавить быстрые unit-тесты для утилит (`etag-fetch`, форматтеры дат) и smoke-тесты рендера.
- A11y: улучшить фокус-ловушки в модалках, клавиатурную навигацию, aria-метки для интерактивных элементов.
- Статика: собрать критические модули под один бандл (Vite) с code splitting для больших страниц; снизить число <script> в шаблоне.
- Наблюдаемость: ввести лёгкий клиентский логгер ошибок (Sentry/otel) для продакшна.
- i18n: предусмотреть инфраструктуру локализации (keys + простой runtime-слой).

Уровень сложности проекта: middle → senior friendly
- Для поддержки и фичевой доработки достаточно уверенного уровня JS/DOM/сети.
- Для оптимизаций и WS-интеграций — ближе к senior.

Короткий план улучшений (влияние):
- 🔵 ESLint + Prettier конфигурация (tech stability)
- 🔵 Smoke-тесты утилит и рендера «таблица/расписание» (tech stability)
- 🔵 Витой бандл core-скриптов (Vite) с code splitting «admin/predictions/profile» (engagement, perf)
- ⚪ A11y фокус/ролевая семантика в модалках (retention)
- ⚪ Локализация ключевых строк (retention)

---

Примеры кода взяты из текущей кодовой базы: `static/js/etag-fetch.js`, `static/js/realtime-updates.js`, `static/js/league.js`, `templates/index.html`.

## ℹ️ Примечания по бэкенду (кратко)
- Flask + SQLAlchemy, PostgreSQL; ETag на многих ответах; gunicorn + geventwebsocket; Render autoDeploy.
- Topic-based WebSockets управляются через `optimizations.websocket_manager.WebSocketManager`.

## ✅ Краткая «quality gates» сводка
- Build фронтенда: не требуется (статическая раздача). PASS
- Линт/типизация: отсутствуют — рекомендованы к добавлению. N/A
- Тесты фронтенда: отсутствуют — рекомендованы к добавлению. N/A
- Смоук-проверка: шаблон `index.html` ссылается на существующие скрипты. PASS

Requirements coverage:
- Обзор структуры, стек, архитектурные паттерны, стилизация, качество кода, ключевые компоненты с кодом, best practices, инфраструктура — Done.

## 📷 Поток аватаров пользователя (UserPhoto)

- Клиент при входе вызывает `/api/user` с Telegram initData (через `profile-*.js`).
- Декоратор `require_telegram_auth` валидирует initData и кладёт данные в `flask.g.auth_data`.
- Обработчик `/api/user` зеркалирует `photo_url` в таблицу `user_photos` (upsert по `user_id`).
- Эндпоинты `/api/user/avatars` и `/api/users/public-batch` читают `photo_url` из `user_photos` для отображения на «Призы» и в оверлеях.

Изменение: обработчик теперь берёт `photo_url` из `g.auth_data` (fallback — из локального `parsed`), чтобы запись гарантированно создавалась при авторизации через декоратор.
