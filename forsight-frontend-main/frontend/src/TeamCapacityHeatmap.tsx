import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ReactNode } from "react";

/* ═════════════════════════════════ Types ═════════════════════════════════ */

type MemberId = "anar" | "leyla" | "elvin";
type LoadStatus = "over" | "full" | "balanced";

interface Member {
  id: MemberId;
  name: string;
  role: string;
  initials: string;
}

interface Task {
  id: string;
  name: string;
  hours: number[]; // planned hours per day, aligned with DAYS
  critical: boolean;
  /** Members who could take this task over. */
  transferableTo: MemberId[];
}

type Assignments = Record<string, MemberId>;

interface MemberLoad {
  member: Member;
  tasks: Task[];
  totalHours: number;
  capacityHours: number;
  percent: number;
  daily: number[]; // hours per day
  criticalCount: number;
  status: LoadStatus;
}

interface Recommendation {
  task: Task;
  from: Member;
  to: Member;
  fromAfter: number;
  toAfter: number;
}

interface State {
  assignments: Assignments;
  history: { taskId: string; from: MemberId }[];
}

type Action = { type: "reassign"; taskId: string; to: MemberId } | { type: "undo" } | { type: "reset" };

/* ═════════════════════════════════ Data ═════════════════════════════════ */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const HOURS_PER_DAY = 4; // part-time student team
const CAPACITY = HOURS_PER_DAY * DAYS.length;

const MEMBERS: Member[] = [
  { id: "anar", name: "Anar", role: "Backend", initials: "AN" },
  { id: "leyla", name: "Leyla", role: "Frontend", initials: "LE" },
  { id: "elvin", name: "Elvin", role: "QA", initials: "EL" },
];

const TASKS: Task[] = [
  { id: "auth", name: "Auth & user endpoints", hours: [3, 3, 2, 2, 2], critical: true, transferableTo: [] },
  { id: "schema", name: "Data schema migration", hours: [2, 1, 1, 0, 0], critical: true, transferableTo: [] },
  { id: "api-docs", name: "API Documentation", hours: [0, 1, 2, 2, 1], critical: true, transferableTo: ["elvin", "leyla"] },
  { id: "ci", name: "CI pipeline fix", hours: [0, 0, 1, 1, 2], critical: true, transferableTo: [] },
  { id: "integration", name: "Frontend integration", hours: [2, 2, 3, 3, 2], critical: true, transferableTo: [] },
  { id: "ui-polish", name: "Dashboard UI polish", hours: [1, 1, 1, 1, 1], critical: false, transferableTo: [] },
  { id: "e2e-plan", name: "E2E test plan", hours: [1, 1, 1, 1, 1], critical: false, transferableTo: [] },
  { id: "fixtures", name: "Test data fixtures", hours: [1, 1, 1, 1, 1], critical: false, transferableTo: [] },
];

const INITIAL_ASSIGNMENTS: Assignments = {
  auth: "anar",
  schema: "anar",
  "api-docs": "anar",
  ci: "anar",
  integration: "leyla",
  "ui-polish": "leyla",
  "e2e-plan": "elvin",
  fixtures: "elvin",
};

const CRITICAL_TOTAL = TASKS.filter((t) => t.critical).length;

/* ═════════════════════════════════ State & derivations ═════════════════════════════════ */

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reassign": {
      const from = state.assignments[action.taskId];
      if (from === action.to) return state;
      return {
        assignments: { ...state.assignments, [action.taskId]: action.to },
        history: [...state.history, { taskId: action.taskId, from }],
      };
    }
    case "undo": {
      const last = state.history[state.history.length - 1];
      if (!last) return state;
      return {
        assignments: { ...state.assignments, [last.taskId]: last.from },
        history: state.history.slice(0, -1),
      };
    }
    case "reset":
      return { assignments: INITIAL_ASSIGNMENTS, history: [] };
  }
}

function statusFor(percent: number): LoadStatus {
  if (percent > 100) return "over";
  if (percent > 85) return "full";
  return "balanced";
}

function computeLoads(assignments: Assignments): MemberLoad[] {
  return MEMBERS.map((member) => {
    const tasks = TASKS.filter((t) => assignments[t.id] === member.id);
    const daily = DAYS.map((_, d) => tasks.reduce((sum, t) => sum + t.hours[d], 0));
    const totalHours = daily.reduce((a, b) => a + b, 0);
    const percent = Math.round((totalHours / CAPACITY) * 100);
    return {
      member,
      tasks,
      totalHours,
      capacityHours: CAPACITY,
      percent,
      daily,
      criticalCount: tasks.filter((t) => t.critical).length,
      status: statusFor(percent),
    };
  });
}

/** Moves one transferable task off the most overloaded member to whoever ends up least loaded. */
function recommend(loads: MemberLoad[]): Recommendation | null {
  const over = [...loads].filter((l) => l.status === "over").sort((a, b) => b.percent - a.percent)[0];
  if (!over) return null;

  let best: Recommendation | null = null;
  for (const task of over.tasks) {
    const taskHours = task.hours.reduce((a, b) => a + b, 0);
    for (const targetId of task.transferableTo) {
      const target = loads.find((l) => l.member.id === targetId);
      if (!target) continue;
      const toAfter = Math.round(((target.totalHours + taskHours) / CAPACITY) * 100);
      if (toAfter > 100) continue;
      const fromAfter = Math.round(((over.totalHours - taskHours) / CAPACITY) * 100);
      if (!best || toAfter < best.toAfter) {
        best = { task, from: over.member, to: target.member, fromAfter, toAfter };
      }
    }
  }
  return best;
}

const taskHours = (t: Task) => t.hours.reduce((a, b) => a + b, 0);

/* ═════════════════════════════════ Tokens ═════════════════════════════════ */

const SHADOW_XS = "shadow-[0_1px_2px_0_rgb(15_23_42/0.05)]";
const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500";

const STATUS_META: Record<LoadStatus, { label: string; badge: string; bar: string }> = {
  over: { label: "Overcapacity", badge: "bg-amber-100 text-amber-950 ring-amber-300", bar: "bg-amber-400" },
  full: { label: "At capacity", badge: "bg-slate-100 text-slate-700 ring-slate-200", bar: "bg-slate-500" },
  balanced: { label: "Balanced", badge: "bg-blue-50 text-blue-900 ring-blue-200", bar: "bg-blue-900" },
};

/** Diverging scale centred on full capacity: blue = headroom, slate = full, amber = overload. */
function cellStyle(percent: number): string {
  if (percent === 0) return "bg-white text-slate-300 ring-1 ring-inset ring-slate-200";
  if (percent <= 50) return "bg-blue-50 text-blue-900";
  if (percent <= 85) return "bg-blue-100 text-blue-900";
  if (percent <= 100) return "bg-slate-100 text-slate-700";
  if (percent <= 125) return "bg-amber-100 text-amber-950";
  return "bg-amber-300 text-amber-950";
}

const SCALE_LEGEND = [
  { label: "≤50%", className: "bg-blue-50" },
  { label: "51–85%", className: "bg-blue-100" },
  { label: "86–100%", className: "bg-slate-100" },
  { label: "101–125%", className: "bg-amber-100" },
  { label: ">125%", className: "bg-amber-300" },
];

/* ═════════════════════════════════ Primitives ═════════════════════════════════ */

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-slate-200 bg-white ${SHADOW_XS} ${className}`}>{children}</section>;
}

function Avatar({ member, tone }: { member: Member; tone: LoadStatus }) {
  const tones: Record<LoadStatus, string> = {
    over: "bg-amber-400 text-amber-950",
    full: "bg-slate-200 text-slate-700",
    balanced: "bg-blue-50 text-blue-900",
  };
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-500 ${tones[tone]}`}>
      {member.initials}
    </span>
  );
}

type IconName = "alert" | "check" | "spark" | "arrow" | "spinner" | "undo";

function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      {name === "check" && <path d="m5 10.5 3.2 3L15 6.5" {...p} />}
      {name === "arrow" && <path d="M4 10h11m0 0-4-4m4 4-4 4" {...p} />}
      {name === "undo" && <path d="M7 6 4 9l3 3M4 9h8a4 4 0 0 1 0 8h-2" {...p} />}
      {name === "spinner" && <path d="M10 3a7 7 0 1 0 7 7" {...p} className="origin-center animate-spin" />}
      {name === "spark" && <path d="M10 2.5 11.6 8.4 17.5 10l-5.9 1.6L10 17.5l-1.6-5.9L2.5 10l5.9-1.6L10 2.5Z" {...p} />}
      {name === "alert" && (
        <>
          <path d="M10 7v3.5m0 2.75h.01" {...p} strokeWidth={2} />
          <path d="M8.6 3.3 2.4 14.2A1.6 1.6 0 0 0 3.8 16.6h12.4a1.6 1.6 0 0 0 1.4-2.4L11.4 3.3a1.6 1.6 0 0 0-2.8 0Z" {...p} strokeWidth={1.5} />
        </>
      )}
    </svg>
  );
}

/* ═════════════════════════════════ Member card ═════════════════════════════════ */

const BAR_MAX = 150; // bar track represents 0–150% so overload stays visible

function MemberCard({ load, movedTaskId }: { load: MemberLoad; movedTaskId: string | null }) {
  const meta = STATUS_META[load.status];
  const criticalShare = Math.round((load.criticalCount / CRITICAL_TOTAL) * 100);
  const over = load.status === "over";

  return (
    <Card className={`flex flex-col p-5 transition-colors duration-500 ${over ? "!border-amber-300" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar member={load.member} tone={load.status} />
          <div>
            <p className="text-[15px] font-semibold tracking-tight text-slate-900">{load.member.name}</p>
            <p className="text-[13px] text-slate-500">{load.member.role}</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset transition-colors duration-500 ${meta.badge}`}
        >
          {over && <Icon name="alert" className="h-3 w-3" />}
          {over ? `${load.percent}% ${meta.label}` : meta.label}
        </span>
      </div>

      {/* Workload bar */}
      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{load.percent}%</span>
          <span className="text-[12px] tabular-nums text-slate-500">
            {load.totalHours}h / {load.capacityHours}h this week
          </span>
        </div>
        <div className="relative mt-2 h-2 rounded-full bg-slate-100" role="meter" aria-valuemin={0} aria-valuemax={BAR_MAX} aria-valuenow={load.percent} aria-label={`${load.member.name} workload`}>
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${meta.bar}`}
            style={{ width: `${Math.min(load.percent, BAR_MAX) / BAR_MAX * 100}%` }}
          />
          <span
            className="absolute -top-1 bottom-[-4px] w-0.5 rounded bg-slate-900"
            style={{ left: `${(100 / BAR_MAX) * 100}%` }}
            aria-hidden="true"
          />
        </div>
        <div className="relative mt-1 h-4 text-[10px] text-slate-400">
          <span className="absolute -translate-x-1/2" style={{ left: `${(100 / BAR_MAX) * 100}%` }}>
            100%
          </span>
        </div>
      </div>

      {/* Stats */}
      <dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
        <div>
          <dt className="text-[11px] text-slate-500">Active tasks</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{load.tasks.length}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-500">Critical path share</dt>
          <dd className={`mt-0.5 text-sm font-semibold tabular-nums ${criticalShare >= 60 ? "text-amber-700" : "text-slate-900"}`}>
            {criticalShare}%
            <span className="ml-1 text-[11px] font-normal text-slate-400">
              ({load.criticalCount}/{CRITICAL_TOTAL})
            </span>
          </dd>
        </div>
      </dl>

      {/* Task list */}
      <ul className="mt-4 space-y-1.5">
        {load.tasks.map((t) => (
          <li
            key={t.id}
            className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors duration-500 ${
              t.id === movedTaskId ? "bg-blue-50 ring-1 ring-inset ring-blue-200" : ""
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.critical ? "bg-slate-900" : "bg-slate-300"}`} />
              <span className="truncate text-slate-700">{t.name}</span>
              {t.id === movedTaskId && <span className="shrink-0 text-[10px] font-semibold text-blue-900">New</span>}
            </span>
            <span className="shrink-0 tabular-nums text-slate-400">{taskHours(t)}h</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ═════════════════════════════════ Recommendation banner ═════════════════════════════════ */

function RecommendationBanner({ rec, phase, lastMove, onApply, onUndo }: {
  rec: Recommendation | null;
  phase: "idle" | "applying";
  lastMove: { task: Task; from: Member; to: Member } | null;
  onApply: () => void;
  onUndo: () => void;
}) {
  if (!rec && lastMove) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-blue-200 bg-blue-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Icon name="check" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Workload balanced</p>
            <p className="mt-0.5 text-[13px] text-slate-600">
              {lastMove.task.name} moved from {lastMove.from.name} to {lastMove.to.name} ({lastMove.to.role}). No one is over capacity.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onUndo}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 sm:self-auto"
        >
          <Icon name="undo" />
          Undo
        </button>
      </div>
    );
  }

  if (!rec) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-[13px] text-slate-600">
        No reallocation needed. Every member is at or below capacity.
      </div>
    );
  }

  const hours = taskHours(rec.task);
  return (
    <div className="overflow-hidden rounded-xl border border-amber-300 bg-white">
      <div className="grid lg:grid-cols-[1fr_auto]">
        <div className="flex gap-4 bg-amber-50/60 p-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-amber-950">
            <Icon name="spark" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-amber-800">AI Recommendation</p>
            <p className="mt-1 text-[15px] font-semibold leading-snug tracking-tight text-slate-900">
              Reassign {rec.task.name} from {rec.from.name} to {rec.to.name} ({rec.to.role}) to free up {hours} hours and prevent cascade
              delays.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
              <span className="rounded-md bg-white px-2 py-1 font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
                {rec.from.name}{" "}
                <span className="tabular-nums text-amber-700">{rec.fromAfter + Math.round((hours / CAPACITY) * 100)}%</span> →{" "}
                <span className="font-semibold tabular-nums text-slate-900">{rec.fromAfter}%</span>
              </span>
              <span className="rounded-md bg-white px-2 py-1 font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
                {rec.to.name}{" "}
                <span className="tabular-nums text-slate-500">{rec.toAfter - Math.round((hours / CAPACITY) * 100)}%</span> →{" "}
                <span className="font-semibold tabular-nums text-slate-900">{rec.toAfter}%</span>
              </span>
              {rec.task.critical && (
                <span className="rounded-md bg-white px-2 py-1 font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
                  Critical-path concentration on {rec.from.name} drops
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center border-t border-amber-200 bg-white p-5 lg:border-l lg:border-t-0">
          <button
            type="button"
            onClick={onApply}
            disabled={phase === "applying"}
            className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-wait disabled:bg-slate-700 lg:w-auto"
          >
            {phase === "applying" ? (
              <>
                <Icon name="spinner" />
                Balancing…
              </>
            ) : (
              <>
                Auto-Balance Workload
                <Icon name="arrow" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════ Heatmap ═════════════════════════════════ */

function Heatmap({ loads }: { loads: MemberLoad[] }) {
  const [active, setActive] = useState<{ member: MemberId; day: number } | null>(null);

  return (
    <Card>
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-6 py-5">
        <div>
          <p className={EYEBROW}>Daily allocation</p>
          <h2 className="mt-1 text-[15px] font-semibold tracking-tight text-slate-900">Workload heatmap · next week</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">Planned hours vs. {HOURS_PER_DAY}h daily capacity</p>
        </div>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-600" aria-label="Colour scale">
          {SCALE_LEGEND.map((s) => (
            <li key={s.label} className="flex items-center gap-1.5">
              <span className={`h-3 w-5 rounded-sm ${s.className} ${s.className === "bg-blue-50" ? "ring-1 ring-inset ring-blue-100" : ""}`} />
              {s.label}
            </li>
          ))}
        </ul>
      </header>

      <div className="overflow-x-auto px-6 py-5">
        <table className="w-full min-w-[520px] border-separate border-spacing-[3px] text-center">
          <thead>
            <tr>
              <th scope="col" className="w-36 pb-1 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Member
              </th>
              {DAYS.map((d) => (
                <th key={d} scope="col" className="pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {d}
                </th>
              ))}
              <th scope="col" className="w-20 pb-1 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Week
              </th>
            </tr>
          </thead>
          <tbody>
            {loads.map((l) => (
              <tr key={l.member.id}>
                <th scope="row" className="pr-2 text-left">
                  <span className="text-[13px] font-medium text-slate-900">{l.member.name}</span>
                  <span className="ml-1.5 text-[12px] font-normal text-slate-400">{l.member.role}</span>
                </th>
                {l.daily.map((hours, d) => {
                  const percent = Math.round((hours / HOURS_PER_DAY) * 100);
                  const isActive = active?.member === l.member.id && active.day === d;
                  const breakdown = l.tasks.filter((t) => t.hours[d] > 0);
                  return (
                    <td key={d} className="relative p-0">
                      <button
                        type="button"
                        onMouseEnter={() => setActive({ member: l.member.id, day: d })}
                        onMouseLeave={() => setActive(null)}
                        onFocus={() => setActive({ member: l.member.id, day: d })}
                        onBlur={() => setActive(null)}
                        aria-label={`${l.member.name}, ${DAYS[d]}: ${hours} of ${HOURS_PER_DAY} hours, ${percent}%`}
                        className={`flex h-12 w-full flex-col items-center justify-center rounded-md transition-all duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${cellStyle(
                          percent,
                        )} ${isActive ? "ring-2 ring-inset ring-slate-900/70" : ""}`}
                      >
                        <span className="text-[13px] font-semibold tabular-nums">{percent}%</span>
                        <span className="text-[10px] tabular-nums opacity-70">{hours}h</span>
                      </button>
                      {isActive && (
                        <div
                          role="tooltip"
                          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-52 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-lg shadow-slate-900/10"
                        >
                          <p className="text-[11px] text-slate-500">
                            {l.member.name} · {DAYS[d]}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                            {hours}h <span className="font-normal text-slate-500">of {HOURS_PER_DAY}h</span>
                          </p>
                          {breakdown.length > 0 && (
                            <ul className="mt-1.5 space-y-0.5 border-t border-slate-100 pt-1.5">
                              {breakdown.map((t) => (
                                <li key={t.id} className="flex justify-between gap-2 text-[11px] text-slate-600">
                                  <span className="truncate">{t.name}</span>
                                  <span className="tabular-nums text-slate-900">{t.hours[d]}h</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="pl-2 text-right">
                  <span
                    className={`inline-flex rounded-md px-1.5 py-0.5 text-[12px] font-semibold tabular-nums ring-1 ring-inset ${STATUS_META[l.status].badge}`}
                  >
                    {l.percent}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ═════════════════════════════════ Main ═════════════════════════════════ */

export default function TeamCapacityHeatmap() {
  const [state, dispatch] = useReducer(reducer, { assignments: INITIAL_ASSIGNMENTS, history: [] });
  const [phase, setPhase] = useState<"idle" | "applying">("idle");
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const loads = useMemo(() => computeLoads(state.assignments), [state.assignments]);
  const rec = useMemo(() => recommend(loads), [loads]);

  const last = state.history[state.history.length - 1];
  const lastMove = last
    ? {
        task: TASKS.find((t) => t.id === last.taskId)!,
        from: MEMBERS.find((m) => m.id === last.from)!,
        to: MEMBERS.find((m) => m.id === state.assignments[last.taskId])!,
      }
    : null;

  const overloaded = loads.filter((l) => l.status === "over").length;
  const teamPercent = Math.round(loads.reduce((s, l) => s + l.totalHours, 0) / (CAPACITY * loads.length) * 100);
  const topCritical = [...loads].sort((a, b) => b.criticalCount - a.criticalCount)[0];
  const concentration = Math.round((topCritical.criticalCount / CRITICAL_TOTAL) * 100);

  const autoBalance = () => {
    if (!rec || phase === "applying") return;
    setPhase("applying");
    timer.current = window.setTimeout(() => {
      dispatch({ type: "reassign", taskId: rec.task.id, to: rec.to.id });
      setPhase("idle");
    }, 900);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-700 antialiased">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 py-6 sm:px-8">
          <div>
            <p className={EYEBROW}>Foresight · Student Team Project Q4</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Team Capacity &amp; Workload Risk</h1>
            <p className="mt-1 text-sm text-slate-600">Spot over-allocation before it turns into a delay.</p>
          </div>
          <dl className="flex flex-wrap gap-6">
            <div>
              <dt className="text-[11px] text-slate-500">Team load</dt>
              <dd className="text-lg font-semibold tabular-nums text-slate-900">{teamPercent}%</dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">Over capacity</dt>
              <dd className={`text-lg font-semibold tabular-nums ${overloaded ? "text-amber-700" : "text-slate-900"}`}>
                {overloaded} of {loads.length}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">Critical path on one person</dt>
              <dd className={`text-lg font-semibold tabular-nums ${concentration >= 60 ? "text-amber-700" : "text-slate-900"}`}>
                {concentration}% <span className="text-[12px] font-normal text-slate-500">({topCritical.member.name})</span>
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {loads.map((l) => (
            <MemberCard key={l.member.id} load={l} movedTaskId={last?.taskId ?? null} />
          ))}
        </div>

        <RecommendationBanner
          rec={rec}
          phase={phase}
          lastMove={lastMove}
          onApply={autoBalance}
          onUndo={() => dispatch({ type: "undo" })}
        />

        <Heatmap loads={loads} />
      </main>
    </div>
  );
}
