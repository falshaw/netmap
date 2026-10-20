"""Fresh installs must not seed plaintext into encrypted columns."""

from pathlib import Path

from app.models import AppSettings

INIT_SQL = Path(__file__).resolve().parents[2] / "postgres" / "init.sql"


def _app_settings_ddl() -> str:
    sql = INIT_SQL.read_text(encoding="utf-8")
    start = sql.index("CREATE TABLE IF NOT EXISTS app_settings")
    return sql[start:sql.index(");", start)]


def test_init_sql_has_no_plaintext_community_default():
    ddl = _app_settings_ddl()
    line = next(ln for ln in ddl.splitlines() if ln.strip().startswith("snmp_community"))
    assert "DEFAULT" not in line.upper()


def test_init_sql_community_column_fits_fernet_token():
    ddl = _app_settings_ddl()
    line = next(ln for ln in ddl.splitlines() if ln.strip().startswith("snmp_community"))
    size = int(line.split("VARCHAR(")[1].split(")")[0])
    assert size >= 256  # a 32-char community encrypts to ~140 chars


def test_model_default_is_none():
    col = AppSettings.__table__.c.snmp_community
    assert col.default is None or col.default.arg is None
    assert col.type.length >= 256
