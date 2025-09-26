import sys
import os

# ensure project root is on path for imports
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from optimizations.smart_invalidator import SmartCacheInvalidator, InvalidationRule
from optimizations.multilevel_cache import MultiLevelCache


class DummyWS:
    def __init__(self):
        self.sent = []

    def emit_to_topic_batched(self, topic, event, payload, priority=0):
        self.sent.append((topic, event, payload, priority))

    def notify_data_change(self, data_type, data=None):
        self.sent.append((data_type, data))


def test_invalidate_for_change_basic():
    cache = MultiLevelCache(redis_client=None)
    # populate cache entries
    cache.set('league_table', {'a': 1})
    cache.set('match_details', {'m': 2}, 'team1_team2')

    ws = DummyWS()
    inv = SmartCacheInvalidator(cache, websocket_manager=ws)

    # custom rule for test
    rule = InvalidationRule(trigger_type='test_change', affected_caches=['league_table', 'match_details'], identifier_pattern='{home}_{away}', broadcast_update=True)
    inv.register_custom_rule('test_change', rule)

    # apply invalidation
    ok = inv.invalidate_for_change('test_change', {'home': 'team1', 'away': 'team2'})
    assert ok is True

    # memory cache entries should be invalidated
    assert cache.get('league_table') is None
    assert cache.get('match_details', 'team1_team2') is None

    # websocket notifications should be attempted (task_manager may be None => direct send)
    import time
    time.sleep(0.05)  # allow background thread to deliver notification
    assert len(ws.sent) > 0
