from __future__ import annotations
from typing import Optional, List, Tuple
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text

# Centralized helpers to read/write match status in the primary table `matches`.
# Transitional mirror to MatchFlags is optional and can be disabled via flag.

VALID_STATUSES = {"scheduled", "live", "finished", "cancelled", "postponed"}


def _find_match_by_team_names(db: Session, home: str, away: str):
    """Best-effort lookup: find latest match by team names.
    This uses Team.name -> ids and then picks most recent Match(home_id, away_id).
    Returns ORM object Match or None.
    """
    from database.database_models import Team, Match
    if not home or not away:
        return None
    h = db.query(Team).filter(Team.name == home).first()
    a = db.query(Team).filter(Team.name == away).first()
    if not h or not a:
        return None
    return (
        db.query(Match)
        .filter(Match.home_team_id == h.id, Match.away_team_id == a.id)
        .order_by(Match.match_date.desc())
        .first()
    )


def set_match_status_by_names(db: Session, home: str, away: str, status: str, *, mirror_to_flags: bool = True) -> Tuple[bool, Optional[str]]:
    """Set match status in `matches` by team names. Optionally mirror to MatchFlags.
    Returns (ok, error)."""
    status = (status or '').strip().lower()
    if status not in VALID_STATUSES:
        return False, f"invalid status: {status}"
    m = _find_match_by_team_names(db, home, away)
    if not m:
        return False, "match not found by team names"
    try:
        m.status = status
        m.updated_at = datetime.utcnow()
        db.commit()
    except Exception as e:
        db.rollback()
        return False, f"failed to update matches.status: {e}"

    if mirror_to_flags:
        try:
            from app import MatchFlags  # local import to avoid cycles at import-time
            now = datetime.utcnow()
            row = db.query(MatchFlags).filter(MatchFlags.home == home, MatchFlags.away == away).first()
            if not row:
                row = MatchFlags(home=home, away=away, status=status, updated_at=now)
                db.add(row)
            else:
                row.status = status
                if status == 'live' and not getattr(row, 'live_started_at', None):
                    row.live_started_at = now
                row.updated_at = now
            db.commit()
        except Exception:
            # best-effort; don't fail primary path
            db.rollback()
    return True, None


def get_match_status_by_names(db: Session, home: str, away: str) -> Optional[str]:
    """Return matches.status by team names, or None if not found."""
    m = _find_match_by_team_names(db, home, away)
    return (m.status if m else None)


def list_live_matches(db: Session) -> List[Tuple[str, str, Optional[str]]]:
    """Return list of (home_name, away_name, live_started_at_iso) for matches with status='live'."""
    from database.database_models import Team, Match
    q = (
        db.query(Match, Team, Team)
        .join(Team, Match.home_team_id == Team.id)
        .join(Team, Match.away_team_id == Team.id)
        .filter(Match.status == 'live')
        .order_by(Match.match_date.desc())
    )
    items: List[Tuple[str, str, Optional[str]]] = []
    for m, th, ta in q.all():
        # Use match_date as live start if precise start is unknown
        live_started_iso = None
        try:
            live_started_iso = m.match_date.isoformat() if hasattr(m, 'match_date') and m.match_date else None
        except Exception:
            live_started_iso = None
        items.append((th.name or '', ta.name or '', live_started_iso))
    return items
