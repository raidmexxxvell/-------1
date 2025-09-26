# Player Migration Guide - Complete Steps

Полный пошаговый план миграции от legacy-модели (текстовые имена игроков) к нормализованной модели (`players` + `player_tournament_stats`).

## Обзор миграции

**Цель:** Заменить фрагментарные хранилища данных об игроках на единую масштабируемую модель с поддержкой нескольких турниров и оптимизированными запросами.

**Принципы:**
- Малые атомарные изменения
- Тесты после каждого шага  
- Сохранение совместимости во время переходного периода
- Удаление дублирующего кода после валидации

## Подготовка

### Требования
- PostgreSQL база данных
- Python 3.8+ с psycopg3
- Переменная окружения `DATABASE_URL`
- Резервная копия БД

### Перед началом
```bash
# 1. Создать бэкап БД
pg_dump $DATABASE_URL > backup_before_migration.sql

# 2. Установить зависимости
pip install psycopg[binary] requests

# 3. Проверить подключение
python -c "import os, psycopg; print('✓ DB OK' if psycopg.connect(os.getenv('DATABASE_URL')) else '✗ DB FAIL')"
```

## Шаги миграции

### Шаг 1: Анализ данных
```bash
# Создать helper таблицы и проанализировать существующие данные
psql $DATABASE_URL -f scripts/migrate_players_step1.sql
python scripts/migrate_players_step1.py
```

**Что делает:**
- Создает `temp_player_names` для нормализации имен
- Анализирует `team_roster` и `match_lineups`  
- Парсит имена на first_name/last_name
- Выявляет проблемные записи

**Тесты:**
- Проверить покрытие: все ли записи из legacy таблиц попали в `temp_player_names`
- Просмотреть `needs_review = TRUE` записи

### Шаг 2: Создание нормализованных игроков
```bash
python scripts/migrate_players_step2.py
```

**Что делает:**
- Создает записи в `players` из чистых имен
- Сопоставляет с существующими игроками
- Создает `legacy_player_mapping` для связи старых и новых записей
- Строит индексы

**Тесты:**
- Все ли legacy записи имеют mapping
- Spot-check: соответствие имен в mapping
- Нет ли дублей в `players`

### Шаг 3: Обновление API (dual-read)
```bash
python scripts/migrate_players_step3.py
# Затем вручную интегрировать созданные endpoints в app.py
```

**Что создает:**
- `/api/admin/teams/<id>/roster/normalized` - новый endpoint через `players`
- CRUD endpoints для игроков: POST/PUT/DELETE `/api/admin/players`
- Dual-read логика: пробует новый API, fallback на legacy

**Ручная интеграция:**
1. Скопировать код из `scripts/api_updates_step3.py` в `app.py`
2. Добавить импорты моделей
3. Протестировать endpoints

**Тесты:**
```bash
# Проверить endpoints
curl http://localhost:5000/api/admin/teams
curl http://localhost:5000/api/admin/teams/1/roster/normalized
```

### Шаг 4: Обновление фронтенда
```bash
# Интегрировать JavaScript код из scripts/frontend_updates_step4.js
# в static/js/admin-enhanced.js
```

**Что обновляет:**
- `openTeamRoster` использует dual-read
- Добавляет CRUD UI для normalized игроков
- Форма добавления игрока
- Inline редактирование

**Ручная интеграция:**
1. Добавить код из `frontend_updates_step4.js` в `admin-enhanced.js`
2. Обновить modal разметку если нужно
3. Протестировать UI

### Шаг 5: Валидация и тестирование  
```bash
python scripts/migrate_players_step5_test.py
```

**Что проверяет:**
- Структура БД и индексы
- Целостность данных и mapping
- API endpoints (если сервер запущен)
- Консистентность (дубли, broken references)
- Генерирует отчет миграции

**Критерии прохождения:**
- Все тесты структуры БД: PASS
- Mapping coverage > 95%
- API endpoints доступны
- Нет broken references

### Шаг 6: Финализация (переход на normalized-only)
```bash
python scripts/migrate_players_step6_final.py
```

**⚠ ВНИМАНИЕ:** Этот шаг удаляет legacy таблицы!

**Что делает:**
- Мигрирует `match_lineups` → `team_compositions`
- Пересчитывает статистику в `player_statistics`
- Архивирует legacy таблицы в `*_backup`
- Удаляет `team_roster`, `match_lineups`, `team_stats_*`
- Финальная валидация

**После выполнения:**
1. Обновить `app.py`: удалить legacy endpoints и функции
2. Убрать dual-read логику из фронтенда
3. Удалить функции создания `team_stats_*`
4. Обновить документацию

## Откат (если нужно)

### До Шага 6:
```bash
# Откат до legacy модели
psql $DATABASE_URL -c "
DROP TABLE IF EXISTS legacy_player_mapping;
DROP TABLE IF EXISTS temp_player_names;
DELETE FROM players WHERE created_at > (SELECT MIN(created_at) FROM player_migration_log);
"
```

### После Шага 6:
```bash
# Восстановление из архивных таблиц
psql $DATABASE_URL -c "
CREATE TABLE team_roster AS SELECT * FROM team_roster_backup;
CREATE TABLE match_lineups AS SELECT * FROM match_lineups_backup;
"
# + восстановить индексы и функции
```

## Типичные проблемы и решения

### Проблема: Много unmapped записей
**Решение:** Настроить fuzzy matching порог, вручную сопоставить частые имена

### Проблема: API endpoints не работают  
**Решение:** Проверить правильность интеграции в `app.py`, импорты моделей

### Проблема: Дублирующиеся игроки
**Решение:** Запустить dedupe скрипт перед финализацией:
```sql
DELETE FROM players p1 USING players p2 
WHERE p1.id > p2.id 
  AND LOWER(p1.first_name) = LOWER(p2.first_name)
  AND LOWER(COALESCE(p1.last_name,'')) = LOWER(COALESCE(p2.last_name,''));
```

### Проблема: Broken statistics
**Решение:** Пересчитать статистику:
```sql
TRUNCATE player_statistics;
-- Выполнить пересчет из match_events и team_compositions
```

## Мониторинг после миграции

### Важные метрики:
- Время ответа roster endpoints
- Количество активных игроков  
- Покрытие статистики
- Errors в логах приложения

### SQL для проверки:
```sql
-- Проверить консистентность
SELECT COUNT(*) as total_players FROM players WHERE is_active = TRUE;
SELECT COUNT(*) as players_with_stats FROM player_statistics ps JOIN players p ON p.id = ps.player_id WHERE p.is_active = TRUE;

-- Топ игроки по очкам
SELECT p.first_name, p.last_name, ps.goals_scored + ps.assists as total_points
FROM players p 
JOIN player_statistics ps ON ps.player_id = p.id 
ORDER BY total_points DESC LIMIT 10;
```

## Заключение

После успешного выполнения всех шагов:
- ✅ Единая нормализованная модель игроков
- ✅ Поддержка множественных турниров  
- ✅ Оптимизированные запросы и индексы
- ✅ Удален дублирующий код
- ✅ Масштабируемая архитектура

**Время выполнения:** ~2-4 часа (зависит от объема данных)
**Downtime:** Минимальное (только во время Шага 6)