import csv
import io
import json
import os
import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from statistics import median
from typing import Annotated, Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ValidationError

from backend.analytics import RULE_VERSION, analyze, peer_outlier, risk_score
from backend.demo import seed
from backend.models import Alert, Asset, Entity, Finding, Review, Submission
from backend.store import connect, initialize, insert_submission


class EntitySummary(BaseModel):
    id: str
    name: str
    sector: str
    cohort: str
    period: str
    score: int | None
    previous_score: int | None = None
    alerts: int
    findings: int
    critical: int
    status: str
    complete: bool
    submission_id: str
    demo: bool


class SubmissionSummary(BaseModel):
    id: str
    entity_id: str
    entity_name: str
    period: str
    alerts: int
    assets: int
    complete: bool
    imported_at: str
    source_hash: str
    demo: bool


class Trend(BaseModel):
    period: str
    score: int | None
    findings: int
    alerts: int


class Workspace(BaseModel):
    entities: list[EntitySummary]
    findings: list[Finding]
    submissions: list[SubmissionSummary]
    trends: list[Trend]
    periods: list[str]
    rule_version: str = RULE_VERSION


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    initialize()
    if os.environ.get("SATSA_DEMO", "1") == "1":
        seed()
    yield


app = FastAPI(title="SAT-SA local assessment API", version="0.1.0", lifespan=lifespan)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "rule_version": RULE_VERSION, "mode": "local"}


@lru_cache(maxsize=1)
def workspace() -> Workspace:
    with connect() as db:
        rows = db.execute("SELECT * FROM submissions ORDER BY period DESC, entity_id").fetchall()
        review_rows = db.execute("SELECT finding_id, decision FROM reviews ORDER BY id").fetchall()
    statuses = {r["finding_id"]: r["decision"] for r in review_rows}
    entities: list[EntitySummary] = []
    findings: list[Finding] = []
    submissions: list[SubmissionSummary] = []
    scores: dict[tuple[str, str], int | None] = {}
    for row in rows:
        sub = Submission.model_validate_json(row["payload"])
        batch = analyze(sub, row["id"], row["source_hash"])
        score = risk_score(sub, batch)
        scores[(sub.entity.id, sub.period)] = score
        entities.append(EntitySummary(
            **sub.entity.model_dump(), period=sub.period, score=score, alerts=len(sub.alerts),
            findings=len(batch), critical=sum(f.severity == "critical" for f in batch),
            status="Insufficient data" if score is None else (
                "High attention" if score >= 45 else "Moderate" if score >= 20 else "Routine"),
            complete=sub.complete, submission_id=row["id"], demo=bool(row["demo"]),
        ))
        findings.extend(batch)
        submissions.append(SubmissionSummary(
            id=row["id"], entity_id=sub.entity.id, entity_name=sub.entity.name,
            period=sub.period, alerts=len(sub.alerts), assets=len(sub.assets),
            complete=sub.complete, imported_at=row["imported_at"],
            source_hash=row["source_hash"], demo=bool(row["demo"]),
        ))
    for entity in entities:
        earlier = sorted(p for eid, p in scores if eid == entity.id and p < entity.period)
        if earlier:
            entity.previous_score = scores[(entity.id, earlier[-1])]
        peers = [
            e.alerts for e in entities if e.period == entity.period and e.cohort == entity.cohort
            and e.id != entity.id and e.complete and e.demo == entity.demo
        ]
        if entity.complete and peer_outlier(entity.alerts, peers):
            submission = next(s for s in submissions if s.id == entity.submission_id)
            findings.append(Finding(
                id=f"{entity.submission_id}-PA01", entity_id=entity.id, entity_name=entity.name,
                period=entity.period, rule="PA01", title="Unusually low activity relative to peers",
                kind="Peer anomaly", dimension="Security operations", severity="medium",
                rationale=f"{entity.alerts} alerts versus a peer median of {median(peers):.0f} "
                f"across {len(peers)} complete submissions in cohort '{entity.cohort}'. "
                "Difference exceeds both 3 scaled median absolute deviations and 50% of the peer median.",
                recommendation="Confirm comparable asset scope, detection maturity and submission coverage.",
                confidence="Context required", evidence_ids=[], numerator=entity.alerts,
                denominator=round(median(peers)), submission_id=entity.submission_id,
                source_hash=submission.source_hash,
            ))
            entity.findings += 1
    for finding in findings:
        finding.status = statuses.get(finding.id, "pending")
    findings.sort(key=lambda f: ({"critical": 0, "high": 1, "medium": 2}[f.severity], -f.numerator))
    periods = sorted({s.period for s in submissions}, reverse=True)
    trends = []
    for period in reversed(periods):
        period_entities = [e for e in entities if e.period == period]
        rated = [e.score for e in period_entities if e.score is not None]
        trends.append(Trend(
            period=period, score=round(sum(rated) / len(rated)) if rated else None,
            findings=sum(e.findings for e in period_entities), alerts=sum(e.alerts for e in period_entities),
        ))
    return Workspace(entities=entities, findings=findings, submissions=submissions, trends=trends, periods=periods)


@app.get("/api/workspace")
def get_workspace() -> Workspace:
    return workspace()


def get_finding(finding_id: str) -> Finding:
    finding = next((f for f in workspace().findings if f.id == finding_id), None)
    if finding is None:
        raise HTTPException(404, "Finding not found")
    return finding


def get_submission(submission_id: str) -> Submission:
    with connect() as db:
        row = db.execute("SELECT payload FROM submissions WHERE id=?", (submission_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Submission not found")
    return Submission.model_validate_json(row["payload"])


class ReviewRecord(Review):
    id: int
    created_at: str


class Evidence(BaseModel):
    finding: Finding
    alerts: list[Alert]
    assets: list[Asset]
    reviews: list[ReviewRecord]
    total_alerts: int


@app.get("/api/findings/{finding_id}")
def evidence(finding_id: str) -> Evidence:
    finding = get_finding(finding_id)
    sub = get_submission(finding.submission_id)
    evidence_ids = set(finding.evidence_ids)
    with connect() as db:
        rows = db.execute(
            "SELECT id, decision, rationale, created_at FROM reviews WHERE finding_id=? ORDER BY id DESC",
            (finding_id,),
        ).fetchall()
    return Evidence(
        finding=finding, alerts=[a for a in sub.alerts if a.id in evidence_ids][:100],
        assets=[a for a in sub.assets if a.id in finding.asset_ids],
        reviews=[ReviewRecord.model_validate(dict(row)) for row in rows],
        total_alerts=len(evidence_ids),
    )


@app.post("/api/findings/{finding_id}/review")
def review(finding_id: str, body: Review) -> dict[str, str]:
    get_finding(finding_id)
    with connect() as db:
        db.execute(
            "INSERT INTO reviews (finding_id, decision, rationale, created_at) VALUES (?, ?, ?, ?)",
            (finding_id, body.decision, body.rationale, datetime.now(UTC).isoformat()),
        )
    workspace.cache_clear()
    return {"status": body.decision}


@app.get("/api/submissions/{submission_id}")
def submission_source(submission_id: str) -> Submission:
    return get_submission(submission_id)


MAX_FILE_BYTES = 20 * 1024 * 1024


@app.post("/api/import")
async def import_data(
    file: Annotated[UploadFile, File()],
    entity_id: Annotated[str, Form()] = "",
    entity_name: Annotated[str, Form()] = "",
    sector: Annotated[str, Form()] = "",
    cohort: Annotated[str, Form()] = "",
    period: Annotated[str, Form()] = "",
    complete: Annotated[bool, Form()] = False,
) -> dict[str, str]:
    try:
        raw = await file.read(MAX_FILE_BYTES + 1)
        if len(raw) > MAX_FILE_BYTES:
            raise HTTPException(413, "Maximum file size is 20 MB.")
        text = raw.decode("utf-8-sig")
        filename = (file.filename or "").lower()
        if filename.endswith(".json"):
            sub = Submission.model_validate_json(text)
        elif filename.endswith(".csv"):
            reader = csv.DictReader(io.StringIO(text))
            alerts: list[Alert] = []
            for index, row in enumerate(reader):
                if index >= 50000:
                    raise ValueError("Maximum 50,000 alerts per submission.")
                if None in row:
                    raise ValueError(f"CSV row {index + 2} has more values than header columns.")
                alerts.append(Alert.model_validate({
                    key: (value or None) if key in ("acknowledged_at", "closed_at") else value
                    for key, value in row.items()
                }))
            sub = Submission(
                entity=Entity(id=entity_id, name=entity_name, sector=sector, cohort=cohort),
                period=period, complete=complete, alerts=alerts,
            )
        else:
            raise HTTPException(422, "Choose a UTF-8 JSON or CSV file.")
        submission_id = insert_submission(sub)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(409, "This entity already has a submission for this period. No data was changed.") from exc
    except ValidationError as exc:
        errors = "; ".join(
            f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}"
            for e in exc.errors(include_input=False)[:5]
        )
        raise HTTPException(422, errors) from exc
    except (ValueError, UnicodeError, csv.Error) as exc:
        raise HTTPException(422, str(exc)) from exc
    finally:
        await file.close()
    workspace.cache_clear()
    return {"id": submission_id, "message": f"Imported {len(sub.alerts):,} alerts for {sub.entity.name}."}


@app.get("/api/template")
def template(format: Literal["json", "csv"] = "json") -> Response:
    sample = {
        "id": "ALERT-001", "asset_id": "ASSET-01", "category": "Identity", "severity": "critical",
        "created_at": "2026-07-05T10:00:00Z", "acknowledged_at": "2026-07-05T10:00:30Z",
        "closed_at": "2026-07-05T10:02:00Z", "status": "closed",
        "investigation": "Reviewed. False positive.", "escalated": False, "remediated": False,
    }
    if format == "csv":
        stream = io.StringIO()
        writer = csv.DictWriter(stream, fieldnames=list(sample))
        writer.writeheader()
        writer.writerow(sample)
        return Response(stream.getvalue(), media_type="text/csv",
                        headers={"Content-Disposition": 'attachment; filename="satsa-template.csv"'})
    payload = {
        "entity": {"id": "CSE-NEW", "name": "Example Entity", "sector": "Energy", "cohort": "Large energy SOC"},
        "period": "2026-07", "complete": True, "expected_categories": ["Identity", "Malware"],
        "assets": [{"id": "ASSET-01", "name": "Core server", "critical": True, "monitoring_expected": True}],
        "alerts": [sample],
    }
    return Response(json.dumps(payload, indent=2), media_type="application/json",
                    headers={"Content-Disposition": 'attachment; filename="satsa-template.json"'})


def safe_cell(value: str) -> str:
    return f"'{value}" if value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) else value


@app.get("/api/report")
def report(period: str = "", format: Literal["json", "csv"] = "json") -> Response:
    data = workspace()
    chosen = period or (data.periods[0] if data.periods else "")
    if chosen not in data.periods:
        raise HTTPException(404, "Reporting period not found.")
    entities = [e for e in data.entities if e.period == chosen]
    findings = [f for f in data.findings if f.period == chosen]
    if format == "csv":
        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(["finding_id", "entity", "period", "rule", "severity", "kind", "title",
                         "affected", "denominator", "status", "rationale", "source_hash", "rule_version"])
        for f in findings:
            writer.writerow([safe_cell(str(value)) for value in [
                f.id, f.entity_name, f.period, f.rule, f.severity, f.kind, f.title,
                f.numerator, f.denominator, f.status, f.rationale, f.source_hash, f.rule_version,
            ]])
        return Response(stream.getvalue(), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="satsa-{chosen}.csv"'})
    ids = {f.id for f in findings}
    with connect() as db:
        reviews = [dict(r) for r in db.execute("SELECT * FROM reviews ORDER BY id").fetchall() if r["finding_id"] in ids]
    payload = {
        "generated_at": datetime.now(UTC).isoformat(), "period": chosen,
        "rule_version": RULE_VERSION, "purpose": "Prioritisation for human supervisory review",
        "entities": [e.model_dump() for e in entities],
        "findings": [f.model_dump() for f in findings], "review_history": reviews,
        "submissions": [s.model_dump() for s in data.submissions if s.period == chosen],
    }
    return Response(json.dumps(payload, indent=2), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="satsa-{chosen}.json"'})


DIST = Path(__file__).resolve().parent.parent / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")
