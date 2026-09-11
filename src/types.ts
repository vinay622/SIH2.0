export type Page = 'Overview' | 'Entities' | 'Findings' | 'Review queue' | 'Submissions' | 'Reports' | 'Methodology'
export type Finding = {
  id: string; entity_id: string; entity_name: string; period: string; rule: string
  title: string; kind: 'Execution gap' | 'Negative space' | 'Peer anomaly'
  dimension: string; severity: 'critical' | 'high' | 'medium'; rationale: string
  recommendation: string; confidence: string; evidence_ids: string[]; asset_ids: string[]
  numerator: number; denominator: number; submission_id: string; source_hash: string
  rule_version: string; status: string
}
export type Entity = {
  id: string; name: string; sector: string; cohort: string; period: string
  score: number | null; previous_score: number | null; alerts: number; findings: number
  critical: number; status: string; complete: boolean; submission_id: string; demo: boolean
}
export type Submission = {
  id: string; entity_id: string; entity_name: string; period: string; alerts: number
  assets: number; complete: boolean; imported_at: string; source_hash: string; demo: boolean
}
export type Workspace = {
  entities: Entity[]; findings: Finding[]; submissions: Submission[]
  trends: { period: string; score: number | null; findings: number; alerts: number }[]
  periods: string[]; rule_version: string
}
export type Evidence = {
  finding: Finding
  alerts: { id: string; asset_id: string; severity: string; category: string; created_at: string
    closed_at: string | null; investigation: string; escalated: boolean; status: string }[]
  assets: { id: string; name: string; critical: boolean; monitoring_expected: boolean }[]
  reviews: { id: number; decision: string; rationale: string; created_at: string }[]
  total_alerts: number
}
