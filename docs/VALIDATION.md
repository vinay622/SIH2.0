# Analytics and validation methodology

## Signals

| Rule | Trigger | Interpretation requiring examiner context |
|---|---|---|
| EG01 | Closed high/critical alerts, closure < 300 seconds | Authorised automation may be appropriate |
| EG02 | Closed critical alerts with `escalated=false` | Confirm escalation policy and accepted exceptions |
| EG03 | Closed alerts with < 8 investigation words | Linked case systems may contain the evidence |
| EG04 | Normalised narrative present in ≥ 5 closed alerts | Templates alone do not imply superficial investigation |
| EG05 | ≥ 8 unremediated alerts per asset/category | Validate root cause and remediation outside export |
| NS01 | Expected monitored critical asset absent from complete alert submission | No alert activity does not prove missing telemetry |
| NS02 | Declared category absent from complete alert submission | Validate expected categories and benign activity |
| PA01 | Alert count below cohort peer median by > max(3 × 1.4826 × MAD, 50% of median) | Minimum 3 complete peers; scope/scale comparability is essential |

Negative-space rules are suppressed for incomplete submissions. NS01 also
requires inventory; NS02 requires explicit category expectations. No model
should invent expected categories from a sector label. Low activity is a
follow-up question, not a finding of missing monitoring.

Thresholds are fixed, versioned prototype defaults. Adjusting thresholds is a
code/configuration release requiring a new rule version and validation; the UI
does not silently tune thresholds on reviewed data.

## Attention indicator

```text
weight = {critical: 4, high: 3, medium: 2, low: 1}
affected = union(all execution-gap evidence IDs)
execution_fraction = sum(weight[alert] for affected) / sum(weight[all alerts])
absence_fraction = max(negative-space numerator / denominator), default 0
score = min(100, round(80 * execution_fraction + 20 * absence_fraction))
```

An alert is counted once even when multiple rules flag it. Scores are withheld
for empty/incomplete submissions. Lack of inventory does not imply good
coverage: the attention score then lacks that dimension. Peer signals do not
affect the score. Prior-period comparisons use the latest earlier available
submission for that entity, not necessarily the previous calendar month.
Portfolio trends show the mean among scorable submitted entities; cohort changes
can affect the trend. The prototype does not provide matched-cohort trend
adjustment.

High attention: 45–100; moderate: 20–44; routine: 0–19. These are triage bands,
not incident probabilities, regulatory ratings or validated risk tolerances.

## Expert-review validation protocol (to be executed with NCIIPC)

1. Select consenting historical submissions across sectors, SOC maturity,
   incident volume and multiple periods. Retain a sealed holdout by entity and
   time; prevent template leakage between training/calibration and holdout.
2. Have two independent examiners label execution gaps and negative-space
   concerns, including explicit “insufficient evidence” outcomes. Use inventory,
   control expectations and submission-quality evidence for absence claims.
3. Adjudicate disagreements without revealing tool ranking. Record Cohen's
   kappa or another justified agreement measure and reasons for disagreement.
4. Compare random sampling, severity-only sampling and SAT-SA prioritisation at
   the same examiner-hour and sample-count budget.
5. Measure per-rule precision/recall, confidence intervals, entity-level concern
   recall, recall at top K, time per confirmed concern and review effort saved.
   Also measure false-positive burden and sensitivity to partial submissions.
6. Report results by sector and entity size. Test alternate closure/template
   policies and legitimately quiet assets. Investigate false negatives manually.
7. Agree acceptance thresholds with examiners *before* opening the holdout.
   Roll out in shadow mode, maintain human dispositions, and revalidate every
   rule change using fixed regression examples and an updated holdout.

Comparable or superior effectiveness to expert manual sampling is **not yet
demonstrated**. Synthetic records exercise behaviour but cannot establish
supervisory validity.

## Engineering validation

The automated suite checks rule boundaries, suppressed negative-space checks,
weighted score deduplication, sparse peers, chronology, duplicate imports,
source/evidence linkage, persistence of review history and safe exports.
The frontend is checked with ESLint, TypeScript and a production build.

Performance methodology: measure cold/warm workspace latency, ingestion time,
peak resident memory and report latency at increasing entity/period/row counts.
The current engine parses all retained submissions in memory and caches the
workspace. A per-file limit does not imply bounded total memory. Establish
dataset retention budgets for pilots; migrate to columnar/streamed analysis
before claiming national-scale capacity.
