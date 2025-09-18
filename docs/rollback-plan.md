# План отката для критических изменений

## 🔄 Стратегия rollback для проекта "Лига Обнинска"

### 1. Feature Flags (защита от регрессий)

#### Включенные feature flags:
- `feature:match_ui_store` - Подписка UI деталей матча на централизованный стор
- `feature:admin:season_reset` - Полный сброс данных сезона
- `feature:admin:order_delete` - Удаление заказов
- `feature:admin:news_delete` - Удаление новостей
- `feature:admin:team_delete` - Удаление команд
- `feature:admin:event_remove` - Удаление событий матчей
- `feature:admin:user_data_repair` - Починка пользовательских данных
- `feature:admin:force_refresh` - Принудительное обновление кэша

#### Быстрое отключение всех feature flags:
```javascript
// В консоли браузера:
Object.keys(localStorage).filter(k => k.startsWith('feature:')).forEach(k => localStorage.removeItem(k));
location.reload();
```

#### Отключение конкретного флага:
```javascript
localStorage.removeItem('feature:match_ui_store'); // отключить стор для UI деталей матча
localStorage.removeItem('feature:admin:season_reset'); // заблокировать сброс сезона
```

### 2. Откат централизованного стора (этап 1)

#### Симптомы проблем со стором:
- UI не обновляется при изменениях данных
- Дублирование состояния между модулями
- Ошибки в консоли связанные с `window.Store`, `window.MatchesStore`, etc.
- Проблемы с real-time обновлениями

#### Шаги отката:

1. **Быстрый откат через URL параметр:**
   ```
   ?ff=0  // отключает feature:match_ui_store
   ```

2. **Полный откат стора через localStorage:**
   ```javascript
   // Очистить все данные стора
   localStorage.removeItem('store:persist');
   Object.keys(localStorage).filter(k => k.startsWith('feature:')).forEach(k => localStorage.removeItem(k));
   location.reload();
   ```

3. **Откат файлов (если нужен rollback кода):**
   - Удалить файлы `static/js/dist/*.js` (скомпилированный TypeScript)
   - Откатить изменения в `templates/index.html` (убрать загрузку dist файлов)
   - Восстановить оригинальные версии модулей из git

### 3. Откат feature flags системы (этап 10)

#### Если система feature flags вызывает проблемы:

1. **Удалить подключение в templates/index.html:**
   ```html
   <!-- Закомментировать эту строку -->
   <!-- <script src="/static/js/admin-feature-flags.js?v={{ static_version }}"></script> -->
   ```

2. **Очистить перехваченный fetch:**
   ```javascript
   // В консоли браузера:
   if (window.__ADMIN_FETCH_INTERCEPTED__) {
     location.reload(); // это восстановит оригинальный fetch
   }
   ```

3. **Удалить файл admin-feature-flags.js** и перезапустить сервер

### 4. Пошаговый rollback по модулям

#### Если проблемы с конкретными модулями:

**League модуль:**
```javascript
// Отключить интеграцию со стором
localStorage.removeItem('store:league');
// Перезагрузить страницу для возврата к legacy логике
location.reload();
```

**Predictions модуль:**
```javascript
// Отключить стор для прогнозов
localStorage.removeItem('store:predictions');
localStorage.removeItem('store:odds');
location.reload();
```

**Profile модули:**
```javascript
// Отключить стор для профиля
localStorage.removeItem('store:profile');
location.reload();
```

### 5. Rollback через Render (infrastructure)

#### Откат deployment на Render:

1. **Зайти в Render Dashboard**
2. **Выбрать service "liga-obninsk"**
3. **Перейти в раздел "Deploys"**
4. **Выбрать предыдущий успешный deploy**
5. **Нажать "Redeploy"**

#### Откат через Git:
```bash
# Найти последний стабильный коммит
git log --oneline -10

# Откатиться к нему
git reset --hard <commit-hash>

# Форсированный push (ОСТОРОЖНО!)
git push --force-with-lease origin main
```

### 6. Диагностика проблем

#### Проверить состояние feature flags:
```javascript
console.table(
  Object.keys(localStorage)
    .filter(k => k.startsWith('feature:'))
    .reduce((acc, k) => { acc[k] = localStorage.getItem(k); return acc; }, {})
);
```

#### Проверить состояние стора:
```javascript
console.log('Store state:', {
  core: window.Store?.get?.(),
  matches: window.MatchesStore?.get?.(),
  league: window.LeagueStore?.get?.(),
  predictions: window.PredictionsStore?.get?.()
});
```

#### Проверить ошибки JavaScript:
- Открыть DevTools → Console
- Искать ошибки связанные с `Store`, `AdminFeatureFlags`, `fetch intercepted`

### 7. Экстренные процедуры

#### Если админ-панель недоступна:
1. Зайти через прямую ссылку: `/admin_dashboard.html`
2. Или отключить все feature flags через консоль браузера
3. Или перезапустить сервер на Render

#### Если сайт не загружается:
1. Проверить логи на Render
2. Откатить последний deploy
3. Проверить статус сервера через healthcheck endpoints

#### Если данные повреждены:
1. Проверить логи AdminLogs в админ-панели
2. Использовать backup данных (если настроен)
3. Восстановить из Google Sheets (для пользователей/команд)

### 8. Контакты и эскалация

- **Техническая поддержка**: проверить статус через админ-панель
- **Логи системы**: `/api/admin/logs` (требует авторизации админа)
- **Мониторинг**: `/healthz`, `/version`, `/features` endpoints

### 9. Чек-лист для rollback

- [ ] Определить масштаб проблемы (локальная/глобальная)
- [ ] Проверить feature flags в localStorage
- [ ] Попробовать URL параметр `?ff=0`
- [ ] Проверить консоль браузера на ошибки
- [ ] При необходимости откатить deployment на Render
- [ ] Проверить восстановление функциональности
- [ ] Документировать инцидент для будущих улучшений

---

**ВАЖНО**: Всегда сначала пробуйте быстрые методы отката (feature flags, URL параметры) перед полным rollback кода или deployment.