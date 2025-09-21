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
    SnapshotModel,
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

    # 1. Результат -> snapshot 'results' (с безопасным fallback от событий)
    try:
        ms = db.query(MatchScore).filter(MatchScore.home == home, MatchScore.away == away).first()
        score_h = (ms and ms.score_home)
        score_a = (ms and ms.score_away)
        if score_h is None or score_a is None:
            # Fallback: посчитать голы из событий матча
            try:
                from sqlalchemy import and_ as _and
                goals = db.query(MatchPlayerEvent).filter(
                    MatchPlayerEvent.home == home,
                    MatchPlayerEvent.away == away,
                    MatchPlayerEvent.type == 'goal'
                ).all()
                gh = sum(1 for e in goals if (e.team or 'home') == 'home')
                ga = sum(1 for e in goals if (e.team or 'home') != 'home')
                # Если есть хоть один гол/или явно 0:0 (в случае отсутствия событий — не трогаем)
                if goals or (gh == 0 and ga == 0):
                    score_h = gh
                    score_a = ga
                    # Зафиксируем в MatchScore для консистентности
                    if not ms:
                        ms = MatchScore(home=home, away=away)
                        db.add(ms)
                    ms.score_home = int(score_h)
                    ms.score_away = int(score_a)
                    ms.updated_at = datetime.now(timezone.utc)
                    db.commit()
            except Exception:
                pass
        if score_h is not None and score_a is not None:
            snap = snapshot_get(db, SnapshotModel, 'results', logger)
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
                'score_home': int(score_h),
                'score_away': int(score_a),
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
            snapshot_set(db, SnapshotModel, 'results', payload, logger)
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
            # Ранее здесь зеркалировался счёт в Google Sheets (удалено)
    except Exception as e:
        try:
            logger.warning(f"finalize: results upsert failed {home} vs {away}: {e}")
        except Exception:
            pass

    # 1b. Зеркалирование финального счёта в таблицу matches (новая схема)
    #     Правки важны для экрана команды (team/overview), который агрегирует по matches.
    try:
        # Импортируем модели из новой схемы только здесь, чтобы избежать жёстких зависимостей при отсутствии пакета
        from database.database_models import Team as _TeamModel, Match as _MatchModel
        # Узнаём id команд по имени
        teams = db.query(_TeamModel).filter(_TeamModel.name.in_([home, away])).all()
        name_to_id = {t.name: t.id for t in teams}
        hid = name_to_id.get(home)
        aid = name_to_id.get(away)
        if hid and aid:
            # Пытаемся уточнить дату матча из расписания, чтобы выбрать нужную запись среди возможных нескольких
            target_dt = None
            try:
                meta = build_match_meta(home, away) if callable(build_match_meta) else None
                dt_str = (meta or {}).get('datetime') or ''
                if dt_str:
                    # ISO или близкий формат
                    from datetime import datetime as _dt
                    try:
                        target_dt = _dt.fromisoformat(dt_str.replace('Z', '+00:00'))
                    except Exception:
                        target_dt = None
            except Exception:
                target_dt = None

            q = db.query(_MatchModel).filter(
                _MatchModel.home_team_id == hid,
                _MatchModel.away_team_id == aid
            )
            candidates = q.all()
            chosen = None
            if candidates:
                # Выбираем запись:
                # 1) если известна целевая дата — ближайшая по |match_date - target_dt|
                # 2) иначе приоритет по статусу: live -> scheduled -> finished (последняя по дате)
                from datetime import datetime as _dt, timezone as _tz
                now_dt = _dt.now(_tz.utc)
                def _score(candidate):
                    md = getattr(candidate, 'match_date', None)
                    st = (getattr(candidate, 'status', '') or '').lower()
                    # Близость к целевой дате, затем к текущему времени, затем по статусу
                    if target_dt and md:
                        try:
                            diff = abs((md - target_dt).total_seconds())
                        except Exception:
                            diff = 10**12
                    elif md:
                        try:
                            diff = abs((md - now_dt).total_seconds()) + 10**6  # штраф за отсутствие target_dt
                        except Exception:
                            diff = 10**12
                    else:
                        diff = 10**12
                    st_rank = {'live': 0, 'scheduled': 1, 'finished': 2}.get(st, 3)
                    return (diff, st_rank, -(getattr(candidate, 'id', 0) or 0))
                chosen = sorted(candidates, key=_score)[0]
            if chosen is not None:
                # Устанавливаем итоговый счёт и статус finished, если известен счёт
                if (score_h is not None) and (score_a is not None):
                    try:
                        chosen.home_score = int(score_h)
                    except Exception:
                        pass
                    try:
                        chosen.away_score = int(score_a)
                    except Exception:
                        pass
                # Если статус ещё не finished — проставим
                try:
                    st = (chosen.status or 'scheduled').lower()
                    if st != 'finished' and (score_h is not None) and (score_a is not None):
                        chosen.status = 'finished'
                except Exception:
                    pass
                try:
                    chosen.updated_at = datetime.now(timezone.utc)
                except Exception:
                    pass
                db.commit()
    except Exception as e:
        try:
            logger.warning(f"finalize: mirror to matches failed {home} vs {away}: {e}")
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
                snapshot_set(db, SnapshotModel, 'stats-table', stats_payload, logger)
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

        # --- Update dynamic per-team stats tables (team_stats_<team_id>) ---
        try:
            # Импортирующиеся здесь, чтобы не тянуть heavy объекты выше
            from sqlalchemy import text as _sql_text
            from database.database_models import Team
            # Инвалидация глобального goal+assist лидерборда (двухуровневый кэш)
            try:
                if cache_manager:
                    cache_manager.invalidate('leaderboards', identifier='goal-assist')
            except Exception:
                pass
            try:
                if websocket_manager:
                    websocket_manager.notify_data_change('leader-goal-assist', {'reason': 'invalidate', 'ts': datetime.now(timezone.utc).isoformat()})
            except Exception:
                pass
            # 0. Таблица идемпотентности для динамических инкрементов
            db.execute(_sql_text("""
            CREATE TABLE IF NOT EXISTS dynamic_team_stats_applied (
                home VARCHAR(120) NOT NULL,
                away VARCHAR(120) NOT NULL,
                applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (home, away)
            );"""))
            already_applied = db.execute(_sql_text(
                "SELECT 1 FROM dynamic_team_stats_applied WHERE home=:h AND away=:a"), {'h': home, 'a': away}
            ).first()
            if already_applied:
                # Идемпотентность: пропускаем повторный динамический апдейт
                pass
            else:
                # Получаем id команд по имени (допускаем уникальность name среди активных)
                teams = db.query(Team).filter(Team.name.in_([home, away])).all()
                name_to_id = {t.name: t.id for t in teams}

                def _ensure_table(team_id: int):
                    table = f"team_stats_{team_id}";
                    ddl = f"""
                    CREATE TABLE IF NOT EXISTS {table} (
                        player_id INTEGER PRIMARY KEY,
                        first_name VARCHAR(100) NOT NULL,
                        last_name VARCHAR(150) NOT NULL DEFAULT '',
                        matches_played INTEGER NOT NULL DEFAULT 0,
                        goals INTEGER NOT NULL DEFAULT 0,
                        assists INTEGER NOT NULL DEFAULT 0,
                        yellow_cards INTEGER NOT NULL DEFAULT 0,
                        red_cards INTEGER NOT NULL DEFAULT 0,
                        last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    );"""
                    db.execute(_sql_text(ddl))

                # Агрегация по строкам lineup_rows / event_rows (они используют player как строковое поле)
                from collections import defaultdict as _dd
                # team_name -> player_name -> stat_key -> int
                def _zero_dict():
                    return {'matches_played': 0, 'goals': 0, 'assists': 0, 'yellow_cards': 0, 'red_cards': 0}
                per_team_player = _dd(lambda: _dd(_zero_dict))
                # matches_played: учитываем уникальный игрок в составе
                seen_match_presence = set()
                for lr in lineup_rows:
                    pname = (lr.player or '').strip()
                    if not pname:
                        continue
                    team_name = home if (lr.team or 'home') == 'home' else away
                    key = (team_name, pname)
                    if key not in seen_match_presence:
                        per_team_player[team_name][pname]['matches_played'] = per_team_player[team_name][pname].get('matches_played', 0) + 1
                        seen_match_presence.add(key)
                for ev in event_rows:
                    pname = (ev.player or '').strip()
                    if not pname:
                        continue
                    team_name = home if (ev.team or 'home') == 'home' else away
                    if ev.type == 'goal':
                        per_team_player[team_name][pname]['goals'] = per_team_player[team_name][pname].get('goals', 0) + 1
                    elif ev.type == 'assist':
                        per_team_player[team_name][pname]['assists'] = per_team_player[team_name][pname].get('assists', 0) + 1
                    elif ev.type == 'yellow':
                        per_team_player[team_name][pname]['yellow_cards'] = per_team_player[team_name][pname].get('yellow_cards', 0) + 1
                    elif ev.type == 'red':
                        per_team_player[team_name][pname]['red_cards'] = per_team_player[team_name][pname].get('red_cards', 0) + 1

                # Обновление по двум командам
                for team_name, players_map in per_team_player.items():
                    team_id = name_to_id.get(team_name)
                    if not team_id:
                        continue
                    _ensure_table(team_id)
                    table = f"team_stats_{team_id}"
                    for full_name, stats_map in players_map.items():
                        parts = full_name.split()
                        if len(parts) == 1:
                            first_name = parts[0]; last_name = ''
                        else:
                            first_name = parts[0]; last_name = ' '.join(parts[1:])
                        # Находим/создаём player_id в team_roster (без fallback hash)
                        roster_row = db.execute(_sql_text(
                            "SELECT id FROM team_roster WHERE team = :t AND lower(player)=lower(:p) ORDER BY id LIMIT 1"
                        ), {'t': team_name, 'p': full_name}).first()
                        if roster_row:
                            player_id = roster_row[0]
                        else:
                            # Авто-добавление в roster чтобы сохранить консистентность
                            ins = db.execute(_sql_text(
                                "INSERT INTO team_roster (team, player, created_at) VALUES (:t, :p, CURRENT_TIMESTAMP) RETURNING id"
                            ), {'t': team_name, 'p': full_name}).first()
                            player_id = ins[0]
                        up_sql = f"""
                        INSERT INTO {table} (player_id, first_name, last_name, matches_played, goals, assists, yellow_cards, red_cards, last_updated)
                        VALUES (:pid, :fn, :ln, :mp, :g, :a, :yc, :rc, CURRENT_TIMESTAMP)
                        ON CONFLICT (player_id) DO UPDATE SET
                            first_name = EXCLUDED.first_name,
                            last_name = EXCLUDED.last_name,
                            matches_played = {table}.matches_played + EXCLUDED.matches_played,
                            goals = {table}.goals + EXCLUDED.goals,
                            assists = {table}.assists + EXCLUDED.assists,
                            yellow_cards = {table}.yellow_cards + EXCLUDED.yellow_cards,
                            red_cards = {table}.red_cards + EXCLUDED.red_cards,
                            last_updated = CURRENT_TIMESTAMP
                        """
                        db.execute(_sql_text(up_sql), {
                            'pid': player_id,
                            'fn': first_name,
                            'ln': last_name,
                            'mp': (stats_map or {}).get('matches_played', 0),
                            'g': (stats_map or {}).get('goals', 0),
                            'a': (stats_map or {}).get('assists', 0),
                            'yc': (stats_map or {}).get('yellow_cards', 0),
                            'rc': (stats_map or {}).get('red_cards', 0),
                        })
                # Фиксируем применение, чтобы избежать повторного инкремента
                db.execute(_sql_text(
                    "INSERT INTO dynamic_team_stats_applied (home, away) VALUES (:h, :a) ON CONFLICT (home, away) DO NOTHING"
                ), {'h': home, 'a': away})
                db.commit()
                # Инвалидация кэша глобального goal-assist лидерборда (если используется MultiLevelCache)
                try:
                    from optimizations.multilevel_cache import get_cache as _get_cache
                    _cache = _get_cache()
                    try:
                        _cache.invalidate('leaderboards', 'goal-assist')
                    except Exception:
                        pass
                except Exception:
                    pass
            db.commit()  # commit при no-op (already_applied)
        except Exception as dyn_err:
            try:
                logger.warning(f"finalize: dynamic team stats update failed {home} vs {away}: {dyn_err}")
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
        snapshot_set(db, SnapshotModel, 'schedule', schedule_payload, logger)
    except Exception:
        pass

    # 7. League table snapshot
    try:
        league_payload = build_league_payload()
        snapshot_set(db, SnapshotModel, 'league-table', league_payload, logger)
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
