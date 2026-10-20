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
- **Security** - API-key auth on every API route (constant-time compare), SNMP credentials and webhook URL encrypted at rest with Fernet, rate limiting (slowapi), hardened containers, API and database bound to `127.0.0.1`. The nginx frontend injects the API key server-side, so the browser never stores it. The login page checks the key you type, but because the proxy adds the key to every `/api` request, anyone who can reach the frontend port can use the API through it: keep it bound to `127.0.0.1` (the default) or put real authentication in front of it.

## Architecture

```
browser -> frontend (nginx, React SPA, :3021) --/api/* + X-API-Key--> api (FastAPI, :8021) --> postgres (:5450)
                                                                         |
                                                                         +--> nmap / scapy / SNMP --> your network
```

| Service | Build / image | Host port (default) |
| --- | --- | --- |
| `frontend` | `frontend/` - React 19, Vite, Tailwind 4, @xyflow/react, served by nginx | `127.0.0.1:3021` (`NETMAP_WEB_PORT`) |
| `api` | `api/` - Python 3.11, FastAPI, SQLAlchemy, Pydantic | `127.0.0.1:8021` (`NETMAP_API_PORT`) |
| `postgres` | `postgres:16-alpine`, schema in `postgres/init.sql` | `127.0.0.1:5450` (`NETMAP_DB_PORT`) |

Container names, the network and its subnet are not fixed: Compose prefixes them with the project name (`-p`), so several copies or other stacks can run side by side.

### Scan modes

- **Bridge networking (default, Windows/macOS/Linux):** the API container runs with `SCAN_MODE=limited` and no extra capabilities. nmap runs unprivileged: host discovery and port scans use TCP connect, so a host counts as live when it answers on any probed port (open *or* closed). No ARP and no OS fingerprinting. From inside Docker Desktop's VM it can reach the compose network and whatever the VM can route to.
- **Host networking (Linux only):** full raw-socket scanning (ARP, SYN scan, OS detection) with `NET_RAW` + `NET_ADMIN`:

  ```bash
  docker compose -f docker-compose.yml -f docker-compose.host.yml up -d
  ```

  In this mode the API listens on all host interfaces and is protected only by the API key. Read the warning at the top of `docker-compose.host.yml` and restrict port 8021 at the host firewall on shared networks.

Only live, responding hosts become devices. Network and broadcast addresses never do; each scanned subnet appears as a network node in the topology. The gateway of a subnet is taken from the scanner's own default route, an SNMP default route, or (fallback) the subnet's first address if it is live, and is shown as a router.

Only scan networks you own or are authorised to scan.

## Setup

Requirements: Docker with Compose v2, Python 3 (only to generate two random keys).

```bash
git clone <this repo> netmap
cd netmap
cp .env.example .env            # Windows (cmd): copy .env.example .env
python -c "import secrets; print(secrets.token_hex(32))"   # paste as API_KEY in .env
python -c "import secrets; print(secrets.token_hex(32))"   # paste as ENCRYPTION_KEY in .env
# also set POSTGRES_PASSWORD in .env
docker compose up -d --build
```

Open http://127.0.0.1:3021, log in with your `API_KEY`, then start a scan from the **Scan** page (seed IP, subnets, SNMP credentials, which scanners to run).

If a default port is taken, change `NETMAP_WEB_PORT` / `NETMAP_API_PORT` / `NETMAP_DB_PORT` in `.env`. To run a second copy next to another stack, give it its own project name: `docker compose -p netmap-test up -d --build`.

API docs (Swagger) are served at http://127.0.0.1:8021/docs when `NODE_ENV` is not `production`.

### Try it without a real network

The stack's own compose network is a safe first target. Find its subnet and gateway:

```bash
docker network inspect netmap_netmap --format "{{range .IPAM.Config}}{{.Subnet}} {{.Gateway}}{{end}}"
# with -p <name> the network is called <name>_netmap
```

Docker usually hands out a /16 (65,534 addresses), which takes a long time to sweep. Containers get the lowest addresses, so scan just the first /28 of it: for `172.20.0.0/16` that is `172.20.0.0/28`.

Then on the **Scan** page enter the gateway as the target IP and the /28 under subnets, untick SNMP and ARP, and start the scan. The same through the API:

```bash
curl -s -X POST http://127.0.0.1:8021/api/scans \
  -H "X-API-Key: <your API_KEY>" -H "Content-Type: application/json" \
  -d '{"target_ip": "<gateway>", "subnets": ["<first /28>"], "scan_snmp": false, "scan_arp": false}'
```

The scan should report one device per running container plus the network gateway, then show them in **Topology**.

### Local development without Docker

API (needs [nmap](https://nmap.org/download) on `PATH`; falls back to SQLite when `DATABASE_URL` is unset):

```bash
cd api
python -m venv .venv
. .venv/bin/activate              # Windows: .venv\Scripts\activate
pip install -r requirements.txt
API_KEY=dev-key ENCRYPTION_KEY=dev-encryption-key uvicorn app.main:app --port 8021
```

On Windows PowerShell set the variables first: `$env:API_KEY="dev-key"; $env:ENCRYPTION_KEY="dev-encryption-key"`, then run `uvicorn app.main:app --port 8021`.

Frontend (Node 20+), in a second terminal. The dev server proxies `/api` to `http://127.0.0.1:8021` and adds the `X-API-Key` header from the `API_KEY` environment variable, like nginx does in Docker:

```bash
cd frontend
npm install
API_KEY=dev-key npm run dev   # http://localhost:3021 (PowerShell: $env:API_KEY="dev-key"; npm run dev)
npm run build                 # typecheck + production build
```

Stop the Docker stack first (or change `NETMAP_WEB_PORT`), since both use port 3021.

## Configuration

See `.env.example`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | yes | database credentials |
| `API_KEY` | yes | API authentication and UI login |
| `ENCRYPTION_KEY` | yes | Fernet key derivation for stored credentials |
| `NETMAP_WEB_PORT`, `NETMAP_API_PORT`, `NETMAP_DB_PORT` | no | host ports (default 3021 / 8021 / 5450, all on 127.0.0.1) |
| `LLM_PROVIDER` | no | `ollama` (default) or `claude` (HTTP bridge) |
| `OLLAMA_HOST`, `OLLAMA_MODEL` | no | Ollama endpoint and model; the model must already be pulled there |
| `CLAUDE_BRIDGE_URL`, `CLAUDE_MODEL`, `CLAUDE_BRIDGE_TOKEN` | no | bridge endpoint, model (default `sonnet`) and shared token |

The LLM settings are optional. Scanning, topology, history and export work without any LLM; it is only used by the Settings page "Test connection" probe, which simply reports the provider as unavailable if nothing is configured.

`api/scripts/migrate_crypto.py` re-encrypts stored credentials when rotating `ENCRYPTION_KEY` (reads `OLD_ENCRYPTION_KEY`).

## Tests

```bash
cd api
python -m venv .venv
. .venv/bin/activate              # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pytest
```

Tests cover nmap result parsing and live-host filtering, device classification, gateway inference, the topology builder and layout, an end-to-end scan run against a fake nmap result, SNMP helpers and the draw.io exporter. nmap itself is not needed for the tests.

## License

MIT - see [LICENSE](LICENSE).
