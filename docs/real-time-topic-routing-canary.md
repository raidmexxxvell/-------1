# Topic-based WebSocket routing, batching и canary rollout — план и задачи

Дата: 2025-09-06

Кратко: этот документ описывает практический план внедрения topic-based подписок для WebSocket, server-side batching (debounce/aggregation), delta/patch‑формат сообщений, и безопасный canary-rollout с минимальными изменениями в API.

## Цели
- Уменьшить число широковещательных WS сообщений при активном трафике на матчах.
- Отправлять только релевантные патчи (delta) подписанным клиентам по топикам: `match:{id}`, `team:{id}`, `leaderboard:{type}`.
- Ввести безопасный canary для бинарной сериализации (MessagePack) и delta-формата для 5% клиентов.
- Добавить минимальный набор метрик для оценки эффекта (WS msg/min, %304, ETag hit ratio, median payload gen time).

## Короткий контракт (inputs/outputs, error modes)
- Input: внутренняя нотификация об изменении сущности (например, match.update с payload полей). Источник: DB hook / background task / admin action.
- Output: одно или несколько WS сообщений по topic-каналам, со структурой:
  - full: {type: 'full', topic: 'match:123', v: 42, payload: {...}}
  - patch: {type: 'patch', topic: 'match:123', v: 43, fields: {score: '1:0', odds: {...}}}
- Error modes: недоставленные сообщения (client offline) — клиенты должны при reconnect запрашивать full state с If-None-Match.
- Success: клиент применил patch и версия согласована (v полей >= локальной).

## Статус реализации (2025-09-06)

- [x] PR-2 выполнен: `optimizations/smart_invalidator.py` публикует topic-сообщения в Redis канал `app:topic` и вызывает локально `websocket_manager.emit_to_topic`.
- [x] PR-2a выполнен: клиентские флаги `WEBSOCKETS_ENABLED` и `WS_TOPIC_SUBSCRIPTIONS_ENABLED` добавлены, frontend делает pre-probe и автоподписывается на топик `match:{home}__{away}__{date}:details` при открытии match-details.
- [x] PR-3 выполнен: `optimizations/websocket_manager.py` содержит per-topic буферы и `emit_to_topic_batched` с агрегацией `data_patch` полей, deep-merge для полей patch, и priority bypass (priority>0 отправляется немедленно). Дефолтный debounce: 180ms.

Изменённые файлы (локально):
- `optimizations/smart_invalidator.py` — publish_topic, Redis `app:topic` handling.
- `optimizations/websocket_manager.py` — emit_to_topic_batched, topic buffers, metrics.
- `app.py` — админ-эндпоинты (score/events/stats) вызывают `publish_topic(...)` после коммита.
- `static/js/profile-match-advanced.js`, `static/js/profile-match-stats.js` — polling fallbacks (5s / 10-15s) и lifecycle cancellation; `static/js/team-utils.js` — унифицированный загрузчик логотипов.

Next steps (recommended):
- Добавить админ‑эндпоинт `/health/perf` (admin-only) для экспорта `ws_messages_sent/ws_messages_batched/ws_messages_bypass` и других метрик.
- Подготовить unit-тесты для батчинга и интеграционные тесты для Redis pub/sub (CI run).
- Планировать канареечный rollout MessagePack/delta (5% клиентов) после валидации метрик.

## Критерии приёмки
- Снижение количества WS сообщений/min ≥ 30% в пилотных матчах (после batching). (метрика)
- Корректность UI: нет регрессий при reconnect и при race conditions (optimistic updates rollback работает).
- Canary: бинарная сериализация работает у 5% клиентов без ошибок и с улучшением пропускной способности.

## Высокоуровневые шаги (микро‑таски)
1. Topic routing infrastructure (backend)
   - [ ] В `optimizations/websocket_manager.py` добавить registry для топиков и map topic->rooms.
   - [ ] Добавить API: subscribe(topic), unsubscribe(topic) для Socket.IO namespace (в `app.py` existing socket handlers).
   - [ ] При отправке нотификаций заменять широковещание на `socketio.emit(event, data, room=topic)`.
   - Срок: 1–2 дня

2. Redis pub/sub per-topic invalidation
   - [ ] В `optimizations/smart_invalidator.py` расширить формат событий: `{event:'match:update', topic:'match:123', payload:{...}}`.
   - [ ] При публикации события на одном экземпляре, другие подпишутся и вызовут `websocket_manager.emit_to_topic(...)`.
   - Срок: 1 день

3. Server-side batching / debounce (MVP)
   - [ ] В `optimizations/websocket_manager.py` реализовать per-topic debouncer: buffer изменений 100–250ms, затем агрегировать в один patch и отправить.
   - [ ] Логика агрегирования: объединять поля, последняя версия v = max(vs).
   - Edge: если buffer содержит full-request (recompute full), отправить full вместо patch.
   - Срок: 1–2 дня

4. Patch format + client apply/rollback
   - [ ] Утвердить формат: {type:'patch'|'full', topic, v, fields}
   - [ ] Обновить `static/js/realtime-updates.js`:
     - subscribe/unsubscribe по топику;
     - applyPatch(fields) с version check;
     - on reconnect, call fetch with If-None-Match for topic.
   - Срок: 1–2 дня

5. Canary rollout для MessagePack / delta
   - [ ] Добавить feature-flag в `app.py` и client (localStorage flag + server-side header `X-RT-FEATURES` or cookie).
   - [ ] Canary selection: server assigns MessagePack to random 5% of connected clients (or based on persistent user id hash).
   - [ ] For canary: server encodes WS messages as MessagePack; client detects and decodes.
   - Safety: keep JSON fallback for non-canary clients.
   - Срок: 2–3 дня

6. Метрики и /health/perf
   - [ ] Добавить счётчики: ws_messages_sent, ws_messages_dropped, etag_hits, etag_misses, payload_build_ms histogram.
   - [ ] Экспорт в `/api/monitoring` или `/health/perf` (admin-only via `X-METRICS-KEY`).
   - Срок: 1–2 дня

## Детали реализации и местоположения кода
- Backend files:
  - `optimizations/websocket_manager.py` — core: topic registry, debouncer, emit_to_topic(room).
  - `optimizations/smart_invalidator.py` — pub/sub publishing, now include topic string in messages.
  - `app.py` — socket event handlers: subscribe/unsubscribe; feature-flag handling; hook to publish internal events (wrap existing ws.notify_patch_debounced).
  - `optimizations/multilevel_cache.py` — optional: maintain cached full state per topic for fast full responses.

- Frontend files:
  - `static/js/realtime-updates.js` — subscribe(topic), applyPatch, fetch-on-reconnect using `fetchEtag`.
  - `static/js/match-details-fetch.js` — integrate topic subscribe for live match updates.

## Маленькие контракты / API примеры
- Socket subscribe request (from client):
  - emit `subscribe` with payload `{topic: 'match:123'}`; server joins room `match:123`.
- Server patch example (JSON):
  - {type: 'patch', topic: 'match:123', v: 43, fields: {score: '1:0', events: [{t:78, type:'goal', player_id:123}]}}
- MessagePack: тот же объект, сериализованный через msgpack-lite; клиент должен уметь различать (например, Content-Type meta in first bytes or negotiation via `X-RT-ENC: msgpack`).

## Проверки и тесты (smoke)
- Unit tests:
  - emulation теста `notify_patch_debounced` — убедиться, что несколько быстрых вызовов приводят к одной отправке.
- Integration:
  - запустить two local instances (or simulate via two namespaces), publish event on instance A, verify B emits to topic room subscribers.
- Manual QA checklist:
  - подписаться на `match:ID`, вызвать серию обновлений (score, odds) → убедиться что клиент получил 1–N агрегированных сообщений; проверить версионность;
  - отключить canary → убедиться что JSON fallback работает.

## Edge cases
- Out-of-order patches: всегда держать `v` поле и игнорировать старые версии;
- Large bursts: поставить hard cap на размер агрегированного patch; если превышен — отправлять full snapshot;
- Offline clients: при reconnect, client запрашивает full state через existing `etag_json` endpoint.

## Минимальный план релиза / canary
1. Implement topic routing + subscribe/unsubscribe (backend + client) — internal smoke.
2. Implement debouncer + batching for non-critical events; enable for a small subset of events (odds/score low-priority) — monitor ws_messages_sent.
3. Add MessagePack canary (5%): select via hash(user_id) % 100 < 5 — safe, deterministic.
4. Monitor metrics for 48–72 hours; rollback if error rate or reconcilation issues > 1%.

## Next steps — что я могу сделать сейчас
- [ ] Создать PR с первым патчем: topic subscribe/unsubscribe + `emit_to_topic` и minimal client hooks (safe, non-breaking).
- [ ] Подготовить PR для `smart_invalidator` формат расширения и пример publish usage.
- [ ] Добавить basic metrics counters и `/health/perf` patch (admin-only) для первичного измерения.

Если желаете, выполняю следующую конкретную задачу прямо сейчас: выбрать один из пунктов из "Next steps" и реализовать (создать файл(ы)/патч/PR-ready изменения).

## Focus: instant match-details updates (score & in-detail stats)

Goal: ensure a user viewing `match-details` receives immediate score and in-detail statistics updates when an admin updates them, without page reload or tab-switch.

Design notes:
- Topic name: `match:{id}:details` — clients subscribe on open, unsubscribe on close.
- Message types: `patch` (small updates) and `full` (snapshot for resync).
- Priority events (goal, red card) bypass debounce and are sent immediately; lower-priority stat updates are batched 100–250ms.
- Server publishes change via Redis: `{event:'match:update', topic:'match:{id}:details', payload:{fields, v, priority}}` and `websocket_manager` relays to room.

Server tasks (small incremental PRs):
1. Ensure `websocket_manager` supports `emit_to_topic(topic, data, immediate=False)`.
2. Add handling in `smart_invalidator` to forward `match:update` to `websocket_manager.emit_to_topic`.
3. Mark high-priority fields (score, goals, match_status) to bypass debounce.
4. Add server-side unit test: multiple quick updates → only one aggregated patch unless priority flag present.

Client tasks:
1. On `match-details` load, call `socket.emit('subscribe', {topic: 'match:{id}:details'})`.
2. Apply incoming `patch` with version check; if older/skip detected, fetch full via `fetchMatchDetails` with If-None-Match.
3. Show transient toast for important events (goal) and animate score update.

QA criteria:
- Score update visible <500ms for priority events.
- Batching reduces messages during bursts (measure in metrics).
- Resync fallback works and doesn't cause UI thrash.

Notes: this is an implementation-focused extension of the roadmap item; no code changes are made here yet — document only. When ready, I can create PRs for each server/client task above.
