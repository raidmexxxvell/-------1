"""Snapshots service abstraction."""
from __future__ import annotations
import json, time
from datetime import datetime, timezone

def snapshot_get(db, SnapshotModel, key: str, logger):
    attempts=0
    while attempts<3:
        try:
            row = db.get(SnapshotModel, key)
            if not row:
                return None
            try: data=json.loads(row.payload)
            except Exception: data=None
            return {'key': key,'payload': data,'updated_at': (row.updated_at or datetime.now(timezone.utc)).isoformat()}
        except Exception as e:
            try: db.rollback()
            except Exception: pass
            attempts+=1
            if attempts>=3:
                try: logger.warning(f"snapshot_get failed {key}: {e}")
                except Exception: pass
            time.sleep(0.1*attempts)
    return None

def snapshot_set(db, SnapshotModel, key: str, payload: dict, logger):
    attempts=0
    while attempts<3:
        try:
            raw=json.dumps(payload, ensure_ascii=False)
            now=datetime.now(timezone.utc)
            row=db.get(SnapshotModel, key)
            if row:
                row.payload=raw; row.updated_at=now
            else:
                row=SnapshotModel(key=key, payload=raw, updated_at=now); db.add(row)
            db.commit(); return True
        except Exception as e:
            try: db.rollback()
            except Exception: pass
            attempts+=1
            if attempts>=3:
                try: logger.warning(f"snapshot_set failed {key}: {e}")
                except Exception: pass
            time.sleep(0.1*attempts)
    return False
