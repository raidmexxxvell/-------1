-- Создание таблицы admin_logs для логирования действий администратора
-- Дата создания: 2025-09-08

CREATE TABLE IF NOT EXISTS admin_logs (
    id SERIAL PRIMARY KEY,
    admin_id BIGINT NOT NULL,                    -- Telegram user ID админа
    action VARCHAR(100) NOT NULL,                -- Краткое описание действия
    description TEXT NOT NULL,                   -- Подробное описание
    endpoint VARCHAR(200),                       -- API endpoint
    request_data TEXT,                           -- JSON данных запроса
    result_status VARCHAR(20) NOT NULL,          -- 'success' или 'error'
    result_message TEXT,                         -- Детали результата
    affected_entities TEXT,                      -- JSON со списком затронутых сущностей
    execution_time_ms INTEGER,                   -- Время выполнения в миллисекундах
    ip_address VARCHAR(45),                      -- IP адрес
    user_agent TEXT,                             -- User-Agent
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для оптимизации поиска
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_logs_result_status ON admin_logs(result_status);
CREATE INDEX IF NOT EXISTS idx_admin_logs_composite ON admin_logs(admin_id, created_at DESC);

-- Ограничения
ALTER TABLE admin_logs ADD CONSTRAINT chk_admin_logs_result_status 
    CHECK (result_status IN ('success', 'error'));

-- Комментарии к таблице
COMMENT ON TABLE admin_logs IS 'Логи действий администратора с детальной информацией';
COMMENT ON COLUMN admin_logs.admin_id IS 'ID администратора в Telegram';
COMMENT ON COLUMN admin_logs.action IS 'Краткое название действия (например, "Завершить матч")';
COMMENT ON COLUMN admin_logs.description IS 'Подробное описание действия на простом языке';
COMMENT ON COLUMN admin_logs.endpoint IS 'API endpoint который был вызван';
COMMENT ON COLUMN admin_logs.request_data IS 'JSON данные запроса';
COMMENT ON COLUMN admin_logs.result_status IS 'Статус выполнения: success или error';
COMMENT ON COLUMN admin_logs.result_message IS 'Детальный результат выполнения';
COMMENT ON COLUMN admin_logs.affected_entities IS 'JSON с информацией о затронутых сущностях';
COMMENT ON COLUMN admin_logs.execution_time_ms IS 'Время выполнения операции в миллисекундах';
