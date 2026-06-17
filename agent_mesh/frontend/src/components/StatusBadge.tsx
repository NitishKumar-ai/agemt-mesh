type Props = {
  status?: "idle" | "planning" | "executing" | "blocked" | "success" | "failed" | string;
};

export function StatusBadge({ status = "idle" }: Props) {
  const normalized = status.toLowerCase();
  return <span className={`status-badge status-badge--${normalized}`}>{status}</span>;
}
