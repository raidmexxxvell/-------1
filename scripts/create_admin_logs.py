#!/usr/bin/env python3
"""
Скрипт для создания таблицы admin_logs в базе данных
Запуск: python scripts/create_admin_logs.py
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Добавляем корневую папку проекта в PYTHONPATH
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Загружаем переменные окружения
load_dotenv(project_root / '.env.test')

from database.database_models import Base, db_manager, AdminLog
from sqlalchemy import text

def create_admin_logs_table():
    """Создание таблицы admin_logs и индексов"""
    try:
        print("🔄 Инициализация подключения к базе данных...")
        
        # Инициализация подключения к БД
        db_manager._ensure_initialized()
        engine = db_manager.engine
        
        print("📋 Создание таблицы admin_logs...")
        
        # Создание таблицы через SQLAlchemy
        Base.metadata.create_all(engine, tables=[AdminLog.__table__])
        
        # Дополнительные индексы и ограничения (если нужны специфичные)
        with engine.connect() as conn:
            # Проверяем существование таблицы
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'admin_logs'
                );
            """))
            
            table_exists = result.scalar()
            
            if table_exists:
                print("✅ Таблица admin_logs создана успешно!")
                
                # Создание дополнительных индексов
                try:
                    conn.execute(text("""
                        CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id 
                        ON admin_logs(admin_id);
                    """))
                    
                    conn.execute(text("""
                        CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at 
                        ON admin_logs(created_at DESC);
                    """))
                    
                    conn.execute(text("""
                        CREATE INDEX IF NOT EXISTS idx_admin_logs_action 
                        ON admin_logs(action);
                    """))
                    
                    conn.execute(text("""
                        CREATE INDEX IF NOT EXISTS idx_admin_logs_result_status 
                        ON admin_logs(result_status);
                    """))
                    
                    conn.execute(text("""
                        CREATE INDEX IF NOT EXISTS idx_admin_logs_composite 
                        ON admin_logs(admin_id, created_at DESC);
                    """))
                    
                    # Ограничение на result_status
                    conn.execute(text("""
                        DO $$ 
                        BEGIN
                            IF NOT EXISTS (
                                SELECT 1 FROM information_schema.constraint_column_usage 
                                WHERE table_name = 'admin_logs' 
                                AND constraint_name = 'chk_admin_logs_result_status'
                            ) THEN
                                ALTER TABLE admin_logs ADD CONSTRAINT chk_admin_logs_result_status 
                                    CHECK (result_status IN ('success', 'error'));
                            END IF;
                        END $$;
                    """))
                    
                    conn.commit()
                    print("✅ Индексы и ограничения созданы успешно!")
                    
                except Exception as idx_err:
                    print(f"⚠️  Предупреждение при создании индексов: {idx_err}")
                
                # Вставка тестовой записи для проверки
                try:
                    conn.execute(text("""
                        INSERT INTO admin_logs (
                            admin_id, action, description, result_status, result_message
                        ) VALUES (
                            :admin_id, :action, :description, :status, :message
                        ) ON CONFLICT DO NOTHING;
                    """), {
                        'admin_id': 0,
                        'action': 'Тест системы логирования',
                        'description': 'Проверка работоспособности таблицы admin_logs после инициализации',
                        'status': 'success',
                        'message': 'Таблица успешно создана и готова к использованию'
                    })
                    conn.commit()
                    print("✅ Тестовая запись добавлена успешно!")
                    
                except Exception as test_err:
                    print(f"⚠️  Предупреждение при создании тестовой записи: {test_err}")
                
                # Проверка структуры таблицы
                result = conn.execute(text("""
                    SELECT column_name, data_type, is_nullable 
                    FROM information_schema.columns 
                    WHERE table_name = 'admin_logs' 
                    ORDER BY ordinal_position;
                """))
                
                columns = result.fetchall()
                print("\n📊 Структура таблицы admin_logs:")
                for col in columns:
                    nullable = "NULL" if col[2] == "YES" else "NOT NULL"
                    print(f"  - {col[0]}: {col[1]} ({nullable})")
                
            else:
                print("❌ Ошибка: таблица admin_logs не была создана")
                return False
        
        print("\n🎉 Инициализация таблицы admin_logs завершена успешно!")
        return True
        
    except Exception as e:
        print(f"❌ Ошибка при создании таблицы admin_logs: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Главная функция"""
    print("🚀 Начинаем создание таблицы логов администратора...")
    
    # Проверка переменных окружения
    required_env_vars = ['DATABASE_URL']
    missing_vars = [var for var in required_env_vars if not os.getenv(var)]
    
    if missing_vars:
        print(f"❌ Отсутствуют переменные окружения: {', '.join(missing_vars)}")
        print("Убедитесь, что DATABASE_URL настроен правильно")
        return False
    
    success = create_admin_logs_table()
    
    if success:
        print("\n✨ Готово! Система логирования администратора готова к использованию.")
        print("\nТеперь вы можете:")
        print("  - Просматривать логи в админ-панели (вкладка 'Логи')")
        print("  - Отслеживать все действия администраторов")
        print("  - Анализировать производительность операций")
        return True
    else:
        print("\n💥 Инициализация не удалась. Проверьте ошибки выше.")
        return False

if __name__ == "__main__":
    exit(0 if main() else 1)
