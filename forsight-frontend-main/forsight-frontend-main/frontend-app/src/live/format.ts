import type { RiskCategory, Severity, TaskPriority, TaskStatus } from "../api";
import { timeAgo } from "../auth/session";

/* Formatting and style tokens shared by the API-backed views. */

export const SEVERITY_STYLE: Record<Severity, string> = {
  CRITICAL: "bg-amber-400 text-amber-950 ring-amber-500",
  HIGH: "bg-amber-50 text-amber-900 ring-amber-300",
  MEDIUM: "bg-slate-100 text-slate-700 ring-slate-200",
  LOW: "bg-blue-50 text-indigo-700 ring-blue-200",
};

export const STATUS_STYLE: Record<TaskStatus, string> = {
  TODO: "bg-slate-100 text-slate-700 ring-slate-200",
  IN_PROGRESS: "bg-blue-50 text-indigo-700 ring-blue-200",
  BLOCKED: "bg-amber-400 text-amber-950 ring-amber-500",
  IN_REVIEW: "bg-blue-50 text-indigo-700 ring-blue-200",
  DONE: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  CANCELLED: "bg-slate-100 text-slate-400 ring-slate-200",
};

export const PRIORITY_STYLE: Record<TaskPriority, string> = {
  CRITICAL: "text-amber-800",
  HIGH: "text-amber-700",
  MEDIUM: "text-slate-600",
  LOW: "text-slate-400",
};

export const CATEGORY_LABEL: Record<RiskCategory, string> = {
  OVERDUE_TASK: "Overdue task",
  APPROACHING_DEADLINE: "Approaching deadline",
  STALLED_TASK: "Stalled task",
  BLOCKED_DEPENDENCY: "Blocked dependency",
  PROJECT_DEADLINE: "Project deadline",
  WORKLOAD_IMBALANCE: "Workload imbalance",
};

/** `IN_PROGRESS` → `In progress` */
export function humanize(value: string): string {
  const spaced = value.replace(/_/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : timeAgo(t);
}

/** Whole days from today to an ISO date (negative when past). */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
  const today = new Date().setHours(0, 0, 0, 0);
  return Number.isNaN(target) ? null : Math.round((target - today) / 86_400_000);
}

export const OPEN_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "IN_REVIEW"];

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300";
export const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
export const selectClass =
  "rounded-md border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";
