"""Bet settlement service.

Функция settle_open_bets(db, now, helpers...) вынесена из монолита для уменьшения
зависимостей и подготовки к дальнейшей декомпозиции.
"""
from __future__ import annotations
from datetime import timedelta

def settle_open_bets(
    db,
    Bet,
    User,
    get_match_result,
    get_match_total_goals,
    get_special_result,
    bet_match_duration_minutes: int,
    now,
    logger,
):
    open_bets = db.query(Bet).filter(Bet.status=='open').all()
    changed = 0
    for b in open_bets:
        if b.match_datetime and b.match_datetime > now:
            continue
        won = None
        if b.market == '1x2':
            res = get_match_result(b.home, b.away)
            if not res:
                continue
            won = (res == b.selection)
        elif b.market == 'totals':
            sel_raw = (b.selection or '').strip()
            side=None; line=None
            if '_' in sel_raw:
                parts = sel_raw.split('_',1)
                if len(parts)==2:
                    side=parts[0]
                    try: line=float(parts[1])
                    except Exception: line=None
            else:
                if len(sel_raw) in (3,4) and sel_raw[0] in ('O','U') and sel_raw[1:].isdigit():
                    side='over' if sel_raw[0]=='O' else 'under'
                    mp={'35':'3.5','45':'4.5','55':'5.5'}; ln=mp.get(sel_raw[1:], sel_raw[1:])
                    try: line=float(ln)
                    except Exception: line=None
            if side not in ('over','under') or line is None:
                continue
            total = get_match_total_goals(b.home, b.away)
            if total is None:
                continue
            won = (total > line) if side=='over' else (total < line)
        elif b.market in ('penalty','redcard'):
            res = get_special_result(b.home, b.away, b.market)
            if res is None:
                finished=False
                if b.match_datetime:
                    try: end_dt = b.match_datetime + timedelta(minutes=bet_match_duration_minutes)
                    except Exception: end_dt = b.match_datetime
                    if end_dt <= now: finished=True
                else:
                    if get_match_result(b.home,b.away) is not None or get_match_total_goals(b.home,b.away) is not None:
                        finished=True
                if not finished:
                    continue
                res = False
            won = ((res is True) and b.selection=='yes') or ((res is False) and b.selection=='no')
        else:
            continue
        if won is None:
            continue
        if won:
            try:
                odd=float(b.odds or '2.0')
            except Exception:
                odd=2.0
            payout=int(round(b.stake*odd))
            b.status='won'; b.payout=payout
            u=db.get(User, b.user_id)
            if u:
                u.credits = int(u.credits or 0) + payout
        else:
            b.status='lost'; b.payout=0
        b.updated_at=now
        changed+=1
    if changed:
        try: db.commit()
        except Exception as e:
            try: db.rollback()
            except Exception: pass
            try: logger.error(f"settle_open_bets commit failed: {e}")
            except Exception: pass
    return changed
