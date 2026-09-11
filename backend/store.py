import hashlib
import json
import os
import sqlite3
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from backend.models import Submission

DATABASE = Path(os.environ.get("SATSA_DB", "data/satsa.db"))


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE, timeout=30)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
    except Exception:
        connection.rollback()
        raise
    else:
        connection.commit()
    finally:
        connection.close()


def initialize() -> None:
    with connect() as db:
        db.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS submissions (
                id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, period TEXT NOT NULL,
                payload TEXT NOT NULL, source_hash TEXT NOT NULL, imported_at TEXT NOT NULL,
                demo INTEGER NOT NULL DEFAULT 0, UNIQUE(entity_id, period)
            );
            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT, finding_id TEXT NOT NULL,
                decision TEXT NOT NULL, rationale TEXT NOT NULL, created_at TEXT NOT NULL
            );
            CREATE TRIGGER IF NOT EXISTS reviews_no_update BEFORE UPDATE ON reviews
            BEGIN SELECT RAISE(ABORT, 'Review history is append-only'); END;
            CREATE TRIGGER IF NOT EXISTS reviews_no_delete BEFORE DELETE ON reviews
            BEGIN SELECT RAISE(ABORT, 'Review history is append-only'); END;
        """)


def insert_submission(submission: Submission, demo: bool = False) -> str:
    payload = submission.model_dump_json()
    digest = hashlib.sha256(payload.encode()).hexdigest()
    submission_id = uuid.uuid4().hex[:12]
    with connect() as db:
        existing = db.execute(
            "SELECT payload FROM submissions WHERE entity_id=? LIMIT 1", (submission.entity.id,)
        ).fetchone()
        if existing and json.loads(existing["payload"])["entity"] != submission.entity.model_dump():
            raise ValueError("Entity ID already exists with different name, sector or cohort.")
        db.execute(
            "INSERT INTO submissions VALUES (?, ?, ?, ?, ?, ?, ?)",
            (submission_id, submission.entity.id, submission.period, payload, digest,
             datetime.now(UTC).isoformat(), int(demo)),
        )
    return submission_id
