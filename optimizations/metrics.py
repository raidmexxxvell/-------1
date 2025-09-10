"""Примитивные метрики производительности и стабильности.
Используются для эндпоинта /health/perf (admin-only).

Цели:
 - Низкая стоимость (O(1) инкременты, без тяжёлого хранения)
 - Потокобезопасность
 - Агрегация p50/p95 через простую шкалу EMA (approx)
"""
from __future__ import annotations
import threading, time
from typing import Dict

_LOCK = threading.Lock()

_DATA = {
    'uptime_started': time.time(),
    'api': {
        # per endpoint key -> {'count': int, 'ema_p50': float, 'ema_p95': float}
        # EMA формула: v = v*alpha + x*(1-alpha)
        'by_key': {}
    },
    'cache': {
        'memory_hits': 0,
        'redis_hits': 0,
        'misses': 0,
        'sets': 0,
    },
    'ws': {
        # будут заполняться из websocket_manager.get_metrics() по запросу
    }
}

_ALPHA_P50 = 0.85
_ALPHA_P95 = 0.92

def api_observe(endpoint: str, elapsed_ms: float):
    if elapsed_ms < 0:
        return
    try:
        with _LOCK:
            e = _DATA['api']['by_key'].setdefault(endpoint, {'count':0,'ema_p50':elapsed_ms,'ema_p95':elapsed_ms})
            e['count'] += 1
            # упрощённо: p50 ~ EMA с alpha_p50; p95 ~ max(p50, EMA(alpha_p95)) или подталкиваем вверх при всплеске
            e['ema_p50'] = (e['ema_p50'] * _ALPHA_P50) + (elapsed_ms * (1-_ALPHA_P50))
            # для p95 если всплеск > текущего ema_p95 — jump 50% к всплеску
            if elapsed_ms > e['ema_p95']:
                e['ema_p95'] = e['ema_p95'] + (elapsed_ms - e['ema_p95']) * 0.5
            else:
                e['ema_p95'] = (e['ema_p95'] * _ALPHA_P95) + (elapsed_ms * (1-_ALPHA_P95))
    except Exception:
        pass

def cache_inc(field: str, delta: int = 1):
    try:
        with _LOCK:
            if field in _DATA['cache']:
                _DATA['cache'][field] += delta
    except Exception:
        pass

def snapshot(ws_metrics: Dict | None = None):
    try:
        with _LOCK:
            api_view = {}
            for k,v in _DATA['api']['by_key'].items():
                api_view[k] = {
                    'count': v['count'],
                    'p50_ms': round(v['ema_p50'],2),
                    'p95_ms': round(v['ema_p95'],2)
                }
            out = {
                'uptime_sec': int(time.time()-_DATA['uptime_started']),
                'api': api_view,
                'cache': dict(_DATA['cache']),
                'etag': {},  # заполняется в app.py через _etag_metrics_snapshot
                'ws': ws_metrics or {}
            }
            return out
    except Exception:
        return {}

__all__ = ['api_observe','cache_inc','snapshot']

def reset():
    """Полный сброс внутренних метрик (используется в admin full-reset).
    Сохраняем только новую точку старта uptime.
    """
    try:
        with _LOCK:
            _DATA['uptime_started'] = time.time()
            _DATA['api']['by_key'].clear()
            for k in list(_DATA['cache'].keys()):
                _DATA['cache'][k] = 0
            _DATA['ws'].clear()
    except Exception:
        pass

__all__.append('reset')
