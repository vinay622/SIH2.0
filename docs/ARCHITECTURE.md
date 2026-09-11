# SAT-SA: architecture and functional design

## Purpose and scope

Support NCIIPC examiners analysing periodic SOC submissions from critical sector
entities. Operational records are evidence of capability; no single alert is an
automated supervisory determination. The prototype does not collect live
telemetry, operate a SOC, replace a SIEM, or connect to cloud services.

## Local architecture

```text
Periodic CSE exports (CSV / JSON / offline API adapter)
             |
             v
FastAPI ingestion -> Pydantic validation -> immutable submission snapshot
             |                              + SHA-256(normalised JSON)
             v                              |
Local SQLite <------------------------------+
             |
             v
Versioned deterministic rules + cohort median/MAD comparison
             |
             v
Attention indicators -> React workspace -> examiner evidence review
             |                               |
             v                               v
JSON / CSV assessment reports       Append-only review events in SQLite
```

Compiled React assets and the API can be served by one local FastAPI process.
All assets, icons, rules and processing are local. There are no CDN fonts, hosted
models, scheduled collectors or runtime third-party requests.

## Functional modules

| Module | Implemented behaviour |
|---|---|
| Overview | Counts derived from selected period, dimension distribution, trends |
| Entities | Attention ordering, prior-period delta, sector and entity filters |
| Findings | Severity/category filters; entity-scoped evidence navigation |
| Review queue | Pending signals in severity/count order; expert dispositions |
| Submissions | Strict import, duplicate protection, original source downloads |
| Reports | JSON assessment package; spreadsheet-safe CSV findings register |
| Methodology | Rule catalogue, scoring, limitations and validation guidance |

## Data contract, version 1

An import is one entity and one calendar month. Alert `created_at` determines
the reporting month; closure may occur later. This is a creation-cohort analysis,
not a month-end closure-throughput calculation.

| JSON field | Requirement / semantics |
|---|---|
| `entity.id` | Stable alphanumeric, hyphen or underscore ID, max 60 |
| `entity.name` | Display name, 2–120 characters |
| `entity.sector` | Sector label, 2–80 characters |
| `entity.cohort` | Examiner-defined comparison group, 2–80 characters |
| `period` | `YYYY-MM`; must match every alert's creation month |
| `complete` | Submitter declaration of complete alert coverage for the period |
| `expected_categories` | Optional declared categories; only used for complete submissions |
| `assets` | Optional inventory, up to 10,000 assets |
| `alerts` | Up to 50,000 alert/case records |

Assets require `id`, `name`, `critical` and `monitoring_expected`. Alert fields:

| Field | Requirement |
|---|---|
| `id`, `asset_id`, `category` | Non-empty strings |
| `severity` | `critical`, `high`, `medium`, `low` |
| `created_at` | ISO-8601 timestamp including timezone |
| `acknowledged_at` | Timestamp or null; must not precede creation |
| `closed_at` | Required for closed alerts, null for open; cannot precede creation/acknowledgement |
| `status` | `open` or `closed` |
| `investigation` | Optional text, defaults to empty; maximum 10,000 characters |
| `escalated`, `remediated` | Required booleans; evidence present in the submission |

JSON booleans use `true`/`false`; CSV supports `true`/`false` text.
Unknown fields, duplicate IDs, unknown inventory references and invalid
chronology are rejected. Absent inventory is permitted but disables
inventory-dependent checks. Empty submissions are stored and explicitly
unscored. A repeated entity/month is rejected with HTTP 409; correction/version
workflows are not yet implemented.

CSV is an alert-only format. Entity metadata comes from form fields and the
completeness checkbox; inventory/category checks require JSON. Database export
and case-management adapters should transform their own schemas into this
contract; no vendor-specific connectors ship in the prototype.

## Traceability

Submission IDs and SHA-256 hashes refer to retained *normalised* JSON, not the
original file bytes. Findings contain rule version, numerator, denominator,
source ID, affected alert/asset identifiers and a plain-language rationale.
The current UI caps alert evidence at 100 records; the complete source is
downloadable and finding `evidence_ids` enumerate all matching alerts.

Review decisions append event ID, finding ID, disposition, rationale and UTC
timestamp. A decision may be superseded by a later event without destroying
history. The prototype records a local examiner label, not an authenticated
identity. Peer analysis keeps synthetic and locally imported submissions
separate even when cohort names match.

Rules run on read and are cached until an import/review or server restart.
Historical periods are recalculated with the current engine. Reports should be
archived with the matching source bundle and released code to reproduce results
after future rule changes. Durable analysis-run snapshots are a production
extension.

## Next implementation priorities

1. Authenticated examiner identities, access control and protected audit exports.
2. Correction/version workflows, signed import manifests and source provenance.
3. Asset-normalised peers with explicit cohort approval and confidence intervals.
4. DuckDB/Parquet or PostgreSQL processing and asynchronous import jobs.
5. Explicit control-policy expectations for governance/oversight and resilience.
6. Local statistical/ML novelty detection only after labelled validation.

No model architecture or accelerator is required for this release: analytics
use transparent rules and robust descriptive statistics, with no model training
or inference dependency.
