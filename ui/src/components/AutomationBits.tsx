import type { ReactNode } from 'react';

/**
 * Small shared presentation primitives for the Automations surfaces
 * (Workflows / Agents / Schedules). Self-contained, theme-token driven,
 * no external data dependencies.
 */

export function automationStatusColor(status: string | undefined | null): string {
  const s = (status ?? '').toLowerCase();
  if (['completed', 'success', 'succeeded', 'healthy', 'enabled', 'active'].includes(s))
    return 'var(--success)';
  if (['failed', 'error', 'timed_out', 'timeout'].includes(s)) return 'var(--error)';
  if (['running', 'executing', 'in_progress', 'live'].includes(s)) return 'var(--brand-teal)';
  if (['paused', 'suspended', 'queued', 'pending', 'idle', 'waiting'].includes(s))
    return 'var(--brand-ochre)';
  return 'var(--muted)';
}

export function StatusPill({ status }: { status: string | undefined | null }) {
  if (!status) return null;
  const color = automationStatusColor(status);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.2px',
        textTransform: 'capitalize',
        color,
        background: 'color-mix(in srgb, ' + color + ' 14%, transparent)',
        border: '1px solid color-mix(in srgb, ' + color + ' 32%, transparent)',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: color,
          boxShadow: '0 0 0 3px color-mix(in srgb, ' + color + ' 18%, transparent)',
          flexShrink: 0,
        }}
      />
      {String(status).replace(/_/g, ' ')}
    </span>
  );
}

export function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: ReactNode;
  accent?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.6px',
          textTransform: 'uppercase',
          color: 'var(--muted)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: '-0.4px',
          color: accent ?? 'var(--ink)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** Tiny inline sparkline rendered from a list of 0..1 values. */
export function Sparkline({
  points,
  color = 'var(--brand-teal)',
  width = 96,
  height = 28,
}: {
  points: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = height - ((p - min) / span) * (height - 4) - 2;
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const gradId = `spark-${Math.round(points.reduce((a, b) => a + b, 0) * 1000)}`;
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r={2.4} fill={color} />
    </svg>
  );
}

export function relTime(input: string | number | undefined | null): string {
  if (input === undefined || input === null || input === '') return '—';
  const date = new Date(input);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return '—';
  const diff = Date.now() - ms;
  if (diff < 0) {
    const abs = Math.abs(diff);
    if (abs < 60_000) return 'in <1m';
    if (abs < 3_600_000) return `in ${Math.floor(abs / 60_000)}m`;
    if (abs < 86_400_000) return `in ${Math.floor(abs / 3_600_000)}h`;
    return `in ${Math.floor(abs / 86_400_000)}d`;
  }
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
