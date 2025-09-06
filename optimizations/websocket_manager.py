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
        except Exception as e:
            logger.warning(f"Failed to emit '{event}' to topic '{topic}': {e}")

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
