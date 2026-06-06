import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import type { AppSettings } from "../lib/types";

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13 }}>
      {ok
        ? <CheckCircle2 size={15} color="var(--success)" />
        : <XCircle size={15} color="var(--error)" />}
      <span style={{ color: ok ? "var(--success)" : "var(--error)", fontWeight: 600 }}>
        {label} {ok ? "configured" : "not configured"}
      </span>
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>{title}</h2>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>{description}</p>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "18px 20px",
        background: "var(--panel)",
        marginBottom: 20,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

function ModelField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <code
        style={{
          display: "block",
          padding: "8px 12px",
          background: "var(--panel-soft)",
          borderRadius: 8,
          fontSize: 13,
          color: "var(--primary)",
          border: "1px solid var(--border)",
        }}
      >
        {value}
      </code>
      <p style={{ fontSize: 11, color: "var(--subtle)", marginTop: 4 }}>
        Override via env var <code>MODEL_{label.replace(" ", "_").toUpperCase()}</code>
      </p>
    </div>
  );
}

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings()
      .then(setSettings)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Operations"
        title="Settings"
        description="Runtime configuration status for models, integrations, and observability."
      />

      {loading && <div className="empty-card">Loading settings…</div>}
      {error && <div className="empty-card" style={{ color: "var(--error)" }}>{error}</div>}

      {settings && (
        <>
          {/* Models */}
          <SectionHeader
            title="Model routing"
            description="Which LLM handles planning vs. execution. Change via environment variables and restart the server."
          />
          <Card>
            <ModelField label="Plan" value={settings.model_plan} />
            <ModelField label="Execute" value={settings.model_execute} />
          </Card>

          {/* Integrations */}
          <SectionHeader
            title="Integrations"
            description="Service credentials are read from environment variables at startup."
          />
          <Card>
            <StatusBadge ok={settings.github_configured} label="GitHub OAuth" />
            <StatusBadge ok={settings.e2b_configured} label="E2B sandbox (CommitGuard)" />
            {settings.commitguard_webhook && (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                CommitGuard webhook:{" "}
                <code style={{ color: "var(--text)" }}>{settings.commitguard_webhook}</code>
              </div>
            )}
          </Card>

          {/* Observability */}
          <SectionHeader
            title="Observability"
            description="LLM tracing and prompt analytics. Set the relevant API keys to enable."
          />
          <Card>
            <StatusBadge ok={settings.traceloop_configured} label="Traceloop (OpenTelemetry)" />
            <StatusBadge ok={settings.langfuse_configured} label="Langfuse" />
          </Card>

          {/* Env hint */}
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              background: "var(--primary-soft)",
              color: "var(--primary)",
              fontSize: 13,
              border: "1px solid var(--primary)",
            }}
          >
            <strong>To change settings:</strong> edit your <code>.env</code> file (see{" "}
            <code>.env.example</code>) and restart the API server. All values are read at
            startup and cannot be changed at runtime.
          </div>
        </>
      )}
    </div>
  );
}
