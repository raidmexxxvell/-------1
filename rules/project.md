# Анализ кодовой базы: Лига Обнинска (Актуализировано)

> Дата актуализации: 2025-09-04  
> Текущая версия `app.py`: ~9750 строк (добавлен retry для my-bets, etag_json расширения, вспомогательные хелперы splashStages).  
> Последние ключевые изменения: persistent roster (`team_roster`), публичный эндпоинт lineups, частичная унификация match-details через `fetchMatchDetails`, миграция schedule/results на `fetchEtag`, числовой прогресс splash (stage API), UI фиксы горизонтального скролла, пилотный DB retry.

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
│   └── sheets.py              # Интеграция с Google Sheets
├── optimizations/             # Оптимизации производительности
│   ├── multilevel_cache.py    # Многоуровневый кэш
│   ├── background_tasks.py    # Фоновые задачи
│   ├── websocket_manager.py   # WebSocket менеджер
│   ├── smart_invalidator.py   # Умная инвалидация кэша
│   └── optimized_sheets.py    # Оптимизированная работа с Sheets
├── scripts/                   # Скрипты инициализации
│   └── init_database.py       # Инициализация БД
├── static/                    # Статические файлы
│   ├── css/                   # Стили
│   │   ├── style.css          # Основные стили
│   │   ├── blb.css            # Тема BLB League
│   │   ├── splash.css         # Стили splash-экрана
│   │   └── database-ui.css    # Стили для БД интерфейса
│   ├── js/                    # JavaScript модули
│   │   ├── profile.js         # Основной модуль профиля
│   │   ├── predictions.js     # Модуль ставок
│   │   ├── league.js          # Лига и турнирная таблица
│   │   ├── admin.js           # Админ-панель
│   │   ├── realtime-updates.js # Real-time обновления
│   │   ├── profile-*.js       # Модульные компоненты профиля
│   │   └── telegram-patch.js  # Интеграция с Telegram WebApp
│   └── img/                   # Изображения и иконки
└── templates/                 # HTML шаблоны
    ├── index.html             # Основной шаблон SPA
    └── admin_dashboard.html   # Админ-панель
```

### Принципы организации кода (актуально)

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

## 🏗 Архитектурные паттерны и новые подсистемы

Новые элементы (Q3 2025):
1. Сезонный «deep reset» (dry / soft / full / deep): расширенная очистка и пересбор данных.
2. Очистка колонок B,D расписания в Google Sheets при deep reset (строки 2..300).
3. CRUD новостей + публичный `/api/news` (кэш + ETag MD5) + прогрев.
4. Прогрев кэша после операций (новости, сезонный сброс).
5. Помощник `_get_news_session()` для плавной миграции к `DatabaseManager`.
6. Snapshot стратегия `/api/stats-table` (ETag + fallback генерация из игроков / событий).
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

### 5. Модульная JavaScript архитектура

```javascript
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

### 2025-09-04
- Splash экран: добавлен числовой индикатор прогресса (0–100%) под полосой загрузки.
- Введён stage API `window.splashStages` (profile → 70%, data → 90%, finish → 100%) + `setSplashProgress` для ручной коррекции.
- Устранён горизонтальный скролл: убраны full-bleed стили у `.subtabs`, ограничены `profile-top-area`, инсет для нижней навигации.
- UI: увеличен размер шрифта заголовка «Новости», добавлены боковые отступы нижнему меню.
- Частичная унификация match-details: обработчик в `league.js` переведён на `fetchMatchDetails` (сохранён fallback для legacy зон).
- Миграция `/api/schedule` и `/api/results` на универсальный `fetchEtag` (клиент). Серверный `etag_json` для них — в плане.
- Добавлен пилотный retry (OperationalError / SSL EOF) для `/api/betting/my-bets`: dispose engine → пересоздание сессии (основа для будущего централизованного helper).

### 2025-09-03
- Автозагрузка новостей при старте SPA: `profile.js` вызывает `loadNews()` на `DOMContentLoaded`.
- Достижения: добавлены длинные описания и кнопка «Подробнее» (`profile-achievements.js`), убраны placeholder'ы.
- Стили: `.achv-desc`, `.achv-desc-toggle`, унификация прогресс-баров достижений.
- Улучшено debug-логирование при рендеринге достижений.

Эти правки повышают UX (первый запуск быстрее воспринимается пользователем), уменьшают визуальный шум и готовят почву для дальнейшей оптимизации загрузки (интеграция splashStages в реальные точки завершения данных).
```

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
```

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

### 9. ETag паттерн
Стабильная сериализация JSON (sort_keys) → md5 → `ETag` + `Cache-Control: public, max-age=120, stale-while-revalidate=60` (новости) / более длительные для статистики.

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
