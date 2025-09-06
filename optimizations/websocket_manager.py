"""
WebSocket manager для real-time уведомлений при изменениях админа
Снижает нагрузку на сервер, устраняя необходимость в polling
"""
import json
import threading
from typing import Dict, Set
from flask_socketio import SocketIO, emit, join_room, leave_room
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

class WebSocketManager:
    def __init__(self, socketio: SocketIO):
        self.socketio = socketio
        # user_id -> {session_ids}
        self.connected_users = {}
        self.lock = threading.Lock()
        # Дебаунсер для патчей: ключ -> {timer, fields, entity, id, room}
        self._patch_buffers = {}
        self._patch_lock = threading.Lock()
        # Регистр тем (опционально для метрик): topic -> примерное число подписчиков
        self._topics = {}
        # Топиковый дебаунс/батчинг (PR-3): key=(topic|event) -> buffer
        self._topic_buffers: Dict[str, dict] = {}
        self._topic_lock = threading.Lock()
        # Настройки дебаунса по топикам
        self.topic_debounce_enabled = True
        self.topic_debounce_ms = 180
        # Примитивные метрики
        self._metrics = {
            'ws_messages_sent': 0,
            'ws_messages_batched': 0,
            'ws_messages_bypass': 0,
        }

    def add_connection(self, user_id: str, session_id: str):
        """Добавляет соединение пользователя"""
        with self.lock:
            if user_id not in self.connected_users:
                self.connected_users[user_id] = set()
            self.connected_users[user_id].add(session_id)
            
    def remove_connection(self, user_id: str, session_id: str):
        """Удаляет соединение пользователя"""
        with self.lock:
            if user_id in self.connected_users:
                self.connected_users[user_id].discard(session_id)
                if not self.connected_users[user_id]:
                    del self.connected_users[user_id]

    def emit_to_topic(self, topic: str, event: str, data: dict):
        """Отправить событие в конкретную комнату (топик). Безопасная обёртка.
        Не бросает исключения и не меняет существующее поведение broadcast.
        """
        if not self.socketio:
            return
        try:
            if not topic or not isinstance(topic, str):
                return
            self.socketio.emit(event, data, room=topic, namespace='/')
            try:
                with self._topic_lock:
                    self._metrics['ws_messages_sent'] += 1
            except Exception:
                pass
        except Exception as e:
            logger.warning(f"Failed to emit '{event}' to topic '{topic}': {e}")

    def _make_topic_key(self, topic: str, event: str) -> str:
        return f"{topic}|{event}"

    def emit_to_topic_batched(self, topic: str, event: str, data: dict | None, priority: int = 0, delay_ms: int | None = None):
        """Отправка в топик с дебаунсом/батчингом.
        - priority>0: немедленная отправка (bypass)
        - иначе: агрегируем сообщение в буфер topic+event и отправляем через delay_ms (по умолчанию topic_debounce_ms)
        - Для event 'data_patch' пытаемся мержить словари payload (поверхностно)
        """
        if not self.socketio:
            return
        if priority and priority > 0:
            try:
                with self._topic_lock:
                    self._metrics['ws_messages_bypass'] += 1
            except Exception:
                pass
            # Немедленная отправка
            return self.emit_to_topic(topic, event, data or {})

        if not self.topic_debounce_enabled:
            return self.emit_to_topic(topic, event, data or {})

        key = self._make_topic_key(topic, event)
        dly = max(1, int(delay_ms if isinstance(delay_ms, int) else self.topic_debounce_ms)) / 1000.0

        def _flush():
            buf = None
            with self._topic_lock:
                buf = self._topic_buffers.pop(key, None)
            if not buf:
                return
            try:
                self.emit_to_topic(buf['topic'], buf['event'], buf['payload'])
            except Exception as e:
                logger.warning(f"Failed to flush topic buffer for {buf.get('topic')}:{buf.get('event')}: {e}")

        with self._topic_lock:
            entry = self._topic_buffers.get(key)
            if entry is None:
                self._topic_buffers[key] = {
                    'topic': topic,
                    'event': event,
                    'payload': (data or {}),
                    'timer': None,
                }
                try:
                    self._metrics['ws_messages_batched'] += 1
                except Exception:
                    pass
                t = threading.Timer(dly, _flush)
                self._topic_buffers[key]['timer'] = t
                t.daemon = True
                t.start()
            else:
                # Мержим payload при повторных событиях до срабатывания таймера
                try:
                    if event == 'data_patch' and isinstance(entry['payload'], dict) and isinstance(data, dict):
                        # Пытаемся объединить поля патча, сохраняя entity/id из первой записи
                        try:
                            if isinstance(entry['payload'].get('fields'), dict) and isinstance(data.get('fields'), dict):
                                entry['payload']['fields'].update(data['fields'])
                            else:
                                entry['payload'].update(data)
                        except Exception:
                            entry['payload'].update(data)
                    else:
                        # Для generic событий берём последнее значение
                        entry['payload'] = (data or entry['payload'])
                except Exception:
                    entry['payload'] = (data or {})

    def apply_topic_debounce_config(self, enabled: bool | None = None, delay_ms: int | None = None):
        """Применить конфигурацию дебаунса по топикам (можно вызывать из app.py после чтения env)."""
        try:
            if enabled is not None:
                self.topic_debounce_enabled = bool(enabled)
            if delay_ms is not None and isinstance(delay_ms, int) and delay_ms >= 0:
                self.topic_debounce_ms = delay_ms
        except Exception:
            pass

    def get_metrics(self) -> dict:
        """Вернуть локальные метрики по ws-сообщениям."""
        with self._topic_lock:
            return dict(self._metrics)

    def notify_data_change(self, data_type: str, data: dict = None):
        """
        Уведомляет всех подключенных пользователей об изменении данных
        data_type: 'league_table', 'schedule', 'match_score', 'match_status', etc.
        """
        if not self.socketio:
            return
            
        message = {
            'type': 'data_update',
            'data_type': data_type,
            'timestamp': json.dumps(data.get('updated_at', ''), default=str) if data else None,
            'data': data
        }
        
        try:
            # Отправляем всем подключенным пользователям (совместимый синтаксис)
            self.socketio.emit('data_changed', message, namespace='/')
            logger.info(f"Sent {data_type} update to all connected users")
        except Exception as e:
            logger.warning(f"Failed to send WebSocket notification for {data_type}: {e}")

    def notify_match_live_update(self, home: str, away: str, update_data: dict):
        """Специальные уведомления для live-матчей"""
        if not self.socketio:
            return
            
        try:
            room = f"match_{home}_{away}"
            message = {
                'type': 'match_live_update',
                'home': home,
                'away': away,
                'data': update_data
            }
            self.socketio.emit('live_update', message, room=room, namespace='/')
        except Exception as e:
            logger.warning(f"Failed to send live match update: {e}")

    def notify_patch(self, entity: str, entity_id, fields: dict, room: str | None = None):
        """Отправляет компактный патч для частичного обновления клиентского состояния.
        entity: 'match' | 'odds' | 'news' | ...
        entity_id: идентификатор сущности (например, {'home':..., 'away':...} или числовой id)
        fields: изменённые поля, например {'score_home': 1, 'score_away': 0} или {'odds': {...}, 'odds_version': 123}
        room: необязательная комната для таргетированной доставки
        """
        if not self.socketio:
            return
        try:
            message = {
                'type': 'data_patch',
                'entity': entity,
                'id': entity_id,
                'fields': fields,
                'ts': datetime.now(timezone.utc).isoformat()
            }
            if room:
                self.socketio.emit('data_patch', message, room=room, namespace='/')
            else:
                self.socketio.emit('data_patch', message, namespace='/')
        except Exception as e:
            logger.warning(f"Failed to send data_patch for {entity}: {e}")

    def _make_patch_key(self, entity: str, entity_id, room: str | None) -> str:
        try:
            if isinstance(entity_id, dict):
                key_part = json.dumps(entity_id, sort_keys=True, ensure_ascii=False)
            else:
                key_part = str(entity_id)
        except Exception:
            key_part = str(entity_id)
        return f"{entity}|{room or '*'}|{key_part}"

    def notify_patch_debounced(self, entity: str, entity_id, fields: dict, room: str | None = None, delay_ms: int = 250):
        """Дебаунс-версия notify_patch: агрегирует поля и отправляет один пакет через delay_ms."""
        if not self.socketio:
            return
        key = self._make_patch_key(entity, entity_id, room)

        def _flush():
            buf = None
            with self._patch_lock:
                buf = self._patch_buffers.pop(key, None)
            if not buf:
                return
            try:
                self.notify_patch(buf['entity'], buf['id'], buf['fields'], room=buf['room'])
            except Exception as e:
                try:
                    ent = (buf or {}).get('entity')
                except Exception:
                    ent = None
                logger.warning(f"Failed to flush debounced patch for {ent}: {e}")

        with self._patch_lock:
            entry = self._patch_buffers.get(key)
            if entry is None:
                # Создаём новую запись
                self._patch_buffers[key] = {
                    'entity': entity,
                    'id': entity_id,
                    'room': room,
                    'fields': dict(fields),
                    'timer': None,
                }
                t = threading.Timer(delay_ms / 1000.0, _flush)
                self._patch_buffers[key]['timer'] = t
                t.daemon = True
                t.start()
            else:
                # Мержим поля, таймер уже тикает
                try:
                    entry['fields'].update(fields or {})
                except Exception:
                    # на всякий случай пересоздаём словарь
                    merged = dict(entry.get('fields') or {})
                    merged.update(fields or {})
                    entry['fields'] = merged

    def get_connected_count(self) -> int:
        """Возвращает количество подключенных пользователей"""
        with self.lock:
            return len(self.connected_users)
