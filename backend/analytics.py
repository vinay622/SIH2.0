from collections import Counter
from statistics import median

from backend.models import Finding, Submission

RULE_VERSION = "1.0.0"
SEVERITY_WEIGHT = {"critical": 4, "high": 3, "medium": 2, "low": 1}


def analyze(sub: Submission, submission_id: str, source_hash: str) -> list[Finding]:
    findings: list[Finding] = []
    closed = [a for a in sub.alerts if a.status == "closed"]
    severe = [a for a in closed if a.severity in ("critical", "high")]
    critical = [a for a in closed if a.severity == "critical"]

    def add(
        rule: str,
        title: str,
        kind: str,
        dimension: str,
        severity: str,
        rationale: str,
        recommendation: str,
        evidence: list[str],
        denominator: int,
        assets: list[str] | None = None,
    ) -> None:
        count = len(evidence) if evidence else len(assets or [])
        if not count:
            return
        findings.append(Finding.model_validate({
            "id": f"{submission_id}-{rule}",
            "entity_id": sub.entity.id,
            "entity_name": sub.entity.name,
            "period": sub.period,
            "rule": rule,
            "title": title,
            "kind": kind,
            "dimension": dimension,
            "severity": severity,
            "rationale": rationale,
            "recommendation": recommendation,
            "confidence": "Context required" if kind == "Negative space" else "Rule-based",
            "evidence_ids": evidence,
            "asset_ids": assets or [],
            "numerator": count,
            "denominator": denominator,
            "submission_id": submission_id,
            "source_hash": source_hash,
        }))

    fast = [
        a.id for a in severe
        if a.closed_at and (a.closed_at - a.created_at).total_seconds() < 300
    ]
    add("EG01", "High-severity alerts closed unusually quickly", "Execution gap",
        "Investigation", "high",
        f"{len(fast)} of {len(severe)} closed high/critical alerts were closed in under 5 minutes. "
        "Approved automation or tuning may explain this pattern; speed alone does not prove weak review.",
        "Inspect investigation notes and verify whether automated closure is authorised.", fast, len(severe))
    unescalated = [a.id for a in critical if not a.escalated]
    add("EG02", "Critical alerts closed without escalation", "Execution gap",
        "Escalation", "critical",
        f"{len(unescalated)} of {len(critical)} closed critical alerts have no recorded escalation.",
        "Check escalation policy, exceptions and associated incident records.", unescalated, len(critical))
    shallow = [a.id for a in closed if len(a.investigation.split()) < 8]
    add("EG03", "Insufficient investigation evidence", "Execution gap",
        "Investigation", "high",
        f"{len(shallow)} of {len(closed)} closed alerts have fewer than 8 words of investigation evidence. "
        "Detailed evidence may be held in another system.",
        "Request linked case records and assess the quality of investigation.", shallow, len(closed))
    texts = Counter(" ".join(a.investigation.lower().split()) for a in closed if a.investigation)
    repeated = [
        a.id for a in closed
        if a.investigation and texts[" ".join(a.investigation.lower().split())] >= 5
    ]
    add("EG04", "Repeated investigation narratives", "Execution gap", "Operational discipline", "medium",
        f"{len(repeated)} closed alerts share a normalised investigation narrative with at least 4 other alerts. "
        "Legitimate runbooks can also produce identical text.",
        "Sample repeated narratives for alert-specific reasoning and supporting evidence.", repeated, len(closed))
    groups = Counter((a.asset_id, a.category) for a in sub.alerts if not a.remediated)
    recurring = [a.id for a in sub.alerts if not a.remediated and groups[(a.asset_id, a.category)] >= 8]
    add("EG05", "Recurring alerts without recorded remediation", "Execution gap",
        "Incident response", "high",
        f"{len(recurring)} alerts belong to asset/category groups with at least 8 alerts and no recorded remediation.",
        "Verify root-cause analysis and whether remediation occurred outside this submission.", recurring, len(sub.alerts))

    if sub.complete:
        active = {a.asset_id for a in sub.alerts}
        expected = [a for a in sub.assets if a.critical and a.monitoring_expected]
        absent = [a.id for a in expected if a.id not in active]
        add("NS01", "Critical assets with no submitted alert activity", "Negative space",
            "Threat detection", "high",
            f"{len(absent)} of {len(expected)} critical assets expected to be monitored have no alerts "
            "in this complete submission. This is an evidence gap, not proof of missing telemetry.",
            "Request collector health, coverage mapping and benign-activity evidence for these assets.",
            [], len(expected), absent)
        categories = {a.category for a in sub.alerts}
        missing = sorted(set(sub.expected_categories) - categories)
        if missing:
            add("NS02", "Expected detection categories absent", "Negative space",
                "Threat detection", "medium",
                f"Declared expected categories absent from this complete submission: {', '.join(missing)}. "
                "An absence of alerts may reflect genuinely low activity.",
                "Validate detection use cases, test outcomes and category mapping.", [],
                len(set(sub.expected_categories)), missing)
    return findings


def risk_score(sub: Submission, findings: list[Finding]) -> int | None:
    if not sub.alerts or not sub.complete:
        return None
    flagged = {eid for finding in findings if finding.kind == "Execution gap" for eid in finding.evidence_ids}
    total = sum(SEVERITY_WEIGHT[a.severity] for a in sub.alerts)
    affected = sum(SEVERITY_WEIGHT[a.severity] for a in sub.alerts if a.id in flagged)
    negative = [f for f in findings if f.kind == "Negative space"]
    absence = max((f.numerator / max(f.denominator, 1) for f in negative), default=0)
    return min(100, round(80 * affected / total + 20 * absence))


def peer_outlier(value: int, peers: list[int]) -> bool:
    if len(peers) < 3:
        return False
    midpoint = median(peers)
    deviation = median([abs(p - midpoint) for p in peers])
    return value < midpoint - max(3 * 1.4826 * deviation, midpoint * 0.5)
