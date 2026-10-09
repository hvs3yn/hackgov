import type { ReactNode } from "react";

/* Shared design primitives for Foresight: tokens, icons, cards, toggle. */

// Tailwind v4 `shadow-xs`, written out so it also works on v3.
export const SHADOW_XS = "shadow-[0_1px_2px_0_rgb(15_23_42/0.05)]";
export const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500";

export const BRAND = "Foresight";

export type IconName =
  | "spark"
  | "alert"
  | "check"
  | "arrow"
  | "chevron"
  | "close"
  | "send"
  | "spinner"
  | "undo"
  | "dashboard"
  | "cascade"
  | "sliders"
  | "inbox"
  | "users"
  | "settings"
  | "menu"
  | "collapse"
  | "user"
  | "logout"
  | "back"
  | "eye"
  | "eye-off"
  | "clock";

export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      {name === "spark" && <path d="M10 2.5 11.6 8.4 17.5 10l-5.9 1.6L10 17.5l-1.6-5.9L2.5 10l5.9-1.6L10 2.5Z" {...p} />}
      {name === "check" && <path d="m5 10.5 3.2 3L15 6.5" {...p} />}
      {name === "arrow" && <path d="M4 10h11m0 0-4-4m4 4-4 4" {...p} />}
      {name === "back" && <path d="M16 10H5m0 0 4-4m-4 4 4 4" {...p} />}
      {name === "chevron" && <path d="m6 8 4 4 4-4" {...p} />}
      {name === "close" && <path d="m5.5 5.5 9 9m0-9-9 9" {...p} />}
      {name === "send" && <path d="M10 16V4m0 0-5 5m5-5 5 5" {...p} strokeWidth={2} />}
      {name === "undo" && <path d="M7 6 4 9l3 3M4 9h8a4 4 0 0 1 0 8h-2" {...p} />}
      {name === "spinner" && <path d="M10 3a7 7 0 1 0 7 7" {...p} className="origin-center animate-spin" />}
      {name === "dashboard" && <path d="M3.5 3.5h5v6h-5zM11.5 3.5h5v3.5h-5zM11.5 10h5v6.5h-5zM3.5 12.5h5v4h-5z" {...p} />}
      {name === "cascade" && <path d="M5 3.5v3m0 0a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5Zm0 3.5v2.5a2.5 2.5 0 0 0 2.5 2.5h5m0 0a1.75 1.75 0 1 0 3.5 0 1.75 1.75 0 0 0-3.5 0Zm1.75 1.75v3" {...p} />}
      {name === "sliders" && <path d="M4 5.5h7m3 0h2M4 10h2m3 0h7M4 14.5h8m3 0h1M12.5 4v3M7.5 8.5v3M13.5 13v3" {...p} />}
      {name === "inbox" && <path d="M3.5 11 5.6 4.6A1.5 1.5 0 0 1 7 3.5h6a1.5 1.5 0 0 1 1.4 1.1L16.5 11m-13 0v4A1.5 1.5 0 0 0 5 16.5h10a1.5 1.5 0 0 0 1.5-1.5v-4m-13 0h3.5l1 2h4l1-2h3.5" {...p} />}
      {name === "users" && <path d="M7.5 9a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM2.5 16.5c0-2.8 2.2-5 5-5s5 2.2 5 5M13 3.6a2.75 2.75 0 0 1 0 5.3M15 11.8c1.5.7 2.5 2.3 2.5 4.2" {...p} />}
      {name === "user" && <path d="M10 9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 16.5c0-3 2.7-5 6-5s6 2 6 5" {...p} />}
      {name === "logout" && <path d="M8 3.5H5A1.5 1.5 0 0 0 3.5 5v10A1.5 1.5 0 0 0 5 16.5h3M12.5 13.5 16 10l-3.5-3.5M16 10H8" {...p} />}
      {name === "eye" && (
        <>
          <path d="M2.5 10s2.7-5 7.5-5 7.5 5 7.5 5-2.7 5-7.5 5-7.5-5-7.5-5Z" {...p} />
          <circle cx="10" cy="10" r="2.25" {...p} />
        </>
      )}
      {name === "eye-off" && <path d="M3.5 3.5l13 13M8.3 5.2A7.6 7.6 0 0 1 10 5c4.8 0 7.5 5 7.5 5a13 13 0 0 1-2.2 2.8M12 12.2A2.25 2.25 0 0 1 7.8 8M5.2 6.6A13 13 0 0 0 2.5 10s2.7 5 7.5 5c1.2 0 2.3-.3 3.2-.7" {...p} />}
      {name === "clock" && (
        <>
          <circle cx="10" cy="10" r="7" {...p} />
          <path d="M10 6.5V10l2.5 1.5" {...p} />
        </>
      )}
      {name === "settings" && (
        <>
          <circle cx="10" cy="10" r="2.5" {...p} />
          <path d="M10 2.5v2m0 11v2M2.5 10h2m11 0h2M4.7 4.7l1.4 1.4m7.8 7.8 1.4 1.4M4.7 15.3l1.4-1.4m7.8-7.8 1.4-1.4" {...p} />
        </>
      )}
      {name === "menu" && <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" {...p} />}
      {name === "collapse" && <path d="M3.5 4.5h13v11h-13zM8 4.5v11M13.5 8 11.5 10l2 2" {...p} />}
      {name === "alert" && (
        <>
          <path d="M10 7v3.5m0 2.75h.01" {...p} strokeWidth={2} />
          <path d="M8.6 3.3 2.4 14.2A1.6 1.6 0 0 0 3.8 16.6h12.4a1.6 1.6 0 0 0 1.4-2.4L11.4 3.3a1.6 1.6 0 0 0-2.8 0Z" {...p} strokeWidth={1.5} />
        </>
      )}
    </svg>
  );
}

/** Foresight wordmark: navy tile with an amber spark. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-amber-400">
        <Icon name="spark" />
      </span>
      {!compact && <span className="text-[16px] font-semibold tracking-tight text-slate-900">{BRAND}</span>}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-slate-200 bg-white ${SHADOW_XS} ${className}`}>{children}</section>;
}

export function CardHeader({ eyebrow, title, aside }: { eyebrow: string; title: string; aside?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-6 py-5">
      <div>
        <p className={EYEBROW}>{eyebrow}</p>
        <h2 className="mt-1 text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
      </div>
      {aside}
    </header>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 ${
        checked ? "bg-amber-400" : "bg-slate-300"
      }`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}

/** Text input with label and inline error, shared by the auth modal and profile form. */
export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-medium text-slate-900">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[12px] font-medium text-amber-800">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
