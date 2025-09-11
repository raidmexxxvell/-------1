"""Advanced stats lineups application service."""
from __future__ import annotations
from datetime import datetime, timezone

def apply_lineups_to_adv_stats(
    db,
    home: str,
    away: str,
    MatchStatsAggregationState,
    MatchLineupPlayer,
    adv_db_manager,
    ensure_adv_player,
    update_player_statistics,
    tournament_id: int | None,
    logger,
):
    if not home or not away or tournament_id is None:
        return
    state = db.query(MatchStatsAggregationState).filter(MatchStatsAggregationState.home==home, MatchStatsAggregationState.away==away).first()
    if not state:
        state = MatchStatsAggregationState(home=home, away=away, lineup_counted=0, events_applied=0)
        db.add(state); db.flush()
    if state.lineup_counted == 1:
        return
    lineup_rows = db.query(MatchLineupPlayer).filter(MatchLineupPlayer.home==home, MatchLineupPlayer.away==away).all()
    if not lineup_rows:
        return
    uniq=[]; seen=set()
    for r in lineup_rows:
        nm=(r.player or '').strip()
        if not nm: continue
        if nm.lower() in seen: continue
        seen.add(nm.lower()); uniq.append(nm)
    if not uniq:
        return
    # Advanced schema session
    if not adv_db_manager or not getattr(adv_db_manager,'get_session',None):
        return
    try:
        sess = adv_db_manager.get_session()
        try:
            for player_name in uniq:
                try:
                    pl = ensure_adv_player(sess, player_name)
                    update_player_statistics(sess, pl, 'game', tournament_id)
                except Exception:
                    continue
            sess.commit()
        finally:
            sess.close()
    except Exception as e:
        try: logger.warning(f"adv_lineups apply failed {home} vs {away}: {e}")
        except Exception: pass
    state.lineup_counted = 1
    state.updated_at = datetime.now(timezone.utc)
    try: db.commit()
    except Exception:
        try: db.rollback()
        except Exception: pass
