"""Service layer exports."""

try:
	from .betting_service import *  # type: ignore  # noqa
except Exception:
	pass

try:
	from .betting_settle import settle_open_bets  # noqa
except Exception:
	settle_open_bets = None  # type: ignore

try:
	from .adv_lineups import apply_lineups_to_adv_stats  # noqa
except Exception:
	apply_lineups_to_adv_stats = None  # type: ignore

try:
	from .snapshots import snapshot_get, snapshot_set  # noqa
except Exception:
	snapshot_get = snapshot_set = None  # type: ignore

__all__ = [
	'settle_open_bets',
	'apply_lineups_to_adv_stats',
	'snapshot_get',
	'snapshot_set',
]
