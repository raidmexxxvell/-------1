import sys
import os
import time

# ensure project root is on path for imports
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from optimizations.multilevel_cache import MultiLevelCache


def test_set_get_invalidate():
    cache = MultiLevelCache(redis_client=None)

    # set and get with identifier
    ok = cache.set('foo', {'v': 1}, 'id1')
    assert ok is True
    got = cache.get('foo', 'id1')
    assert got == {'v': 1}

    # invalidate specific
    assert cache.invalidate('foo', 'id1') is True
    assert cache.get('foo', 'id1') is None


def test_try_acquire():
    cache = MultiLevelCache(redis_client=None)
    key = 'token_test'
    ok = cache.try_acquire(key, ttl_seconds=1)
    assert ok is True
    # second acquire within ttl should fail
    ok2 = cache.try_acquire(key, ttl_seconds=1)
    assert ok2 is False
    # after ttl it should succeed again
    time.sleep(1.1)
    ok3 = cache.try_acquire(key, ttl_seconds=1)
    assert ok3 is True
