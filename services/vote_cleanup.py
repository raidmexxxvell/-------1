"""Vote cleanup service

Удаление голосов из таблицы match_votes после завершения тура.

Определение тура основано на date_key (YYYY-MM-DD) и, опционально, tournament_id,
если он доступен в объекте матча.

Использование:
  from services.vote_cleanup import cleanup_votes_if_tour_finished
  cleanup_votes_if_tour_finished(db, match_obj)

Модуль изолирован и не зависит от app.py напрямую, чтобы избежать монолита.
"""

from __future__ import annotations

from typing import Optional

def _date_key_from_match(match_obj) -> Optional[str]:
    """Извлекает YYYY-MM-DD из match_obj.match_date/ datetime/ date.

    Возвращает None, если дата недоступна.
    """
    try:
        d = getattr(match_obj, 'match_date', None) or getattr(match_obj, 'date', None) or getattr(match_obj, 'datetime', None)
        if not d:
            return None
        # d может быть date, datetime или строка
        try:
            # date/datetime
            return str(d)[:10]
        except Exception:
            return str(d)[:10]
    except Exception:
        return None


def cleanup_votes_for_date(db, MatchVote, date_key: str) -> int:
    """Удаляет все голоса за дату тура (date_key=YYYY-MM-DD). Возвращает число удалённых строк."""
    try:
        cnt = db.query(MatchVote).filter(MatchVote.date_key == date_key).delete(synchronize_session=False)
        db.commit()
        return int(cnt or 0)
    except Exception:
        # не прерываем основной поток; вызывающий код может залогировать предупреждение
        try:
            db.rollback()
        except Exception:
            pass
        return 0


def cleanup_votes_if_tour_finished(db, MatchModel, MatchVote, match_obj) -> int:
    """Если все матчи тура (по той же дате и турниру) завершены — удалить голоса за этот тур.

    Возвращает число удалённых голосов (0, если ещё есть незавершённые матчи или при ошибке).
    """
    if not match_obj:
        return 0
    date_key = _date_key_from_match(match_obj)
    if not date_key:
        return 0

    try:
        # Считаем матчи того же турнира и той же даты (если tournament_id доступен)
        q = db.query(MatchModel)
        # Фильтр по дате: нормализуем к YYYY-MM-DD строкой
        # Предпочтительно использовать сравнение по дню, но чтобы не тащить func/date_trunc, используем префикс
        # через текстовое преобразование: безопаснее, если match_date — date.
        # Для SQLAlchemy: сравнение по равенству с date_key должно сработать для date.
        q = q.filter(MatchModel.match_date == date_key)  # если match_date=date/datetime — драйвер приведёт корректно

        tid = getattr(match_obj, 'tournament_id', None)
        if tid is not None:
            q = q.filter(MatchModel.tournament_id == tid)

        # Проверяем наличие незавершённых матчей
        unfinished = q.filter(getattr(MatchModel, 'status') != 'finished').count()
        if unfinished == 0:
            # Все матчи тура завершены — чистим голоса
            return cleanup_votes_for_date(db, MatchVote, date_key)
    except Exception:
        # защита от любых несовпадений схемы — не падаем, просто не чистим
        pass
    return 0
