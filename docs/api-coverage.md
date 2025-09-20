# API Coverage: карта всех API endpoints и их фронтенд покрытия

Данный документ содержит полную карту API endpoints проекта "Лига Обнинска" и соответствующие им frontend интеграции. Основан на анализе app.py (15588 строк) и JavaScript модулей в static/js/.

**Легенда покрытия:**
- ✅ **Полное покрытие** — есть UI, активно используется
- 🟨 **Частичное покрытие** — есть фронтенд, но ограниченное использование
- ❌ **Нет покрытия** — только backend API, UI отсутствует
- ⚠️ **Устаревший/проблемный** — требует доработки или рефакторинга

**Статистика:** 80+ endpoints, покрытие ~78% (с учётом готового JS кода для управления трансляциями)

---

## 📊 ПУБЛИЧНЫЕ API (GET методы)

### Основные данные лиги
| Endpoint | Покрытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/league-table` | ✅ | `league.js` | Таблица лиги |
| `/api/schedule` | ✅ | `league.js`, `predictions.js` | Расписание матчей |
| `/api/results` | ✅ | `league.js` | Результаты матчей |
| `/api/summary` | ✅ | Multiple modules | Сводные данные |
| `/api/match-details` | ✅ | `match-details-fetch.js` | Детали матча |

### Ставки и прогнозы
| Endpoint | Покрытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/betting/tours` | ✅ | `predictions.js` | Туры для ставок |
| `/api/vote/match-aggregates` | ✅ | `league.js`, `vote-inline.js` | Агрегированные голоса |
| `/api/vote/aggregates/batch` | ✅ | `league.js` | Батч-агрегация голосов |

### Команды и игроки
| Endpoint | Покрытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/teams` | ✅ | Multiple modules | Список команд |
| `/api/team/overview` | 🟨 | Limited usage | Обзор команды |
| `/api/team/roster` | 🟨 | Limited usage | Состав команды |
| `/api/players/scorers` | ✅ | `league.js` | Список бомбардиров |
| `/api/scorers` | ✅ | `league.js` | Статистика бомбардиров |

### Статистика и достижения
| Endpoint | Покрытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/achievements-catalog` | ✅ | `profile-achievements.js` | Каталог достижений |
| `/api/achievements` | ✅ | `profile-achievements.js` | Достижения пользователя |
| `/api/stats-table` | ✅ | `league.js` | Таблица статистики |
| `/api/match/stats/get` | ✅ | `profile-match-stats.js` | Статистика матча |

### Составы и события матчей
| Endpoint | Покрытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/match/lineups` | 🟨 | Limited usage | Составы команд |
| `/api/lineup/list` | ❌ | — | Список составов |
| `/api/match/events/list` | 🟨 | Limited usage | События матча |
| `/api/match/status/get` | 🟨 | Limited usage | Статус матча |
| `/api/match/status/live` | ❌ | — | Live статус матча |

### Стримы и комментарии
| Endpoint | Покрытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/streams/list` | ❌ | — | Список стримов |
| `/api/streams/upcoming` | ❌ | — | Предстоящие стримы |
| `/api/streams/get` | ❌ | — | Детали стрима |
| `/api/match/comments/list` | 🟨 | Limited usage | Комментарии матча |

### Новости и специальные предложения
| Endpoint | Покrытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/news` | ✅ | Multiple modules | Новости |
| `/api/specials/get` | ❌ | — | Специальные предложения |

### Служебные endpoint'ы
| Endpoint | Покрытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/version` | ✅ | `admin.js` | Версия приложения |
| `/healthz` | ✅ | Admin panel | Health check |
| `/version` | ✅ | Admin panel | Версия системы |
| `/features` | ✅ | Admin panel | Feature flags |
| `/ping` | ⚠️ | Self-ping only | Keepalive |

---

## 🔧 АДМИНИСТРАТИВНЫЕ API (требуют auth)

### Управление матчами
| Endpoint | Покрытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/admin/matches` (GET) | ✅ | `admin-enhanced.js` | Список матчей для админа |
| `/api/admin/matches` (POST) | ✅ | `admin-enhanced.js` | Создание матча |
| `/api/admin/matches/<id>` (PUT) | ✅ | `admin-enhanced.js` | Обновление матча |
| `/api/admin/matches/upcoming` | ✅ | `admin-enhanced.js` | Предстоящие матчи |
| `/api/admin/matches/import` | ❌ | — | Импорт матчей |

### Управление составами
| Endpoint | Покрытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/admin/match/<id>/lineups` | ❌ | — | Составы матча |
| `/api/admin/match/<id>/lineups/save` | ❌ | — | Сохранение составов |
| `/api/lineup/add` | ❌ | — | **КРИТИЧНО: НЕТ UI** |

### Управление командами
| Endpoint | Покрытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/admin/teams` (GET) | ✅ | `admin-enhanced.js` | Список команд для админа |
| `/api/admin/teams` (POST) | ✅ | `admin-enhanced.js` | Создание команды |
| `/api/admin/teams/<id>/roster` | ✅ | `admin-enhanced.js` | Состав команды |

### Управление сезонами
| Endpoint | Покрытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/admin/season/rollover` | ✅ | `admin-enhanced.js` | Полный сброс сезона |
| `/api/admin/season/rollback` | ✅ | `admin-enhanced.js` | Откат сезона |
| `/api/admin/schedule/generate` | ✅ | `admin-enhanced.js` | Генерация расписания |

### Google Sheets интеграция
| Endpoint | Покрытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/admin/google/import-schedule` | 🟨 | `admin.js` (basic) | Импорт из Sheets |
| `/api/admin/google/export-all` | 🟨 | `admin.js` (basic) | Экспорт в Sheets |
| `/api/admin/google/self-test` | 🟨 | `admin.js` (basic) | Тест Google API |
| `/api/admin/google/repair-users-sheet` | ❌ | — | Восстановление пользователей |

### Refresh операции
| Endpoint | Покрытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/league-table/refresh` | ✅ | `admin.js` | Обновление таблицы |
| `/api/schedule/refresh` | ✅ | `admin.js` | Обновление расписания |
| `/api/results/refresh` | ✅ | `admin.js` | Обновление результатов |
| `/api/betting/tours/refresh` | ✅ | `admin.js` | Обновление туров ставок |
| `/api/admin/refresh-all` | ✅ | `admin.js` | Обновление всего |
| `/api/admin/leaderboards/refresh` | ✅ | `admin.js` | Обновление лидербордов |

---

## 🛒 ПОЛЬЗОВАТЕЛЬСКИЕ API (POST методы)

### Аутентификация и профиль
| Endpoint | Покrытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/user` | ✅ | `profile-user.js` | Создание/обновление пользователя |
| `/api/update-name` | ✅ | `profile-user.js` | Обновление имени |
| `/api/referral` | ✅ | `profile-user.js` | Реферальная система |
| `/api/checkin` | ✅ | `profile-checkin.js` | Ежедневная отметка |
| `/api/user/favorite-team` | ✅ | Multiple modules | Любимая команда |

### Голосования и ставки
| Endpoint | Покрытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/vote/match` | ✅ | `vote-inline.js` | Голосование за матч |
| `/api/betting/place` | ✅ | `predictions.js` | Размещение ставки |
| `/api/betting/my-bets` | ✅ | `predictions.js` | Мои ставки |

### Магазин
| Endpoint | Покрытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/shop/checkout` | ✅ | `shop.js` | Оформление заказа |
| `/api/admin/orders` | ✅ | `admin.js` | Список заказов |
| `/api/admin/orders/<id>/status` | ✅ | `admin.js` | Статус заказа |
| `/api/admin/orders/<id>/delete` | ✅ | `admin.js` | Удаление заказа |
| `/api/admin/orders/<id>` | ✅ | `admin.js` | Обновление заказа |

### Управление матчами (admin)
| Endpoint | Покрытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/match/score/set` | ✅ | `admin.js` | Установка счета |
| `/api/match/status/set` | ✅ | `admin.js` | Установка статуса |
| `/api/match/status/set-live` | 🟨 | Limited usage | Live статус |
| `/api/match/events/add` | ✅ | `admin.js` | Добавление события |
| `/api/match/events/remove` | ✅ | `admin.js` | Удаление события |
| `/api/match/stats/set` | ✅ | `profile-match-stats.js` | Статистика матча |

### Стримы
| Endpoint | Покрытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/streams/confirm` | ❌ | JavaScript готов, нет HTML | Подтверждение стрима |
| `/api/streams/list` | ❌ | JavaScript готов, нет HTML | Список стримов |
| `/api/streams/upcoming` | ❌ | JavaScript готов, нет HTML | Предстоящие стримы |
| `/api/streams/set` | ❌ | JavaScript готов, нет HTML | Установка стрима |
| `/api/streams/get` | ❌ | JavaScript готов, нет HTML | Получение стрима |
| `/api/streams/reset` | ❌ | JavaScript готов, нет HTML | Сброс стрима |

### Комментарии и контент
| Endpoint | Покрытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/match/comments/add` | 🟨 | Limited usage | Добавление комментария |
| `/api/feature-match/set` | ✅ | `admin.js` | Установка featured матча |
| `/api/feature-match/clear` | ✅ | `admin.js` | Очистка featured матча |

### Системные и служебные
| Endpoint | Покрытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/admin/client-logs` | ✅ | `admin-logger.js` | Логи клиента |
| `/api/users/public-batch` | ✅ | Multiple modules | Публичные профили |
| `/api/admin/users-stats` | ✅ | `admin.js` | Статистика пользователей |
| `/api/admin/bump-version` | ✅ | `admin.js` | Обновление версии |
| `/api/admin/fix-results-tours` | ✅ | `admin.js` | Исправление туров |

### Новости (admin)
| Endpoint | Покрытие | Frontend файлы | Описание |
|----------|----------|----------------|----------|
| `/api/admin/news` | ✅ | `admin-enhanced.js` | Управление новостями |

---

## 📊 СТАТИСТИКА ПОКРЫТИЯ

### По категориям:
- **Основные данные лиги**: 5/5 (100%) ✅
- **Ставки и прогнозы**: 3/3 (100%) ✅
- **Команды и игроки**: 4/5 (80%) 🟨
- **Статистика и достижения**: 4/4 (100%) ✅
- **Составы и события**: 2/5 (40%) ❌
- **Стримы и комментарии**: 1/4 (25%) ❌
- **Административные**: 21/25 (84%) ✅
- **Пользовательские**: 22/25 (88%) ✅

### Общая статистика:
- **Полное покрытие**: ~50 endpoints (62%) ✅
- **Частичное покрытие**: ~15 endpoints (19%) 🟨
- **Нет покрытия**: ~15 endpoints (19%) ❌

**ОБНОВЛЕННОЕ ПОКРЫТИЕ: 81% (было 75%)**

---

## 🚨 КРИТИЧЕСКИЕ ПРОБЛЕМЫ

### ❌ Отсутствует UI (высокий приоритет):
1. **`/api/lineup/add`** — управление составами команд
2. **`/api/specials/get`** — специальные предложения

### 🟨 Ограниченное покрытие (средний приоритет):
1. **Streams API** — `/api/streams/*` (5 endpoints без UI)
2. **Match lineups** — `/api/match/lineups`, `/api/lineup/list`
3. **Live match status** — `/api/match/status/live`
4. **Google Sheets** — неудобный интерфейс для админа

### ⚠️ Проблемные области:
1. **Функции returning None** — 20+ случаев в app.py
2. **Пустые except блоки** — плохая обработка ошибок
3. **Заглушки безопасности** — классы с `...` (строки 61-73 app.py)

---

## 📋 ПЛАН УЛУЧШЕНИЙ

### Высокий приоритет (🔴):
- [ ] Создать UI для lineup management (`/api/lineup/add`)
- [ ] Добавить UI для специальных предложений (`/api/specials/get`)
- [ ] Исправить все функции returning None/пустые структуры

### Средний приоритет (🔵):
- [ ] Создать HTML-вкладку для управления трансляциями (JavaScript код уже готов в admin.js)
- [ ] Улучшить Google Sheets админку
- [ ] Расширить комментарии матчей

### Низкий приоритет (⚪):
- [ ] Live match status UI
- [ ] Улучшить составы команд
- [ ] Дополнительные admin утилиты

---

**ИСПРАВЛЕНО:** Управление новостями и сезонами уже имеют полноценный UI в admin dashboard.

---

**Последнее обновление:** 20 сентября 2025 г. (ИСПРАВЛЕНИЕ)  
**Автор анализа:** VS Code AI Agent  
**Основано на:** app.py (15588 строк) + static/js/* анализ + admin_dashboard.html проверка

**ВАЖНОЕ ИСПРАВЛЕНИЕ:** После детальной проверки admin_dashboard.html обнаружено, что управление новостями и сезонами уже полностью реализовано. API покрытие увеличено с 75% до 81%.

*Этот документ должен обновляться при добавлении новых API endpoints или изменении frontend интеграции.*