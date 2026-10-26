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


def test_fresh_settings_row_serialises():
    """GET /api/settings on a fresh row (community NULL) must not 500."""
    from app.routes.settings import _decrypt_settings
    from app.schemas import SettingsResponse

    row = AppSettings(id=1, snmp_version="2c", snmp_port=161, snmp_timeout=5, snmp_retries=2,
                      default_scan_nmap=True, default_scan_arp=True, default_scan_snmp=True)
    data = _decrypt_settings(row)
    assert data["snmp_community"] == ""
    SettingsResponse(**data)


def test_ollama_host_and_model_default_to_env():
    """Blank Ollama settings mean OLLAMA_HOST / OLLAMA_MODEL from .env."""
    for name in ("llm_ollama_host", "llm_ollama_model"):
        col = AppSettings.__table__.c[name]
        assert col.default is None or col.default.arg is None


def test_llm_test_uses_env_model_for_a_blank_field(monkeypatch):
    import asyncio

    from app.routes import settings as route
    from app.schemas import LLMTestRequest

    saved = AppSettings(id=1, llm_provider="ollama", llm_ollama_host="http://saved:11434",
                        llm_ollama_model="saved-model:1b")
    monkeypatch.setattr(route, "_get_or_create", lambda db: saved)
    seen = {}
    monkeypatch.setattr(route.llm, "probe_provider", lambda provider, **kw: seen.update(kw) or {})

    # blank on screen -> None, so probe_provider falls back to .env
    asyncio.run(route.test_llm_connection(LLMTestRequest(llm_ollama_model="", llm_ollama_host=""), db=None))
    assert seen["ollama_model"] is None and seen["ollama_host"] is None

    # left out -> the saved value
    asyncio.run(route.test_llm_connection(LLMTestRequest(), db=None))
    assert seen["ollama_model"] == "saved-model:1b"
