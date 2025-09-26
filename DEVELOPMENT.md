# 🚀 Руководство по разработке - Лига Обнинска

## 📋 Краткое описание

Это приложение представляет собой полнофункциональную систему управления футзальной лигой с поддержкой:
- Прогнозов и ставок
- Админ панели
- WebSocket соединений в реальном времени  
- Системы достижений
- Магазина и лидерборда

## 🛠️ Быстрый старт

### 1. Настройка окружения

```powershell
# Используйте встроенный инструмент
.\dev-tools.ps1 setup

# Или вручную:
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
npm install
```

### 2. Настройка базы данных

1. Скопируйте `.env.example` в `.env`:
   ```powershell
   copy .env.example .env
   ```

2. Отредактируйте `.env` файл:
   - `DATABASE_URL` - строка подключения к PostgreSQL
   - `ADMIN_USER_ID` - ваш Telegram ID для админ доступа
   - `ADMIN_PASSWORD` - пароль для локальной админ панели

### 3. Компиляция TypeScript

```powershell
.\dev-tools.ps1 build
# или
npm run build
```

### 4. Запуск сервера

```powershell
.\dev-tools.ps1 run
# или
python .\run-websocket.py
```

### 5. Вход в админ панель

- Откройте `http://localhost:5000/admin/login`
- Логин: ваш `ADMIN_USER_ID` 
- Пароль: ваш `ADMIN_PASSWORD`
- После входа в основном приложении появится вкладка "Админ"

## 🔧 Инструменты разработки

### PowerShell скрипт `dev-tools.ps1`

```powershell
.\dev-tools.ps1 help      # Показать справку
.\dev-tools.ps1 setup     # Настройка окружения
.\dev-tools.ps1 run       # Запуск сервера
.\dev-tools.ps1 build     # Компиляция TypeScript
.\dev-tools.ps1 status    # Git статус
.\dev-tools.ps1 commit    # Быстрый коммит
.\dev-tools.ps1 backup    # Создание бекапа
```

## 📁 Структура проекта

```
├── app.py                    # Основное Flask приложение
├── config.py                 # Конфигурация приложения
├── run-websocket.py          # WebSocket сервер для разработки
├── static/js/                # Frontend JavaScript/TypeScript
│   ├── dist/store/          # Скомпилированные store модули
│   ├── store/               # Исходники TypeScript store
│   └── local-admin-auth.js  # Локальная админ аутентификация
├── templates/               # HTML шаблоны
├── api/                     # API эндпоинты
├── database/                # Модели и схема БД
├── utils/                   # Утилиты и хелперы
└── optimizations/           # Кеширование и оптимизации
```

## 🏗️ Архитектура

### Backend (Python/Flask)
- **Flask 2.3.3** - веб фреймворк
- **SQLAlchemy 2.0** - ORM для работы с БД
- **Flask-SocketIO** - WebSocket поддержка
- **eventlet** - асинхронный WSGI сервер
- **psycopg** - драйвер PostgreSQL

### Frontend (TypeScript/JavaScript)
- **Nano Stores** - состояние приложения
- **Socket.IO Client** - WebSocket клиент
- **TypeScript** - типизированный JavaScript
- Модульная store-архитектура

### База данных
- **PostgreSQL** - основная БД
- Многоуровневое кеширование
- Real-time обновления через WebSocket

## 🔐 Система аутентификации

### Двойная аутентификация
1. **Telegram WebApp** - основная (для продакшена)
2. **Cookie-based** - для локальной разработки

### Админ права
- Проверка через `ADMIN_USER_ID` в конфигурации
- API эндпоинт `/api/admin/status` для верификации
- Автоматическая симуляция Telegram WebApp контекста

## 📊 Мониторинг и отладка

### Логи
- Подробное логирование всех операций
- Отслеживание медленных запросов (>1000ms)
- WebSocket события в реальном времени

### Отладочные инструменты
- Error overlay для фронтенда
- Store debugger в DevTools
- Real-time индикатор соединения

## 🚀 Развертывание

### Локальная разработка
```powershell
.\dev-tools.ps1 run
```

### Продакшн готовые скрипты
- `run-production.py` - продакшн сервер
- `start-production.ps1` - Windows служба
- `render.yaml` - конфигурация для Render.com

## 📝 Соглашения коммитов

```
🚀 feat: новая функциональность
🔧 fix: исправление бага  
📊 perf: оптимизация производительности
🎨 style: изменения стилей/UI
📝 docs: обновление документации
🔄 refactor: рефакторинг кода
✅ test: добавление тестов
🔒 security: безопасность
```

## 🆘 Решение проблем

### Ошибки TypeScript
```powershell
.\dev-tools.ps1 build
```

### Проблемы с WebSocket
- Проверьте что используется `run-websocket.py` 
- Убедитесь что eventlet установлен
- Проверьте логи на наличие ошибок подключения

### Отсутствие админ прав
- Проверьте `ADMIN_USER_ID` в `.env`
- Используйте `/admin/login` для входа
- Убедитесь что `local-admin-auth.js` загружается

### Медленная БД
- Проверьте индексы в `db_indexes.sql`
- Оптимизируйте запросы через логи SLOW REQUEST
- Используйте кеширование

## 🔗 Полезные ссылки

- **Локальный сервер**: http://localhost:5000
- **Админ панель**: http://localhost:5000/admin/login  
- **API документация**: `/docs/api-coverage.md`
- **Техническая документация**: `/docs/detail.md`

---

*Создано: 26 сентября 2025*  
*Последнее обновление: новый Git репозиторий*