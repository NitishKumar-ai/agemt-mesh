import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  FileCode2,
  ShieldAlert,
  Terminal,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { useState } from "react";
import { shortTime } from "../lib/format";
import { StatusBadge } from "./StatusBadge";
import type { SessionMessage } from "../lib/types";

type Props = {
  message: SessionMessage;
  onApprove?: (approved: boolean) => void;
};

export function MessageCard({ message, onApprove }: Props) {
  const [collapsed, setCollapsed] = useState(message.metadata?.collapsed ?? true);

  // Determine avatar and styling based on role
  const avatarIcon = {
    user: <UserRound size={16} />,
    agent: <Terminal size={16} />,
    system: <AlertTriangle size={14} />,
    tool: <Wrench size={14} />,
    approval: <ShieldAlert size={16} />,
  }[message.role];

  const roleLabel = {
    user: "You",
    agent: "Agent Mesh",
    system: "System",
    tool: message.metadata?.toolName || "Tool",
    approval: "Approval Required",
  }[message.role];

  // Render code blocks if present
  function renderCodeBlocks() {
    if (!message.metadata?.codeBlocks?.length) return null;
    return message.metadata.codeBlocks.map((block, i) => (
      <div key={i} className="msg-code-block">
        <div className="msg-code-header">
          <Code2 size={12} />
          <span>{block.language}</span>
        </div>
        <pre className="msg-code-content">{block.code}</pre>
      </div>
    ));
  }

  // Render file references
  function renderFiles() {
    if (!message.metadata?.files?.length) return null;
    return (
      <div className="msg-files">
        {message.metadata.files.map((f, i) => (
          <span key={i} className="msg-file-tag">
            <FileCode2 size={11} />
            {f.split("/").pop()}
          </span>
        ))}
      </div>
    );
  }

  // Tool call card
  if (message.role === "tool") {
    return (
      <article className="message message--tool">
        <div className="message-avatar message-avatar--tool">{avatarIcon}</div>
        <div className="message-card message-card--tool">
          <button
            className="tool-call-toggle"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <Wrench size={13} />
            <strong>{message.title || message.metadata?.toolName || "Tool call"}</strong>
            {message.status && <StatusBadge status={message.status} />}
          </button>
          {!collapsed && (
            <div className="tool-call-output">
              <pre>{message.metadata?.toolOutput || message.body}</pre>
            </div>
          )}
        </div>
      </article>
    );
  }

  // Approval card
  if (message.role === "approval") {
    return (
      <article className="message message--approval">
        <div className="message-avatar message-avatar--approval">{avatarIcon}</div>
        <div className="message-card message-card--approval">
          <div className="message-meta">
            <strong>{roleLabel}</strong>
            <span>{shortTime(message.time)}</span>
            {message.status && <StatusBadge status={message.status} />}
          </div>
          <p>{message.body}</p>
          {renderCodeBlocks()}
          {renderFiles()}
          {onApprove && (
            <div className="approval-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => onApprove(false)}
              >
                <X size={14} /> Reject
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => onApprove(true)}
              >
                <Check size={14} /> Approve
              </button>
            </div>
          )}
        </div>
      </article>
    );
  }

  // System message
  if (message.role === "system") {
    return (
      <article className="message message--system">
        <div className="system-message-content">
          {avatarIcon}
          <span>{message.body}</span>
          <span className="system-time">{shortTime(message.time)}</span>
        </div>
      </article>
    );
  }

  // User / Agent message
  return (
    <article className={`message message--${message.role}`}>
      <div className={`message-avatar message-avatar--${message.role}`}>{avatarIcon}</div>
      <div className={`message-card message-card--${message.role}`}>
        <div className="message-meta">
          <strong>{message.title ?? roleLabel}</strong>
          <span>{shortTime(message.time)}</span>
          {message.status && <StatusBadge status={message.status} />}
        </div>
        <div className="message-body">
          {message.body.split("\n").map((line, i) => {
            // Basic inline code rendering
            if (line.startsWith("```")) return null;
            return <p key={i}>{line || "\u00A0"}</p>;
          })}
        </div>
        {renderCodeBlocks()}
        {renderFiles()}
      </div>
    </article>
  );
}
