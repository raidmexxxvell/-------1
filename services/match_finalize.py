"""Match finalization service.

Отдельный модуль с единой функцией `finalize_match_core` устраняет дублирование
логики между `/api/match/status/set` (при status=finished) и `/api/match/settle`.

Функция идемпотентна относительно статистики игроков за счёт таблицы
`MatchStatsAggregationState` (флаги lineup_counted / events_applied).

Передаём все зависимости явным образом (dependency injection), чтобы избежать
циклического импорта `app.py` и упростить последующую декомпозицию.
"""

from __future__ import annotations

from datetime import datetime, timezone
import time
from typing import Any, Callable, Dict, Optional


def finalize_match_core(
    db,
    home: str,
    away: str,
    *,
    settle_open_bets: bool,
    # Models
    MatchScore,
    MatchSpecials,
    MatchLineupPlayer,
    MatchPlayerEvent,
    TeamPlayerStats,
    MatchStatsAggregationState,
    # Helpers / functions
    snapshot_get: Callable,
    snapshot_set: Callable,
    cache_manager: Any,
    websocket_manager: Any,
    etag_cache: Optional[Dict[str, Any]],
    build_match_meta: Callable[[str, str], Dict[str, Any]],
    mirror_score: Callable[[str, str, int, int], None],
    apply_lineups_adv: Callable[[str, str], None],
    settle_open_bets_fn: Callable[[], None],
    build_schedule_payload: Callable[[], Dict[str, Any]],
    build_league_payload: Callable[[], Dict[str, Any]],
    logger,
    scorers_cache: Dict[str, Any],
):
    """Единая финализация матча.

    Последовательность:
      1. Upsert результата в snapshot 'results' + инвалидация/WS
      2. Автофикс спецрынков (penalty_yes / redcard_yes) => 0 при None
      3. (Опционально) расчёт открытых ставок (через settle_open_bets_fn)
      4. Применение составов в расширенную схему (apply_lineups_adv)
      5. Локальная агрегация TeamPlayerStats (идемпотентно через MatchStatsAggregationState)
         + rebuild scorers + снапшот stats-table
      6. Обновление schedule снапшота
      7. Пересборка league-table снапшота

    Все шаги best-effort: ошибки логируются и не прерывают цепочку.
    """
    home = (home or '').strip(); away = (away or '').strip()
    if not home or not away:
        return

    # 1. Результат -> snapshot 'results'
    try:
        ms = db.query(MatchScore).filter(MatchScore.home == home, MatchScore.away == away).first()
        if ms and ms.score_home is not None and ms.score_away is not None:
            snap = snapshot_get(db, 'results')
            payload = (snap and snap.get('payload')) or {
                'results': [],
                'updated_at': datetime.now(timezone.utc).isoformat(),
            }
            results = payload.get('results') or []
            idx = None
            for i, r in enumerate(results):
                if (r.get('home') or '').strip() == home and (r.get('away') or '').strip() == away:
                    idx = i
                    break
            extra = build_match_meta(home, away) or {}
            entry = {
                'home': home,
                'away': away,
                'score_home': int(ms.score_home),
                'score_away': int(ms.score_away),
                'tour': extra.get('tour'),
                'date': extra.get('date') or '',
                'time': extra.get('time') or '',
                'datetime': extra.get('datetime') or '',
            }
            if idx is not None:
                results[idx] = entry
            else:
                results.append(entry)
            payload['results'] = results
            payload['updated_at'] = datetime.now(timezone.utc).isoformat()
            snapshot_set(db, 'results', payload)
            # Инвалидация / WS
            try:
                if cache_manager:
                    cache_manager.invalidate('results')
            except Exception:
                pass
            try:
                if websocket_manager:
                    websocket_manager.notify_data_change('results', payload)
            except Exception:
                pass
            # Очистка team overview etag-ключей
            if etag_cache is not None:
                try:
                    for k in list(etag_cache.keys()):
                        if k.startswith('team-overview:'):
                            etag_cache.pop(k, None)
                except Exception:
                    pass
            # Зеркало в Google Sheets (best-effort)
            try:
                mirror_score(home, away, int(ms.score_home), int(ms.score_away))
            except Exception:
                pass
    except Exception as e:
        try:
            logger.warning(f"finalize: results upsert failed {home} vs {away}: {e}")
        except Exception:
            pass

    # 2. Specials автофикс
    try:
        spec_row = db.query(MatchSpecials).filter(MatchSpecials.home == home, MatchSpecials.away == away).first()
        auto_fixed = False
        if not spec_row:
            spec_row = MatchSpecials(home=home, away=away)
            db.add(spec_row)
            spec_row.penalty_yes = 0
            spec_row.redcard_yes = 0
            auto_fixed = True
        else:
            if spec_row.penalty_yes is None:
                spec_row.penalty_yes = 0; auto_fixed = True
            if spec_row.redcard_yes is None:
                spec_row.redcard_yes = 0; auto_fixed = True
        if auto_fixed:
            spec_row.updated_at = datetime.now(timezone.utc)
            db.flush()
    except Exception as e:
        try:
            logger.warning(f"finalize: specials auto-fix failed {home} vs {away}: {e}")
        except Exception:
            pass

    # 3. Bets
    if settle_open_bets:
        try:
            settle_open_bets_fn()
        except Exception as e:
            try:
                logger.error(f"finalize: settle_open_bets failed {home} vs {away}: {e}")
            except Exception:
                pass

    # 4. Advanced stats (optional)
    try:
        apply_lineups_adv(home, away)
    except Exception as e:
        try:
            logger.warning(f"finalize: adv stats apply failed {home} vs {away}: {e}")
        except Exception:
            pass

    # 5. Local aggregation TeamPlayerStats
    try:
        lineup_rows = db.query(MatchLineupPlayer).filter(MatchLineupPlayer.home == home, MatchLineupPlayer.away == away).all()
        event_rows = db.query(MatchPlayerEvent).filter(MatchPlayerEvent.home == home, MatchPlayerEvent.away == away).all()
        from collections import defaultdict
        team_players = defaultdict(set)
        for r in lineup_rows:
            team_name = home if (r.team or 'home') == 'home' else away
            team_players[team_name].add((r.player or '').strip())

        def _up(team, player):
            pl = db.query(TeamPlayerStats).filter(TeamPlayerStats.team == team, TeamPlayerStats.player == player).first()
            if not pl:
                pl = TeamPlayerStats(team=team, player=player)
                db.add(pl)
            return pl

        state = db.query(MatchStatsAggregationState).filter(
            MatchStatsAggregationState.home == home,
            MatchStatsAggregationState.away == away,
        ).first()
        if not state:
            state = MatchStatsAggregationState(home=home, away=away, lineup_counted=0, events_applied=0)
            db.add(state)
            db.flush()
        if state.lineup_counted == 0:
            for tname, players in team_players.items():
                for p in players:
                    if not p:
                        continue
                    pl = _up(tname, p)
                    pl.games = (pl.games or 0) + 1
                    pl.updated_at = datetime.now(timezone.utc)
            state.lineup_counted = 1
            state.updated_at = datetime.now(timezone.utc)
        if state.events_applied == 0:
            for ev in event_rows:
                player = (ev.player or '').strip()
                if not player:
                    continue
                tname = home if (ev.team or 'home') == 'home' else away
                pl = _up(tname, player)
                if not pl.games:
                    pl.games = 1
                if ev.type == 'goal':
                    pl.goals = (pl.goals or 0) + 1
                elif ev.type == 'assist':
                    pl.assists = (pl.assists or 0) + 1
                elif ev.type == 'yellow':
                    pl.yellows = (pl.yellows or 0) + 1
                elif ev.type == 'red':
                    pl.reds = (pl.reds or 0) + 1
                pl.updated_at = datetime.now(timezone.utc)
            state.events_applied = 1
            state.updated_at = datetime.now(timezone.utc)
        db.commit()

        # Rebuild scorers + stats-table
        try:
            all_rows = db.query(TeamPlayerStats).all()
            scorers = []
            for r in all_rows:
                total = (r.goals or 0) + (r.assists or 0)
                scorers.append(
                    {
                        'player': r.player,
                        'team': r.team,
                        'games': r.games or 0,
                        'goals': r.goals or 0,
                        'assists': r.assists or 0,
                        'yellows': r.yellows or 0,
                        'reds': r.reds or 0,
                        'total_points': total,
                    }
                )
            scorers.sort(key=lambda x: (-x['total_points'], x['games'], -x['goals']))
            for i, s in enumerate(scorers, start=1):
                s['rank'] = i
            scorers_cache['ts'] = time.time()
            scorers_cache['items'] = scorers

            header = ['Игрок', 'Матчи', 'Голы', 'Пасы', 'ЖК', 'КК', 'Очки']
            rows_sorted = sorted(
                all_rows,
                key=lambda r: (-((r.goals or 0) + (r.assists or 0)), -(r.goals or 0)),
            )
            vals = []
            for r in rows_sorted[:10]:
                pts = (r.goals or 0) + (r.assists or 0)
                vals.append([
                    r.player or '',
                    int(r.games or 0),
                    int(r.goals or 0),
                    int(r.assists or 0),
                    int(r.yellows or 0),
                    int(r.reds or 0),
                    pts,
                ])
            if len(vals) < 10:
                for i in range(len(vals) + 1, 11):
                    vals.append([f'Игрок {i}', 0, 0, 0, 0, 0, 0])
            stats_payload = {
                'range': 'A1:G11',
                'values': [header] + vals,
                'updated_at': datetime.now(timezone.utc).isoformat(),
            }
            try:
                snapshot_set(db, 'stats-table', stats_payload)
            except Exception:
                pass
            try:
                if cache_manager:
                    cache_manager.invalidate('stats_table')
            except Exception:
                pass
            try:
                if websocket_manager:
                    websocket_manager.notify_data_change('stats_table', stats_payload)
            except Exception:
                pass
        except Exception as sc_err:
            try:
                logger.warning(f"finalize: scorers/stats rebuild failed {home} vs {away}: {sc_err}")
            except Exception:
                pass
    except Exception as agg_err:
        try:
            logger.warning(f"finalize: aggregation failed {home} vs {away}: {agg_err}")
        except Exception:
            pass

    # 6. Schedule snapshot
    try:
        schedule_payload = build_schedule_payload()
        snapshot_set(db, 'schedule', schedule_payload)
    except Exception:
        pass

    # 7. League table snapshot
    try:
        league_payload = build_league_payload()
        snapshot_set(db, 'league-table', league_payload)
        try:
            if cache_manager:
                cache_manager.invalidate('league_table')
        except Exception:
            pass
        try:
            if websocket_manager:
                websocket_manager.notify_data_change('league_table', league_payload)
        except Exception:
            pass
    except Exception:
        pass
