# NetMap

Self-hosted network topology discovery and diagram generator. Point it at a seed device and one or more subnets; it discovers hosts with nmap and ARP, walks SNMP on reachable devices for interfaces, neighbours, VLANs and routes, builds a topology graph, and lets you view, arrange and export it as a draw.io diagram, PNG or PDF.

Everything runs locally in Docker. Scan results, SNMP credentials and diagrams stay in your own PostgreSQL database; nothing is sent to an external service.

## Features

- **Discovery pipeline** (`api/app/scanner/orchestrator.py`):
  - nmap host discovery with service detection (`-sV`), OS fingerprinting in full mode, MAC vendor lookup
  - ARP sweep (scapy) when raw sockets are available
  - SNMP v2c / v3 (pysnmp): system info, interfaces and utilisation, ARP table, CDP and LLDP neighbours, VLANs, routing table
  - topology builder that merges these into devices, interfaces, links and networks
- **Interactive topology** - React Flow canvas with device types, a device detail panel, and drag-to-arrange layouts that are saved per scan.
- **Export** - draw.io XML with Cisco shapes (via N2G), plus PNG and PDF from the canvas.
- **Scan history and diff** - list past scans and compare two scans to see added, removed and changed devices.
- **Dashboard** - aggregate stats across scans.
- **Settings** - default SNMP parameters and scan options, webhook notifications on scan complete / failed (Slack, Discord and Mattermost compatible payload), and an optional LLM provider with a connection test.
- **Security** - API-key auth on every API route (constant-time compare), SNMP credentials and webhook URL encrypted at rest with Fernet, rate limiting (slowapi), hardened containers, API and database bound to `127.0.0.1`. The nginx frontend injects the API key server-side, so the browser never needs it after login.

## Architecture

```
browser -> frontend (nginx, React SPA, :3021) --/api/* + X-API-Key--> api (FastAPI, :8021) --> postgres (:5450)
                                                                         |
                                                                         +--> nmap / scapy / SNMP --> your network
```

| Service | Build / image | Host port |
| --- | --- | --- |
| `frontend` | `frontend/` - React 19, Vite, Tailwind 4, @xyflow/react, served by nginx | `127.0.0.1:3021` |
| `api` | `api/` - Python 3.11, FastAPI, SQLAlchemy, Pydantic | `127.0.0.1:8021` |
| `postgres` | `postgres:16-alpine`, schema in `postgres/init.sql` | `127.0.0.1:5450` |

### Scan modes

- **Bridge networking (default, works on Windows/macOS/Linux):** the API container runs with `SCAN_MODE=limited` - TCP connect scans only, no ARP, no extra capabilities.
- **Host networking (Linux only):** full raw-socket scanning (ARP, raw nmap) with `NET_RAW` + `NET_ADMIN`:

  ```bash
  docker compose -f docker-compose.yml -f docker-compose.host.yml up -d
  ```

  In this mode the API listens on all host interfaces and is protected only by the API key. Read the warning at the top of `docker-compose.host.yml` and restrict port 8021 at the host firewall on shared networks.

Only scan networks you own or are authorised to scan.

## Setup

Requirements: Docker with Compose v2.

```bash
cp .env.example .env     # set POSTGRES_PASSWORD, API_KEY, ENCRYPTION_KEY
docker compose up -d --build
```

Open http://127.0.0.1:3021, log in with your `API_KEY`, then start a scan from the **Scan** page (seed IP, subnets, SNMP credentials, which scanners to run).

API docs (Swagger) are served at http://127.0.0.1:8021/docs when `NODE_ENV` is not `production`.

### Local development without Docker

```bash
# API (needs nmap installed; falls back to SQLite when DATABASE_URL is unset)
cd api
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
API_KEY=dev-key ENCRYPTION_KEY=dev-encryption-key uvicorn app.main:app --port 8021

# Frontend
cd frontend
npm install
npm run dev
```

## Configuration

See `.env.example`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | yes | database credentials |
| `API_KEY` | yes | API authentication and UI login |
| `ENCRYPTION_KEY` | yes | Fernet key derivation for stored credentials |
| `LLM_PROVIDER` | no | `ollama` (default) or `claude` (HTTP bridge) |
| `OLLAMA_HOST`, `OLLAMA_MODEL` | no | Ollama endpoint and model |
| `CLAUDE_BRIDGE_URL`, `CLAUDE_MODEL`, `CLAUDE_BRIDGE_TOKEN` | no | bridge endpoint, model and shared token |

`api/scripts/migrate_crypto.py` re-encrypts stored credentials when rotating `ENCRYPTION_KEY` (reads `OLD_ENCRYPTION_KEY`).

## Tests

```bash
cd api
pytest
```

Tests cover the nmap scanner parsing, SNMP helpers, the orchestrator and the draw.io exporter.

## License

MIT - see [LICENSE](LICENSE).
