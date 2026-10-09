import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Card, Icon } from "../ui";
import type { Severity, TaskStatus } from "../api";
import { SEVERITY_STYLE, STATUS_STYLE, humanize } from "./format";

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${SEVERITY_STYLE[severity]}`}>
      {(severity === "CRITICAL" || severity === "HIGH") && <Icon name="alert" className="h-3 w-3" />}
      {humanize(severity)}
    </span>
  );
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_STYLE[status]}`}>{humanize(status)}</span>
  );
}

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
        tone === "warn" ? "bg-amber-50 text-amber-900 ring-amber-300" : "bg-slate-100 text-slate-600 ring-slate-200"
      }`}
    >
      {children}
    </span>
  );
}

export function Notice({ children, tone = "error", onDismiss }: { children: ReactNode; tone?: "error" | "info"; onDismiss?: () => void }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] ${
        tone === "error" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-slate-200 bg-slate-50 text-slate-600"
      }`}
    >
      <Icon name="alert" className={`mt-px h-4 w-4 shrink-0 ${tone === "error" ? "text-amber-500" : "text-slate-400"}`} />
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 text-slate-400 hover:text-slate-900">
          <Icon name="close" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-10 text-sm text-slate-500" role="status">
      <Icon name="spinner" />
      {label}
    </div>
  );
}

export function Empty({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-[13px] text-slate-500">{hint}</p>}
      {children && <div className="mt-4 flex justify-center">{children}</div>}
    </div>
  );
}

export function PageTitle({ title, subtitle, aside }: { title: string; subtitle?: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {aside}
    </div>
  );
}

export function NoProject() {
  return (
    <Card>
      <Empty title="No project selected" hint="Pick a project from the switcher in the top bar, or create one there." />
    </Card>
  );
}

/* Modal / side-drawer shell */

export function Overlay({ label, onClose, side = false, children }: { label: string; onClose: () => void; side?: boolean; children: ReactNode }) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`fixed inset-0 z-[60] flex ${side ? "justify-end" : "items-start justify-center overflow-y-auto px-4 py-10 sm:items-center"}`}>
      <div className="fixed inset-0 bg-slate-900/30" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={
          side
            ? "relative flex h-full w-full max-w-[540px] flex-col overflow-y-auto bg-white shadow-2xl shadow-slate-900/10"
            : "relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20"
        }
      >
        {children}
      </div>
    </div>
  );
}

export function OverlayHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
      <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
      <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900">
        <Icon name="close" />
      </button>
    </div>
  );
}

