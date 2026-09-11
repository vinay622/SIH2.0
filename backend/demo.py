import random
from datetime import UTC, datetime, timedelta
from typing import Literal

from backend.models import Alert, Asset, Entity, Submission
from backend.store import connect, insert_submission

ENTITIES = [
    ("CSE-001", "Northern Grid Power", "Energy", "Large energy SOC", 0.57),
    ("CSE-002", "Bharat National Bank", "Banking & Finance", "Large banking SOC", 0.40),
    ("CSE-003", "Western Energy Systems", "Energy", "Large energy SOC", 0.26),
    ("CSE-004", "Coastal Petroleum", "Energy", "Large energy SOC", 0.14),
    ("CSE-005", "National Payments Network", "Banking & Finance", "Large banking SOC", 0.09),
    ("CSE-006", "Eastern Power Corporation", "Energy", "Large energy SOC", 0.04),
]


def seed() -> None:
    with connect() as db:
        if db.execute("SELECT COUNT(*) FROM submissions").fetchone()[0]:
            return
    rng = random.Random(42)
    for month in range(1, 7):
        for index, (eid, name, sector, cohort, weakness) in enumerate(ENTITIES):
            assets = [
                Asset(id=f"{eid}-A{i:02}", name=f"{['Gateway', 'Application', 'Database', 'Controller'][i % 4]} {i:02}",
                      critical=i < 5, monitoring_expected=True)
                for i in range(12)
            ]
            alerts = []
            count = rng.randint(240, 410)
            for i in range(count):
                created = datetime(2026, month, rng.randint(1, 26), rng.randint(0, 23), rng.randint(0, 59), tzinfo=UTC)
                bad = rng.random() < weakness + (6 - month) * 0.025
                severities: list[Literal["critical", "high", "medium", "low"]] = ["critical", "high", "medium", "low"]
                severity = rng.choices(severities, [10, 28, 42, 20])[0]
                asset = assets[rng.randrange(2 if index == 0 else 0, len(assets))]
                category = rng.choice(["Malware", "Identity", "Network", "Data access"])
                duration = rng.randint(1, 4) if bad else rng.randint(18, 960)
                note = "Reviewed. False positive." if bad else (
                    f"Examined {category.lower()} evidence for record {i} on {asset.name}. "
                    f"Correlated source context and activity at {created.isoformat()}. "
                    "Recorded the case disposition and validated the approved control response."
                )
                closed = rng.random() > 0.10
                alerts.append(Alert(
                    id=f"{eid}-{month:02}-{i:04}", asset_id=asset.id, category=category,
                    severity=severity, created_at=created, acknowledged_at=created + timedelta(seconds=30),
                    closed_at=created + timedelta(minutes=duration) if closed else None,
                    status="closed" if closed else "open", investigation=note,
                    escalated=not bad and severity in ("critical", "high"), remediated=not bad,
                ))
            insert_submission(Submission(
                entity=Entity(id=eid, name=name, sector=sector, cohort=cohort),
                period=f"2026-{month:02}", complete=True, assets=assets, alerts=alerts,
                expected_categories=["Malware", "Identity", "Network", "Data access"] + (["OT security"] if index == 0 else []),
            ), demo=True)
