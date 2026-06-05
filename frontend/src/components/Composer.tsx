import { ArrowUp, Paperclip, Square } from "lucide-react";
import { FormEvent, useState } from "react";

type Props = {
  disabled?: boolean;
  running?: boolean;
  onSubmit: (value: string) => Promise<void> | void;
};

export function Composer({ disabled, running, onSubmit }: Props) {
  const [value, setValue] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const prompt = value.trim();
    if (!prompt || disabled || running) return;
    setValue("");
    await onSubmit(prompt);
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <button className="icon-button" type="button" title="Attach context">
        <Paperclip size={17} />
      </button>
      <textarea
        value={value}
        rows={1}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Ask Agent Mesh to inspect, fix, schedule, or explain..."
        disabled={disabled}
      />
      <div className="composer-controls">
        <span>CommitGuard</span>
        <button className="send-button" type="submit" disabled={disabled || running || !value.trim()}>
          {running ? <Square size={15} /> : <ArrowUp size={16} />}
        </button>
      </div>
    </form>
  );
}
