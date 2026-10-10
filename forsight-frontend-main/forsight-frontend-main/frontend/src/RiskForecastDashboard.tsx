import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/* ═════════════════════════════════ Types ═════════════════════════════════ */

type Phase = "forecast" | "mitigated";
type StrategyState = "idle" | "applying" | "applied";
type NodeStatus = "bottleneck" | "blocked" | "at-risk" | "decoupled" | "in-progress" | "ready";

/** A value shown before the strategy is applied (`forecast`) and after (`mitigated`). */
type Phased<T> = Record<Phase, T>;

interface Person {
  id: string;
  name: string;
  role: string;
  initials: string;
}

interface Project {
  id: string;
  name: string;
  forecastActive: boolean;
}

interface CascadeTask {
  id: string;
  index: number;
  title: string;
  assignee: Person;
  plannedEnd: number; // days from today
  forecastEnd: Phased<number>;
  status: Phased<NodeStatus>;
  note: Phased<string>;
}

interface CascadeLink {
  label: Phased<string>;
  blocking: Phased<boolean>;
}

interface Snapshot {
  health: number;
  delayDays: number;
  winRate: number;
}

/* ═════════════════════════════════ Data ═════════════════════════════════ */

const PEOPLE = {
  anar: { id: "anar", name: "Anar", role: "Backend", initials: "AN" },
  leyla: { id: "leyla", name: "Leyla", role: "Frontend", initials: "LE" },
  elvin: { id: "elvin", name: "Elvin", role: "QA & Docs", initials: "EL" },
} satisfies Record<string, Person>;

const PROJECTS: Project[] = [
  { id: "q4", name: "Student Team Project Q4", forecastActive: true },
  { id: "capstone", name: "Capstone Mobile App", forecastActive: false },
  { id: "hackathon", name: "GovTech Hackathon MVP", forecastActive: false },
];

const DEADLINE_OFFSET = 10;

const SNAPSHOT: Phased<Snapshot> = {
  forecast: { health: 42, delayDays: 3.5, winRate: 28 },
  mitigated: { health: 81, delayDays: 0, winRate: 85 },
};

const CASCADE: CascadeTask[] = [
  {
    id: "backend",
    index: 1,
    title: "Backend API Endpoint",
    assignee: PEOPLE.anar,
    plannedEnd: 4,
    forecastEnd: { forecast: 7, mitigated: 7 },
    status: { forecast: "bottleneck", mitigated: "decoupled" },
    note: {
      forecast: "Auth & schema work is 3 days behind. Nothing downstream can start.",
      mitigated: "Still 3 days late, but the frozen contract lets downstream work continue.",
    },
  },
  {
    id: "frontend",
    index: 2,
    title: "Frontend Integration",
    assignee: PEOPLE.leyla,
    plannedEnd: 7,
    forecastEnd: { forecast: 10.5, mitigated: 7.5 },
    status: { forecast: "blocked", mitigated: "in-progress" },
    note: {
      forecast: "Waiting on /auth and /users. Inherits the full 3.5-day slip.",
      mitigated: "Building against MSW mock handlers generated from the OpenAPI spec.",
    },
  },
  {
    id: "e2e",
    index: 3,
    title: "E2E Testing",
    assignee: PEOPLE.elvin,
    plannedEnd: 9,
    forecastEnd: { forecast: 12.5, mitigated: 9.5 },
    status: { forecast: "at-risk", mitigated: "ready" },
    note: {
      forecast: "Test window squeezed past the deadline. High failure risk.",
      mitigated: "Suites run on mocks now; live API swap planned for day 9.",
    },
  },
];

const LINKS: CascadeLink[] = [
  { label: { forecast: "+3.0d slip", mitigated: "mocked" }, blocking: { forecast: true, mitigated: false } },
  { label: { forecast: "+3.5d slip", mitigated: "parallel" }, blocking: { forecast: true, mitigated: false } },
];

/* ═════════════════════════════════ Styles ═════════════════════════════════ */

// Tailwind v4 `shadow-xs` equivalent, written out so it also works on v3.
const SHADOW_XS = "shadow-[0_1px_2px_0_rgb(15_23_42/0.05)]";
const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500";

const STATUS_META: Record<NodeStatus, { label: string; badge: string; card: string }> = {
  bottleneck: {
    label: "Root Bottleneck",
    badge: "bg-amber-400 text-amber-950 ring-amber-500",
    card: "border-amber-300 bg-amber-50/50 ring-1 ring-amber-300",
  },
  blocked: {
    label: "Blocked",
    badge: "bg-amber-50 text-amber-900 ring-amber-300",
    card: "border-slate-200 bg-white",
  },
  "at-risk": {
    label: "At Risk",
    badge: "bg-amber-50 text-amber-900 ring-amber-300",
    card: "border-slate-200 bg-white",
  },
  decoupled: {
    label: "Decoupled",
    badge: "bg-slate-100 text-slate-700 ring-slate-200",
    card: "border-slate-200 bg-white",
  },
  "in-progress": {
    label: "In Progress",
    badge: "bg-blue-50 text-slate-900 ring-blue-200",
    card: "border-slate-200 bg-white",
  },
  ready: {
    label: "Unblocked",
    badge: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    card: "border-slate-200 bg-white",
  },
};

/* ═════════════════════════════════ Helpers ═════════════════════════════════ */

const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

function formatDay(offset: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + Math.floor(offset));
  const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return offset % 1 === 0 ? label : `${label} PM`;
}

function formatDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/* ═════════════════════════════════ Primitives ═════════════════════════════════ */

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border bg-white ${SHADOW_XS} ${className}`}>{children}</div>;
}

function Avatar({ person, highlight = false }: { person: Person; highlight?: boolean }) {
  return (
    <span
      title={`${person.name} · ${person.role}`}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-2 ring-white ${
        highlight ? "bg-amber-400 text-amber-950" : "bg-slate-100 text-slate-700"
      }`}
    >
      {person.initials}
    </span>
  );
}

function StatusBadge({ status }: { status: NodeStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset transition-colors duration-300 ${meta.badge}`}
    >
      {status === "bottleneck" && <span className="h-1.5 w-1.5 rounded-full bg-amber-950" />}
      {meta.label}
    </span>
  );
}

type IconName = "chevron" | "check" | "alert" | "arrow" | "spinner" | "undo";

function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      {name === "chevron" && <path d="m6 8 4 4 4-4" {...p} />}
      {name === "check" && <path d="m5 10.5 3.2 3L15 6.5" {...p} />}
      {name === "arrow" && <path d="M4 10h11m0 0-4-4m4 4-4 4" {...p} />}
      {name === "undo" && <path d="M7 6 4 9l3 3M4 9h8a4 4 0 0 1 0 8h-2" {...p} />}
      {name === "spinner" && <path d="M10 3a7 7 0 1 0 7 7" {...p} className="origin-center animate-spin" />}
      {name === "alert" && (
        <>
          <path d="M10 7v3.5m0 2.75h.01" {...p} strokeWidth={2} />
          <path d="M8.6 3.3 2.4 14.2A1.6 1.6 0 0 0 3.8 16.6h12.4a1.6 1.6 0 0 0 1.4-2.4L11.4 3.3a1.6 1.6 0 0 0-2.8 0Z" {...p} strokeWidth={1.5} />
        </>
      )}
    </svg>
  );
}

/* ═════════════════════════════════ Top bar ═════════════════════════════════ */

function ProjectSwitcher({ projects, activeId, onChange }: {
  projects: Project[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = projects.find((p) => p.id === activeId) ?? projects[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 transition-colors hover:border-slate-300 hover:bg-slate-50"
      >
        <span className="text-slate-400">Project</span>
        <span className="h-4 w-px bg-slate-200" />
        <span className="font-semibold">{active.name}</span>
        <Icon name="chevron" className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute left-1/2 z-20 mt-2 w-72 -translate-x-1/2 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg shadow-slate-900/5"
        >
          {projects.map((p) => (
            <li key={p.id} role="option" aria-selected={p.id === activeId}>
              <button
                type="button"
                disabled={!p.forecastActive}
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <span className={p.forecastActive ? "font-medium text-slate-900" : "text-slate-400"}>{p.name}</span>
                {p.id === activeId ? (
                  <Icon name="check" className="h-4 w-4 text-slate-900" />
                ) : (
                  !p.forecastActive && <span className="text-[11px] text-slate-400">Forecast paused</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TopBar({ projectId, onProjectChange, riskActive }: {
  projectId: string;
  onProjectChange: (id: string) => void;
  riskActive: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-3 px-4 py-3 sm:px-8 md:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center gap-2.5">
          <span className="text-[15px] font-semibold tracking-tight text-slate-900">Foresight</span>
          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
            Risk
          </span>
        </div>

        <div className="md:justify-self-center">
          <ProjectSwitcher projects={PROJECTS} activeId={projectId} onChange={onProjectChange} />
        </div>

        <div className="md:justify-self-end">
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                  riskActive ? "bg-amber-400" : "bg-emerald-400"
                }`}
              />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${riskActive ? "bg-amber-400" : "bg-emerald-400"}`} />
            </span>
            Live Forecast Active
          </span>
        </div>
      </div>
    </header>
  );
}

/* ═════════════════════════════════ Metric cards ═════════════════════════════════ */

function HealthCard({ value, atRisk }: { value: number; atRisk: boolean }) {
  return (
    <Card className={`p-5 transition-colors duration-500 ${atRisk ? "border-amber-300 bg-amber-50/50" : "border-slate-200"}`}>
      <div className="flex items-center justify-between">
        <p className={EYEBROW}>Health Index</p>
        <span
          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
            atRisk ? "bg-amber-400 text-amber-950 ring-amber-500" : "bg-blue-50 text-slate-900 ring-blue-200"
          }`}
        >
          {atRisk ? "Critical" : "Healthy"}
        </span>
      </div>
      <p className="mt-3 text-4xl font-semibold tracking-tight tabular-nums text-slate-900">{value}%</p>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-slate-200">
        <div
          className={`h-full rounded-full transition-all duration-700 ${atRisk ? "bg-amber-400" : "bg-slate-900"}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <p className="mt-2 text-[12px] text-slate-500">Threshold for healthy: 70%</p>
    </Card>
  );
}

function DelayCard({ days }: { days: number }) {
  const late = days > 0;
  return (
    <Card className="border-slate-200 p-5">
      <p className={EYEBROW}>Expected Delay</p>
      <p className="mt-3 text-4xl font-semibold tracking-tight tabular-nums text-slate-900">
        {late ? `+${formatDays(days)}` : "0"}
        <span className="ml-1.5 text-base font-medium text-slate-500">days</span>
      </p>
      {late ? (
        <p className="mt-3 flex items-start gap-1.5 text-[13px] leading-snug text-amber-900">
          <Icon name="alert" className="mt-px h-4 w-4 shrink-0 text-amber-500" />
          Misses the {formatDay(DEADLINE_OFFSET)} deadline. Final delivery forecast {formatDay(DEADLINE_OFFSET + days)}.
        </p>
      ) : (
        <p className="mt-3 flex items-start gap-1.5 text-[13px] leading-snug text-slate-600">
          <Icon name="check" className="mt-px h-4 w-4 shrink-0 text-slate-900" />
          Delivers before {formatDay(DEADLINE_OFFSET)} with a 0.5-day buffer.
        </p>
      )}
    </Card>
  );
}

function BlockerCard({ task, phase }: { task: CascadeTask; phase: Phase }) {
  const active = phase === "forecast";
  return (
    <Card className="border-slate-200 p-5">
      <div className="flex items-center justify-between">
        <p className={EYEBROW}>Primary Blocker</p>
        <StatusBadge status={task.status[phase]} />
      </div>
      <p className="mt-3 text-lg font-semibold leading-tight tracking-tight text-slate-900">{task.title}</p>
      <div className="mt-4 flex items-center gap-2.5 border-t border-slate-100 pt-4">
        <Avatar person={task.assignee} highlight={active} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">{task.assignee.name}</p>
          <p className="text-[12px] text-slate-500">
            {task.assignee.role} · {active ? "blocking 2 tasks" : "no longer blocking"}
          </p>
        </div>
      </div>
    </Card>
  );
}

function WinRateCard({ before, after, applied }: { before: number; after: number; applied: boolean }) {
  return (
    <Card className="border-slate-200 p-5">
      <p className={EYEBROW}>Win Rate Improvement</p>
      <p className="mt-3 flex items-baseline gap-2 text-4xl font-semibold tracking-tight tabular-nums text-slate-900">
        <span className={applied ? "text-2xl text-slate-400 line-through decoration-2" : "text-amber-600"}>{before}%</span>
        <Icon name="arrow" className="h-5 w-5 self-center text-slate-300" />
        <span>{after}%</span>
      </p>
      <p className="mt-1 text-[13px] text-slate-500">On-Time Completion</p>
      <div className="mt-3 space-y-1.5" aria-hidden="true">
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-amber-400" style={{ width: `${before}%` }} />
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-slate-900" style={{ width: `${after}%` }} />
        </div>
      </div>
      <p className="mt-2 text-[12px] text-slate-500">{applied ? "Achieved with Mock API strategy" : "Projected with Mock API strategy"}</p>
    </Card>
  );
}

/* ═════════════════════════════════ Cascade flow ═════════════════════════════════ */

function CascadeConnector({ link, phase }: { link: CascadeLink; phase: Phase }) {
  const blocking = link.blocking[phase];
  const stroke = blocking ? "stroke-amber-400" : "stroke-slate-400";
  const dash = blocking ? undefined : "5 5";

  return (
    <div className="flex items-center justify-center gap-3 py-2 lg:flex-col lg:gap-1.5 lg:py-0" aria-hidden="true">
      <span
        className={`order-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors duration-500 lg:order-1 ${
          blocking ? "bg-amber-400 text-amber-950" : "bg-slate-100 text-slate-600"
        }`}
      >
        {link.label[phase]}
      </span>

      {/* Horizontal connector (desktop) */}
      <svg viewBox="0 0 96 16" className="order-2 hidden h-4 w-full lg:block" preserveAspectRatio="none">
        <circle cx="4" cy="8" r="3" className={`${blocking ? "fill-amber-400" : "fill-slate-400"} transition-colors duration-500`} />
        <line x1="8" y1="8" x2="86" y2="8" strokeWidth="2" strokeDasharray={dash} className={`${stroke} transition-colors duration-500`} />
        <path d="m84 3 7 5-7 5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${stroke} transition-colors duration-500`} />
      </svg>

      {/* Vertical connector (mobile) */}
      <svg viewBox="0 0 16 40" className="order-1 h-10 w-4 lg:hidden">
        <line x1="8" y1="0" x2="8" y2="32" strokeWidth="2" strokeDasharray={dash} className={stroke} />
        <path d="m3 30 5 7 5-7" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={stroke} />
      </svg>
    </div>
  );
}

function CascadeCard({ task, phase }: { task: CascadeTask; phase: Phase }) {
  const status = task.status[phase];
  const forecastEnd = task.forecastEnd[phase];
  const slip = forecastEnd - task.plannedEnd;
  const isRoot = status === "bottleneck";

  return (
    <article className={`flex h-full flex-col rounded-xl border p-5 transition-colors duration-500 ${STATUS_META[status].card}`}>
      <div className="flex items-center justify-between gap-2">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold transition-colors duration-500 ${
            isRoot ? "bg-amber-400 text-amber-950" : "bg-slate-900 text-white"
          }`}
        >
          {task.index}
        </span>
        <StatusBadge status={status} />
      </div>

      <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-slate-900">{task.title}</h3>
      <p className="mt-1.5 min-h-[40px] text-[13px] leading-snug text-slate-600">{task.note[phase]}</p>

      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-200/80 pt-4 text-[13px]">
        <div>
          <p className="text-[11px] text-slate-500">Planned</p>
          <p className="mt-0.5 tabular-nums text-slate-700">{formatDay(task.plannedEnd)}</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-500">AI forecast</p>
          <p className="mt-0.5 flex items-center gap-1.5 tabular-nums font-semibold text-slate-900">
            {formatDay(forecastEnd)}
            {slip > 0 && (
              <span className="rounded bg-amber-100 px-1 py-px text-[10px] font-bold text-amber-900">+{formatDays(slip)}d</span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2 pt-4">
        <Avatar person={task.assignee} highlight={isRoot} />
        <span className="text-[13px] font-medium text-slate-900">{task.assignee.name}</span>
        <span className="text-[12px] text-slate-400">· {task.assignee.role}</span>
      </div>
    </article>
  );
}

function CascadeFlow({ phase }: { phase: Phase }) {
  const blocking = phase === "forecast";
  return (
    <Card className="border-slate-200">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-6 py-5">
        <div>
          <p className={EYEBROW}>Dependency Cascade</p>
          <h2 className="mt-1 text-[15px] font-semibold tracking-tight text-slate-900">
            {blocking ? "A 3-day backend slip becomes a 3.5-day project delay" : "Mock API breaks the chain; work runs in parallel"}
          </h2>
        </div>
        <div className="flex items-center gap-4 text-[12px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded bg-amber-400" />
            Blocking dependency
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 border-t-2 border-dashed border-slate-400" />
            Decoupled
          </span>
        </div>
      </div>

      <div className="bg-slate-50 p-4 sm:p-6">
        <div className="grid grid-cols-1 items-stretch lg:grid-cols-[1fr_7rem_1fr_7rem_1fr]">
          {CASCADE.map((task, i) => (
            <div key={task.id} className="contents">
              {i > 0 && <CascadeConnector link={LINKS[i - 1]} phase={phase} />}
              <CascadeCard task={task} phase={phase} />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ═════════════════════════════════ Recommendation ═════════════════════════════════ */

function RecommendationBanner({ state, onApply, onRevert, before, after }: {
  state: StrategyState;
  onApply: () => void;
  onRevert: () => void;
  before: number;
  after: number;
}) {
  const applied = state === "applied";

  return (
    <section className={`overflow-hidden rounded-xl border bg-white ${SHADOW_XS} ${applied ? "border-slate-200" : "border-amber-300"}`}>
      <div className="grid lg:grid-cols-[1fr_auto]">
        <div className="flex gap-4 p-6">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-500 ${
              applied ? "bg-slate-900 text-white" : "bg-amber-400 text-amber-950"
            }`}
          >
            <Icon name={applied ? "check" : "alert"} className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className={`text-[11px] font-bold uppercase tracking-[0.08em] ${applied ? "text-slate-500" : "text-amber-700"}`}>
              AI Recommendation
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Deploy Mock API</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              Freeze the OpenAPI contract for <code className="rounded bg-slate-100 px-1 font-mono text-[12px] text-slate-800">/auth</code> and{" "}
              <code className="rounded bg-slate-100 px-1 font-mono text-[12px] text-slate-800">/users</code>, then serve it through Mock
              Service Worker. Leyla and Elvin continue in parallel while Anar finishes the real endpoints. The only cost is a half-day
              integration once the live API ships.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
              <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">Recovers 3.0 days</span>
              <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">Unblocks 2 tasks</span>
              <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">Setup ~1 day</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center gap-4 border-t border-slate-800 bg-slate-900 p-6 text-white lg:w-80 lg:border-l lg:border-t-0">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">On-time completion</p>
            <p className="mt-1 flex items-baseline gap-2 text-3xl font-semibold tabular-nums tracking-tight">
              <span className="text-amber-400">{before}%</span>
              <Icon name="arrow" className="h-5 w-5 self-center text-slate-500" />
              <span>{after}%</span>
            </p>
          </div>

          {applied ? (
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <Icon name="check" />
                Strategy applied
              </span>
              <button
                type="button"
                onClick={onRevert}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <Icon name="undo" />
                Revert
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onApply}
              disabled={state === "applying"}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-wait disabled:bg-amber-400/70"
            >
              {state === "applying" ? (
                <>
                  <Icon name="spinner" />
                  Applying strategy…
                </>
              ) : (
                <>
                  Apply Strategy
                  <Icon name="arrow" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/* ═════════════════════════════════ Page ═════════════════════════════════ */

export default function RiskForecastDashboard() {
  const [projectId, setProjectId] = useState(PROJECTS[0].id);
  const [strategy, setStrategy] = useState<StrategyState>("idle");
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const phase: Phase = strategy === "applied" ? "mitigated" : "forecast";
  const snapshot = SNAPSHOT[phase];
  const atRisk = phase === "forecast";

  const applyStrategy = () => {
    if (strategy !== "idle") return;
    setStrategy("applying");
    timer.current = window.setTimeout(() => setStrategy("applied"), 1100);
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-700 antialiased">
      <TopBar projectId={projectId} onProjectChange={setProjectId} riskActive={atRisk} />

      <main className="bg-slate-50">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Risk forecast</h1>
              <p className="mt-1 text-sm text-slate-500">
                Deadline {formatDay(DEADLINE_OFFSET)} · 3 members · Updated 2 min ago
              </p>
            </div>
            <div className="flex -space-x-1.5">
              {Object.values(PEOPLE).map((p) => (
                <Avatar key={p.id} person={p} highlight={p.id === "anar" && atRisk} />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <HealthCard value={snapshot.health} atRisk={atRisk} />
            <DelayCard days={snapshot.delayDays} />
            <BlockerCard task={CASCADE[0]} phase={phase} />
            <WinRateCard before={SNAPSHOT.forecast.winRate} after={SNAPSHOT.mitigated.winRate} applied={!atRisk} />
          </div>

          <CascadeFlow phase={phase} />

          <RecommendationBanner
            state={strategy}
            onApply={applyStrategy}
            onRevert={() => setStrategy("idle")}
            before={SNAPSHOT.forecast.winRate}
            after={SNAPSHOT.mitigated.winRate}
          />
        </div>
      </main>
    </div>
  );
}
