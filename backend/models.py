from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Entity(StrictModel):
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,60}$")
    name: str = Field(min_length=2, max_length=120)
    sector: str = Field(min_length=2, max_length=80)
    cohort: str = Field(min_length=2, max_length=80)


class Asset(StrictModel):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=120)
    critical: bool
    monitoring_expected: bool


class Alert(StrictModel):
    id: str = Field(min_length=1, max_length=100)
    asset_id: str = Field(min_length=1, max_length=100)
    category: str = Field(min_length=1, max_length=80)
    severity: Literal["critical", "high", "medium", "low"]
    created_at: datetime
    acknowledged_at: datetime | None = None
    closed_at: datetime | None = None
    status: Literal["open", "closed"]
    investigation: str = Field(default="", max_length=10000)
    escalated: bool
    remediated: bool

    @model_validator(mode="after")
    def check_timestamps(self) -> Self:
        for value in [self.created_at, self.acknowledged_at, self.closed_at]:
            if value and (value.tzinfo is None or value.utcoffset() is None):
                raise ValueError("Timestamps must include a timezone.")
        if self.closed_at and self.closed_at < self.created_at:
            raise ValueError("Closure cannot precede creation.")
        if self.acknowledged_at and self.acknowledged_at < self.created_at:
            raise ValueError("Acknowledgement cannot precede creation.")
        if self.closed_at and self.acknowledged_at and self.closed_at < self.acknowledged_at:
            raise ValueError("Closure cannot precede acknowledgement.")
        if (self.status == "closed") != (self.closed_at is not None):
            raise ValueError("Closed alerts require closed_at; open alerts cannot have closed_at.")
        return self


class Submission(StrictModel):
    entity: Entity
    period: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    complete: bool
    expected_categories: list[str] = Field(default_factory=list, max_length=100)
    assets: list[Asset] = Field(default_factory=list, max_length=10000)
    alerts: list[Alert] = Field(max_length=50000)

    @model_validator(mode="after")
    def check_references(self) -> Self:
        if len({a.id for a in self.alerts}) != len(self.alerts):
            raise ValueError("Duplicate alert IDs within submission.")
        asset_ids = {a.id for a in self.assets}
        if len(asset_ids) != len(self.assets):
            raise ValueError("Duplicate asset IDs within submission.")
        for alert in self.alerts:
            if alert.created_at.strftime("%Y-%m") != self.period:
                raise ValueError(f"Alert {alert.id} creation date is outside reporting period.")
            if asset_ids and alert.asset_id not in asset_ids:
                raise ValueError(f"Alert {alert.id} references an unknown inventory asset.")
        return self


class Review(StrictModel):
    decision: Literal["confirmed", "dismissed", "needs_information"]
    rationale: str = Field(min_length=10, max_length=2000)


class Finding(BaseModel):
    id: str
    entity_id: str
    entity_name: str
    period: str
    rule: str
    title: str
    kind: Literal["Execution gap", "Negative space", "Peer anomaly"]
    dimension: str
    severity: Literal["critical", "high", "medium"]
    rationale: str
    recommendation: str
    confidence: str
    evidence_ids: list[str]
    asset_ids: list[str] = Field(default_factory=list)
    numerator: int
    denominator: int
    submission_id: str
    source_hash: str
    rule_version: str = "1.0.0"
    status: str = "pending"
