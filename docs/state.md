# Централизованный стор (этап 1)

Цель: единый источник истины для клиентского состояния без бандлера, на Vanilla JS. В этом этапе внедрён минимальный стор с простым реактивным API и частичной персистенцией.

## Архитектура

- Реализация: собственный лёгкий стор на событиях (subscribe/notify), без зависимостей.
- Файлы:
  - `static/js/store/core.js` — ядро стора: createStore, регистрация, персистенция (LocalStorage, TTL), экспорт в `window.Store`.
  - `static/js/store/app.js` — срез app: `ready`, `startedAt` (не персистится).
  - `static/js/store/user.js` — срез user: `id`, `name`, `role`, `flags` (persist, TTL=7d).
  - `static/js/store/ui.js` — срез ui: `activeTab`, `theme`, `modals` (частично persist, TTL=14d).
  - `static/js/store/matches.ts` — срез matches: данные матчей, события, статистика (TypeScript).
  - `static/js/store/match_stats_adapter.ts` — адаптер статистики матчей для интеграции с legacy кодом.
  - `static/js/store/match_legacy_bridge.ts` — мост между стором и существующим UI.
   - `static/js/store/match_legacy_bridge.ts` — мост между стором и существующим UI.
     - Поведение рендера статистики: если блок уже существует, мост обновляет значения и ширины существующих элементов (`.stat-fill-left/.stat-fill-right`) без пересоздания DOM. Это сохраняет «старую» анимацию, так как срабатывает CSS `transition: width ...` из legacy стилей.
 - Подключение в шаблон: `templates/index.html` использует стратегию dist-first:
   - если браузер поддерживает ES‑модули (feature-detect), базовые срезы (`dist/store/core.js`, `app.js`, `user.js`, `ui.js`) подключаются как модули (`type="module"`);
   - если модулей нет или конкретный файл dist не загрузился — пофайловый fallback на `static/js/store/*.js` (legacy);
   - дополнительные срезы (`realtime`, `league`, `matches`, `odds`, `predictions`, `shop`, `profile`) подхватываются из `dist/store/` только при поддержке модулей (их отсутствие не критично).
 - Сборка TypeScript: на этапе Render build выполняется `npx tsc -p tsconfig.json`. При отсутствии Node в окружении он устанавливается локально в build и затем запускается `tsc`. Если dist по какой-то причине не собран — приложение продолжает работать на legacy JS (fallback сохранится).

Проверка:
- В современных браузерах в DevTools → Network должны быть запросы к `/static/js/dist/store/*.js` (тип: module). В средах без модулей эти запросы отсутствуют — это означает, что активен fallback и это нормальное поведение.

## Публичный API

Общий контракт стора:
- `const s = Store.createStore(name, initialState, { persistKey?, persistPaths?, ttlMs? })`
- Методы: `s.get()`, `s.set(partial)`, `s.update(mutator)`, `s.subscribe(fn)`
- Регистрация: `Store._stores[name]` и `Store.getStore(name)`

Специализированные срезы:
- `window.AppStore` — флаги приложения
- `window.UserStore` — пользователь (persist)
- `window.UIStore` — UI (частичный persist) + удобные методы: `setActiveTab(tab)`, `setTheme(theme)`
- `window.MatchesStore` — данные матчей, события, статистика
- `window.MatchesStoreAPI` — расширенный API для работы с матчами:
  - `updateMatchStats(matchKey, stats)` — обновление статистики матча
  - `getMatchStats(matchKey)` — получение статистики матча
  - `findMatchByTeams(home, away)` — поиск матча по командам

## Статистика матчей и составы команд (обновлено)

### Единый источник истины через MatchesStore
**Проблема**: До внедрения использовались множественные источники данных:
- Локальный кэш: `mdPane.__lastRosters`, `mdPane.__lastEvents`
- Независимые fetch запросы из `profile-match-advanced.js`
- WebSocket обновления через `matchDetailsUpdate`
- MatchesStore (частично)

Это создавало рассинхронизацию — разные части системы обновлялись в разное время и перезаписывали друг друга.

### Решение: Store-Driven UI
**Статистика матча** (✅ РАБОТАЕТ):
- `match_legacy_bridge.ts` перехватывает `window.MatchStats.render` и заменяет на версию из стора
- WebSocket событие `data_patch` с `entity: 'match_stats'` → `ws_listeners.ts` → обновляет `MatchesStore`
- `match_legacy_bridge.ts` слушает изменения `MatchesStore` и автоматически рендерит статистику
- **Результат**: мгновенные обновления без fetch, отсутствие конфликтов

**Составы команд и события** (✅ РЕАЛИЗОВАНО):
- `match_legacy_bridge.ts` теперь также перехватывает `window.MatchRostersEvents.render`
- WebSocket события `data_patch` с `entity: 'match_rosters'` и `entity: 'match_events'` → обновляют `MatchesStore`
- Единый механизм обновления из стора для составов, событий и счета
- **Результат**: устранение постоянного сброса данных, стабильное отображение админ-контролов

### Архитектура обновлений
```
WebSocket Event → ws_listeners.ts → MatchesStore → match_legacy_bridge.ts → UI Update
```

**Ключевые принципы:**
1. **MatchesStore** — единственный источник истины для всех данных матча
2. **Legacy override** — перехват существующих render функций без изменения основного кода
3. **Fallback совместимость** — при отсутствии данных в сторе используется оригинальная логика
4. **Debounce защита** — предотвращение дублирования обновлений по сигнатуре изменений

### Интеграция статистики
- **Адаптер перехвата**: `match_stats_adapter.ts` перехватывает все запросы к `/api/match/stats/get` и автоматически обновляет MatchesStore
- **Кэширование**: 30-секундный кэш для предотвращения дублирования запросов
- **WebSocket интеграция**: автоматическая очистка кэша при получении `matchStatsRefresh` событий
- **Fallback совместимость**: legacy код продолжает работать без изменений

### Формат данных статистики
```typescript
interface MatchStats {
  home?: { shots_total: number; shots_on: number; corners: number; yellows: number; reds: number };
  away?: { shots_total: number; shots_on: number; corners: number; yellows: number; reds: number };
  // Альтернативный формат массивов [home, away]
  shots_total?: [number, number];
  shots_on?: [number, number];
  corners?: [number, number];
  yellows?: [number, number];
  reds?: [number, number];
}
```

### Оптимизации
- **ETag поддержка**: полная интеграция с существующей системой кэширования (API/БД)
- **Дедупликация**: предотвращение избыточных обновлений через сравнение подписей данных  
- **Реалтайм обновления**: мгновенная синхронизация при WebSocket событиях
 - **Анимация без новых классов**: анимация изменения статистики возобновлена за счёт обновления ширины существующих полос; никаких новых CSS‑классов не вводится.
- **Минимизация нагрузки**: умный кэш и условные запросы снижают нагрузку на сервер

## Персистенция

- Только whitelisted поля (`persistPaths`) сохраняются в LocalStorage
- Запись сопровождается таймштампом `__ts`, TTL проверяется при гидрации
- Безопасность: в user-хранилище не хранить секреты/токены
- **Статистика матчей не персистится** — всегда загружается свежая с сервера

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
  - Примечание (live score в расписании): карточки матчей размечены атрибутами `data-match-home`/`data-match-away`, а элемент счёта имеет класс `match-score`. Это позволяет `realtime-updates.js` (метод `updateMatchScore`) обновлять текст счёта напрямую по WS без полной перерисовки карточки и исключает мерцание «VS → 0:0 → исчез → 0:1 → исчез».

### Статистика (вкладка «Статистика» Лиги)

- Источник: `/api/leaderboard/goal-assist?limit=50` (как в legacy)
- Трансформация: в биндингах стора (`store/league_ui_bindings.ts`) ответ приводится к legacy-формату `values` — массив строк из 5 колонок: `Имя, Матчи, Голы, Ассисты, Г+П` (топ‑10 после сортировки).
- ETL: результат кладётся в `LeagueStore.stats` под ключом кэша `league:stats` (через `etag:success`).
- Рендер: `league.js:renderStatsTable()` — тот же легаси‑рендер, вызывается из подписки стора; добавлена защитная сигнатура `dataset.sig` на таблицу для устранения лишних перерисовок.
- Фича‑флаг: при `localStorage['feature:league_ui_store']='1'` `profile.js` делегирует `loadStatsTable()` на `loadStatsViaStore()` и не очищает `tbody` перед загрузкой (исключает мерцание).
  - UI bindings: `store/league_ui_bindings.ts` рендерит таблицу лиги без мигания —
    добавлена защита от лишних перерисовок через сравнение подписи первых 10 строк (`dataset.sig`).
    Кроме того, при включённом фича-флаге `feature:league_ui_store` вызов `loadLeagueTable()`
    делегируется в `loadLeagueTableViaStore()` (см. `profile.js`), чтобы не дублировать прямой рендер
    и не сбивать метку обновления. Это исключает визуальное мерцание при повторном открытии подвкладки «Таблица».

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
 - ETag адаптер: `etag-fetch.js` теперь дополнительно эмитит `window`-события `etag:success`/`etag:stale` с detail `{ cacheKey, data, etag, fromCache, updated, raw }` — это не меняет текущий API, но даёт единый канал для маппинга в стор.
 - Первый слушатель: `static/js/store/etl_listeners.ts` (dist) подписывается на `etag:success` и обновляет `LeagueStore.schedule` для `cacheKey = "league:schedule"`. Подключается опционально после базовых срезов.
 - WS событийная шина: `realtime-updates.js` эмитит `ws:connected`, `ws:disconnected`, `ws:topic_update`, `ws:data_patch`, `ws:odds` (detail — полезная нагрузка события).
 - WS слушатель: `static/js/store/ws_listeners.ts` (dist) обновляет `RealtimeStore` по событиям соединения/топиков и маппит `ws:odds` в `OddsStore` с защитой от устаревших версий.
 - WS слушатель: `static/js/store/ws_listeners.ts` (dist) обновляет `RealtimeStore` по событиям соединения/топиков, маппит `ws:odds` в `OddsStore` (с защитой от устаревших версий) и аккуратно переносит `ws:data_patch` по сущностям `match`/`match_events` в `MatchesStore` (обновление счёта и пополнение списка событий без дублей).

- shop (persist)
  - state: `{ cart: ShopCartItem[]; orders: ShopOrder[]; products: ShopProduct[]; ttl: number|null; lastCartUpdate: number|null; lastOrdersUpdate: number|null }`
  - persistPaths: `["cart","orders","ttl","lastCartUpdate","lastOrdersUpdate"]`, TTL: 14d
  - обновляется из: UI-действий и подтверждений API
  - Особенности: мигрирует старую корзину из `localStorage['shop:cart']`, поддерживает валидации, типизацию TypeScript
  - Feature flag: `localStorage['feature:shop_ui_store'] = '1'` для включения реактивного UI

- profile (no persist)
  - state: `{ achievements: Achievement[]; badges: string[]; lastUpdated: number|null }`
  - обновляется из: etag-fetch (профиль/ачивки)

- realtime (no persist)
  - state: `{ connected: boolean; topics: string[]; reconnects: number }`
  - обновляется из: realtime-updates.js (события соединения/подписки)

Примечание: конкретные типы `MatchInfo`, `MatchScore`, `PredictionItem`, `Achievement`, `ShopCartItem`, `ShopOrder` — заданы в соответствующих `.ts` и могут уточняться по мере интеграции с API.

## Лёгкий индикатор realtime-соединения

- Файл стилей: `static/css/realtime-indicator.css`
- Модуль: `static/js/store/realtime_indicator.ts` (подключается как `dist/store/realtime_indicator.js`)
- Поведение: маленькая точка в правом нижнем углу, цветом показывает состояние WS (серый — оффлайн, зелёный — онлайн). Не мешает UI, доступен для screen readers (`role="status"`, `aria-live="polite"`). Синхронизируется как со `RealtimeStore.connected`, так и напрямую с событиями `ws:connected/ws:disconnected` в средах без стора.

## Подписка UI деталей матча на MatchesStore (feature-flag)

- Модуль: `static/js/store/match_ui_bindings.ts` (подключается как `dist/store/match_ui_bindings.js`)
- Включение: поставьте в `localStorage` ключ `feature:match_ui_store` = `1`
- Что делает: когда открыт экран деталей матча (`#ufo-match-details`), модуль подписывается на `MatchesStore` и обновляет счёт в `#md-score` по изменениям из WS/ETag. События и статистика остаются под управлением текущих модулей (`profile-match-roster-events.js`, `profile-match-stats.js`) и уже обновляются мгновенно через WS (без дублирования/перерендера в сто́р-биндингах).
- Флаг теперь включается автоматически при загрузке (если нет `?ff=0`).
- Отключить можно временно через `?ff=0` в URL.

## Store → Legacy Bridge (события/статистика без fetch)

- Модуль: `static/js/store/match_legacy_bridge.ts`
- Назначение: транслировать изменения `MatchesStore` в существующие legacy механизмы без дополнительных HTTP-запросов.
  - Для вкладок «Команда 1/Команда 2»: отправляет `matchDetailsUpdate` с адаптированным полем `events` (формат `{home:[],away:[]}`) — legacy модуль `profile-match-roster-events.js` реагирует и перерасчитывает иконки.
  - Для «Статистика»: мягко переопределяет `window.MatchStats.render`, чтобы брать данные напрямую из стора (`entry.stats.home / entry.stats.away`) и не выполнять периодические fetch. Обновление происходит реактивно (debounce ~120ms) при изменении стора.
- Дедупликация: сигнатура (score + длина events + hash stats) предотвращает лишние события.
- Откат: добавить параметр `?ff=0` к URL — флаг удалится и мост не будет активирован.
- Поиск текущего матча: по текстам в `#md-home-name`/`#md-away-name` сопоставляет записи из `MatchesStore.map` и выбирает последнюю по `lastUpdated`.

## Shop интеграция со стором (Этап 5 завершен)

### Архитектура Shop стора

- **ShopStore** (`static/js/store/shop.ts`): централизованное управление корзиной и заказами
- **ShopHelpers** (глобальные функции): API для работы с корзиной, валидации, оформления заказов
- **shop_ui_bindings.ts**: реактивная интеграция UI под feature flag `feature:shop_ui_store`
- **shop_validators.ts**: клиентские валидации с TypeScript типизацией

### Ключевые возможности

1. **Миграция данных**: автоматически переносит корзину из старого формата `localStorage['shop:cart']`
2. **Персистенция**: корзина и заказы сохраняются с TTL 14 дней
3. **Валидации**: 
   - Проверка количества (1-99), цены, названий товаров
   - Лимиты корзины (максимум 50 товаров, максимальная сумма 999999)
   - Валидация при добавлении товаров и оформлении заказа
4. **Реактивный UI**: автоматическое обновление корзины, badge навигации, списка заказов
5. **API интеграция**: полная совместимость с `/api/shop/checkout` и `/api/shop/my-orders`

### Feature flag активация

```javascript
localStorage.setItem('feature:shop_ui_store', '1');
```

При включении флага:
- UI переключается на стор для управления корзиной
- Vanilla JS функции остаются как fallback
- Автоматическая миграция существующих данных
- Валидации при всех операциях

### Интеграция с существующим кодом

- **Сохранена совместимость** с `window.Shop` API из `shop.js`
- **ShopHelpers** расширяет функциональность валидациями
- **Реактивные обновления** через подписки на стор
- **Graceful degradation** при отсутствии стора

Это завершает интеграцию Shop модуля согласно roadmap этап 5.

---

## Profile Store (НОВОЕ)

Централизованное управление данными профиля пользователя с персистенцией настроек.

### Состояние

```typescript
interface ProfileState {
  // Достижения
  achievements: Achievement[];
  badges: string[];
  achievementsLastUpdated: number | null;
  
  // Данные пользователя
  user: UserProfile;
  userLastUpdated: number | null;
  
  // Настройки пользователя (персистятся)
  settings: UserSettings;
  settingsLastUpdated: number | null;
  
  // Данные команд (кэш с TTL)
  teams: TeamData;
  
  // Общие метки времени
  lastUpdated: number | null;
}
```

### Персистенция

- **persistPaths**: `["settings", "settingsLastUpdated"]`
- **TTL**: 14 дней
- **localStorage ключ**: `profile:state:v1`

Только пользовательские настройки сохраняются между сессиями. Данные профиля и достижения загружаются заново при каждом запуске.

### Ключевые возможности

1. **Унифицированное API для достижений**:
   - `updateAchievements()` — обновление списка достижений с кэшированием
   - Интеграция с `profile-achievements.js` через адаптер
   - Сохранение метаданных (тирры, прогресс, иконки)

2. **Управление пользовательскими данными**:
   - `updateUser()` — синхронизация профиля (кредиты, уровень, XP, чекины)
   - `setFavoriteTeam()` — сохранение любимой команды в настройках
   - `updateCheckin()` — обновление данных ежедневного чекина

3. **Настройки пользователя с автоперсистенцией**:
   - `updateSettings()` — изменение уведомлений, темы, языка
   - Автоматическое сохранение в localStorage
   - Восстановление при загрузке страницы

4. **Кэширование команд с TTL**:
   - `updateTeams()` — обновление списка команд с количеством болельщиков
   - `withTeamCount()` — отображение названий команд с численностью
   - `isTeamsDataFresh()` — проверка актуальности (5 минут)

5. **Интеграция чекина**:
   - `canCheckin()` — проверка возможности ежедневного чекина
   - Автоматическое обновление стора после чекина

### Feature flag активация

```javascript
localStorage.setItem('feature:profile_store', '1');
```

При включении флага подключаются адаптеры:
- `profile_achievements_adapter.js` — интеграция достижений
- `profile_user_adapter.js` — интеграция пользовательских данных  
- `profile_core_adapter.js` — координация загрузки

### Адаптеры интеграции

#### 1. Achievements Adapter
- Переопределяет `ProfileAchievements.fetchAchievements()` для работы через стор
- Кэширование достижений с TTL 30 секунд
- Реактивные обновления UI при изменении стора
- Полная совместимость с существующим UI рендерингом

#### 2. User Adapter  
- Переопределяет `ProfileUser.fetchUserData()` для работы через стор
- Кэширование пользовательских данных с TTL 1 минута
- Интеграция с выбором любимой команды
- Автоматическое обновление чекина

#### 3. Core Adapter
- Заменяет логику `ProfileCore.init()` для использования стора
- Координирует параллельную загрузку пользователя и достижений
- Генерирует события `app:data-ready` и `app:all-ready`
- Убирает дублирование кода загрузки

### Интеграция с существующим кодом

- **Обратная совместимость**: все существующие модули продолжают работать без флага
- **Graceful enhancement**: стор добавляет функциональность без ломающих изменений
- **Реактивность**: UI автоматически обновляется при изменениях в сторе
- **Персистенция**: настройки сохраняются между сессиями

### Логика ДО/ПОСЛЕ

**ДО (без стора)**:
- Данные профиля хранились в отдельных модулях (`profile-*.js`)
- Каждый модуль имел собственную логику кэширования
- Настройки не сохранялись между сессиями
- Дублирование загрузки в `profile-core.js`

**ПОСЛЕ (со стором)**:
- Единый источник истины в `ProfileStore`
- Централизованное кэширование с TTL
- Автоперсистенция настроек пользователя
- Координированная загрузка через адаптеры
- Реактивные обновления UI

Это завершает задачу **Profile унификации** согласно roadmap этап 5.

---

## Уведомления о достижениях и наградах (новое)

Цель: донести до пользователя факт разблокировки достижения и выданных наград (XP/кредиты), не нарушая текущую архитектуру (без бандлера, совместимо с Vanilla JS).

### Поток данных и поведения

- Источник данных: `/api/achievements` (ETag, If-None-Match). Клиентская логика использует существующий `etag-fetch.js` и слушает события `etag:success`.
- При нахождении вне вкладки «Профиль» выполняется редкий условный опрос `/api/achievements` с ETag. При отсутствии изменений сервер возвращает 304, сеть не нагружается. Кэш-ключ — профильные достижения (единый для модуля достижений).
- Сравнение тиров: клиент хранит локальный «базовый уровень» лучших тиров по группам достижений и при обнаружении повышения формирует «ожидающие к показу» элементы.

### Локальные ключи состояния (LocalStorage)

- `ach:best:v1` — словарь лучшего достигнутого тира по каждой группе достижений. Формат: `{ [group: string]: number /* 0..3 */ }`.
- `ach:pending:v1` — буфер элементов к показу при входе в Профиль. Формат:
  - `{ items: Array<{ group: string; tier: number; xp?: number; credits?: number; iconUrl?: string }>; ts: number }`.

Примечания:
- Эти ключи не являются «источником истины» по данным достижений — это вспомогательная прослойка для UX уведомления. Источником истины остаётся API/стор.
- TTL для этих ключей не требуется, они перезаписываются при каждом обновлении достижений.

### UI-поведение

- Вне профиля: на иконке вкладки «Профиль» отображается красная точка-индикатор (см. класс `.nav-badge--dot` в `docs/styles.md`), если в `ach:pending:v1` есть элементы.
- Вход в профиль: показывается анимация награды с заголовком и превью-изображением достижения. Суммарные XP и кредиты анимированно прибавляются, переиспользуя существующую анимацию из модуля ежедневного чек-ина.
- После показа: буфер `ach:pending:v1` очищается, `ach:best:v1` обновляется до текущих тиров.

### Изображения достижений

- По возможности берётся «реальная» иконка достижения из `static/img/achievements`. Алгоритм подбора кандидатов:
  1) `<group>-<tier>.png|svg` (например, `streak-gold.png`)
  2) `<group>-<tierName>.png|svg` (например, `streak-gold.png`, если tier → gold)
  3) `<group>.png|svg` (группа без тира)
  4) `<tier>.png|svg` (общая бронза/серебро/золото)
  5) `placeholder.png|svg`
- Кандидаты предварительно пробуются через предзагрузку изображения; используется первый успешно загруженный.

### Доступность и системные предпочтения

- Для пользователей с `prefers-reduced-motion: reduce` продолжительные анимации сокращаются до мгновенного обновления.
- Красная точка-индикатор сопровождается текстом для screen readers через ARIA-метку на родительском элементе навигации («Есть новые достижения»).

### Сеть, кэш и реалтайм

- Сеть: условные запросы (If-None-Match) с ETag минимизируют трафик (частые 304).
- Кэш: используется локальный кэш `etag-fetch.js` для `/api/achievements` и локальное сравнение тиров.
- Реалтайм: на текущем этапе WS не задействован для достижений (опционально можно добавить событие-инвалидатор в будущем).

### Логика ДО/ПОСЛЕ

- ДО: достижения не выдавали бонусы XP/кредитов; не было пользовательского уведомления о разблокировках; изображения в анимациях не показывались.
- ПОСЛЕ: сервер единожды начисляет награды при повышении тира (идемпотентно), клиент показывает индикатор «новых достижений», а при входе в профиль — анимацию с реальной иконкой достижения и анимированным увеличением XP/кредитов.

## Leaderboard Store (НОВОЕ)

### Призы: аватарки победителей

- Источник изображений: `/api/user/avatars?ids=...` возвращает структуру `{ avatars: { "<user_id>": { avatar_url: string } } }`.
- Дополнительно публичный профиль (`/api/users/public-batch`) может возвращать поле `photo_url`.
- UI «Призы» нормализует обе формы: сначала пытается взять `avatars[id].avatar_url`, затем `avatars[id].photo_url`, и только затем использует плейсхолдер `/static/img/achievements/placeholder.png`.
- Причина регрессии: после внедрения стора первоначальная ветка рендера ожидала строку URL в `avatars[id]`, в то время как API возвращает объект. Исправлено: чтение `avatars[id].avatar_url` (с fallback на `photo_url`).

Сеть/кэш:
- Запрос к `/api/leaderboard/prizes` идёт через `fetchEtag` с `cacheKey = 'lb:prizes'` (SWR 30с).
- Запрос к `/api/user/avatars` кэшируется браузером на 1 час (см. заголовки сервера), отдельного LocalStorage кэша не требуется.

Влияние:
- Tech Stability: 🔵 — устранён рассинхрон формата, UI снова стабильно показывает аватарки.
- Engagement: ⚪ — косметическое улучшение восприятия лидерборда.

Централизованное управление данными лидерборда с автоматическим polling и prefetch.

### Состояние

```typescript
interface LeaderboardState {
  // Прогнозисты (топ по винрейту)
  predictors: {
    items: LeaderboardPredictorItem[];
    lastUpdated: number | null;
    etag?: string | null;
  };
  
  // Богатство (топ по кредитам)  
  rich: {
    items: LeaderboardRichItem[];
    lastUpdated: number | null;
    etag?: string | null;
  };
  
  // Сервер (топ игроков)
  server: {
    items: LeaderboardServerItem[];
    lastUpdated: number | null;
    etag?: string | null;
  };
  
  // Призы
  prizes: {
    items: LeaderboardPrizeItem[];
    lastUpdated: number | null;
    etag?: string | null;
  };
  
  // Управление состоянием
  activeTab: 'predictors' | 'rich' | 'server' | 'prizes';
  isPolling: boolean;
  lastGlobalUpdate: number | null;
}
```

### Персистенция

- **Без персистенции** — данные лидерборда всегда свежие
- **Кэширование в памяти** с TTL 60 секунд
- **ETag поддержка** для минимизации трафика

### Ключевые возможности

1. **Типизированные данные лидерборда**:
   - `LeaderboardPredictorItem` — прогнозисты (винрейт, ставки)
   - `LeaderboardRichItem` — богатство (кредиты)
   - `LeaderboardServerItem` — топ игроков (очки, матчи)
   - `LeaderboardPrizeItem` — призы (период, победитель, сумма)

2. **Автоматическое кэширование**:
   - `updatePredictors()`, `updateRich()`, `updateServer()`, `updatePrizes()`
   - Автоматическая нумерация рангов (rank)
   - ETag-версионирование для эффективных обновлений

3. **Умный polling**:
   - Обновление только активной вкладки каждые 60 секунд
   - Приостановка при скрытии страницы (`document.hidden`)
   - Джиттер для распределения нагрузки на сервер

4. **Prefetch неактивных вкладок**:
   - Фоновая загрузка `rich`, `server`, `prizes` для быстрого переключения
   - Проверка актуальности данных перед загрузкой

5. **Управление состоянием UI**:
   - `setActiveTab()` — переключение между вкладками лидерборда
   - `setPollingState()` — контроль статуса автообновления
   - `isDataFresh()` — проверка актуальности данных

### Feature flag активация

```javascript
localStorage.setItem('feature:leaderboard_store', '1');
```

При включении флага подключаются адаптеры:
- `leaderboard_adapter.js` — интеграция с `loadLBPredictors()` и рендерингом
- `leaderboard_polling_adapter.js` — умное автообновление с джиттером

### Адаптеры интеграции

#### 1. Main Adapter
- Переопределяет `window.loadLBPredictors()`, `loadLBRich()`, `loadLBServer()`, `loadLBPrizes()`
- Реактивное обновление UI при изменениях в сторе
- Сохранение совместимости с параметрами `{ forceRevalidate, skipIfNotUpdated }`
- Автоматический рендеринг таблиц с правильными CSS-классами рангов

#### 2. Polling Adapter
- Автоматический polling активной вкладки каждые 60 секунд + джиттер
- Отслеживание переключения вкладок через DOM события
- Prefetch неактивных вкладок для мгновенного переключения
- Приостановка polling при скрытии страницы

### Интеграция с существующим кодом

- **Полная совместимость** с логикой лидерборда в `profile.js`
- **Сохранение функций** `ensureLeaderboardInit()`, polling таймеров
- **Реактивный UI** через подписки на стор
- **Умное кэширование** с проверкой актуальности

### Логика ДО/ПОСЛЕ

**ДО (без стора)**:
- Каждая вкладка лидерборда имела собственную логику загрузки в `profile.js`
- Polling и prefetch управлялись через глобальные переменные
- Дублирование кода рендеринга для каждого типа лидерборда
- Нет централизованного кэширования состояния

**ПОСЛЕ (со стором)**:
- Единый источник истины в `LeaderboardStore`
- Централизованный polling с умным управлением видимостью
- Типизированные данные с автоматической нумерацией рангов
- Реактивное обновление UI через подписки на стор
- Prefetch с проверкой актуальности данных

Это добавляет **Leaderboard унификацию** как расширение roadmap этап 5.
