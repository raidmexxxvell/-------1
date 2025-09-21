"""
Admin API routes for Liga Obninska
Handles all admin-related endpoints and operations
"""
from flask import Blueprint, request, jsonify, g
from datetime import datetime, timezone
import os
import time
from sqlalchemy import text
import hashlib, json

admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')

def init_admin_routes(app, get_db, SessionLocal, parse_and_verify_telegram_init_data, 
                     MatchFlags, _snapshot_set, _build_betting_tours_payload, _settle_open_bets):
    """Initialize admin routes with dependencies"""

    # Инициализация логгера выполняется в app.before_request (см. app.py)
    # Здесь ничего не делаем, чтобы не обращаться к g вне контекста запроса

    def _get_admin_id():
        """Получение ID админа из запроса"""
        admin_id_env = os.environ.get('ADMIN_USER_ID', '')
        if not admin_id_env:
            return None
        try:
            return int(admin_id_env)
        except ValueError:
            return None

    def _is_admin_request():
        """Проверка: либо валидный Telegram initData, либо cookie admin_auth."""
        admin_id_env = os.environ.get('ADMIN_USER_ID','')
        if not admin_id_env:
            return False
        # Telegram
        try:
            parsed = parse_and_verify_telegram_init_data(request.form.get('initData','') or request.args.get('initData',''))
            if parsed and parsed.get('user') and str(parsed['user'].get('id')) == admin_id_env:
                return True
        except Exception:
            pass
        # Cookie
        try:
            cookie_token = request.cookies.get('admin_auth')
            admin_pass = os.environ.get('ADMIN_PASSWORD','')
            if cookie_token and admin_pass:
                expected = hashlib.sha256()
                import hmac as _hmac
                expected_val = _hmac.new(admin_pass.encode('utf-8'), admin_id_env.encode('utf-8'), hashlib.sha256).hexdigest()
                if _hmac.compare_digest(cookie_token, expected_val):
                    return True
        except Exception:
            pass
        return False

    @admin_bp.route('/backfill/scores', methods=['POST'])
    def api_admin_backfill_scores():
        """Перенос финальных счетов из legacy match_scores в таблицу matches.
        Условия обновления: ищем пары (home, away), находим в новой схеме матч со статусом 'finished'
        и нулевым счётом (0:0), либо пустым, и проставляем значения из legacy, если они заданы.
        Требует прав администратора."""
        try:
            if not _is_admin_request():
                return jsonify({'error': 'Недействительные данные'}), 401
            if SessionLocal is None:
                return jsonify({'error': 'БД недоступна'}), 500
            # Попытка импортировать legacy модель из app.py
            try:
                from app import MatchScore as _LegacyMatchScore
            except Exception:
                _LegacyMatchScore = None
            if _LegacyMatchScore is None:
                return jsonify({'error': 'Legacy match_scores не доступны'}), 500
            db = get_db()
            updated = 0; scanned = 0
            try:
                from database.database_models import Team as _Team, Match as _Match
                rows = db.query(_LegacyMatchScore).all()
                from datetime import datetime, timezone
                name_to_id = {}
                for r in rows:
                    scanned += 1
                    home = (r.home or '').strip(); away = (r.away or '').strip()
                    if not home or not away:
                        continue
                    sh = r.score_home; sa = r.score_away
                    if sh is None or sa is None:
                        # Нет достоверного счёта в legacy — пропускаем
                        continue
                    # Получаем id команд с кэшем
                    if home not in name_to_id:
                        t = db.query(_Team).filter(_Team.name == home).first()
                        name_to_id[home] = (t and t.id) or None
                    if away not in name_to_id:
                        t = db.query(_Team).filter(_Team.name == away).first()
                        name_to_id[away] = (t and t.id) or None
                    hid = name_to_id.get(home); aid = name_to_id.get(away)
                    if not (hid and aid):
                        continue
                    # Ищем завершённые матчи этой пары с нулевым счётом для безопасного апдейта
                    cand = db.query(_Match).filter(
                        _Match.home_team_id == hid,
                        _Match.away_team_id == aid,
                        _Match.status == 'finished'
                    ).order_by(_Match.match_date.desc()).all()
                    target = None
                    for m in cand:
                        try:
                            hs0 = int(m.home_score or 0)
                            as0 = int(m.away_score or 0)
                        except Exception:
                            hs0 = 0; as0 = 0
                        # Обновляем, если в matches 0:0 (частый случай отсутствия записи)
                        if hs0 == 0 and as0 == 0:
                            target = m
                            break
                    if not target and cand:
                        # Если нет 0:0, но хотим синхронизировать (например, реальный 0:0) — пропускаем, чтобы не ломать.
                        continue
                    if target:
                        target.home_score = int(sh)
                        target.away_score = int(sa)
                        target.updated_at = datetime.now(timezone.utc)
                        updated += 1
                if updated:
                    db.commit()
            finally:
                try:
                    db.close()
                except Exception:
                    pass
            # Инвалидация team-overview ETag ключей
            try:
                from app import _ETAG_CACHE as _EC
            except Exception:
                _EC = None
            if _EC is None:
                try:
                    from app import _ETAG_HELPER_CACHE as _EC
                except Exception:
                    _EC = None
            if _EC is not None:
                try:
                    for k in list(_EC.keys()):
                        if str(k).startswith('team-overview:'):
                            _EC.pop(k, None)
                except Exception:
                    pass
            return jsonify({'ok': True, 'scanned': scanned, 'updated': updated})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @admin_bp.route('/match/status/set', methods=['POST'])
    def api_match_status_set():
        """Установка статуса матча админом: scheduled|live|finished"""
        start_time = time.time()
        admin_id = _get_admin_id()
        
        try:
            if not _is_admin_request():
                return jsonify({'error': 'Недействительные данные'}), 401

            home = (request.form.get('home') or '').strip()
            away = (request.form.get('away') or '').strip()
            status = request.form.get('status', 'scheduled')

            if not home or not away or status not in ('scheduled', 'live', 'finished'):
                return jsonify({'error': 'home/away/status обязательны'}), 400

            if SessionLocal is None:
                return jsonify({'error': 'БД недоступна'}), 500

            # Подготовка данных для лога
            request_data = {
                'home': home,
                'away': away,
                'status': status
            }
            
            affected_entities = {
                'match': f"{home} vs {away}",
                'new_status': status
            }

            db = get_db()
            try:
                # Determine old_status from primary table if possible (for audit)
                old_status = 'unknown'
                try:
                    from utils.match_status import get_match_status_by_names
                    cur = get_match_status_by_names(db, home, away)
                    if cur:
                        old_status = cur
                except Exception:
                    pass
                # Primary source of truth: update matches.status
                try:
                    from utils.match_status import set_match_status_by_names
                    ok, err = set_match_status_by_names(db, home, away, status, mirror_to_flags=True)
                    affected_entities['matches_status_set'] = bool(ok)
                    if not ok:
                        affected_entities['matches_status_error'] = err
                except Exception as he:
                    affected_entities['matches_status_error'] = str(he)

                # Обновляем снапшот betting-tours при изменении статуса
                try:
                    payload = _build_betting_tours_payload()
                    _snapshot_set(db, 'betting-tours', payload)
                    affected_entities['betting_tours_updated'] = True
                except Exception as e:
                    app.logger.warning(f"Failed to build betting tours payload: {e}")
                    affected_entities['betting_tours_error'] = str(e)

                if status == 'finished':
                    # Расчёт открытых ставок
                    try:
                        _settle_open_bets()
                        affected_entities['bets_settled'] = True
                    except Exception as e:
                        app.logger.error(f"Failed to settle open bets: {e}")
                        affected_entities['bets_settlement_error'] = str(e)
                    
                    # Корректный пересчёт статистики игроков
                    try:
                        from database.database_models import Team, Match, TeamComposition, PlayerStatistics
                        # Точное сопоставление названий с Team
                        home_team = db.query(Team).filter(Team.name==home).first()
                        away_team = db.query(Team).filter(Team.name==away).first()
                        match_obj = None
                        if home_team and away_team:
                            match_obj = db.query(Match).filter(
                                Match.home_team_id==home_team.id,
                                Match.away_team_id==away_team.id
                            ).order_by(Match.match_date.desc()).first()
                        if match_obj:
                            if match_obj.status != 'finished':
                                match_obj.status = 'finished'
                                match_obj.updated_at = datetime.now(timezone.utc)
                                affected_entities['match_status_updated'] = True
                            # Здесь идет остальная логика...
                                # чтобы перенести в расширенную модель как итоговый
                                try:
                                    from app import MatchScore as _LegacyMatchScore
                                    from app import SessionLocal as _SessLocal, get_db as _get_db
                                except Exception:
                                    _LegacyMatchScore = None; _SessLocal = None; _get_db = None
                                try:
                                    sh = sa = None
                                    if _LegacyMatchScore is not None and _SessLocal is not None and _get_db is not None:
                                        _db0 = _get_db()
                                        try:
                                            row = _db0.query(_LegacyMatchScore).filter(_LegacyMatchScore.home==home, _LegacyMatchScore.away==away).first()
                                            if row:
                                                sh = row.score_home; sa = row.score_away
                                        finally:
                                            _db0.close()
                                    if sh is not None and sa is not None:
                                        match_obj.home_score = int(sh)
                                        match_obj.away_score = int(sa)
                                except Exception:
                                    pass
                            tournament_id = match_obj.tournament_id
                            player_ids = [pid for (pid,) in db.query(TeamComposition.player_id).filter(TeamComposition.match_id==match_obj.id).all()]
                            for pid in player_ids:
                                # Идемпотентный агрегирующий пересчёт
                                db.execute(text("""
                                    INSERT INTO player_statistics (
                                        player_id, tournament_id, matches_played, goals_scored, assists, yellow_cards, red_cards
                                    )
                                    SELECT
                                        :pid, :tid,
                                        COUNT(DISTINCT tc.match_id) FILTER (WHERE m.status = 'finished') AS matches_played,
                                        COUNT(CASE WHEN me.event_type = 'goal' THEN 1 END) AS goals_scored,
                                        COUNT(CASE WHEN me.event_type = 'assist' THEN 1 END) AS assists,
                                        COUNT(CASE WHEN me.event_type = 'yellow_card' THEN 1 END) AS yellow_cards,
                                        COUNT(CASE WHEN me.event_type = 'red_card' THEN 1 END) AS red_cards
                                    FROM team_compositions tc
                                    JOIN matches m ON tc.match_id = m.id
                                    LEFT JOIN match_events me ON me.player_id = tc.player_id AND me.match_id = m.id
                                    WHERE tc.player_id = :pid AND m.tournament_id = :tid
                                    GROUP BY tc.player_id
                                    ON CONFLICT (player_id, tournament_id) DO UPDATE SET
                                        matches_played = EXCLUDED.matches_played,
                                        goals_scored = EXCLUDED.goals_scored,
                                        assists = EXCLUDED.assists,
                                        yellow_cards = EXCLUDED.yellow_cards,
                                        red_cards = EXCLUDED.red_cards,
                                        last_updated = CURRENT_TIMESTAMP
                                """), {'pid': pid, 'tid': tournament_id})
                            db.commit()
                            # Инвалидация кэша статистики
                            try:
                                from optimizations.multilevel_cache import get_cache
                                get_cache().invalidate('stats_table')
                            except Exception as _inv_err:
                                app.logger.warning(f"stats_table cache invalidate failed: {_inv_err}")
                            # Уведомления и инвалидация таблицы/результатов
                            try:
                                from optimizations.smart_invalidator import SmartCacheInvalidator
                                from app import invalidator as _inv
                                if _inv:
                                    _inv.invalidate_for_change('league_table_update', {})
                                    _inv.invalidate_for_change('schedule_update', {})
                            except Exception:
                                pass
                        else:
                            app.logger.warning(f"Finished status set but Match not resolved for pair {home} vs {away}")
                            affected_entities['warning'] = f"Match not resolved for pair {home} vs {away}"
                    except Exception as stats_err:
                        app.logger.error(f"Failed to update matches_played stats: {stats_err}")
                        affected_entities['stats_error'] = str(stats_err)

                    # После успешной установки статуса finished — проверка завершения тура и очистка голосов
                    try:
                        # Подключаем легковесный сервис очистки голосов
                        from services.vote_cleanup import cleanup_votes_if_tour_finished
                        # Для корректной работы нужны ORM-модели Match и MatchVote из основной схемы
                        try:
                            from database.database_models import Match as AdvMatch
                        except Exception:
                            AdvMatch = None
                        try:
                            from app import MatchVote as LegacyMatchVote
                        except Exception:
                            LegacyMatchVote = None
                        if match_obj is not None and AdvMatch is not None and LegacyMatchVote is not None:
                            deleted_votes = cleanup_votes_if_tour_finished(db, AdvMatch, LegacyMatchVote, match_obj)
                            if deleted_votes:
                                affected_entities['votes_deleted'] = int(deleted_votes)
                    except Exception as _vdel_err:
                        app.logger.warning(f"vote cleanup skipped: {_vdel_err}")

                # Логирование успешной операции
                execution_time = int((time.time() - start_time) * 1000)
                if admin_id and hasattr(g, 'admin_logger') and g.admin_logger:
                    action_name = "Изменение статуса матча"
                    description = f"Изменен статус матча {home} vs {away} с '{old_status}' на '{status}'"
                    if status == 'finished':
                        description += ". Выполнена автоматическая обработка: расчёт ставок, обновление статистики игроков, инвалидация кэшей"
                    
                    g.admin_logger.log_action(
                        admin_id=admin_id,
                        action=action_name,
                        description=description,
                        endpoint=f"POST {request.path}",
                        request_data=request_data,
                        result_status='success',
                        result_message='Статус матча успешно обновлен',
                        affected_entities=affected_entities,
                        execution_time_ms=execution_time
                    )

                return jsonify({'ok': True, 'status': status})
            finally:
                db.close()
        except Exception as e:
            # Логирование ошибки
            execution_time = int((time.time() - start_time) * 1000)
            if admin_id and hasattr(g, 'admin_logger') and g.admin_logger:
                g.admin_logger.log_action(
                    admin_id=admin_id,
                    action="Изменение статуса матча",
                    description=f"ОШИБКА при изменении статуса матча {request.form.get('home', 'N/A')} vs {request.form.get('away', 'N/A')}",
                    endpoint=f"POST {request.path}",
                    request_data=dict(request.form),
                    result_status='error',
                    result_message=str(e),
                    execution_time_ms=execution_time
                )
            
            app.logger.error(f"Match status set error: {e}")
            return jsonify({'error': 'Не удалось установить статус матча'}), 500

    @admin_bp.route('/season/rollover', methods=['POST'])
    def api_season_rollover():
        """Завершает активный турнир и создаёт следующий сезон (формат YY-YY).
        Параметры:
          ?dry=1  — только показать, что будет сделано, без изменений
          ?soft=1 — не очищать legacy таблицы, только переключить сезон
        Аудит пишется в season_rollovers."""
        start_time = time.time()
        admin_id = _get_admin_id()
        
        try:
            if not _is_admin_request():
                return jsonify({'error': 'Недействительные данные'}), 401

            # Работаем с расширенной схемой (tournaments)
            try:
                from database.database_models import db_manager as adv_db_manager, Tournament
            except Exception as imp_err:
                return jsonify({'error': f'advanced schema unavailable: {imp_err}'}), 500
            try:
                adv_db_manager._ensure_initialized()
            except Exception as init_err:
                return jsonify({'error': f'db init failed: {init_err}'}), 500

            dry_run = request.args.get('dry') in ('1','true','yes')
            soft_mode = request.args.get('soft') in ('1','true','yes')
            
            # Подготовка данных для лога
            request_data = {
                'dry_run': dry_run,
                'soft_mode': soft_mode
            }
            
            affected_entities = {
                'operation_type': 'dry_run' if dry_run else ('soft_rollover' if soft_mode else 'full_rollover')
            }

            adv_sess = adv_db_manager.get_session()
            try:
                # Находим активный турнир (берём самый последний по start_date/created_at)
                active = (adv_sess.query(Tournament)
                          .filter(Tournament.status=='active')
                          .order_by(Tournament.start_date.desc().nullslast(), Tournament.created_at.desc())
                          .first())

                def compute_next(season_str: str|None):
                    import re, datetime as _dt
                    if season_str:
                        m = re.match(r'^(\d{2})[-/](\d{2})$', season_str.strip())
                        if m:
                            a = int(m.group(1)); b = int(m.group(2))
                            return f"{(a+1)%100:02d}-{(b+1)%100:02d}"
                    # fallback: текущий / следующий год
                    now = _dt.date.today()
                    # Сезон начинается с июля: если до июля — считаем прошлый/текущий
                    if now.month >= 7:
                        a = now.year % 100
                        b = (now.year + 1) % 100
                    else:
                        a = (now.year - 1) % 100
                        b = now.year % 100
                    return f"{a:02d}-{b:02d}"

                prev_season = active.season if active else None
                # Если активный найден — завершаем
                from datetime import date
                new_season = compute_next(active.season if active else None)

                # Rate-limit (кроме dry): не чаще одного успешного запуска (soft/full) за 600 сек
                if not dry_run:
                    try:
                        last_row = adv_sess.execute(text("SELECT created_at FROM season_rollovers ORDER BY created_at DESC LIMIT 1"))
                        last_ts = None
                        for r in last_row:
                            last_ts = r[0]
                        if last_ts:
                            # сравнение в секундах
                            from datetime import datetime as _dtm, timezone as _tz
                            now_utc = _dtm.now(_tz.utc)
                            delta = (now_utc - last_ts).total_seconds()
                            if delta < 600:  # 10 минут
                                return jsonify({'error':'rate_limited','retry_after_seconds': int(600-delta)}), 429
                    except Exception as rl_err:
                        app.logger.warning(f"season rollover rate-limit check failed: {rl_err}")

                # Сбор предварительного состояния
                def collect_state_summary():
                    summary = {}
                    try:
                        # tournaments
                        t_total = adv_sess.execute(text('SELECT COUNT(*) FROM tournaments')).scalar() or 0
                        t_active = adv_sess.execute(text("SELECT COUNT(*) FROM tournaments WHERE status='active'" )).scalar() or 0
                        last_season_row = adv_sess.execute(text('SELECT season FROM tournaments ORDER BY created_at DESC LIMIT 1')).fetchone()
                        summary['tournaments_total'] = t_total
                        summary['tournaments_active'] = t_active
                        summary['last_season'] = last_season_row[0] if last_season_row else None
                        ps_rows = adv_sess.execute(text('SELECT COUNT(*) FROM player_statistics')).scalar() or 0
                        summary['player_statistics_rows'] = ps_rows
                    except Exception as _e:
                        summary['error_tournaments'] = str(_e)
                    # legacy counts (separate connection)
                    legacy_counts = {}
                    legacy_db_local = get_db()
                    try:
                        for tbl in ['team_player_stats','match_scores','match_player_events','match_lineups','match_stats','match_flags']:
                            try:
                                cnt = legacy_db_local.execute(text(f'SELECT COUNT(*) FROM {tbl}')).scalar() or 0
                                legacy_counts[tbl] = cnt
                            except Exception as _tbl_e:
                                legacy_counts[tbl] = f"err:{_tbl_e}"
                    finally:
                        try: legacy_db_local.close()
                        except Exception: pass
                    summary['legacy'] = legacy_counts
                    # hash
                    try:
                        h = hashlib.sha256(json.dumps(summary, sort_keys=True).encode('utf-8')).hexdigest()
                        summary['_hash'] = h
                    except Exception:
                        summary['_hash'] = None
                    return summary

                pre_summary = collect_state_summary()

                # Dry-run: возвращаем план
                if dry_run:
                    return jsonify({
                        'ok': True,
                        'dry_run': True,
                        'would_complete': active.season if active else None,
                        'would_create': new_season,
                        'soft_mode': soft_mode,
                        'legacy_cleanup': [] if soft_mode else ['team_player_stats','match_scores','match_player_events','match_lineups','match_stats','match_flags'],
                        'pre_hash': pre_summary.get('_hash'),
                        'pre_summary': pre_summary
                    })

                prev_id = active.id if active else None
                prev_season = active.season if active else None
                if active:
                    active.status = 'completed'
                    active.end_date = date.today()
                new_tournament = Tournament(
                    name=f"Лига Обнинска {new_season}",
                    season=new_season,
                    status='active',
                    start_date=date.today(),
                    description=f"Сезон {new_season}"
                )
                adv_sess.add(new_tournament)
                adv_sess.flush()  # получить ID до потенциального аудита

                # Лог аудит / эволюция таблицы
                try:
                    adv_sess.execute(text("""
                        CREATE TABLE IF NOT EXISTS season_rollovers (
                            id SERIAL PRIMARY KEY,
                            prev_tournament_id INT NULL,
                            prev_season TEXT NULL,
                            new_tournament_id INT NOT NULL,
                            new_season TEXT NOT NULL,
                            soft_mode BOOLEAN NOT NULL DEFAULT FALSE,
                            legacy_cleanup_done BOOLEAN NOT NULL DEFAULT FALSE,
                            pre_hash TEXT NULL,
                            post_hash TEXT NULL,
                            pre_meta TEXT NULL,
                            post_meta TEXT NULL,
                            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                        )"""))
                    # ALTER для старых таблиц (идемпотентно)
                    for col in ['pre_hash TEXT','post_hash TEXT','pre_meta TEXT','post_meta TEXT']:
                        try:
                            adv_sess.execute(text(f'ALTER TABLE season_rollovers ADD COLUMN IF NOT EXISTS {col}'))
                        except Exception:
                            pass
                except Exception as crt_err:
                    app.logger.warning(f"season_rollovers create/alter failed: {crt_err}")

                # Сброс legacy если не soft
                legacy_cleanup_done = False
                legacy_list = ['team_player_stats','match_scores','match_player_events','match_lineups','match_stats','match_flags']
                if not soft_mode:
                    legacy_db = get_db()
                    try:
                        for tbl in legacy_list:
                            try:
                                legacy_db.execute(text(f'DELETE FROM {tbl}'))
                            except Exception as tbl_err:
                                app.logger.warning(f"Failed to clear {tbl}: {tbl_err}")
                        legacy_db.commit()
                        legacy_cleanup_done = True
                    finally:
                        try: legacy_db.close()
                        except Exception: pass

                # Запись аудита (предварительно, без post_hash)
                audit_id = None
                try:
                    res = adv_sess.execute(text("""
                        INSERT INTO season_rollovers (prev_tournament_id, prev_season, new_tournament_id, new_season, soft_mode, legacy_cleanup_done, pre_hash, pre_meta)
                        VALUES (:pid, :ps, :nid, :ns, :soft, :lcd, :ph, :pm)
                        RETURNING id
                    """), {
                        'pid': prev_id,
                        'ps': prev_season,
                        'nid': new_tournament.id,
                        'ns': new_season,
                        'soft': soft_mode,
                        'lcd': legacy_cleanup_done,
                        'ph': pre_summary.get('_hash'),
                        'pm': json.dumps(pre_summary, ensure_ascii=False)
                    })
                    row = res.fetchone()
                    if row:
                        audit_id = row[0]
                except Exception as ins_audit_err:
                    app.logger.warning(f"season_rollovers audit insert failed: {ins_audit_err}")

                # Post summary (после изменений)
                post_summary = collect_state_summary()
                try:
                    if audit_id is not None:
                        adv_sess.execute(text("""
                            UPDATE season_rollovers SET post_hash=:h, post_meta=:pm WHERE id=:id
                        """), {'h': post_summary.get('_hash'), 'pm': json.dumps(post_summary, ensure_ascii=False), 'id': audit_id})
                except Exception as upd_audit_err:
                    app.logger.warning(f"season_rollovers audit post update failed: {upd_audit_err}")

                adv_sess.commit()

                # Инвалидация кэшей (после фиксации транзакции)

                # Инвалидация кэшей
                try:
                    from optimizations.multilevel_cache import get_cache
                    cache = get_cache()
                    for key in ('league_table','stats_table','results','schedule','tours','betting-tours'):
                        try: cache.invalidate(key)
                        except Exception: pass
                    affected_entities['cache_invalidated'] = True
                except Exception as _c_err:
                    app.logger.warning(f"cache invalidate failed season rollover: {_c_err}")
                    affected_entities['cache_error'] = str(_c_err)

                # Логирование успешной операции
                execution_time = int((time.time() - start_time) * 1000)
                if admin_id and hasattr(g, 'admin_logger') and g.admin_logger:
                    action_name = "Переход к новому сезону" + (" (пробный)" if dry_run else "")
                    description = f"Выполнен переход с сезона '{prev_season}' на '{new_season}'"
                    if dry_run:
                        description += " (пробный режим - без изменений)"
                    elif soft_mode:
                        description += " (мягкий режим - legacy данные сохранены)"
                    else:
                        description += " (полный режим - legacy данные очищены)"
                    
                    affected_entities.update({
                        'previous_season': prev_season,
                        'new_season': new_season,
                        'tournament_id': new_tournament.id,
                        'legacy_cleanup_done': legacy_cleanup_done
                    })
                    
                    g.admin_logger.log_action(
                        admin_id=admin_id,
                        action=action_name,
                        description=description,
                        endpoint=f"POST {request.path}",
                        request_data=request_data,
                        result_status='success',
                        result_message='Переход к новому сезону выполнен успешно',
                        affected_entities=affected_entities,
                        execution_time_ms=execution_time
                    )

                return jsonify({
                    'ok': True,
                    'previous_season': prev_season,
                    'new_season': new_season,
                    'tournament_id': new_tournament.id,
                    'soft_mode': soft_mode,
                    'legacy_cleanup_done': (not soft_mode) and legacy_cleanup_done,
                    'pre_hash': pre_summary.get('_hash'),
                    'post_hash': post_summary.get('_hash')
                })
            finally:
                try:
                    adv_sess.close()
                except Exception:
                    pass
        except Exception as e:
            # Логирование ошибки
            execution_time = int((time.time() - start_time) * 1000)
            if admin_id and hasattr(g, 'admin_logger') and g.admin_logger:
                g.admin_logger.log_action(
                    admin_id=admin_id,
                    action="Переход к новому сезону",
                    description=f"ОШИБКА при переходе к новому сезону: {str(e)}",
                    endpoint=f"POST {request.path}",
                    request_data=request_data if 'request_data' in locals() else dict(request.args),
                    result_status='error',
                    result_message=str(e),
                    execution_time_ms=execution_time
                )
            
            app.logger.error(f"Season rollover error: {e}")
            return jsonify({'error': 'season rollover failed'}), 500

    @admin_bp.route('/season/rollback', methods=['POST'])
    def api_season_rollback():
        """Откат к предыдущему сезону на основе последней записи в season_rollovers.
        Делает предыдущий турнир активным, а текущий — завершённым.
        Параметры:
          ?dry=1  — только показать план без изменений
          ?force=1 — выполнить, даже если активный турнир не совпадает с последним new_tournament_id в журнале
        Примечание: если при прошлом rollover выполнялась очистка legacy-таблиц (full/deep), данные не восстанавливаются.
        """
        start_time = time.time()
        admin_id = _get_admin_id()
        
        try:
            if not _is_admin_request():
                return jsonify({'error': 'Недействительные данные'}), 401

            # Расширенная схема
            try:
                from database.database_models import db_manager as adv_db_manager, Tournament
            except Exception as imp_err:
                return jsonify({'error': f'advanced schema unavailable: {imp_err}'}), 500
            try:
                adv_db_manager._ensure_initialized()
            except Exception as init_err:
                return jsonify({'error': f'db init failed: {init_err}'}), 500

            dry_run = request.args.get('dry') in ('1','true','yes')
            force = request.args.get('force') in ('1','true','yes')
            
            # Подготовка данных для лога
            request_data = {
                'dry_run': dry_run,
                'force': force
            }
            
            affected_entities = {
                'operation_type': 'dry_run' if dry_run else 'rollback'
            }

            adv_sess = adv_db_manager.get_session()
            try:
                # Получаем последнюю запись из журнала сезонных операций
                row = adv_sess.execute(text('SELECT id, prev_tournament_id, prev_season, new_tournament_id, new_season, soft_mode, legacy_cleanup_done, created_at FROM season_rollovers ORDER BY id DESC LIMIT 1')).fetchone()
                if not row:
                    return jsonify({'error': 'no_rollover_history'}), 400
                audit_id, prev_tid, prev_season, cur_tid, cur_season, soft_mode, legacy_cleanup_done, created_at = row

                prev_t = adv_sess.query(Tournament).get(prev_tid) if prev_tid else None
                cur_t = adv_sess.query(Tournament).get(cur_tid) if cur_tid else None
                if not prev_t or not cur_t:
                    return jsonify({'error': 'tournament_not_found', 'details': {'prev_tournament_id': prev_tid, 'new_tournament_id': cur_tid}}), 404

                # Текущий активный
                active_t = (adv_sess.query(Tournament)
                            .filter(Tournament.status=='active')
                            .order_by(Tournament.start_date.desc().nullslast(), Tournament.created_at.desc())
                            .first())
                if active_t and active_t.id != cur_t.id and not force:
                    return jsonify({'error': 'active_mismatch', 'expected_active_id': cur_t.id, 'actual_active_id': active_t.id, 'hint': 'use ?force=1 to override'}), 409

                # План без изменений
                if dry_run:
                    return jsonify({
                        'ok': True,
                        'dry_run': True,
                        'will_activate': {'id': prev_t.id, 'season': prev_t.season},
                        'will_deactivate': {'id': cur_t.id, 'season': cur_t.season},
                        'warning': None if (soft_mode or not legacy_cleanup_done) else 'Legacy-данные были очищены при предыдущем rollover и не будут восстановлены'
                    })

                # Переключение статусов
                from datetime import date as _date
                cur_t.status = 'completed'
                if not cur_t.end_date:
                    cur_t.end_date = _date.today()
                prev_t.status = 'active'
                prev_t.end_date = None
                adv_sess.commit()

                # Инвалидация кэшей
                try:
                    from optimizations.multilevel_cache import get_cache
                    cache = get_cache()
                    for key in ('league_table','stats_table','results','schedule','tours','betting-tours'):
                        try: cache.invalidate(key)
                        except Exception: pass
                    affected_entities['cache_invalidated'] = True
                except Exception as _c_err:
                    app.logger.warning(f"cache invalidate failed season rollback: {_c_err}")
                    affected_entities['cache_error'] = str(_c_err)

                # Логирование успешной операции
                execution_time = int((time.time() - start_time) * 1000)
                if admin_id and hasattr(g, 'admin_logger') and g.admin_logger:
                    action_name = "Откат к предыдущему сезону"
                    description = f"Выполнен откат с сезона '{cur_t.season}' на предыдущий сезон '{prev_t.season}'"
                    if legacy_cleanup_done:
                        description += ". ВНИМАНИЕ: legacy данные были очищены при предыдущем rollover и не восстановлены"
                    
                    affected_entities.update({
                        'activated_season': prev_t.season,
                        'deactivated_season': cur_t.season,
                        'activated_tournament_id': prev_t.id,
                        'deactivated_tournament_id': cur_t.id,
                        'legacy_cleanup_was_done': bool(legacy_cleanup_done)
                    })
                    
                    g.admin_logger.log_action(
                        admin_id=admin_id,
                        action=action_name,
                        description=description,
                        endpoint=f"POST {request.path}",
                        request_data=request_data,
                        result_status='success',
                        result_message='Откат к предыдущему сезону выполнен успешно',
                        affected_entities=affected_entities,
                        execution_time_ms=execution_time
                    )

                return jsonify({
                    'ok': True,
                    'activated_season': prev_t.season,
                    'deactivated_season': cur_t.season,
                    'activated_tournament_id': prev_t.id,
                    'deactivated_tournament_id': cur_t.id,
                    'legacy_restored': False,
                    'legacy_cleanup_was_done': bool(legacy_cleanup_done),
                    'soft_mode_rollover': bool(soft_mode)
                })
            finally:
                try:
                    adv_sess.close()
                except Exception:
                    pass
        except Exception as e:
            # Логирование ошибки
            execution_time = int((time.time() - start_time) * 1000)
            if admin_id and hasattr(g, 'admin_logger') and g.admin_logger:
                g.admin_logger.log_action(
                    admin_id=admin_id,
                    action="Откат к предыдущему сезону",
                    description=f"ОШИБКА при откате к предыдущему сезону: {str(e)}",
                    endpoint=f"POST {request.path}",
                    request_data=request_data if 'request_data' in locals() else dict(request.args),
                    result_status='error',
                    result_message=str(e),
                    execution_time_ms=execution_time
                )
            
            app.logger.error(f"Season rollback error: {e}")
            return jsonify({'error': 'season rollback failed'}), 500

    @admin_bp.route('/logs', methods=['GET'])
    def api_admin_logs():
        """Получение логов действий администратора"""
        try:
            if not _is_admin_request():
                return jsonify({'error': 'Недействительные данные'}), 401

            # Параметры запроса
            page = int(request.args.get('page', 1))
            per_page = min(int(request.args.get('per_page', 50)), 100)  # Максимум 100 записей
            action_filter = request.args.get('action', '').strip()
            status_filter = request.args.get('status', '').strip()
            
            # Импорт логгера
            try:
                # Используем логгер из g если он инициализирован, иначе создаём локальный
                admin_logger = getattr(g, 'admin_logger', None)
                if admin_logger is None:
                    from utils.admin_logger import AdminActionLogger
                    admin_logger = AdminActionLogger()

                # Вычисление offset
                offset = (page - 1) * per_page

                # Получение логов с фильтрацией
                logs = admin_logger.get_logs(
                    limit=per_page,
                    offset=offset,
                    action_filter=action_filter if action_filter else None,
                    status_filter=status_filter if status_filter else None
                )

                # Подсчёт общего количества (для пагинации)
                total_count = len(admin_logger.get_logs(limit=10000))  # Приблизительный подсчёт
                total_pages = (total_count + per_page - 1) // per_page

                return jsonify({
                    'ok': True,
                    'logs': logs,
                    'pagination': {
                        'page': page,
                        'per_page': per_page,
                        'total_count': total_count,
                        'total_pages': total_pages,
                        'has_next': page < total_pages,
                        'has_prev': page > 1
                    }
                })

            except ImportError as e:
                app.logger.error(f"Failed to import admin logger: {e}")
                return jsonify({'error': 'Система логирования недоступна'}), 500
            
        except Exception as e:
            app.logger.error(f"Admin logs error: {e}")
            return jsonify({'error': 'Ошибка получения логов'}), 500

    app.register_blueprint(admin_bp)
    return admin_bp
