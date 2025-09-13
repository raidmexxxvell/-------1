import os
import logging
import json
from datetime import datetime, timezone

# Helper: shop catalog
def _shop_catalog() -> dict:
    """Серверный каталог товаров: { code: {name, price} }.
    Цены могут быть переопределены через переменные окружения SHOP_PRICE_*.
    """
    def p(env_key: str, default: int) -> int:
        try:
            return int(os.environ.get(env_key, str(default)))
        except Exception:
            return default
    return {
        'boots': { 'name': 'Бутсы', 'price': p('SHOP_PRICE_BOOTS', 500) },
        'ball': { 'name': 'Мяч', 'price': p('SHOP_PRICE_BALL', 500) },
        'tshirt': { 'name': 'Футболка', 'price': p('SHOP_PRICE_TSHIRT', 500) },
        'cap': { 'name': 'Кепка', 'price': p('SHOP_PRICE_CAP', 500) },
    }

# Helper: normalize incoming order items
def _normalize_order_items(raw_items) -> list[dict]:
    """Приводит массив позиций к [{code, qty}] с валидными qty>=1. Игнорирует неизвестные коды."""
    out = []
    if not isinstance(raw_items, list):
        return out
    for it in raw_items:
        code = (it.get('id') or it.get('code') or '').strip()
        try:
            qty = int(it.get('qty') or it.get('quantity') or 0)
        except Exception:
            qty = 0
        if not code:
            continue
        qty = max(1, min(99, qty))
        out.append({'code': code, 'qty': qty})
    return out

# Logger helper
def log_shop_order_event(user_id, items, total, status, error=None, extra=None):
    """Логирование событий создания/обработки заказа для отладки и аудита.
    msg: dict с полями user_id, items (raw), total, status ('start'|'success'|'fail'), error, extra, ts
    Записывается в логгер 'shop_order'."""
    msg = {
        'user_id': user_id,
        'items': items,
        'total': total,
        'status': status,
        'error': error,
        'extra': extra,
        'ts': datetime.now(timezone.utc).isoformat()
    }
    try:
        logging.getLogger('shop_order').info(msg)
    except Exception as e:
        try:
            # best-effort fallback; import app lazily to avoid circular import
            from flask import current_app
            current_app.logger.warning(f"log_shop_order_event failed: {e}")
        except Exception:
            pass
