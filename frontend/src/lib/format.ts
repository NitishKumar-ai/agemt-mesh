import type { MeshEvent } from "./types";

export function eventTitle(event: MeshEvent) {
  const words = event.eventType.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function eventBody(event: MeshEvent) {
  const payload = event.payload;
  if (typeof payload.status === "string") return payload.status;
  if (typeof payload.result === "string") return payload.result;
  if (typeof payload.error === "string") return payload.error;
  if (typeof payload.reason === "string") return payload.reason;
  if (typeof payload.context === "string") return payload.context;
  return JSON.stringify(payload, null, 2);
}

export function statusFromEvent(event: MeshEvent) {
  const raw = String(event.payload.status ?? event.eventType).toLowerCase();
  if (raw.includes("blocked") || raw.includes("approval")) return "blocked";
  if (raw.includes("execut")) return "executing";
  if (raw.includes("plan")) return "planning";
  if (raw.includes("fail") || raw.includes("error")) return "failed";
  if (raw.includes("success") || raw.includes("complete")) return "success";
  return "idle";
}

export function shortTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}
