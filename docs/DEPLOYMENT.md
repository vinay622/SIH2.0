# Deployment and operations

## Initial controlled pilot

Estimated starting point, to be benchmarked: 4 CPU cores, 8 GB RAM, 20 GB free SSD
space, Python 3.12, and a current local browser. No GPU is required. Use a dedicated
account and encrypted local storage. SQLite allows a straightforward single
process pilot; this is not a multi-worker analytics service.

Development and packaging may use Internet access to obtain dependencies.
Runtime processing and deployment installation can be entirely offline.

## Air-gapped installation bundle

On an approved connected packaging machine matching the target OS, CPU and
Python version:

```sh
python -m pip download -r requirements.txt --dest offline-wheels
npm ci
npm run build
```

Transfer the reviewed source (`backend/`, `requirements.txt`), `dist/`,
`offline-wheels/`, an approved Python installer, licences, dependency inventory
and cryptographic checksums through the organisation's approved media process.
Pin and archive the complete resolved wheel set for the released bundle.
`package-lock.json` records frontend dependency resolution; Node/node_modules
are not needed on the runtime host.

On the disconnected host:

```sh
python -m pip install --no-index --find-links offline-wheels -r requirements.txt
```

Then set `SATSA_DEMO=0`, select `SATSA_DB` on an encrypted local volume and run:

```sh
python -m uvicorn backend.api:app --app-dir . --host 127.0.0.1 --port 8000
```

Use `http://127.0.0.1:8000` from the same machine. On Windows, set environment
variables using `$env:SATSA_DEMO = "0"`. On Linux use `export SATSA_DEMO=0`.
The compiled frontend is mounted when the server starts; build it before
starting the service.

## Before using genuine submissions

- Integrate local authentication/SSO, per-entity access control and trusted
  examiner identity. Current review records identify no authenticated principal.
- Configure service management, TLS on any network-facing reverse proxy,
  permitted origins, request limits and firewall allowlisting. Bind the backend
  to loopback. Do not expose the unauthenticated pilot over a shared network.
- Enforce ingress body limits at the proxy: the application checks file size
  after multipart parsing. Large uploads can use temporary disk before rejection.
- Encrypt database/backups and restrict filesystem access. Define retention and
  evidence-handling procedures; source records can contain investigation text.
- Forward audit exports to protected storage. SQLite append-only triggers do not
  protect against database-administrator tampering.
- Archive released code, dependency bundles, source snapshots, reports and rule
  versions. There is no automatic model update or Internet update service.

## Operations and lifecycle

Health endpoint: `GET /api/health`. Review source completeness and validation
errors before interpreting scores. Imports reject corrections to an existing
entity/month until a versioning workflow is implemented.

Stop the service for a consistent filesystem backup, then copy the database and
retain checksums under restricted access. If backing up live, use SQLite's backup
API; do not copy only the main database while WAL transactions may be pending.
Restore to a separate path and verify imports, report counts and review history.

Release updates are reviewed offline source/assets/wheel bundles. Back up before
updates, retain prior artefacts for rollback, and test any schema changes on a
copy. This first version has schema initialisation but no migration framework.

## Delivery estimate and remaining work

The runnable prototype is the first deliverable. A next engineering session can
add explicit submission versioning and integrate a chosen local identity
provider once the target environment and permissions are available. A subsequent
session can implement columnar processing and representative load benchmarks.

Expert effectiveness validation depends on access to adjudicated historical
submissions and examiner review time. Production sizing, acceptance thresholds
and operational accreditation require those results; no national-scale
performance or expert-equivalence claim is made by the prototype.
