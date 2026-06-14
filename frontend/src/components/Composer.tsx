import {
  ArrowUp,
  Command,
  Paperclip,
  ScanSearch,
  Shield,
  Square,
  Timer,
  Zap,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

type SlashCommand = {
  command: string;
  label: string;
  description: string;
  icon: typeof ScanSearch;
};

const SLASH_COMMANDS: SlashCommand[] = [
  { command: "/scan", label: "Scan codebase", description: "Scan for security issues and code quality", icon: ScanSearch },
  { command: "/schedule", label: "Schedule task", description: "Create a recurring automated task", icon: Timer },
  { command: "/audit", label: "Security audit", description: "Run a comprehensive security audit", icon: Shield },
  { command: "/quick", label: "Quick fix", description: "Apply a quick automated fix", icon: Zap },
];

type Props = {
  disabled?: boolean;
  running?: boolean;
  onSubmit: (value: string) => Promise<void> | void;
};

export function Composer({ disabled, running, onSubmit }: Props) {
  const [value, setValue] = useState("");
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [selectedSlash, setSelectedSlash] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 6 * 24; // ~6 lines at 24px line-height
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  // Slash command detection
  useEffect(() => {
    if (value.startsWith("/")) {
      const filter = value.slice(1).toLowerCase();
      setSlashFilter(filter);
      setSlashOpen(true);
      setSelectedSlash(0);
    } else {
      setSlashOpen(false);
    }
  }, [value]);

  const filteredCommands = SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.command.slice(1).includes(slashFilter) ||
      cmd.label.toLowerCase().includes(slashFilter)
  );

  function selectSlashCommand(cmd: SlashCommand) {
    // Replace the slash prefix with the command's full prompt
    setValue(cmd.label + ": ");
    setSlashOpen(false);
    textareaRef.current?.focus();
  }

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const prompt = value.trim();
    if (!prompt || disabled || running) return;
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    await onSubmit(prompt);
  }

  function handleKeyDown(e: KeyboardEvent) {
    // Slash menu navigation
    if (slashOpen && filteredCommands.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSlash((prev) => (prev + 1) % filteredCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSlash((prev) =>
          prev === 0 ? filteredCommands.length - 1 : prev - 1
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectSlashCommand(filteredCommands[selectedSlash]);
        return;
      }
      if (e.key === "Escape") {
        setSlashOpen(false);
        return;
      }
    }

    // Enter to submit, Shift+Enter for newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <div className="composer-wrapper">
      {/* Slash command menu */}
      {slashOpen && filteredCommands.length > 0 && (
        <div className="slash-menu">
          <div className="slash-menu-header">
            <Command size={12} />
            <span>Commands</span>
          </div>
          {filteredCommands.map((cmd, i) => {
            const Icon = cmd.icon;
            return (
              <button
                key={cmd.command}
                className={`slash-menu-item ${i === selectedSlash ? "slash-menu-item--active" : ""}`}
                onClick={() => selectSlashCommand(cmd)}
                onMouseEnter={() => setSelectedSlash(i)}
              >
                <Icon size={14} />
                <div className="slash-menu-item-content">
                  <strong>{cmd.command}</strong>
                  <span>{cmd.description}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <form className="composer" onSubmit={handleSubmit}>
        <button className="icon-button" type="button" title="Attach context">
          <Paperclip size={17} />
        </button>
        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Agent Mesh to inspect, fix, schedule, or explain… Type / for commands"
          disabled={disabled}
        />
        <div className="composer-controls">
          <span className="composer-hint">
            {value.length > 0 ? (
              <>⏎ Send · ⇧⏎ Newline</>
            ) : (
              <>CommitGuard</>
            )}
          </span>
          <button
            className="send-button"
            type="submit"
            disabled={disabled || running || !value.trim()}
          >
            {running ? <Square size={15} /> : <ArrowUp size={16} />}
          </button>
        </div>
      </form>
    </div>
  );
}
