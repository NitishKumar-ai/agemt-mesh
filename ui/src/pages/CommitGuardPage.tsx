import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Github,
  RefreshCw,
  Shield,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { api } from '../lib/api';

type ScanStatus = 'idle' | 'queued' | 'running' | 'complete' | 'failed';

type ScanProgress = {
  step: string;
  progress_pct: number;
  current?: number;
  total?: number;
};

type Finding = {
  id: string;
  file: string;
  line: number;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  verdict: 'CONFIRMED' | 'UNVERIFIABLE' | 'FALSE_POSITIVE';
  poc_summary: string;
  cvss?: string;
  cwe?: string;
  fix_suggestion?: string;
  github_issue_url?: string;
  issue_filed: boolean;
};

const STEPS = ['queued', 'clone', 'scan', 'verify', 'file', 'done'];

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    HIGH: 'badge badge--error',
    MEDIUM: 'badge badge--warning',
    LOW: 'badge badge--info',
  };
  return <span className={colors[severity] ?? 'badge'}>{severity}</span>;
}

function VerdictBadge({ verdict }: { verdict: string }) {
  if (verdict === 'CONFIRMED')
    return (
      <span className="badge badge--success">
        <CheckCircle2 size={12} />
        CONFIRMED
      </span>
    );
  if (verdict === 'FALSE_POSITIVE')
    return (
      <span className="badge badge--muted">
        <XCircle size={12} />
        FALSE POSITIVE
      </span>
    );
  return <span className="badge badge--muted">UNVERIFIABLE</span>;
}

export function CommitGuardPage() {
  const [repoUrl, setRepoUrl] = useState('');
  const [maxFindings, setMaxFindings] = useState(5);
  const [jobId, setJobId] = useState<string>();
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [progress, setProgress] = useState<ScanProgress>({ step: 'queued', progress_pct: 0 });
  const [findings, setFindings] = useState<Finding[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState('');
  const [expandedFix, setExpandedFix] = useState<string>();
  const eventSourceRef = useRef<EventSource | null>(null);

  // Connect to SSE stream once we have a job_id
  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/commitguard/stream/${jobId}`);
    eventSourceRef.current = es;

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        const payload = data?.payload ?? {};
        if (data.event_type === 'scan_progress') {
          setScanStatus('running');
          setProgress({
            step: payload.step,
            progress_pct: payload.progress_pct,
            current: payload.current,
            total: payload.total,
          });
        } else if (data.event_type === 'scan_complete') {
          setScanStatus('complete');
          setProgress({ step: 'done', progress_pct: 100 });
          void loadFindings(jobId);
          es.close();
        }
      } catch {
        /* ignore parse errors */
      }
    };

    es.onerror = () => setScanStatus((s) => (s === 'running' ? 'running' : s));

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [jobId]);

  async function loadFindings(id: string) {
    try {
      const res = await fetch(`/api/commitguard/findings/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setFindings(data.findings ?? []);
      setTruncated(data.findings_truncated ?? false);
    } catch {
      /* ignore */
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    if (!repoUrl.startsWith('https://github.com/')) {
      setError('URL must start with https://github.com/');
      return;
    }
    setError('');
    setFindings([]);
    setScanStatus('queued');
    setProgress({ step: 'queued', progress_pct: 0 });

    try {
      const res = await api.runCommitGuardScan(repoUrl.trim(), maxFindings);
      setJobId(res.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start scan');
      setScanStatus('idle');
    }
  }

  const stepIndex = STEPS.indexOf(progress.step);
  const confirmedCount = findings.filter((f) => f.verdict === 'CONFIRMED').length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Security scanner"
        title="CommitGuard"
        description="Semgrep static analysis + E2B sandbox PoC verification on any GitHub repo."
      />

      <form className="scan-form" onSubmit={submit}>
        <div className="scan-input-row">
          <Github size={16} />
          <input
            className="scan-url-input"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            disabled={scanStatus === 'queued' || scanStatus === 'running'}
          />
          <label className="scan-max-label">
            Max findings
            <select
              value={maxFindings}
              onChange={(e) => setMaxFindings(Number(e.target.value))}
              disabled={scanStatus === 'queued' || scanStatus === 'running'}
            >
              {[1, 2, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary-button"
            type="submit"
            disabled={!repoUrl.trim() || scanStatus === 'queued' || scanStatus === 'running'}
          >
            <Shield size={15} />
            Scan
          </button>
        </div>
        {error && (
          <div className="scan-error">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}
      </form>

      {scanStatus !== 'idle' && (
        <section className="scan-progress-section">
          <div className="progress-strip">
            {STEPS.slice(1).map((step, i) => (
              <span
                key={step}
                className={
                  i < stepIndex - 1
                    ? 'progress-strip--done'
                    : i === stepIndex - 1
                      ? 'progress-strip--active'
                      : ''
                }
              >
                <i />
                {step}
              </span>
            ))}
          </div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${progress.progress_pct}%` }} />
          </div>
          {progress.step === 'verify' && progress.current != null && (
            <p className="progress-detail">
              Verifying finding {progress.current} of {progress.total}…
            </p>
          )}
          {scanStatus === 'complete' && (
            <p className="progress-detail">
              {confirmedCount > 0 ? (
                <>
                  <CheckCircle2 size={14} /> {confirmedCount} CONFIRMED finding
                  {confirmedCount > 1 ? 's' : ''} — GitHub issues filed
                </>
              ) : (
                'Scan complete — no confirmed exploitable findings'
              )}
              {truncated && ' · some findings were truncated (raise max_findings to see more)'}
            </p>
          )}
        </section>
      )}

      {findings.length > 0 && (
        <section className="findings-section">
          <h2>Findings</h2>
          {findings.map((f) => (
            <article key={f.id} className={`finding-card finding-card--${f.verdict.toLowerCase()}`}>
              <div className="finding-header">
                <SeverityBadge severity={f.severity} />
                <VerdictBadge verdict={f.verdict} />
                <code>
                  {f.file}:{f.line}
                </code>
                {f.cvss && (
                  <span className="finding-cvss" title="AI-estimated, not validated">
                    {f.cvss}
                  </span>
                )}
                {f.cwe && <span className="finding-cwe">{f.cwe}</span>}
              </div>
              <p className="finding-poc">{f.poc_summary}</p>
              {f.github_issue_url && (
                <a
                  className="finding-issue-link"
                  href={f.github_issue_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={13} />
                  View GitHub issue
                </a>
              )}
              {f.verdict === 'CONFIRMED' && !f.issue_filed && (
                <span className="badge badge--warning">
                  <AlertTriangle size={12} />
                  Issue filing failed
                </span>
              )}
              {f.fix_suggestion && (
                <div className="finding-fix">
                  <button
                    type="button"
                    className="bare-toggle"
                    onClick={() => setExpandedFix(expandedFix === f.id ? undefined : f.id)}
                  >
                    <RefreshCw size={13} />
                    {expandedFix === f.id ? 'Hide' : 'Show'} suggested fix
                  </button>
                  {expandedFix === f.id && <pre className="fix-diff">{f.fix_suggestion}</pre>}
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {scanStatus === 'complete' && findings.length === 0 && (
        <div className="empty-card">
          <CheckCircle2 size={20} />
          No high/critical findings confirmed in this repo.
        </div>
      )}
    </div>
  );
}
