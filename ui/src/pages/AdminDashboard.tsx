import { useEffect, useState } from 'react';
import { RefreshCw, Database, Clock, FileCheck, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { GraphViewer } from '../components/GraphViewer';

interface DashboardMetrics {
  syncLagMinutes: number;
  parseSuccessRate: number;
  f1Score: number;
  nodeCount: number;
  edgeCount: number;
  timestamp: string;
}

export function AdminDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchMetrics() {
    try {
      setRefreshing(true);
      const res = await fetch('/api/admin/metrics');
      if (!res.ok) {
        throw new Error(`Failed to load admin metrics: ${res.statusText}`);
      }
      const data = await res.json();
      setMetrics(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch system metrics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void fetchMetrics();
  }, []);

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <PageHeader
          eyebrow="System Administration"
          title="Operator Dashboard"
          description="Real-time knowledge ingestion performance, sync lag, retrieval calibration, and node topologies."
        />
        <button
          onClick={() => void fetchMetrics()}
          disabled={refreshing}
          className="secondary-button"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            fontSize: 13,
            borderRadius: 12,
          }}
        >
          <RefreshCw size={15} className={refreshing ? 'spin-animation' : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {loading && <div className="empty-card">Loading system metrics...</div>}
      
      {error && (
        <div className="empty-card" style={{ color: 'var(--brand-coral)' }}>
          {error}
        </div>
      )}

      {metrics && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Card grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
            }}
          >
            {/* Sync Lag */}
            <div
              style={{
                border: '1px solid var(--hairline)',
                borderRadius: 16,
                padding: '20px 22px',
                background: 'var(--canvas)',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <div style={{ padding: 10, borderRadius: 12, background: 'rgba(245, 158, 11, 0.1)' }}>
                <Clock size={24} color="#f59e0b" />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Sync Lag
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', margin: '4px 0 2px' }}>
                  {metrics.syncLagMinutes === 0 ? 'Healthy' : `${metrics.syncLagMinutes}m`}
                </div>
                <div style={{ fontSize: 11, color: metrics.syncLagMinutes < 15 ? 'var(--success)' : 'var(--brand-coral)' }}>
                  {metrics.syncLagMinutes < 15 ? 'Within normal limits' : 'Sync is lagging'}
                </div>
              </div>
            </div>

            {/* Parse Success Rate */}
            <div
              style={{
                border: '1px solid var(--hairline)',
                borderRadius: 16,
                padding: '20px 22px',
                background: 'var(--canvas)',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <div style={{ padding: 10, borderRadius: 12, background: 'rgba(20, 184, 166, 0.1)' }}>
                <FileCheck size={24} color="#14b8a6" />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Parse Success
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', margin: '4px 0 2px' }}>
                  {metrics.parseSuccessRate}%
                </div>
                <div style={{ fontSize: 11, color: 'var(--success)' }}>
                  Documents parsed successfully
                </div>
              </div>
            </div>

            {/* F1 Score */}
            <div
              style={{
                border: '1px solid var(--hairline)',
                borderRadius: 16,
                padding: '20px 22px',
                background: 'var(--canvas)',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <div style={{ padding: 10, borderRadius: 12, background: 'rgba(168, 85, 247, 0.1)' }}>
                <CheckCircle2 size={24} color="#a855f7" />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  F1 Extraction
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', margin: '4px 0 2px' }}>
                  {(metrics.f1Score * 100).toFixed(1)}%
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted-soft)' }}>
                  Fact extraction accuracy
                </div>
              </div>
            </div>

            {/* Graph Size */}
            <div
              style={{
                border: '1px solid var(--hairline)',
                borderRadius: 16,
                padding: '20px 22px',
                background: 'var(--canvas)',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <div style={{ padding: 10, borderRadius: 12, background: 'rgba(59, 130, 246, 0.1)' }}>
                <Database size={24} color="#3b82f6" />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Graph Sizing
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', margin: '4px 0 2px' }}>
                  {metrics.nodeCount} / {metrics.edgeCount}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted-soft)' }}>
                  Nodes / Relationships
                </div>
              </div>
            </div>
          </div>

          {/* Graph Visualizer Section */}
          <div
            style={{
              border: '1px solid var(--hairline)',
              borderRadius: 16,
              padding: '20px 22px',
              background: 'var(--canvas)',
            }}
          >
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, letterSpacing: '-0.2px' }}>
                Knowledge Graph Topology
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: 14 }}>
                Visual network of permission-aware entities and bitemporal facts extracted from company data sources.
              </p>
            </div>
            <GraphViewer />
          </div>
        </div>
      )}
    </div>
  );
}
