# Протокол WebSocket патчей: Лига Обнинска

## Обзор

Все WS события обрабатываются через систему централизованного стора с защитой от гонок версий.

Unified Topic Scheme:
- По умолчанию используется схема топиков без даты (`no_date`):
  - `match:{home}_{away}__details` — обновления деталей матча (счёт, события, статистика)
- Альтернативная схема с датой (`with_date`) может быть включена конфигурацией сервера, тогда топик включает компонент даты:
  - `match:{home}_{away}__{YYYY-MM-DD}__details`
Клиент и сервер обязаны использовать одну и ту же схему. Значение схемы прокидывается с сервера в шаблон и доступно в `window.__WS_TOPIC_SCHEME__`.

## События соединения

### `ws:connected`
```javascript
{
  reconnects: number  // количество предыдущих переподключений
}
```

### `ws:disconnected`
```javascript
{
  reason: string  // причина отключения
}
```

### `ws:reconnect_scheduled`
```javascript
{
  attempt: number,   // номер попытки
  delay: number      // задержка в мс
}
```

## Патчи данных

### 1. Odds Updates (Коэффициенты)

**Событие:** `ws:odds`

**Структура:**
```javascript
{
  homeTeam: string,
  awayTeam: string,
  date: string,           // YYYY-MM-DD
  key: string,            // альтернативный ID (homeTeam_awayTeam_date)
  odds_version: number,   // ОБЯЗАТЕЛЬНО для версионирования
  odds: {
    value: number         // новое значение коэффициента
  } | number             // упрощенный формат
}
```

**Правила версионирования:**
- Патч применяется ТОЛЬКО если `odds_version > current_version`
- При равной версии — игнорируется (защита от дубликатов)
- При отсутствии версии — считается как 0

**Пример:**
```javascript
// Успешное обновление
{
  homeTeam: "Спартак",
  awayTeam: "Зенит",
  date: "2025-09-20",
  odds_version: 15,
  odds: { value: 2.45 }
}

// Игнорируется (старая версия)
{
  homeTeam: "Спартак",
  awayTeam: "Зенит", 
  date: "2025-09-20",
  odds_version: 14,    // < 15
  odds: { value: 2.20 }
}
```

### 2. Match Data Patches (Данные матчей)

**Событие:** `ws:data_patch`

**Структура для счета:**
```javascript
{
  entity: "match",
  id: {
    home: string,
    away: string,
    date?: string
  },
  fields: {
    score_home?: number,
    score_away?: number
  }
}
```

**Структура для событий:**
```javascript
{
  entity: "match_events",
  id: {
    home: string,
    away: string,
    date?: string
  },
  fields: {
    events: [
      {
        t?: number,           // время в минутах
        kind?: string,        // тип события (goal, card, etc.)
        team?: string,        // команда
        side?: "home"|"away", // сторона
        teamName?: string     // название команды
      }
    ]
  }
}
```

**Удаление событий:**
```javascript
{
  entity: "match_events_removed",
  // ... аналогично match_events
  fields: {
    events: []  // пустой массив = очистка
  }
}
```

### 3. Topic Subscriptions (Подписки на темы)

**Событие:** `ws:topic_update`

**Структура:**
```javascript
{
  topic: string,      // имя темы
  channel?: string    // альтернативное поле
}
```

**Стандартные темы:**
- `global` — глобальные обновления
- `match:{home}_{away}__details` — конкретный матч (по умолчанию schema=no_date)
- `match:{home}_{away}__{YYYY-MM-DD}__details` — конкретный матч при schema=with_date
- `league:table` — таблица лиги
- `user:{user_id}` — пользовательские данные

## Heartbeat протокол

### Ping/Pong
- Клиент отправляет `ping` каждые 25 секунд
- Сервер отвечает `pong` в течение 5 секунд
- При таймауте pong → принудительное отключение

**Ping:**
```javascript
socket.emit('ping', { timestamp: Date.now() })
```

**Pong:**
```javascript
socket.on('pong', (data) => {
  // data может содержать серверные метрики
})
```

## Обработка ошибок

### Стратегия переподключения
- Максимум 8 попыток переподключения
- Экспоненциальный backoff: 1s → 2s → 4s → 8s → 16s → 30s (макс)
- Случайный jitter ±30% для предотвращения thundering herd
- После максимума попыток → остановка автоподключения

### События ошибок
```javascript
// Таймаут максимальных попыток
'ws:max_reconnects_reached' {
  attempts: number
}

// Ошибка соединения
'connect_error' {
  error: Error
}
```

## Мониторинг и debug

### Debug режим
Включается через: `localStorage.setItem('websocket_debug', 'true')`

**Логирование:**
- Все ping/pong события
- Детали переподключений с таймингами
- Применение/отклонение патчей odds
- Статистика версий

### Метрики в RealtimeStore
```typescript
{
  connected: boolean,     // текущий статус
  topics: string[],       // активные подписки
  reconnects: number      // счетчик переподключений
}
```

## Гарантии и ограничения

### Гарантии
✅ **Порядок версий odds** — старые версии игнорируются  
✅ **Идемпотентность** — повторная отправка того же патча безопасна  
✅ **Автовосстановление** — переподключение с экспоненциальным backoff  
✅ **Heartbeat** — обнаружение мертвых соединений  

### Ограничения
⚠️ **Нет гарантии доставки** — патчи могут быть потеряны при разрыве  
⚠️ **Нет буферизации** — состояние восстанавливается только через HTTP API  
⚠️ **Один активный патч** — параллельные обновления одного матча могут конфликтовать  

## Лучшие практики

### Для сервера
1. Всегда указывать `odds_version` в патчах odds
2. Инкрементировать версию при каждом изменении
3. Отправлять патчи только при реальном изменении данных
4. Группировать мелкие изменения в батчи

### Для клиента  
1. Полагаться на HTTP API для начального состояния
2. Использовать WS только для обновлений
3. При разрыве соединения — принудительная перезагрузка критичных данных
4. Логировать отклоненные патчи в debug режиме