import { Loader } from 'lucide-react';
import { useEffect, useState } from 'react';

type Props = {
  label?: string;
  startTime?: Date;
};

export function ThinkingIndicator({ label = 'Thinking', startTime }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  function formatElapsed(s: number) {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  return (
    <div className="thinking-indicator">
      <div className="thinking-dots">
        <span />
        <span />
        <span />
      </div>
      <span className="thinking-label">
        <Loader size={13} className="thinking-spinner" />
        {label}
        {startTime && elapsed > 0 && (
          <span className="thinking-elapsed">{formatElapsed(elapsed)}</span>
        )}
      </span>
    </div>
  );
}
