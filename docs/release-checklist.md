# Release Checklist: Лига Обнинска

## Pre-Release Testing (Staging)

### Health Checks
- [ ] `GET /healthz` — возвращает 200 и `status: "healthy"`
- [ ] `GET /version` — корректная информация о версии и features
- [ ] `GET /features` — актуальные feature flags и capabilities
- [ ] `GET /ping` — базовая доступность сервиса

### Frontend Core
- [ ] Главная страница загружается без ошибок в консоли
- [ ] Навигация между вкладками (Home, UFO, Predictions, Leaderboard, Shop, Admin)
- [ ] Отображение базовых блоков на каждой вкладке
- [ ] Централизованный стор инициализируется (проверить `window.Store` в DevTools)

### Store & Caching
- [ ] ETag кэширование работает (проверить через Network tab: 304 Not Modified)
- [ ] Состояние стора персистится (user, shop, ui) при перезагрузке
- [ ] StoreDebugger доступен админу: `StoreDebugger.toggle()`
- [ ] Cache utilities работают: `fetchEtagUtils.getCacheStats()`

### WebSocket & Real-time
- [ ] WebSocket подключение устанавливается (проверить в консоли)
- [ ] Heartbeat/ping работает (каждые 25 сек)
- [ ] Переподключение при разрыве с exponential backoff
- [ ] WS события маппятся в стор (проверить `RealtimeStore.get()`)
- [ ] Match UI обновляется в реальном времени (если включен feature flag)

### Admin Features
- [ ] Админ-панель доступна только для admin/owner роли
- [ ] Structured logging отправляется на сервер (проверить в server logs)
- [ ] Admin logger активируется автоматически для админов
- [ ] Error overlay и debug информация работают

### Performance
- [ ] TypeScript компилируется без ошибок (`npx tsc -p tsconfig.json`)
- [ ] JavaScript загружается через dist/fallback стратегию
- [ ] Нет избыточных сетевых запросов при навигации
- [ ] Память не протекает при длительном использовании

## Production Deployment

### Pre-Deploy
- [ ] Все изменения закоммичены в git
- [ ] `package.json` и `requirements.txt` актуальны
- [ ] `.gitignore` исключает `node_modules/`
- [ ] Staging tests проходят успешно

### Deploy Process
- [ ] Render.com build завершается без ошибок
- [ ] TypeScript компиляция в build script работает
- [ ] Health endpoints доступны сразу после деплоя
- [ ] Static files обновляются (проверить версионирование)

### Post-Deploy Verification
- [ ] `GET /healthz` возвращает `status: "healthy"`
- [ ] Основной функционал доступен в течение 2 минут после деплоя
- [ ] WebSocket соединения стабильны
- [ ] Нет критических ошибок в server logs
- [ ] Admin logging работает в production

## Browser Compatibility

### Desktop
- [ ] Chrome (последняя версия)
- [ ] Firefox (последняя версия)
- [ ] Safari (если доступен)
- [ ] Edge (последняя версия)

### Mobile
- [ ] Chrome Mobile (Android)
- [ ] Safari Mobile (iOS)
- [ ] Telegram WebApp (если используется)

### Feature Detection
- [ ] ES Modules support — dist files загружаются
- [ ] No ES Modules — fallback на legacy работает
- [ ] LocalStorage доступен — persistence работает
- [ ] WebSocket support — real-time функции активны

## Performance Benchmarks

### Load Time
- [ ] TTI (Time to Interactive) < 3 секунд на 3G
- [ ] First Contentful Paint < 1.5 секунд
- [ ] Cumulative Layout Shift < 0.1

### Memory Usage
- [ ] Heap size стабилен при длительном использовании
- [ ] Нет memory leaks в WebSocket connections
- [ ] Store subscriptions очищаются корректно

### Network
- [ ] Cache hit ratio > 60% для повторных посещений
- [ ] WebSocket reconnects < 3 раз за час при стабильном соединении
- [ ] ETag 304 responses для неизмененных данных

## Rollback Plan

### Quick Rollback
- [ ] Документирован процесс отката к предыдущему build на Render
- [ ] Feature flags готовы для быстрого отключения проблемных функций
- [ ] Backup данных доступен (если критично)

### Rollback Triggers
- [ ] Health checks падают > 2 минут
- [ ] Error rate > 5% в течение 5 минут
- [ ] Memory usage > 80% постоянно
- [ ] WebSocket disconnect rate > 50%

## Sign-off

**Tested by:** _________________ **Date:** _________________

**Approved by:** _________________ **Date:** _________________

**Deployed by:** _________________ **Date:** _________________

---

## Emergency Contacts

- **Primary:** [Owner contact]
- **Secondary:** [Admin contact]
- **Platform:** Render.com support

## Useful Commands

```bash
# Check health
curl https://your-app.onrender.com/healthz

# Check version
curl https://your-app.onrender.com/version

# Check features
curl https://your-app.onrender.com/features

# TypeScript compilation
npx tsc -p tsconfig.json

# Cache stats (in browser console)
fetchEtagUtils.getCacheStats()

# Store debugging (in browser console)
StoreDebugger.toggle()
StoreDebugger.logState()
```