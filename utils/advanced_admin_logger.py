"""
Расширенная система логирования для всех критически важных операций
Автоматическое логирование админских и системных функций
"""

import json
import time
import traceback
from datetime import datetime, timezone
from functools import wraps
from flask import request, g
from typing import Optional, Dict, Any, List


def log_admin_operation(action_name: str, description_template: str = None, 
                       track_performance: bool = True, log_request_data: bool = True,
                       track_entities: List[str] = None):
    """
    Расширенный декоратор для логирования админских операций
    
    Args:
        action_name: Название операции для лога
        description_template: Шаблон описания с подстановками {param}
        track_performance: Отслеживать время выполнения
        log_request_data: Логировать данные запроса
        track_entities: Список типов сущностей для отслеживания изменений
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time() if track_performance else None
            admin_id = _get_admin_id_from_request()
            endpoint = f"{request.method} {request.path}" if request else None
            request_data = None
            
            # Собираем данные запроса
            if log_request_data and request:
                request_data = _extract_request_data()
            
            try:
                # Выполнение оригинальной функции
                result = func(*args, **kwargs)
                
                # Время выполнения
                execution_time = None
                if track_performance and start_time:
                    execution_time = int((time.time() - start_time) * 1000)
                
                # Формирование описания
                description = _build_description(action_name, description_template, request_data, result)
                
                # Анализ результата
                result_status, result_message, affected_entities = _analyze_result(result, track_entities)
                
                # Логирование
                _log_operation(
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
                execution_time = None
                if track_performance and start_time:
                    execution_time = int((time.time() - start_time) * 1000)
                
                # Логирование ошибки с трейсбэком
                error_details = {
                    'error_type': type(e).__name__,
                    'error_message': str(e),
                    'traceback': traceback.format_exc()
                }
                
                _log_operation(
                    admin_id=admin_id,
                    action=action_name,
                    description=f"ОШИБКА при выполнении: {action_name}",
                    endpoint=endpoint,
                    request_data=request_data,
                    result_status='error',
                    result_message=json.dumps(error_details, ensure_ascii=False),
                    execution_time_ms=execution_time
                )
                
                # Повторное поднятие исключения
                raise
        
        return wrapper
    return decorator


def log_system_operation(operation_type: str, description: str, 
                        user_id: Optional[int] = None, 
                        affected_data: Optional[Dict] = None,
                        performance_critical: bool = False):
    """
    Логирование системных операций (не админских)
    
    Args:
        operation_type: Тип операции (например, "Изменение счета матча")
        description: Подробное описание операции
        user_id: ID пользователя, если операция не админская
        affected_data: Затронутые данные
        performance_critical: Критична ли операция для производительности
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time() if performance_critical else None
            endpoint = f"{request.method} {request.path}" if request else None
            
            try:
                result = func(*args, **kwargs)
                
                # Время выполнения
                execution_time = None
                if performance_critical and start_time:
                    execution_time = int((time.time() - start_time) * 1000)
                
                # Анализ результата
                result_status, result_message, _ = _analyze_result(result)
                
                # Логирование
                _log_operation(
                    admin_id=user_id or _get_admin_id_from_request(),
                    action=operation_type,
                    description=description,
                    endpoint=endpoint,
                    request_data=_extract_request_data() if request else None,
                    result_status=result_status,
                    result_message=result_message,
                    affected_entities=affected_data,
                    execution_time_ms=execution_time
                )
                
                return result
                
            except Exception as e:
                execution_time = None
                if performance_critical and start_time:
                    execution_time = int((time.time() - start_time) * 1000)
                
                error_details = {
                    'error_type': type(e).__name__,
                    'error_message': str(e)
                }
                
                _log_operation(
                    admin_id=user_id or _get_admin_id_from_request(),
                    action=operation_type,
                    description=f"ОШИБКА: {description}",
                    endpoint=endpoint,
                    request_data=_extract_request_data() if request else None,
                    result_status='error',
                    result_message=json.dumps(error_details, ensure_ascii=False),
                    execution_time_ms=execution_time
                )
                
                raise
        
        return wrapper
    return decorator


def manual_log(action: str, description: str, admin_id: Optional[int] = None,
               result_status: str = 'success', affected_data: Optional[Dict] = None,
               execution_time_ms: Optional[int] = None):
    """
    Ручное логирование для сложных операций
    """
    try:
        from utils.admin_logger import AdminActionLogger
        
        if hasattr(g, 'admin_logger') and g.admin_logger:
            admin_logger = g.admin_logger
        else:
            admin_logger = AdminActionLogger()
        
        admin_id = admin_id or _get_admin_id_from_request()
        
        admin_logger.log_action(
            admin_id=admin_id,
            action=action,
            description=description,
            result_status=result_status,
            affected_entities=affected_data,
            execution_time_ms=execution_time_ms
        )
        
    except Exception as e:
        print(f"Ошибка ручного логирования: {e}")


# Вспомогательные функции

def _get_admin_id_from_request() -> Optional[int]:
    """Получение ID админа из запроса"""
    import os
    admin_id_env = os.environ.get('ADMIN_USER_ID', '')
    if not admin_id_env:
        return None
    try:
        return int(admin_id_env)
    except ValueError:
        return None


def _extract_request_data() -> Optional[Dict]:
    """Извлечение данных запроса"""
    if not request:
        return None
    
    request_data = {}
    
    try:
        if request.form:
            request_data.update(dict(request.form))
        if request.args:
            request_data.update(dict(request.args))
        if request.json:
            request_data.update(request.json)
        
        # Фильтруем чувствительные данные
        sensitive_keys = ['password', 'token', 'secret', 'key', 'credentials']
        for key in list(request_data.keys()):
            if any(sensitive in key.lower() for sensitive in sensitive_keys):
                request_data[key] = '[FILTERED]'
        
        return request_data if request_data else None
        
    except Exception:
        return None


def _build_description(action_name: str, template: Optional[str], 
                      request_data: Optional[Dict], result: Any) -> str:
    """Построение описания операции"""
    if template and request_data:
        try:
            return template.format(**request_data)
        except (KeyError, ValueError):
            pass
    
    return f"Выполнено действие: {action_name}"


def _analyze_result(result: Any, track_entities: Optional[List[str]] = None) -> tuple:
    """Анализ результата выполнения функции"""
    result_status = 'success'
    result_message = 'Операция выполнена успешно'
    affected_entities = {}
    
    # Анализ HTTP ответов Flask
    if hasattr(result, 'status_code'):
        if result.status_code >= 400:
            result_status = 'error'
            try:
                if hasattr(result, 'get_json') and result.get_json():
                    error_data = result.get_json()
                    result_message = error_data.get('error', f'HTTP {result.status_code}')
                else:
                    result_message = f'HTTP {result.status_code}'
            except Exception:
                result_message = f'HTTP {result.status_code}'
    
    # Анализ словарей с результатами
    elif isinstance(result, dict):
        if result.get('error'):
            result_status = 'error'
            result_message = str(result.get('error'))
        elif result.get('ok') is False:
            result_status = 'error'
            result_message = result.get('message', 'Операция не выполнена')
        else:
            # Извлекаем полезную информацию из результата
            for key, value in result.items():
                if key in ['tournament_id', 'match_id', 'player_id', 'news_id', 'order_id']:
                    affected_entities[key] = value
                elif key in ['updated_count', 'deleted_count', 'created_count']:
                    affected_entities[key] = value
    
    # Анализ кортежей (часто возвращают Flask функции)
    elif isinstance(result, tuple) and len(result) >= 2:
        if isinstance(result[1], int) and result[1] >= 400:
            result_status = 'error'
            if isinstance(result[0], dict) and result[0].get('error'):
                result_message = str(result[0].get('error'))
            else:
                result_message = f'HTTP {result[1]}'
    
    return result_status, result_message, affected_entities


def _log_operation(admin_id: Optional[int], action: str, description: str,
                  endpoint: Optional[str] = None, request_data: Optional[Dict] = None,
                  result_status: str = 'success', result_message: Optional[str] = None,
                  affected_entities: Optional[Dict] = None, 
                  execution_time_ms: Optional[int] = None):
    """Внутренняя функция для записи лога"""
    try:
        if not admin_id:
            return
            
        if hasattr(g, 'admin_logger') and g.admin_logger:
            g.admin_logger.log_action(
                admin_id=admin_id,
                action=action,
                description=description,
                endpoint=endpoint,
                request_data=request_data,
                result_status=result_status,
                result_message=result_message,
                affected_entities=affected_entities,
                execution_time_ms=execution_time_ms
            )
    except Exception as e:
        # Не прерываем основную операцию если логирование не удалось
        print(f"Ошибка записи лога: {e}")


# Специализированные декораторы для разных типов операций

def log_match_operation(description_template: str = None):
    """Декоратор для операций с матчами"""
    return log_admin_operation(
        action_name="Операция с матчем",
        description_template=description_template,
        track_performance=True,
        track_entities=['match', 'teams', 'scores', 'lineups']
    )


def log_user_management(description_template: str = None):
    """Декоратор для операций управления пользователями"""
    return log_admin_operation(
        action_name="Управление пользователями",
        description_template=description_template,
        track_performance=False,
        track_entities=['users', 'stats', 'permissions']
    )


def log_data_sync(description_template: str = None):
    """Декоратор для операций синхронизации данных"""
    return log_admin_operation(
        action_name="Синхронизация данных",
        description_template=description_template,
        track_performance=True,
        track_entities=['sheets', 'database', 'cache']
    )


def log_content_management(description_template: str = None):
    """Декоратор для управления контентом"""
    return log_admin_operation(
        action_name="Управление контентом",
        description_template=description_template,
        track_performance=False,
        track_entities=['news', 'content', 'media']
    )


def log_system_operation(description_template: str = None):
    """Декоратор для системных операций"""
    return log_admin_operation(
        action_name="Системная операция",
        description_template=description_template,
        track_performance=True,
        track_entities=['system', 'database', 'cache']
    )


def log_api_operation(action_name: str, description: str = None):
    """Универсальный декоратор для API операций"""
    return log_admin_operation(
        action_name=action_name,
        description_template=description,
        track_performance=True
    )


def log_order_management(description_template: str = None):
    """Декоратор для управления заказами"""
    return log_admin_operation(
        action_name="Управление заказами",
        description_template=description_template,
        track_performance=False,
        track_entities=['orders', 'shop', 'users']
    )


def log_leaderboard_operation(description_template: str = None):
    """Декоратор для операций с рейтингами"""
    return log_admin_operation(
        action_name="Операции с рейтингами",
        description_template=description_template,
        track_performance=True,
        track_entities=['leaderboards', 'statistics']
    )
