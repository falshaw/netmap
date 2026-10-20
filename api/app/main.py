"""NetMap - Network Diagram Generator API"""

import hmac
import os
import logging
from typing import Optional

from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response as StarletteResponse

from app.database import engine, Base
from app.auth import require_api_key

logger = logging.getLogger(__name__)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all API responses."""

    async def dispatch(self, request: StarletteRequest, call_next):
        response: StarletteResponse = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast if ENCRYPTION_KEY is missing or invalid
    from app.crypto import _get_fernet
    _get_fernet()
    Base.metadata.create_all(bind=engine)
    # create_all() never ALTERs existing tables — backfill new settings columns
    from app.models import ensure_app_settings_columns
    ensure_app_settings_columns()
    yield


docs_url = "/docs" if os.getenv("NODE_ENV") != "production" else None
redoc_url = "/redoc" if os.getenv("NODE_ENV") != "production" else None

app = FastAPI(
    title="NetMap",
    description="Network Diagram Generator - SNMP/nmap topology discovery",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=docs_url,
    redoc_url=redoc_url,
)

from app.rate_limit import limiter

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3021", "http://127.0.0.1:3021"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
)

api_key_dep = [Depends(require_api_key)]

# Routes imported after app creation to avoid circular imports
from app.routes import scans, topology, export, settings, compare, stats  # noqa: E402

app.include_router(scans.router, prefix="/api/scans", tags=["Scans"], dependencies=api_key_dep)
app.include_router(topology.router, prefix="/api/scans", tags=["Topology"], dependencies=api_key_dep)
app.include_router(export.router, prefix="/api/scans", tags=["Export"], dependencies=api_key_dep)
app.include_router(compare.router, prefix="/api/scans", tags=["Compare"], dependencies=api_key_dep)
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"], dependencies=api_key_dep)
app.include_router(stats.router, prefix="/api/stats", tags=["Stats"], dependencies=api_key_dep)


@app.get("/")
async def root():
    return {"app": "NetMap", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/api/health")
async def api_health():
    return {"status": "healthy"}


@app.get("/api/auth/validate", dependencies=api_key_dep)
async def validate_api_key(x_login_key: Optional[str] = Header(default=None)):
    """Validate the API key — 200 if valid, 401/403 otherwise.

    Behind the nginx frontend X-API-Key is always injected server-side, so the
    UI login sends the key the user typed in X-Login-Key. When present it must
    match API_KEY as well.
    """
    if x_login_key is not None and not hmac.compare_digest(
        x_login_key.encode(), os.getenv("API_KEY", "").encode()
    ):
        raise HTTPException(status_code=403, detail="Invalid API key")
    return {"valid": True}



# POST /api/auth/validate removed — it bypassed require_api_key dependency.
# The GET endpoint above with api_key_dep is sufficient for key validation.
