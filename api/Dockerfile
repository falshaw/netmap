# =============================================================================
# NetMap API - Multi-stage Dockerfile
# =============================================================================
# Scanner needs nmap + raw socket access (NET_RAW, NET_ADMIN via compose)
# =============================================================================

# Stage 1: Build - Install Python dependencies
FROM python:3.11.16-slim@sha256:9c900dea9e8fb7e16277c179b555cc72d29a352dbc33cff48ad5a0412fd5bfc7 AS builder

WORKDIR /app

RUN rm -rf /var/lib/apt/lists/* && apt-get -o Acquire::Retries=5 -o Acquire::http::Pipeline-Depth=0 update && apt-get upgrade -y && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Production - Runtime with nmap + network tools
FROM python:3.11.16-slim@sha256:9c900dea9e8fb7e16277c179b555cc72d29a352dbc33cff48ad5a0412fd5bfc7

WORKDIR /app

RUN rm -rf /var/lib/apt/lists/* && apt-get -o Acquire::Retries=5 -o Acquire::http::Pipeline-Depth=0 update && apt-get upgrade -y && apt-get install -y \
    libpq-dev \
    nmap \
    iputils-ping \
    net-tools \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY . .

RUN groupadd -g 1001 appuser && useradd -m -u 1001 -g appuser appuser && chown -R appuser:appuser /app
RUN rm -f .env .env.*
USER appuser

EXPOSE 8021

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8021/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8021"]
