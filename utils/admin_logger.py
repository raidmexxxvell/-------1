"""
Система логирования действий администратора
Отслеживает все важные операции админа с подробным описанием
"""

import json
import time
from datetime import datetime, timezone
from functools import wraps
from flask import request, g
from database.database_models import AdminLog, db_manager
import os


class AdminActionLogger:
    """Система логирования действий администратора"""
    
    def __init__(self):
        """Инициализация логгера с использованием глобального db_manager"""
        self.db_manager = db_manager
    
    def log_action(self, admin_id=None, action=None, description=None, endpoint=None, 
                  request_data=None, result_status='success', result_message=None,
                  affected_entities=None, execution_time_ms=None):
        """
        Записывает действие админа в лог
        
        Args:
            admin_id: ID администратора в Telegram
            action: Краткое описание действия (например, "Завершить матч")
            description: Подробное описание на простом языке
            endpoint: API endpoint
            request_data: Данные запроса (dict или str)
            result_status: 'success' или 'error'
            result_message: Детали результата
            affected_entities: Список затронутых сущностей (dict)
            execution_time_ms: Время выполнения в миллисекундах
        """
        try:
            if not self.db_manager:
                return False
                
            session = self.db_manager.get_session()
            try:
                # Подготовка данных
                request_data_json = None
                if request_data:
                    if isinstance(request_data, dict):
                        request_data_json = json.dumps(request_data, ensure_ascii=False)
                    else:
                        request_data_json = str(request_data)
                
                affected_entities_json = None
                if affected_entities:
                    if isinstance(affected_entities, dict):
                        affected_entities_json = json.dumps(affected_entities, ensure_ascii=False)
                    else:
                        affected_entities_json = str(affected_entities)
                
                # IP адрес и User-Agent
                ip_address = None
                user_agent = None
                if request:
                    ip_address = request.headers.get('X-Forwarded-For', request.remote_addr)
                    user_agent = request.headers.get('User-Agent')
                
                # Создание записи лога
                log_entry = AdminLog(
                    admin_id=admin_id,
                    action=action,
                    description=description,
                    endpoint=endpoint,
                    request_data=request_data_json,
                    result_status=result_status,
                    result_message=result_message,
                    affected_entities=affected_entities_json,
                    execution_time_ms=execution_time_ms,
                    ip_address=ip_address,
                    user_agent=user_agent
                )
                
                session.add(log_entry)
                session.commit()
                return True
                
            finally:
                session.close()
                
        except Exception as e:
            print(f"Ошибка записи в админ-лог: {e}")
            return False
    
    def get_logs(self, limit=100, offset=0, admin_id=None, action_filter=None, 
                status_filter=None, date_from=None, date_to=None):
        """
        Получение логов администратора с фильтрацией
        
        Args:
            limit: Количество записей
            offset: Смещение для пагинации
            admin_id: Фильтр по ID админа
            action_filter: Фильтр по типу действия
            status_filter: Фильтр по статусу ('success'/'error')
            date_from: Дата начала периода
            date_to: Дата окончания периода
        """
        try:
            if not self.db_manager:
                return []
                
            session = self.db_manager.get_session()
            try:
                query = session.query(AdminLog)
                
                # Применение фильтров
                if admin_id:
                    query = query.filter(AdminLog.admin_id == admin_id)
                if action_filter:
                    query = query.filter(AdminLog.action.ilike(f'%{action_filter}%'))
                if status_filter:
                    query = query.filter(AdminLog.result_status == status_filter)
                if date_from:
                    query = query.filter(AdminLog.created_at >= date_from)
                if date_to:
                    query = query.filter(AdminLog.created_at <= date_to)
                
                # Сортировка по дате создания (сначала новые)
                query = query.order_by(AdminLog.created_at.desc())
                
                # Пагинация
                logs = query.offset(offset).limit(limit).all()
                
                # Преобразование в список словарей
                result = []
                for log in logs:
                    log_dict = {
                        'id': log.id,
                        'admin_id': log.admin_id,
                        'action': log.action,
                        'description': log.description,
                        'endpoint': log.endpoint,
                        'request_data': log.request_data,
                        'result_status': log.result_status,
                        'result_message': log.result_message,
                        'affected_entities': log.affected_entities,
                        'execution_time_ms': log.execution_time_ms,
                        'ip_address': log.ip_address,
                        'created_at': log.created_at.isoformat() if log.created_at else None
                    }
                    result.append(log_dict)
                
                return result
                
            finally:
                session.close()
                
        except Exception as e:
            print(f"Ошибка получения админ-логов: {e}")
            return []


def log_admin_action(action_name, description_template=None):
    """
    Декоратор для автоматического логирования действий администратора
    
    Args:
        action_name: Название действия для лога
        description_template: Шаблон описания с возможностью подстановки параметров
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            admin_id = None
            endpoint = None
            request_data = None
            
            # Извлечение информации о запросе
            if request:
                endpoint = f"{request.method} {request.path}"
                
                # Попытка извлечь admin_id из environment или context
                admin_id_env = os.environ.get('ADMIN_USER_ID', '')
                if admin_id_env:
                    try:
                        admin_id = int(admin_id_env)
                    except ValueError:
                        pass
                
                # Собираем данные запроса
                request_data = {}
                if request.form:
                    request_data.update(dict(request.form))
                if request.args:
                    request_data.update(dict(request.args))
                if request.json:
                    request_data.update(request.json)
            
            try:
                # Выполнение оригинальной функции
                result = func(*args, **kwargs)
                
                # Время выполнения
                execution_time = int((time.time() - start_time) * 1000)
                
                # Формирование описания
                description = description_template or f"Выполнено действие: {action_name}"
                if description_template and request_data:
                    try:
                        description = description_template.format(**request_data)
                    except (KeyError, ValueError):
                        pass
                
                # Определение результата
                result_status = 'success'
                result_message = 'Операция выполнена успешно'
                affected_entities = None
                
                # Анализ результата функции
                if hasattr(result, 'status_code'):
                    if result.status_code >= 400:
                        result_status = 'error'
                        if hasattr(result, 'json') and result.json:
                            result_message = result.json.get('error', 'Неизвестная ошибка')
                        else:
                            result_message = f'HTTP {result.status_code}'
                
                # Логирование через глобальный логгер, если доступен
                if hasattr(g, 'admin_logger') and admin_id:
                    g.admin_logger.log_action(
                        admin_id=admin_id,
                        action=action_name,
                        description=description,
                        endpoint=endpoint,
                        request_data=request_data,
                        result_status=result_status,
                        result_message=result_message,
                        affected_entities=affected_entities,
                        execution_time_ms=execution_time
                    )
                
                return result
                
            except Exception as e:
                # Время выполнения даже при ошибке
                execution_time = int((time.time() - start_time) * 1000)
                
                # Логирование ошибки
                if hasattr(g, 'admin_logger') and admin_id:
                    g.admin_logger.log_action(
                        admin_id=admin_id,
                        action=action_name,
                        description=f"ОШИБКА при выполнении: {action_name}",
                        endpoint=endpoint,
                        request_data=request_data,
                        result_status='error',
                        result_message=str(e),
                        execution_time_ms=execution_time
                    )
                
                # Повторное поднятие исключения
                raise
        
        return wrapper
    return decorator


def create_manual_log(admin_logger, admin_id, action, details, success=True, 
                     affected_data=None, additional_info=None):
    """
    Создание ручного лога для сложных операций
    
    Args:
        admin_logger: Экземпляр AdminActionLogger
        admin_id: ID администратора
        action: Название действия
        details: Подробности операции
        success: Успешность операции
        affected_data: Затронутые данные
        additional_info: Дополнительная информация
    """
    affected_entities = {}
    if affected_data:
        affected_entities.update(affected_data)
    if additional_info:
        affected_entities['additional_info'] = additional_info
    
    admin_logger.log_action(
        admin_id=admin_id,
        action=action,
        description=details,
        result_status='success' if success else 'error',
        result_message='Операция выполнена' if success else 'Операция завершилась с ошибкой',
        affected_entities=affected_entities if affected_entities else None
    )
