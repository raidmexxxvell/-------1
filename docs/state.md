# Централизованный стор (этап 1)

Цель: единый источник истины для клиентского состояния без бандлера, на Vanilla JS. В этом этапе внедрён минимальный стор с простым реактивным API и частичной персистенцией.

## Архитектура

- Реализация: собственный лёгкий стор на событиях (subscribe/notify), без зависимостей.
- Файлы:
  - `static/js/store/core.js` — ядро стора: createStore, регистрация, персистенция (LocalStorage, TTL), экспорт в `window.Store`.
  - `static/js/store/app.js` — срез app: `ready`, `startedAt` (не персистится).
  - `static/js/store/user.js` — срез user: `id`, `name`, `role`, `flags` (persist, TTL=7d).
  - `static/js/store/ui.js` — срез ui: `activeTab`, `theme`, `modals` (частично persist, TTL=14d).
 - Подключение в шаблон: `templates/index.html` использует стратегию dist-first:
   - последовательно загружаются базовые срезы (`dist/store/core.js`, `app.js`, `user.js`, `ui.js`) с пофайловым fallback на `static/js/store/*.js`;
   - затем опционально подхватываются дополнительные срезы из `dist/store/` (realtime, league, matches, odds, predictions, shop, profile) без ошибок, если их пока нет.
 - Сборка TypeScript: на этапе Render build выполняется попытка `npx tsc -p tsconfig.json` при наличии Node; если Node недоступен, приложение продолжает работать на legacy JS, а dist будет пустым (fallback сохранится).

## Публичный API

Общий контракт стора:
- `const s = Store.createStore(name, initialState, { persistKey?, persistPaths?, ttlMs? })`
- Методы: `s.get()`, `s.set(partial)`, `s.update(mutator)`, `s.subscribe(fn)`
- Регистрация: `Store._stores[name]` и `Store.getStore(name)`

Специализированные срезы:
- `window.AppStore` — флаги приложения
- `window.UserStore` — пользователь (persist)
- `window.UIStore` — UI (частичный persist) + удобные методы: `setActiveTab(tab)`, `setTheme(theme)`

## Персистенция

- Только whitelisted поля (`persistPaths`) сохраняются в LocalStorage
- Запись сопровождается таймштампом `__ts`, TTL проверяется при гидрации
- Безопасность: в user-хранилище не хранить секреты/токены

## Интеграция с существующим кодом (дальше по roadmap)

- Сеть/кэш: в `etag-fetch.js` добавить хуки `onSuccess`, `onStale` и диспатчить в соответствующие сторы (league/matches/predictions) — в следующих задачах
- Реалтайм: `realtime-updates.js` публикует события в стор — последующий этап
- Модули UI: замена локальных Maps на чтение из стора и подписки (по частям, под фича-флагом)

## Влияние на метрики

- Tech Stability: 🔴 — единый источник истины снижает баги синхронизации и разъезды состояний
- Engagement: 🔵 — предсказуемые обновления и отсутствие «миганий» при перезагрузках вкладок
- Retention: ⚪ — косвенное влияние через стабильность
- Revenue: ⚪ — без прямого эффекта

## Обновление документации

При добавлении новых срезов (`league`, `matches`, `odds`, `predictions`, `shop`, `profile`, `realtime`) дополняйте этот документ: поля, persistPaths, TTL, события обновления, точки интеграции (HTTP/WS).

---

## Новые срезы состояния (TS)

- league (no persist)
  - state: `{ table: any[]; stats: any[]; schedule: { tours: any[]; lastUpdated: number|null; etag?: string|null } }`
  - обновляется из: etag-fetch (schedule/table/stats), WS патчи

- matches (no persist)
  - state: `{ map: Record<string, { info: MatchInfo|null; score: MatchScore|null; events: MatchEvent[]; lastUpdated: number|null }> }`
  - обновляется из: etag-fetch (детали матча), WS события (голы, карточки, таймер)

- odds (no persist)
  - state: `{ map: Record<string, { value: number; version: number; lastUpdated: number }> }`
  - ключи: `"<matchId>|1x2|home|draw|away"`, `"<matchId>|totals|over|<line>"`, `"<matchId>|totals|under|<line>"`, `"<matchId>|penalty|yes|no"`, `"<matchId>|redcard|yes|no"`
  - `<matchId>` формируется как `home_away_YYYY-MM-DD`
  - обновляется из: etag-fetch (предикшены) + WS патчи (схема версионирования обязательна)

- predictions (no persist)
  - state: `{ items: PredictionItem[]; myVotes: Record<string, any>; ttl: number|null }`
  - items: массив карточек доступных рынков по матчам (`{ id, matchId, market: 'available', options: [...] }`)
  - обновляется из: etag-fetch (списки), локально: кэш myVotes с TTL (перезапрос по истечении)

Интеграция ETag/WS → Store (сводка):
- predictions.js теперь при загрузке `/api/betting/tours` обновляет OddsStore и PredictionsStore
- realtime-updates.js диспатчит `bettingOddsUpdate` для мгновенного обновления UI; последующая интеграция в OddsStore возможна (под фича-флаг)
 - realtime (store) будет получать события соединения/подписок и отражать их в состоянии (`connected`, `topics`, `reconnects`) для дальнейших подписок UI (этап 1. адаптеры интеграции)

- shop (persist)
  - state: `{ cart: ShopCartItem[]; orders: ShopOrder[]; ttl: number|null }`
  - persistPaths: `["cart","orders","ttl"]`, TTL: 14d
  - обновляется из: UI-действий и подтверждений API

- profile (no persist)
  - state: `{ achievements: Achievement[]; badges: string[]; lastUpdated: number|null }`
  - обновляется из: etag-fetch (профиль/ачивки)

- realtime (no persist)
  - state: `{ connected: boolean; topics: string[]; reconnects: number }`
  - обновляется из: realtime-updates.js (события соединения/подписки)

Примечание: конкретные типы `MatchInfo`, `MatchScore`, `PredictionItem`, `Achievement`, `ShopCartItem`, `ShopOrder` — заданы в соответствующих `.ts` и могут уточняться по мере интеграции с API.
