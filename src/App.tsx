import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  Activity, ArrowDown, ArrowDownLeft, ArrowRight, ArrowUpRight, BarChart3, Bell,
  BookOpen, Building2, CalendarDays, Check, CheckCheck, ChevronDown,
  ChevronRight, CircleAlert, CircleHelp, ClipboardCheck, Database, Download,
  FileCheck2, FileJson, FileText, Fingerprint, FolderSearch, LayoutDashboard,
  ListFilter, LoaderCircle, LockKeyhole, Menu, MoreHorizontal, Plus, Search,
  Shield, ShieldCheck, SlidersHorizontal, Sparkles, Upload, X,
} from 'lucide-react'
import type { Entity, Evidence, Finding, Page, Workspace } from './types'

const empty: Workspace = { entities: [], findings: [], submissions: [], trends: [], periods: [], rule_version: '' }
const nav = [
  { name: 'Overview', icon: LayoutDashboard }, { name: 'Entities', icon: Building2 },
  { name: 'Findings', icon: FolderSearch }, { name: 'Review queue', icon: ClipboardCheck },
  { name: 'Submissions', icon: Database }, { name: 'Reports', icon: BarChart3 },
] as const
const fmt = (n: number) => n.toLocaleString('en-IN')
const month = (p: string, short = false) => p ? new Date(`${p}-01T00:00:00`).toLocaleDateString('en-GB', { month: short ? 'short' : 'long', ...(!short ? { year: 'numeric' } : {}) }) : 'No reporting periods'
const pretty = (s: string) => s.replaceAll('_', ' ')
const level = (score: number | null) => score === null ? 'unknown' : score >= 45 ? 'critical' : score >= 20 ? 'medium' : 'low'

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  if (!response.ok) {
    const error: { detail?: string | object } = await response.json().catch(() => ({}))
    throw new Error(typeof error.detail === 'string' ? error.detail : `Request failed (${response.status}). Please check your input.`)
  }
  return response.json() as Promise<T>
}

function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}><span className="badge-dot" />{children}</span>
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty"><FolderSearch size={30} /><h3>{title}</h3><p>{text}</p></div>
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab') {
        const items = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, textarea, [tabindex="0"]')
        if (!items?.length) return
        const first = items[0], last = items[items.length - 1]
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handler); document.body.style.overflow = ''; previous?.focus() }
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className={`modal ${wide ? 'wide' : ''}`} ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
      <div className="modal-heading"><div><span className="eyebrow">SUPERVISORY WORKSPACE</span><h2>{title}</h2></div><button className="icon-btn" onClick={onClose} aria-label="Close dialog"><X size={21} /></button></div>
      {children}
    </div>
  </div>
}

function RiskChart({ trends }: { trends: Workspace['trends'] }) {
  const rated = trends.filter((t): t is typeof t & { score: number } => t.score !== null)
  if (!rated.length) return <Empty title="No scored periods" text="Import complete submissions to see the assessment trend." />
  const x = (i: number) => 42 + i * (480 / Math.max(rated.length - 1, 1))
  const y = (n: number) => 165 - n * 1.3
  const line = rated.map((t, i) => `${x(i)},${y(t.score)}`).join(' ')
  return <svg className="trend-chart" viewBox="0 0 555 205" role="img" aria-label={`Average attention score by period: ${rated.map(t => `${month(t.period)} ${t.score}`).join(', ')}`}>
    <defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#259788" stopOpacity=".15" /><stop offset="100%" stopColor="#259788" stopOpacity="0" /></linearGradient></defs>
    {[0, 25, 50, 75, 100].map(n => <g key={n}><line x1="38" y1={y(n)} x2="533" y2={y(n)} stroke="#e8edeb" strokeDasharray="4 5" /><text x="9" y={y(n) + 4} fill="#98a09e" fontSize="10">{n}</text></g>)}
    <polygon points={`42,165 ${line} ${x(rated.length - 1)},165`} fill="url(#chartFill)" />
    <polyline points={line} fill="none" stroke="#298675" strokeWidth="2.5" strokeLinejoin="round" />
    {rated.map((t, i) => <g key={t.period}><circle cx={x(i)} cy={y(t.score)} r="4" fill="white" stroke="#298675" strokeWidth="2"><title>{month(t.period)}: {t.score}/100</title></circle>
      <text x={x(i)} y="192" textAnchor="middle" fill="#88918e" fontSize="10">{month(t.period, true)}</text>
      {i === rated.length - 1 && <g><rect x={x(i) - 16} y={y(t.score) - 32} width="32" height="21" rx="5" fill="#1e655a" /><text x={x(i)} y={y(t.score) - 18} textAnchor="middle" fill="white" fontSize="10" fontWeight="600">{t.score}</text></g>}
    </g>)}
  </svg>
}

function EntityTable({ entities, onSelect }: { entities: Entity[]; onSelect: (id: string) => void }) {
  return <div className="table-scroll"><table className="entity-table"><thead><tr>
    <th>ENTITY</th><th>ATTENTION SCORE <CircleHelp size={12} /></th><th>FINDINGS</th><th>VS. PRIOR PERIOD</th><th>ASSESSMENT STATUS</th><th aria-label="Actions" />
  </tr></thead><tbody>
    {entities.map(e => <tr key={`${e.id}-${e.period}`} onClick={() => onSelect(e.id)}>
      <td><button className="entity-name" onClick={event => { event.stopPropagation(); onSelect(e.id) }}><span className={`entity-avatar ${e.sector === 'Energy' ? 'energy' : 'finance'}`}><Building2 size={17} /></span><span><strong>{e.name}</strong><small>{e.id} <span>·</span> {e.sector}</small></span></button></td>
      <td><div className="score-cell"><strong className={`score-${level(e.score)}`}>{e.score ?? '—'}</strong><span className="score-track"><i className={level(e.score)} style={{ width: `${e.score ?? 0}%` }} /></span></div></td>
      <td><span className="finding-count">{e.findings}</span>{e.critical > 0 && <span className="critical-count">{e.critical} critical</span>}</td>
      <td>{e.score !== null && e.previous_score !== null ? <span className={`delta ${e.score <= e.previous_score ? 'down' : 'up'}`}>{e.score <= e.previous_score ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}{Math.abs(e.score - e.previous_score)} pts</span> : <span className="muted">No baseline</span>}</td>
      <td><Badge tone={level(e.score)}>{e.status}</Badge></td><td><ChevronRight size={16} className="muted" /></td>
    </tr>)}
  </tbody></table>{!entities.length && <Empty title="No entities found" text="Try another filter or import a submission." />}</div>
}

function FindingsList({ findings, onSelect, compact = false }: { findings: Finding[]; onSelect: (f: Finding) => void; compact?: boolean }) {
  return <div className={`findings-list ${compact ? 'compact' : ''}`}>{findings.map(f => <button className="finding-row" key={f.id} onClick={() => onSelect(f)}>
    <span className={`finding-symbol ${f.severity}`}>{f.kind === 'Negative space' ? <Activity size={17} /> : <CircleAlert size={17} />}</span>
    <span className="finding-text"><span className="finding-title">{f.title}</span><span className="finding-meta">{f.entity_name}<i />{f.rule}<i />{f.numerator} {f.evidence_ids.length ? 'alerts' : 'indicators'}</span></span>
    {!compact && <span className="finding-kind">{f.kind}</span>}<Badge tone={f.severity}>{f.severity}</Badge><ChevronRight size={16} className="muted" />
  </button>)}{!findings.length && <Empty title="No matching findings" text="Adjust your filters or choose a different reporting period." />}</div>
}

export default function App() {
  const [data, setData] = useState<Workspace>(empty)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState<Page>('Overview')
  const [period, setPeriod] = useState('')
  const [search, setSearch] = useState('')
  const [sector, setSector] = useState('All sectors')
  const [tab, setTab] = useState('All signals')
  const [entityFilter, setEntityFilter] = useState('')
  const [severity, setSeverity] = useState('All severities')
  const [importOpen, setImportOpen] = useState(false)
  const [selected, setSelected] = useState<Finding | null>(null)
  const [notice, setNotice] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [limit, setLimit] = useState(20)
  const [sort, setSort] = useState('risk')
  const refresh = useCallback(async () => {
    try {
      const result = await api<Workspace>('/api/workspace')
      setData(result); setPeriod(p => result.periods.includes(p) ? p : result.periods[0] || '')
      setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load workspace') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 5500); return () => clearTimeout(timer) } }, [notice])
  useEffect(() => { setLimit(20) }, [page, period, search, sector, tab, severity, entityFilter])
  const closeImport = useCallback(() => setImportOpen(false), [])
  const closeFinding = useCallback(() => setSelected(null), [])
  const navigate = (p: Page) => { setPage(p); setSearch(''); setTab('All signals'); setEntityFilter(''); setMobileNav(false) }
  const entities = useMemo(() => data.entities.filter(e => e.period === period && (sector === 'All sectors' || e.sector === sector) && `${e.name} ${e.id}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : (b.score ?? -1) - (a.score ?? -1)), [data, period, sector, search, sort])
  const scopeIds = new Set(data.entities.filter(e => e.period === period && (sector === 'All sectors' || e.sector === sector)).map(e => e.id))
  const allFindings = data.findings.filter(f => f.period === period && scopeIds.has(f.entity_id))
  const findings = allFindings.filter(f => `${f.title} ${f.entity_name} ${f.rule} ${f.dimension}`.toLowerCase().includes(search.toLowerCase()) &&
    (!entityFilter || f.entity_id === entityFilter) && (tab === 'All signals' || f.kind === tab) &&
    (severity === 'All severities' || f.severity === severity) && (page !== 'Review queue' || f.status === 'pending'))
  const pending = allFindings.filter(f => f.status === 'pending').length
  const critical = allFindings.filter(f => f.severity === 'critical').length
  const high = entities.filter(e => e.score !== null && e.score >= 45).length
  const complete = entities.filter(e => e.complete).length
  const submissions = data.submissions.filter(s => s.period === period && scopeIds.has(s.entity_id) && s.entity_name.toLowerCase().includes(search.toLowerCase()))
  const selectedEntity = data.entities.find(e => e.period === period && e.id === entityFilter)
  const goEntity = (id: string) => { setPage('Findings'); setEntityFilter(id); setSearch(''); setTab('All signals') }
  const download = (format: 'json' | 'csv') => { window.location.href = `/api/report?period=${period}&format=${format}` }
  const headerText: Record<Page, string> = {
    Overview: 'A clearer view of operational resilience.', Entities: 'Compare operational evidence across critical sector entities.',
    Findings: 'Follow the signal. Examine the evidence.', 'Review queue': 'Your judgement turns signals into supervisory assurance.',
    Submissions: 'Periodic evidence, securely processed in your environment.',
    Reports: 'Bring evidence and supervisory decisions together.', Methodology: 'Transparent signals. Traceable evidence. Human judgement.',
  }

  return <div className="app-shell">
    {mobileNav && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('Overview') }}><span className="brand-symbol"><ShieldCheck size={25} /></span><span>SAT-SA<small>SUPERVISORY ANALYTICS</small></span><span className="brand-version">v1</span></a>
      <div className="workspace-switch"><span className="workspace-icon"><Building2 size={17} /></span><span>Supervisory workspace<small>Local assessment environment</small></span><LockKeyhole size={13} /></div>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="Main navigation">{nav.map(item => <button key={item.name} className={`nav-item ${page === item.name ? 'active' : ''}`} onClick={() => navigate(item.name)}><item.icon size={18} /><span>{item.name}</span>{item.name === 'Review queue' && pending > 0 && <span className="nav-count">{pending}</span>}{page === item.name && item.name !== 'Review queue' && <span className="nav-active-dot" />}</button>)}</nav>
      <div className="nav-label second">RESOURCES</div>
      <button className={`nav-item ${page === 'Methodology' ? 'active' : ''}`} onClick={() => navigate('Methodology')}><BookOpen size={18} /><span>Methodology & rules</span><ArrowUpRight size={14} /></button>
      <div className="sidebar-bottom"><div className="offline-card"><div><span className="online-dot" /><strong>Offline by design</strong><LockKeyhole size={13} /></div><p>Your data stays within<br />your environment.</p><span>LOCAL PROCESSING ONLY</span></div>
        <button className="profile" onClick={() => { navigate('Methodology'); setNotice('Single-examiner prototype. Identity and role management are deployment requirements.') }}><span className="avatar">SE</span><span>Supervisory examiner<small>Local workspace</small></span><MoreHorizontal size={18} /></button>
      </div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-btn mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={19} /></button><span>Workspace</span><ChevronRight size={13} /><strong>{page}</strong></div>
        <div className="topbar-right"><span className="local-label"><span className="online-dot" />Local environment</span><span className="topbar-divider" /><button className="notification" aria-label={`Open review queue with ${pending} pending findings`} onClick={() => navigate('Review queue')}><Bell size={18} />{pending > 0 && <i />}</button><span className="top-avatar">SE</span></div>
      </header>
      <main>
        <div className="page-heading"><div><div className="heading-kicker">SOC ASSESSMENT <span>/</span> {page === 'Overview' ? 'COMMAND OVERVIEW' : page.toUpperCase()}</div><h1>{page === 'Overview' ? 'Supervisory overview' : page}</h1><p>{headerText[page]}</p></div>
          <div className="heading-actions"><label className="period-control"><CalendarDays size={16} /><select aria-label="Reporting period" value={period} onChange={e => setPeriod(e.target.value)}>{!data.periods.length && <option value="">No periods</option>}{data.periods.map(p => <option key={p} value={p}>{month(p)}</option>)}</select><ChevronDown size={13} /></label><button className="button primary" onClick={() => setImportOpen(true)}><Plus size={17} />Import data</button></div>
        </div>

        {error && <div className="error-banner" role="alert"><CircleAlert size={18} /><span>{error}</span><button onClick={() => { setLoading(true); void refresh() }}>Retry</button></div>}
        {loading ? <div className="loading"><LoaderCircle className="spin" size={28} /><p>Preparing your supervisory workspace…</p></div> : <>
        {data.submissions.some(s => s.demo) && <div className="demo-banner"><span className="demo-icon"><Sparkles size={15} /></span><span><strong>Explore the assessment workspace</strong><span className="demo-separator">—</span>Synthetic sample data is loaded. Findings illustrate supervisory signals.</span><button onClick={() => navigate('Submissions')}>View submissions <ArrowRight size={14} /></button></div>}

        {page === 'Overview' && <>
          <div className="stat-grid">
            <Stat label="Entities assessed" value={fmt(entities.length)} icon={<Building2 size={18} />} sub={`${new Set(entities.map(e => e.sector)).size} critical sectors`} detail={`${complete} complete submissions`} />
            <Stat label="Require high attention" value={fmt(high)} icon={<Shield size={18} />} tone="red" sub="Prioritised for supervisory review" detail="Attention score ≥ 45" onClick={() => { navigate('Entities'); setSort('risk') }} />
            <Stat label="Supervisory findings" value={fmt(allFindings.length)} icon={<FolderSearch size={18} />} tone="amber" sub={`${critical} critical signals`} detail="Across all assessment dimensions" onClick={() => navigate('Findings')} />
            <Stat label="Awaiting examiner review" value={fmt(pending)} icon={<ClipboardCheck size={18} />} tone="teal" sub={`${allFindings.length - pending} findings reviewed`} detail="Human judgement at every step" onClick={() => navigate('Review queue')} />
          </div>

          <div className="overview-tabs"><div>{['All signals', 'Execution gap', 'Negative space', 'Peer anomaly'].map(t => <button className={tab === t ? 'selected' : ''} key={t} onClick={() => setTab(t)}>{t === 'All signals' ? 'Assessment overview' : t === 'Peer anomaly' ? 'Peer comparison' : `${t}s`}{t !== 'All signals' && <span>{allFindings.filter(f => f.kind === t).length}</span>}</button>)}</div><span className="period-note"><span className="online-dot" />Periodic assessment</span></div>

          {tab === 'All signals' ? <>
            <div className="insight-grid"><section className="card trend-card"><div className="card-heading"><div><h2>Supervisory attention trend</h2><p>Average entity score across reporting periods</p></div><span className="tiny-label">ALL ENTITIES</span></div><div className="chart-key"><span /><span>Attention score</span><span className="chart-key-note">Lower indicates fewer rule-based signals</span></div><RiskChart trends={data.trends} /></section>
              <section className="card signals-card"><div className="card-heading"><div><h2>Where to look closer</h2><p>Signals by supervisory dimension</p></div><span className="square-icon"><SlidersHorizontal size={16} /></span></div><div className="dimension-bars">{['Investigation', 'Escalation', 'Threat detection', 'Incident response', 'Operational discipline'].map((d, i) => { const count = allFindings.filter(f => f.dimension === d).length; return <button key={d} onClick={() => { navigate('Findings'); setSearch(d) }}><span>{d}</span><span className="dimension-track"><i style={{ width: `${Math.max(2, count / Math.max(allFindings.length, 1) * 230)}%`, background: ['#36796d', '#689f93', '#8cb9ad', '#abc9bc', '#d0dfd3'][i] }} /></span><strong>{count}</strong></button> })}</div><div className="card-footnote"><CircleHelp size={12} />Indicators for review, not confirmed control failures</div></section>
            </div>
            <section className="card entity-card"><div className="card-heading"><div><h2>Entities requiring attention <span className="count-label">{entities.length}</span></h2><p>Prioritised by operational evidence, not reported performance</p></div><button className="text-button" onClick={() => navigate('Entities')}>View all entities <ArrowRight size={15} /></button></div>
              <div className="table-toolbar"><label className="search-field"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search entities…" aria-label="Search entities" /><kbd>⌕</kbd></label><div><label className="select-button"><ListFilter size={14} /><select aria-label="Filter sector" value={sector} onChange={e => setSector(e.target.value)}><option>All sectors</option>{[...new Set(data.entities.map(e => e.sector))].map(s => <option key={s}>{s}</option>)}</select></label><label className="select-button"><ArrowDown size={14} /><select aria-label="Sort entities" value={sort} onChange={e => setSort(e.target.value)}><option value="risk">Highest attention</option><option value="name">Entity name</option></select></label></div></div>
              <EntityTable entities={entities.slice(0, 5)} onSelect={goEntity} /><div className="table-footer"><span>Showing {Math.min(5, entities.length)} of {entities.length} entities</span><button className="text-button" onClick={() => navigate('Entities')}>Explore entity assessments <ArrowRight size={14} /></button></div>
            </section>
            <div className="bottom-grid"><section className="card priority-card"><div className="card-heading"><div><h2>Priority review signals <span className="live-dot" /></h2><p>A starting point for your next examination</p></div><button className="icon-btn" aria-label="View all priority signals" onClick={() => navigate('Review queue')}><ArrowUpRight size={18} /></button></div><FindingsList findings={allFindings.filter(f => f.status === 'pending').slice(0, 3)} onSelect={setSelected} compact /></section>
              <section className="assurance-card"><div className="assurance-symbol"><Fingerprint size={26} /></div><span className="eyebrow">EVIDENCE, NOT ASSUMPTIONS</span><h2>Every finding has<br />a story you can trace.</h2><p>Follow each signal to its source, understand the rule, and record your judgement.</p><button onClick={() => navigate('Methodology')}>Explore our methodology <ArrowRight size={15} /></button></section></div>
          </> : <section className="card"><div className="card-heading"><div><h2>{tab === 'Peer anomaly' ? 'Peer comparison signals' : `${tab}s`}</h2><p>{tab === 'Negative space' ? 'Missing evidence is a question to investigate, not proof of failure.' : tab === 'Peer anomaly' ? 'Compared within declared cohorts, using at least three complete peers.' : 'Where recorded operational behaviour may differ from expected practice.'}</p></div><Badge>{findings.length} signals</Badge></div><FindingsList findings={findings.slice(0, limit)} onSelect={setSelected} />{findings.length > limit && <button className="load-more" onClick={() => setLimit(limit + 20)}>Show more findings</button>}</section>}
        </>}

        {page === 'Entities' && <section className="card"><div className="card-heading"><div><h2>Entity assessments <span className="count-label">{entities.length}</span></h2><p>Select an entity to examine its operational evidence.</p></div></div><Filters search={search} setSearch={setSearch} sector={sector} setSector={setSector} sectors={[...new Set(data.entities.map(e => e.sector))]} /><EntityTable entities={entities} onSelect={goEntity} /><div className="table-footer">Scores prioritise review effort; they do not measure breach probability.</div></section>}

        {(page === 'Findings' || page === 'Review queue') && <>
          {selectedEntity && <div className="entity-focus"><span className="entity-avatar energy"><Building2 size={22} /></span><div><h2>{selectedEntity.name}</h2><p>{selectedEntity.id} · {selectedEntity.cohort} · {fmt(selectedEntity.alerts)} alerts</p></div><Badge tone={level(selectedEntity.score)}>Score {selectedEntity.score ?? 'unavailable'}</Badge><button className="icon-btn" onClick={() => setEntityFilter('')} aria-label="Clear entity filter"><X size={16} /></button></div>}
          <section className="card"><div className="card-heading"><div><h2>{page === 'Review queue' ? 'Prioritised for your review' : 'Supervisory findings'} <span className="count-label">{findings.length}</span></h2><p>{page === 'Review queue' ? 'Critical findings first. Record a decision to move a finding out of the queue.' : 'Open a finding to inspect the rationale, source evidence and review history.'}</p></div><button className="button" disabled={!period} onClick={() => download('csv')}><Download size={15} />Export period</button></div>
            <div className="table-toolbar"><label className="search-field"><Search size={16} /><input aria-label="Search findings" placeholder="Search entity, finding, rule…" value={search} onChange={e => setSearch(e.target.value)} /></label><div><label className="select-button"><ListFilter size={14} /><select aria-label="Signal category" value={tab} onChange={e => setTab(e.target.value)}>{['All signals', 'Execution gap', 'Negative space', 'Peer anomaly'].map(t => <option key={t}>{t}</option>)}</select></label><label className="select-button"><select aria-label="Severity" value={severity} onChange={e => setSeverity(e.target.value)}>{['All severities', 'critical', 'high', 'medium'].map(t => <option key={t}>{t}</option>)}</select><ChevronDown size={13} /></label></div></div>
            <FindingsList findings={findings.slice(0, limit)} onSelect={setSelected} />{findings.length > limit && <button className="load-more" onClick={() => setLimit(limit + 20)}>Show more findings ({findings.length - limit} remaining)</button>}
          </section>
        </>}

        {page === 'Submissions' && <>
          <div className="submission-callout"><span className="large-icon"><Upload size={25} /></span><div><h2>Bring operational evidence into focus</h2><p>Import periodic JSON or CSV submissions. All processing happens locally.</p></div><button className="button primary" onClick={() => setImportOpen(true)}><Upload size={16} />New submission</button></div>
          <section className="card"><div className="card-heading"><div><h2>Submission register</h2><p>Original records retained with a SHA-256 fingerprint for traceability.</p></div><a className="text-button" href="/api/template">Download JSON template <Download size={14} /></a></div><Filters search={search} setSearch={setSearch} sector={sector} setSector={setSector} sectors={[...new Set(data.entities.map(e => e.sector))]} />
            <div className="table-scroll"><table><thead><tr><th>ENTITY / SUBMISSION</th><th>PERIOD</th><th>RECORDS</th><th>COMPLETENESS</th><th>SOURCE</th><th /></tr></thead><tbody>{submissions.map(s => <tr key={s.id}><td><strong>{s.entity_name}</strong><small className="table-small mono">{s.id}</small></td><td>{month(s.period, true)} {s.period.slice(0, 4)}</td><td>{fmt(s.alerts)} alerts<small className="table-small">{s.assets} assets declared</small></td><td><Badge tone={s.complete ? 'low' : 'medium'}>{s.complete ? 'Declared complete' : 'Partial'}</Badge></td><td><span className="source-label">{s.demo ? 'Synthetic sample' : 'Local import'}</span></td><td><a className="icon-btn" href={`/api/submissions/${s.id}`} download={`submission-${s.id}.json`} aria-label={`Download submission for ${s.entity_name}`}><Download size={17} /></a></td></tr>)}</tbody></table></div>{!submissions.length && <Empty title="No submissions for this period" text="Import a CSV or JSON file to begin an assessment." />}</section>
        </>}

        {page === 'Reports' && <><div className="report-intro"><span className="eyebrow">ASSESSMENT PACKAGE</span><h2>From operational evidence<br />to supervisory insight.</h2><p>Export a reproducible assessment for {month(period)}.<br />Include findings, source fingerprints and recorded examiner decisions.</p><div><Badge>{entities.length} entities</Badge><Badge>{allFindings.length} findings</Badge><Badge>{allFindings.length - pending} reviewed</Badge></div></div><div className="report-grid"><ReportCard icon={<FileJson size={27} />} title="Full assessment package" text="Structured JSON with entity scores, findings, source hashes, rule version and complete review history." label="Export JSON package" disabled={!period} onClick={() => download('json')} /><ReportCard icon={<FileText size={27} />} title="Findings register" text="A spreadsheet-ready record of supervisory signals, affected counts, rationales and current review decisions." label="Export CSV register" disabled={!period} onClick={() => download('csv')} /><ReportCard icon={<BookOpen size={27} />} title="Assessment methodology" text="Understand the signal rules, scoring approach, data limitations and validation protocol before drawing conclusions." label="Read methodology" onClick={() => navigate('Methodology')} /></div></>}
        {page === 'Methodology' && <Methodology />}
        <footer className="footer"><span><ShieldCheck size={13} />SAT-SA <span>·</span> Supervisory assurance, grounded in evidence.</span><span>Rule engine {data.rule_version || '1.0.0'} <i />Human-led assessment</span></footer>
        </>}
      </main>
    </div>
    {importOpen && <Modal title="Import a submission" onClose={closeImport}><ImportForm onImported={message => { closeImport(); void refresh(); setNotice(message); setPage('Submissions') }} /></Modal>}
    {selected && <Modal title="Finding & supporting evidence" onClose={closeFinding} wide><FindingDetail finding={selected} onReviewed={() => { void refresh(); setNotice('Examiner decision saved to the review history.') }} /></Modal>}
    {notice && <div className="toast" role="status"><CheckCheck size={18} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={15} /></button></div>}
  </div>
}

function Stat({ label, value, icon, sub, detail, tone = '', onClick }: { label: string; value: string; icon: ReactNode; sub: string; detail: string; tone?: string; onClick?: () => void }) {
  const content = <><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}>{icon}</span></div><strong className="stat-value">{value}</strong><div className={`stat-sub ${tone}`}>{tone === 'red' ? <span className="small-dot" /> : tone === 'amber' ? <CircleAlert size={12} /> : tone === 'teal' ? <Check size={12} /> : <span className="small-dot" />}{sub}</div><div className="stat-detail">{detail}{onClick && <ArrowUpRight size={12} />}</div></>
  return onClick ? <button className="stat-card" onClick={onClick}>{content}</button> : <div className="stat-card">{content}</div>
}

function Filters({ search, setSearch, sector, setSector, sectors }: { search: string; setSearch: (s: string) => void; sector: string; setSector: (s: string) => void; sectors: string[] }) {
  return <div className="table-toolbar"><label className="search-field"><Search size={16} /><input placeholder="Search entities…" aria-label="Search entities" value={search} onChange={e => setSearch(e.target.value)} /></label><label className="select-button"><ListFilter size={15} /><select aria-label="Sector" value={sector} onChange={e => setSector(e.target.value)}><option>All sectors</option>{sectors.map(s => <option key={s}>{s}</option>)}</select></label></div>
}

function ReportCard({ icon, title, text, label, onClick, disabled = false }: { icon: ReactNode; title: string; text: string; label: string; onClick: () => void; disabled?: boolean }) {
  return <section className="card report-card"><span className="large-icon">{icon}</span><h2>{title}</h2><p>{text}</p><button className="button" disabled={disabled} onClick={onClick}>{label}<ArrowRight size={15} /></button></section>
}

function ImportForm({ onImported }: { onImported: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const choose = (chosen: File | null) => { setFile(chosen); setError('') }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file) { setError('Choose a submission file first.'); return }
    if (file.size > 20 * 1024 * 1024) { setError('The maximum file size is 20 MB.'); return }
    const body = new FormData(event.currentTarget)
    body.set('file', file)
    setBusy(true); setError('')
    try { const result = await api<{ message: string }>('/api/import', { method: 'POST', body }); onImported(result.message) }
    catch (e) { setError(e instanceof Error ? e.message : 'Import failed') }
    finally { setBusy(false) }
  }
  return <form onSubmit={event => void submit(event)} className="import-form"><p className="modal-description">Upload a periodic SOC submission. Records are validated before being stored and analysed locally.</p>
    <label className={`dropzone ${drag ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); choose(e.dataTransfer.files[0] || null) }}><span className="upload-circle">{file ? <FileCheck2 size={25} /> : <Upload size={25} />}</span><strong>{file ? file.name : 'Choose a file or drag it here'}</strong><span>{file ? `${(file.size / 1024).toFixed(1)} KB · Click to change file` : 'JSON or CSV · UTF-8 · Up to 20 MB / 50,000 alerts'}</span><input type="file" accept=".json,.csv" aria-label="Submission file" onChange={e => choose(e.target.files?.[0] || null)} /></label>
    <div className="template-links"><span>Start with a template</span><a href="/api/template?format=json" download><Download size={13} />JSON</a><a href="/api/template?format=csv" download><Download size={13} />CSV</a></div>
    {file?.name.toLowerCase().endsWith('.csv') && <fieldset className="csv-fields"><legend>CSV submission context</legend><div className="form-grid">{[['entity_id', 'Entity ID', 'CSE-NEW'], ['entity_name', 'Entity name', 'Example Entity'], ['sector', 'Sector', 'Energy'], ['cohort', 'Comparable cohort', 'Large energy SOC']].map(([name, label, placeholder]) => <label key={name}>{label}<input name={name} placeholder={placeholder} required maxLength={name === 'entity_id' ? 60 : name === 'entity_name' ? 120 : 80} /></label>)}<label>Reporting period<input type="month" name="period" required /></label></div><label className="checkbox"><input type="checkbox" name="complete" value="true" />This submission contains the complete period’s alert records</label><p>CSV has no asset inventory or declared categories. Negative-space checks require the JSON format.</p></fieldset>}
    <div className="info-box"><LockKeyhole size={16} /><span>No raw logs required. Include metadata and investigation evidence only. Duplicate entity/period submissions are rejected.</span></div>
    {error && <div className="form-error" role="alert">{error}</div>}<button type="submit" className="button primary full-width" disabled={busy || !file}>{busy ? <LoaderCircle className="spin" size={17} /> : <Upload size={17} />}{busy ? 'Validating and analysing…' : 'Import & analyse submission'}</button>
  </form>
}

function FindingDetail({ finding, onReviewed }: { finding: Finding; onReviewed: () => void }) {
  const [detail, setDetail] = useState<Evidence | null>(null)
  const [error, setError] = useState('')
  const [decision, setDecision] = useState('confirmed')
  const [rationale, setRationale] = useState('')
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState(5)
  const load = useCallback(async () => {
    try { setDetail(await api<Evidence>(`/api/findings/${finding.id}`)); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load evidence') }
  }, [finding.id])
  useEffect(() => { void load() }, [load])
  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true)
    try { await api(`/api/findings/${finding.id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, rationale }) }); await load(); setRationale(''); onReviewed() }
    catch (err) { setError(err instanceof Error ? err.message : 'Review failed') }
    finally { setBusy(false) }
  }
  return <div className="finding-detail"><div className="detail-badges"><Badge tone={finding.severity}>{finding.severity}</Badge><Badge>{finding.kind}</Badge><span className="mono">{finding.rule} · v{finding.rule_version}</span></div><h2>{finding.title}</h2><p className="detail-subtitle">{finding.entity_name} <span>·</span> {month(finding.period)} <span>·</span> {finding.dimension}</p>
    <div className="rationale-card"><span className="eyebrow">WHY THIS WAS FLAGGED</span><p>{finding.rationale}</p><div><span>{finding.numerator} / {finding.denominator} {finding.kind === 'Peer anomaly' ? 'peer median' : 'affected / eligible'}</span><Badge>{finding.confidence}</Badge></div></div>
    <div className="next-step"><FolderSearch size={19} /><div><strong>Suggested examiner action</strong><p>{finding.recommendation}</p></div></div>
    {error && <div className="form-error" role="alert">{error}<button className="text-button" onClick={() => void load()}>Retry evidence</button></div>}
    {!detail && !error && <div className="loading"><LoaderCircle className="spin" size={22} />Loading source evidence…</div>}
    {detail && <><div className="detail-section-heading"><h3>Supporting evidence</h3><a href={`/api/submissions/${finding.submission_id}`} download={`source-${finding.submission_id}.json`}><Download size={13} />Complete source</a></div>
      {detail.alerts.slice(0, shown).map(a => <div className="evidence-record" key={a.id}><div><span className="mono">{a.id}</span><Badge tone={a.severity}>{a.severity}</Badge><span>{a.category}</span></div><p>{a.investigation || 'No investigation narrative supplied.'}</p><div className="evidence-facts"><span>Asset: {a.asset_id}</span><span>Closure: {a.closed_at ? `${Math.round((Date.parse(a.closed_at) - Date.parse(a.created_at)) / 60000)} min` : 'Open'}</span><span>Escalation: {a.escalated ? 'Recorded' : 'Not recorded'}</span></div></div>)}
      {shown < detail.alerts.length && <button className="load-more" onClick={() => setShown(shown + 10)}>Show more evidence ({detail.alerts.length - shown} loaded records remaining)</button>}
      {detail.total_alerts > 100 && <p className="muted">Showing a capped sample of 100 / {fmt(detail.total_alerts)} alerts. Download the complete source to inspect all records; finding evidence_ids identify the matching records.</p>}
      {detail.assets.map(a => <div className="asset-evidence" key={a.id}><Database size={18} /><div><strong>{a.name}</strong><small>{a.id} · Critical · Monitoring expected</small></div><Badge tone="medium">No submitted alerts</Badge></div>)}
      {!detail.alerts.length && !detail.assets.length && <div className="info-box"><CircleHelp size={18} /><span>{finding.rule === 'NS02' ? `Missing declared categories: ${finding.asset_ids.join(', ')}. Inspect the expected_categories field in the complete source.` : 'The rationale compares submission-level counts. Source submissions are available from the submission register.'}</span></div>}
      <details className="source-fingerprint"><summary><Fingerprint size={15} />Source fingerprint & traceability<ChevronDown size={14} /></summary><p>Submission: <code>{finding.submission_id}</code></p><p>SHA-256 (normalised source):</p><code>{finding.source_hash}</code><p>Rule engine: {finding.rule_version} · Original evidence retained locally</p></details>
      <form className="review-form" onSubmit={e => void save(e)}><div className="detail-section-heading"><h3>Record your assessment</h3><Badge tone={detail.finding.status === 'pending' ? 'medium' : 'low'}>{pretty(detail.finding.status)}</Badge></div><p>A signal is not a determination. Document your evidence and professional judgement.</p><label>Examiner decision<select value={decision} onChange={e => setDecision(e.target.value)}><option value="confirmed">Confirm supervisory concern</option><option value="needs_information">Request more information</option><option value="dismissed">Dismiss with explanation</option></select></label><label>Assessment rationale<textarea value={rationale} onChange={e => setRationale(e.target.value)} minLength={10} maxLength={2000} required placeholder="Record your reasoning, evidence reviewed and any follow-up required…" rows={3} /></label><button className="button primary" disabled={busy || rationale.trim().length < 10}>{busy ? <LoaderCircle className="spin" size={16} /> : <CheckCheck size={16} />}Save examiner decision</button></form>
      {detail.reviews.length > 0 && <div className="review-history"><h3>Review history</h3>{detail.reviews.map(r => <div key={r.id}><div><Badge>{pretty(r.decision)}</Badge><time>{new Date(r.created_at).toLocaleString('en-GB')}</time></div><p>{r.rationale}</p><small>Local examiner · Event #{r.id}</small></div>)}</div>}
    </>}
  </div>
}

function Methodology() {
  const rules = [
    ['EG01', 'Rapid closure', 'Closed high/critical alerts with time to closure < 5 minutes.', 'Investigation'],
    ['EG02', 'Missing escalation', 'Closed critical alerts without a recorded escalation.', 'Escalation'],
    ['EG03', 'Sparse investigation', 'Closed alerts with fewer than 8 words of investigation evidence.', 'Investigation'],
    ['EG04', 'Repeated narratives', 'Normalised narratives occurring in at least 5 closed alerts.', 'Operational discipline'],
    ['EG05', 'Unresolved recurrence', 'At least 8 alerts in the same asset/category group without recorded remediation.', 'Incident response'],
    ['NS01', 'Absent asset activity', 'Critical, expected-to-be-monitored assets with zero alerts in a complete submission.', 'Threat detection'],
    ['NS02', 'Missing categories', 'Declared expected categories absent from a complete submission.', 'Threat detection'],
    ['PA01', 'Low peer activity', 'Below peer median by more than max(3 × 1.4826 × MAD, 50% of median); at least 3 complete peers in the same cohort and period.', 'Security operations'],
  ]
  return <div className="methodology"><section className="method-hero"><span className="large-icon"><Fingerprint size={27} /></span><div><span className="eyebrow">EXPLAINABLE BY DESIGN</span><h2>Signals assist. Examiners decide.</h2><p>SAT-SA reviews periodic operational evidence. It is not a SIEM, a live monitoring system, or an automated assessment of compliance.</p></div></section><section className="card"><div className="card-heading"><div><h2>Supervisory rule catalogue</h2><p>Deterministic analytics · Version 1.0.0 · No AI model or external service</p></div><Badge tone="low">8 transparent rules</Badge></div><div className="table-scroll"><table><thead><tr><th>RULE</th><th>SIGNAL</th><th>TRIGGER</th><th>DIMENSION</th></tr></thead><tbody>{rules.map(([id, name, trigger, dimension]) => <tr key={id}><td className="mono">{id}</td><td><strong>{name}</strong></td><td className="rule-trigger">{trigger}</td><td>{dimension}</td></tr>)}</tbody></table></div></section><div className="method-grid">
    <section className="card"><h2>How attention is scored</h2><p>Score = 80 × weighted affected-alert fraction + 20 × largest negative-space fraction, rounded and capped at 100.</p><p>Alert weights: critical 4, high 3, medium 2, low 1. Each alert is counted once across execution-gap rules. Peer anomalies are review signals and do not change the score.</p><div className="score-legend"><Badge tone="low">0–19 Routine</Badge><Badge tone="medium">20–44 Moderate</Badge><Badge tone="critical">45–100 High attention</Badge></div><p>Empty or incomplete submissions are unscored. Missing inventory prevents coverage checks, so a low score must not be interpreted as good coverage. Scores are prioritisation heuristics, not risk probabilities.</p></section>
    <section className="card"><h2>Evidence and limitations</h2><p>Each signal retains the source submission fingerprint, record identifiers, eligible denominator and rule version. Examiner decisions append to a local review history.</p><p>Missing alerts do not prove missing telemetry. Approved automation, legitimate templates, external case records, differences in asset scale and submission quality require examiner context.</p><p>This single-examiner prototype has no identity provider or role enforcement. A controlled deployment needs authentication, access controls, encryption and protected audit backups. Never expose real CSE data through a development server.</p></section>
    <section className="card"><h2>Validate against expert review</h2><p>Use independently labelled submissions from multiple sectors and periods. Two examiners review stratified samples, adjudicate disagreements, then compare the tool on an untouched holdout set.</p><p>Measure precision and recall per rule, negative-space findings supported by inventory evidence, recall at a fixed review budget, examiner time saved and inter-rater agreement. Compare with random sampling and severity-only prioritisation.</p><p>Synthetic data verifies functionality only. Expert-level effectiveness has not yet been established.</p></section>
    <section className="card"><h2>Deploy inside your environment</h2><p>React frontend, FastAPI service, SQLite storage. Serve compiled assets and the API together locally. No CDN, cloud service, external model, telemetry collection or runtime network dependency.</p><p>Starting pilot estimate: 4 CPU cores, 8 GB RAM and encrypted SSD storage. Use an offline wheel bundle and compiled frontend. Benchmark on representative submissions before sizing a production deployment.</p><p>The prototype accepts up to 50,000 alerts / 20 MB per file. Large-scale columnar processing, organisation-wide governance mapping and validated anomaly models are future extensions.</p></section>
  </div></div>
}
