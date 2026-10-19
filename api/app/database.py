"""Database configuration"""

import os
import sys
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    if os.getenv("TESTING"):
        DATABASE_URL = "sqlite:///:memory:"
    else:
        # Fallback to local SQLite for dev when no postgres available
        _db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "netmap.db")
        DATABASE_URL = f"sqlite:///{_db_path}"
        print(f"WARNING: No DATABASE_URL set, using SQLite: {_db_path}", file=sys.stderr)

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()
else:
    engine = create_engine(
        DATABASE_URL,
        pool_size=5,
        max_overflow=2,
        pool_recycle=3600,
        pool_timeout=30,
        pool_pre_ping=True,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
