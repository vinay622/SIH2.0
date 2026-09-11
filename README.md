# SAT-SA

Supervisory Analytics Tool for SOC Assessment.

An offline-first workspace for analysing periodic SOC submissions, identifying
execution gaps and missing operational evidence, and prioritising expert review.
Findings support supervisory judgement and are not incident determinations.

## Run the prototype

Requirements: Python 3.12 and Node.js 20.19+ (Node is required only to build/develop
the frontend). From the repository root:

```sh
python -m pip install -r requirements-dev.txt
npm ci
npm run build
python -m uvicorn backend.api:app --app-dir . --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000`. The first startup creates a local SQLite database and
loads **synthetic** submissions for six fictional entities across January–June
2026. No genuine CSE data is included. No Internet connection is used by the
running application.

For frontend development, run `npm run dev` in a second terminal. Vite serves port
5173 and proxies `/api` to the backend on 8000. The dev server binds to all
interfaces for preview support; use synthetic data only.

To start an empty workspace, set `SATSA_DEMO=0` **before the first startup**.
For example in PowerShell:

```powershell
$env:SATSA_DEMO = "0"
$env:SATSA_DB = "data/assessment.db"
python -m uvicorn backend.api:app --app-dir . --host 127.0.0.1 --port 8000
```

Changing the demo flag does not delete existing data. Use a separate database for
real imports. Demo seeding only runs when the database contains no submissions.

## What works

- Local CSV/JSON uploads with schema, chronology, duplicate and reference checks.
- Eight explainable rules across execution gaps, negative space and peer activity.
- Period/sector/entity filtering, evidence drill-down and attention trends.
- Severity-prioritised review queue and append-only examiner decision history.
- Source JSON downloads and JSON/CSV supervisory assessment exports.
- Local compiled frontend, SQLite persistence and synthetic example data.

## Data contract

Download a ready-to-import example from the application's import dialog, or
`GET /api/template?format=json` and `GET /api/template?format=csv`.

JSON submissions contain `entity`, `period`, `complete`, `expected_categories`,
`assets`, and `alerts`. CSV contains alert rows and takes entity/period context
from the import form. Database exports must first be mapped to this contract;
`POST /api/import` accepts multipart uploads for offline integration adapters.
There is no ongoing polling or telemetry collection.

See [architecture and data requirements](docs/ARCHITECTURE.md),
[analytics and validation](docs/VALIDATION.md), and
[offline deployment](docs/DEPLOYMENT.md).

## Quality checks

```sh
npm run lint
npm run typecheck
npm run build
python -m ruff check backend tests
python -m mypy backend
python -m unittest discover -s tests -t . -v
```

Tests create isolated databases under the ignored `data/` directory and do not
change the running workspace.

## Prototype boundary

This is a **single-examiner pilot**, not a production accreditation or a validated
substitute for expert manual review. It accepts up to 20 MB / 50,000 alerts per
file; analysis currently runs in application memory. The scoring thresholds are
transparent heuristics requiring expert calibration.

Identity, RBAC, TLS termination, disk encryption, protected audit storage,
operational backups and high-volume processing need controlled-environment
integration before use with real CSE submissions. The database prevents review
updates/deletes through normal SQL, but an administrator can alter the database;
the audit history is not cryptographically tamper-proof.
