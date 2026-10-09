import { useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";

/* ═════════════════════════════════ Types ═════════════════════════════════ */

type MemberId = "anar" | "leyla" | "elvin" | "team";

interface Member {
  id: MemberId;
  name: string;
  initials: string;
}

interface TaskDef {
  id: string;
  name: string;
  owner: MemberId;
  plannedDuration: number; // days
  predictedDelay: number; // days the AI expects this task to overrun
  dependsOn: string[];
  earliestStart?: number; // day offset; for tasks with no upstream dependency
  reason?: string; // why the AI predicts a delay
}

interface Phase {
  id: string;
  name: string;
  tasks: TaskDef[];
}

interface Span {
  start: number;
  end: number;
}

interface ScheduledTask {
  def: TaskDef;
  planned: Span;
  predicted: Span;
  slack: number;
  critical: boolean;
}

type Row =
  | { kind: "phase"; phase: Phase; planned: Span; predicted: Span; critical: boolean }
  | { kind: "task"; task: ScheduledTask; phaseId: string };

interface DragState {
  taskId: string;
  pointerId: number;
  startX: number;
  startAdjustment: number;
}

/* ═════════════════════════════════ Data ═════════════════════════════════ */

const MEMBERS: Record<MemberId, Member> = {
  anar: { id: "anar", name: "Anar", initials: "AN" },
  leyla: { id: "leyla", name: "Leyla", initials: "LE" },
  elvin: { id: "elvin", name: "Elvin", initials: "EL" },
  team: { id: "team", name: "Team", initials: "T" },
};

const PHASES: Phase[] = [
  {
    id: "backend",
    name: "Backend",
    tasks: [
      { id: "schema", name: "Data schema", owner: "anar", plannedDuration: 3, predictedDelay: 0, dependsOn: [], earliestStart: 0 },
      {
        id: "auth",
        name: "Auth endpoints",
        owner: "anar",
        plannedDuration: 5,
        predictedDelay: 2,
        dependsOn: ["schema"],
        reason: "Commit velocity −62%, auth spec changed twice",
      },
      {
        id: "users",
        name: "User endpoints",
        owner: "anar",
        plannedDuration: 3,
        predictedDelay: 1,
        dependsOn: ["auth"],
        reason: "Same owner as Auth; no parallel capacity",
      },
    ],
  },
  {
    id: "frontend",
    name: "Frontend",
    tasks: [
      { id: "ui", name: "UI components", owner: "leyla", plannedDuration: 5, predictedDelay: 0, dependsOn: [], earliestStart: 0 },
      {
        id: "integration",
        name: "API integration",
        owner: "leyla",
        plannedDuration: 4,
        predictedDelay: 0.5,
        dependsOn: ["users", "ui"],
        reason: "Context switch after waiting on the API",
      },
    ],
  },
  {
    id: "qa",
    name: "QA & Release",
    tasks: [
      { id: "test-plan", name: "Test plan", owner: "elvin", plannedDuration: 2, predictedDelay: 0, dependsOn: [], earliestStart: 3 },
      { id: "e2e", name: "E2E testing", owner: "elvin", plannedDuration: 3, predictedDelay: 0, dependsOn: ["integration", "test-plan"] },
      { id: "release", name: "Release", owner: "team", plannedDuration: 1, predictedDelay: 0, dependsOn: ["e2e"] },
    ],
  },
];

const DEADLINE = 20; // day offset
const TODAY_OFFSET = 5; // project started 5 days ago
const DAY_W = 34; // px per day
const ROW_H = 44; // px per row
const LABEL_W = 248; // px, sticky task column
const MIN_DURATION = 0.5;

const ALL_TASKS = PHASES.flatMap((p) => p.tasks);
const TASK_BY_ID = new Map(ALL_TASKS.map((t) => [t.id, t]));
const SUCCESSORS = new Map<string, string[]>(ALL_TASKS.map((t) => [t.id, ALL_TASKS.filter((s) => s.dependsOn.includes(t.id)).map((s) => s.id)]));

/* ═════════════════════════════════ Scheduling engine ═════════════════════════════════ */

/** Forward pass: each task starts when all its dependencies have finished. */
function forwardPass(duration: (t: TaskDef) => number): Map<string, Span> {
  const spans = new Map<string, Span>();
  const visit = (t: TaskDef): Span => {
    const cached = spans.get(t.id);
    if (cached) return cached;
    const start = Math.max(t.earliestStart ?? 0, ...t.dependsOn.map((id) => visit(TASK_BY_ID.get(id)!).end));
    const span = { start, end: start + duration(t) };
    spans.set(t.id, span);
    return span;
  };
  ALL_TASKS.forEach(visit);
  return spans;
}

/** Backward pass on the predicted schedule: tasks with zero slack form the critical path. */
function backwardPass(spans: Map<string, Span>): Map<string, number> {
  const projectEnd = Math.max(...[...spans.values()].map((s) => s.end));
  const latestFinish = new Map<string, number>();
  const visit = (id: string): number => {
    const cached = latestFinish.get(id);
    if (cached !== undefined) return cached;
    const succ = SUCCESSORS.get(id) ?? [];
    const lf = succ.length
      ? Math.min(...succ.map((s) => visit(s) - (spans.get(s)!.end - spans.get(s)!.start)))
      : projectEnd;
    latestFinish.set(id, lf);
    return lf;
  };
  const slack = new Map<string, number>();
  for (const t of ALL_TASKS) slack.set(t.id, visit(t.id) - spans.get(t.id)!.end);
  return slack;
}

function schedule(adjustments: Record<string, number>): Map<string, ScheduledTask> {
  const planned = forwardPass((t) => t.plannedDuration);
  const predicted = forwardPass((t) => Math.max(MIN_DURATION, t.plannedDuration + t.predictedDelay + (adjustments[t.id] ?? 0)));
  const slack = backwardPass(predicted);
  return new Map(
    ALL_TASKS.map((def) => {
      const s = slack.get(def.id)!;
      return [def.id, { def, planned: planned.get(def.id)!, predicted: predicted.get(def.id)!, slack: s, critical: Math.abs(s) < 1e-6 }];
    }),
  );
}

const spanOf = (spans: Span[]): Span => ({ start: Math.min(...spans.map((s) => s.start)), end: Math.max(...spans.map((s) => s.end)) });

/* ═════════════════════════════════ Formatting ═════════════════════════════════ */

const PROJECT_START = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - TODAY_OFFSET);
  return d;
})();

function dateAt(offset: number): Date {
  const d = new Date(PROJECT_START);
  d.setDate(d.getDate() + Math.floor(offset));
  return d;
}

function formatDay(offset: number): string {
  const label = dateAt(offset).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return offset % 1 === 0 ? label : `${label} PM`;
}

function formatDelta(days: number): string {
  const abs = Number.isInteger(Math.abs(days)) ? Math.abs(days) : Math.abs(days).toFixed(1);
  if (days > 0) return `+${abs}d`;
  if (days < 0) return `−${abs}d`;
  return "0d";
}

const STRIPES: CSSProperties = {
  backgroundImage: "repeating-linear-gradient(135deg, #FBBF24 0 5px, #FCD34D 5px 10px)",
};

/* ═════════════════════════════════ Small UI ═════════════════════════════════ */

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-slate-700">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 ${
          checked ? "bg-slate-900" : "bg-slate-300"
        }`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </button>
      {label}
    </label>
  );
}

function Stat({ label, value, tone = "default", children }: { label: string; value: string; tone?: "default" | "warn"; children?: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tracking-tight tabular-nums ${tone === "warn" ? "text-amber-700" : "text-slate-900"}`}>
        {value}
        {children}
      </p>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} fill="none" aria-hidden="true">
      <path d="m8 5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ═════════════════════════════════ Timeline pieces ═════════════════════════════════ */

function TimelineHeader({ days }: { days: number }) {
  return (
    <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-white">
      <div className="sticky left-0 z-30 flex shrink-0 items-end border-r border-slate-200 bg-white px-4 pb-2" style={{ width: LABEL_W }}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Task</span>
      </div>
      <div className="relative flex" style={{ width: days * DAY_W }}>
        {Array.from({ length: days }, (_, d) => {
          const date = dateAt(d);
          const weekend = date.getDay() === 0 || date.getDay() === 6;
          const firstOfMonth = d === 0 || date.getDate() === 1;
          return (
            <div
              key={d}
              className={`flex shrink-0 flex-col items-center justify-end border-l border-slate-200 pb-1.5 pt-1 ${weekend ? "bg-slate-50" : ""}`}
              style={{ width: DAY_W }}
            >
              <span className="h-3.5 text-[10px] font-semibold text-slate-500">
                {firstOfMonth ? date.toLocaleDateString("en-US", { month: "short" }) : ""}
              </span>
              <span className="text-[10px] text-slate-400">{date.toLocaleDateString("en-US", { weekday: "narrow" })}</span>
              <span className={`text-[12px] tabular-nums ${d === TODAY_OFFSET ? "font-bold text-slate-900" : "text-slate-600"}`}>{date.getDate()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GridBackdrop({ days }: { days: number }) {
  return (
    <div className="pointer-events-none absolute inset-y-0 flex" style={{ left: LABEL_W, width: days * DAY_W }} aria-hidden="true">
      {Array.from({ length: days }, (_, d) => {
        const day = dateAt(d).getDay();
        return <div key={d} className={`shrink-0 border-l border-slate-200 ${day === 0 || day === 6 ? "bg-slate-50" : ""}`} style={{ width: DAY_W }} />;
      })}
    </div>
  );
}

interface TaskBarProps {
  task: ScheduledTask;
  adjustment: number;
  dimmed: boolean;
  highlight: boolean;
  dragging: boolean;
  onHandlePointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onHandlePointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onHandlePointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onHandleKey: (e: KeyboardEvent<HTMLDivElement>) => void;
}

function TaskBar({ task, adjustment, dimmed, highlight, dragging, onHandlePointerDown, onHandlePointerMove, onHandlePointerUp, onHandleKey }: TaskBarProps) {
  const { planned, predicted, def } = task;
  const workDays = Math.min(def.plannedDuration, predicted.end - predicted.start);
  const extension = predicted.end - predicted.start - workDays;
  const slip = predicted.start - planned.start;
  const endDelta = predicted.end - planned.end;

  return (
    <div className={`absolute inset-0 transition-opacity duration-300 ${dimmed ? "opacity-30" : "opacity-100"}`}>
      {/* Planned position ghost (only when the task has been pushed) */}
      {slip > 0 && (
        <>
          <div
            className="absolute top-[9px] h-[26px] rounded-[5px] border border-dashed border-slate-300"
            style={{ left: planned.start * DAY_W, width: (planned.end - planned.start) * DAY_W }}
            aria-hidden="true"
          />
          <div
            className="absolute top-[21px] h-0.5 bg-amber-400"
            style={{ left: planned.start * DAY_W, width: slip * DAY_W }}
            aria-hidden="true"
          />
        </>
      )}

      {/* Predicted bar: navy planned work + amber delay extension */}
      <div
        className={`absolute top-[9px] flex h-[26px] overflow-hidden rounded-[5px] ${
          dragging ? "" : "transition-[left,width] duration-300 ease-out"
        } ${highlight ? "ring-2 ring-slate-900 ring-offset-2" : ""}`}
        style={{ left: predicted.start * DAY_W, width: (predicted.end - predicted.start) * DAY_W }}
      >
        <div className="flex h-full shrink-0 items-center bg-slate-900 px-2" style={{ width: workDays * DAY_W }}>
          {workDays * DAY_W > 70 && <span className="truncate text-[11px] font-medium text-white">{def.name}</span>}
        </div>
        {extension > 0 && (
          <div className="flex h-full flex-1 items-center justify-center" style={STRIPES}>
            {extension * DAY_W >= 30 && <span className="text-[10px] font-bold text-amber-950">{formatDelta(extension)}</span>}
          </div>
        )}
      </div>

      {/* Original end marker */}
      <div
        className="absolute top-[5px] h-[34px] w-0.5 rounded bg-slate-400"
        style={{ left: planned.end * DAY_W - 1 }}
        title={`Planned end ${formatDay(planned.end)}`}
        aria-hidden="true"
      />

      {/* Resize handle */}
      <div
        role="slider"
        tabIndex={0}
        aria-label={`Adjust duration of ${def.name}`}
        aria-valuemin={-(def.plannedDuration + def.predictedDelay - MIN_DURATION)}
        aria-valuemax={10}
        aria-valuenow={adjustment}
        aria-valuetext={`${formatDelta(adjustment)} adjustment, ends ${formatDay(predicted.end)}`}
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
        onKeyDown={onHandleKey}
        className={`group absolute top-[7px] z-10 flex h-[30px] w-3 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center focus:outline-none ${
          dragging ? "" : "transition-[left] duration-300 ease-out"
        }`}
        style={{ left: predicted.end * DAY_W }}
      >
        <span
          className={`h-[18px] w-1.5 rounded-full border border-white bg-slate-900 shadow transition-transform group-hover:scale-y-125 group-focus-visible:ring-2 group-focus-visible:ring-amber-500 ${
            dragging ? "scale-y-125 bg-amber-500" : ""
          }`}
        />
      </div>

      {/* End label */}
      <span
        className={`pointer-events-none absolute top-[14px] whitespace-nowrap pl-3 text-[11px] tabular-nums ${
          dragging ? "" : "transition-[left] duration-300 ease-out"
        } ${endDelta > 0 ? "font-semibold text-amber-800" : "text-slate-500"}`}
        style={{ left: predicted.end * DAY_W }}
      >
        {formatDay(predicted.end)}
        {endDelta !== 0 && <span className="ml-1">({formatDelta(endDelta)})</span>}
      </span>

      {/* Live drag readout */}
      {dragging && (
        <span
          className="absolute -top-1 z-20 -translate-x-1/2 -translate-y-full rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold tabular-nums text-white shadow-lg"
          style={{ left: predicted.end * DAY_W }}
        >
          {formatDelta(adjustment)} · ends {formatDay(predicted.end)}
        </span>
      )}
    </div>
  );
}

function PhaseBar({ planned, predicted, dimmed }: { planned: Span; predicted: Span; dimmed: boolean }) {
  const late = predicted.end > planned.end;
  return (
    <div className={`absolute inset-0 transition-opacity duration-300 ${dimmed ? "opacity-30" : ""}`} aria-hidden="true">
      <div
        className="absolute top-[18px] h-2 rounded-sm bg-slate-300 transition-[left,width] duration-300"
        style={{ left: planned.start * DAY_W, width: (planned.end - planned.start) * DAY_W }}
      />
      {late && (
        <div
          className="absolute top-[18px] h-2 rounded-r-sm transition-[left,width] duration-300"
          style={{ ...STRIPES, left: planned.end * DAY_W, width: (predicted.end - planned.end) * DAY_W }}
        />
      )}
    </div>
  );
}

/* ═════════════════════════════════ Main ═════════════════════════════════ */

export default function PredictiveGantt() {
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ backend: true, frontend: true, qa: true });
  const [showCritical, setShowCritical] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("auth");
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const scheduled = useMemo(() => schedule(adjustments), [adjustments]);
  const baseline = useMemo(() => schedule({}), []);

  const plannedFinish = Math.max(...[...scheduled.values()].map((t) => t.planned.end));
  const predictedFinish = Math.max(...[...scheduled.values()].map((t) => t.predicted.end));
  const aiFinish = Math.max(...[...baseline.values()].map((t) => t.predicted.end));
  const days = Math.ceil(Math.max(predictedFinish, DEADLINE, plannedFinish)) + 4;
  const adjusted = Object.values(adjustments).some((v) => v !== 0);

  const rows: Row[] = PHASES.flatMap((phase) => {
    const tasks = phase.tasks.map((t) => scheduled.get(t.id)!);
    const phaseRow: Row = {
      kind: "phase",
      phase,
      planned: spanOf(tasks.map((t) => t.planned)),
      predicted: spanOf(tasks.map((t) => t.predicted)),
      critical: tasks.some((t) => t.critical),
    };
    return expanded[phase.id] ? [phaseRow, ...tasks.map((task): Row => ({ kind: "task", task, phaseId: phase.id }))] : [phaseRow];
  });

  const rowIndex = new Map<string, number>();
  rows.forEach((r, i) => r.kind === "task" && rowIndex.set(r.task.def.id, i));

  /* ───── adjustment helpers ───── */

  const setAdjustment = (id: string, value: number) => {
    const def = TASK_BY_ID.get(id)!;
    const min = -(def.plannedDuration + def.predictedDelay - MIN_DURATION);
    const clamped = Math.min(10, Math.max(min, Math.round(value * 2) / 2));
    setAdjustments((prev) => ({ ...prev, [id]: clamped }));
  };

  const onPointerDown = (id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const state = { taskId: id, pointerId: e.pointerId, startX: e.clientX, startAdjustment: adjustments[id] ?? 0 };
    dragRef.current = state;
    setDrag(state);
    setSelectedId(id);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setAdjustment(d.taskId, d.startAdjustment + (e.clientX - d.startX) / DAY_W);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
    setDrag(null);
  };

  const onHandleKey = (id: string) => (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 1 : 0.5;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") setAdjustment(id, (adjustments[id] ?? 0) + step);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") setAdjustment(id, (adjustments[id] ?? 0) - step);
    else if (e.key === "Home") setAdjustment(id, 0);
    else return;
    e.preventDefault();
    setSelectedId(id);
  };

  /* ───── critical path connectors ───── */

  const connectors: { d: string; key: string }[] = [];
  if (showCritical) {
    for (const t of scheduled.values()) {
      if (!t.critical) continue;
      const to = rowIndex.get(t.def.id);
      if (to === undefined) continue;
      for (const depId of t.def.dependsOn) {
        const dep = scheduled.get(depId)!;
        const from = rowIndex.get(depId);
        if (!dep.critical || from === undefined || Math.abs(dep.predicted.end - t.predicted.start) > 1e-6) continue;
        const x1 = dep.predicted.end * DAY_W;
        const y1 = from * ROW_H + ROW_H / 2;
        const x2 = t.predicted.start * DAY_W;
        const y2 = to * ROW_H + ROW_H / 2;
        const elbow = x1 + 8;
        connectors.push({ key: `${depId}-${t.def.id}`, d: `M ${x1} ${y1} H ${elbow} V ${y2} H ${x2 + 1}` });
      }
    }
  }

  const selected = scheduled.get(selectedId)!;
  const selectedBase = baseline.get(selectedId)!;
  const downstream = [...scheduled.values()].filter(
    (t) => t.def.id !== selectedId && Math.abs(t.predicted.end - baseline.get(t.def.id)!.predicted.end) > 1e-6,
  );
  const criticalNames = PHASES.flatMap((p) => p.tasks)
    .filter((t) => scheduled.get(t.id)!.critical)
    .map((t) => t.name);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 font-sans text-slate-700 antialiased sm:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        {/* ───── Header ───── */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Foresight · Student Team Project Q4</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Predictive Timeline</h1>
            <p className="mt-1 text-sm text-slate-600">Planned schedule vs. AI forecast. Drag a bar's end handle to simulate a change.</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-[0_1px_2px_0_rgb(15_23_42/0.05)]">
            <Stat label="Planned finish" value={formatDay(plannedFinish)} />
            <Stat label={adjusted ? "Simulated finish" : "AI predicted finish"} value={formatDay(predictedFinish)} tone={predictedFinish > DEADLINE ? "warn" : "default"} />
            <Stat
              label="vs. deadline"
              value={predictedFinish > DEADLINE ? `${formatDelta(predictedFinish - DEADLINE)} late` : `${formatDelta(DEADLINE - predictedFinish).replace("+", "")} buffer`}
              tone={predictedFinish > DEADLINE ? "warn" : "default"}
            />
            {adjusted && (
              <Stat label="vs. AI forecast" value={formatDelta(predictedFinish - aiFinish)} tone={predictedFinish > aiFinish ? "warn" : "default"} />
            )}
          </div>
        </div>

        {/* ───── Toolbar ───── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-5">
            <Toggle checked={showCritical} onChange={setShowCritical} label="Highlight critical path" />
            <div className="flex flex-wrap items-center gap-4 text-[12px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-5 rounded-sm bg-slate-900" />
                Planned duration
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-5 rounded-sm" style={STRIPES} />
                AI predicted delay
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-0.5 rounded bg-slate-400" />
                Original end
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-5 rounded-sm border border-dashed border-slate-300" />
                Planned slot (pushed)
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAdjustments({})}
            disabled={!adjusted}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset simulation
          </button>
        </div>

        {/* ───── Gantt ───── */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_0_rgb(15_23_42/0.05)]">
          <div className={`max-h-[560px] overflow-auto ${drag ? "cursor-ew-resize select-none" : ""}`}>
            <div style={{ width: LABEL_W + days * DAY_W }}>
              <TimelineHeader days={days} />

              <div className="relative" style={{ height: rows.length * ROW_H }}>
                <GridBackdrop days={days} />

                {/* Deadline + today lines */}
                <div className="pointer-events-none absolute inset-y-0 z-[5] border-l-2 border-amber-500" style={{ left: LABEL_W + DEADLINE * DAY_W }} aria-hidden="true">
                  <span className="absolute -left-px top-1 whitespace-nowrap rounded-r bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                    Deadline
                  </span>
                </div>
                <div className="pointer-events-none absolute inset-y-0 z-[5] border-l border-dashed border-slate-900/60" style={{ left: LABEL_W + TODAY_OFFSET * DAY_W }} aria-hidden="true">
                  <span className="absolute -left-px bottom-1 whitespace-nowrap rounded-r bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">Today</span>
                </div>

                {/* Critical path connectors */}
                {connectors.length > 0 && (
                  <svg
                    className="pointer-events-none absolute top-0 z-[6]"
                    style={{ left: LABEL_W }}
                    width={days * DAY_W}
                    height={rows.length * ROW_H}
                    aria-hidden="true"
                  >
                    {connectors.map((c) => (
                      <path key={c.key} d={c.d} fill="none" stroke="#0F172A" strokeWidth={2} strokeLinejoin="round" />
                    ))}
                  </svg>
                )}

                {rows.map((row, i) => {
                  if (row.kind === "phase") {
                    const open = expanded[row.phase.id];
                    return (
                      <div key={row.phase.id} className="absolute inset-x-0 flex border-b border-slate-200 bg-slate-50/70" style={{ top: i * ROW_H, height: ROW_H }}>
                        <button
                          type="button"
                          onClick={() => setExpanded((e) => ({ ...e, [row.phase.id]: !open }))}
                          aria-expanded={open}
                          className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-slate-200 bg-slate-50 px-3 text-left hover:bg-slate-100"
                          style={{ width: LABEL_W }}
                        >
                          <Chevron open={open} />
                          <span className="text-[13px] font-semibold text-slate-900">{row.phase.name}</span>
                          <span className="text-[11px] text-slate-400">{row.phase.tasks.length} tasks</span>
                          {row.predicted.end > row.planned.end && (
                            <span className="ml-auto rounded bg-amber-100 px-1.5 py-px text-[10px] font-bold tabular-nums text-amber-900">
                              {formatDelta(row.predicted.end - row.planned.end)}
                            </span>
                          )}
                        </button>
                        <div className="relative flex-1">
                          <PhaseBar planned={row.planned} predicted={row.predicted} dimmed={showCritical && !row.critical} />
                        </div>
                      </div>
                    );
                  }

                  const t = row.task;
                  const owner = MEMBERS[t.def.owner];
                  const isSelected = t.def.id === selectedId;
                  return (
                    <div
                      key={t.def.id}
                      className={`absolute inset-x-0 flex border-b border-slate-100 ${isSelected ? "bg-blue-50/40" : ""}`}
                      style={{ top: i * ROW_H, height: ROW_H }}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(t.def.id)}
                        className={`sticky left-0 z-10 flex shrink-0 items-center gap-2.5 border-r border-slate-200 pl-9 pr-3 text-left transition-colors ${
                          isSelected ? "bg-blue-50" : "bg-white hover:bg-slate-50"
                        }`}
                        style={{ width: LABEL_W }}
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-600">
                          {owner.initials}
                        </span>
                        <span className={`min-w-0 flex-1 truncate text-[13px] ${showCritical && t.critical ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                          {t.def.name}
                        </span>
                        {showCritical && t.critical && (
                          <span className="rounded bg-slate-900 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-white">Critical</span>
                        )}
                      </button>
                      <div className="relative flex-1">
                        <TaskBar
                          task={t}
                          adjustment={adjustments[t.def.id] ?? 0}
                          dimmed={showCritical && !t.critical}
                          highlight={showCritical && t.critical}
                          dragging={drag?.taskId === t.def.id}
                          onHandlePointerDown={onPointerDown(t.def.id)}
                          onHandlePointerMove={onPointerMove}
                          onHandlePointerUp={onPointerUp}
                          onHandleKey={onHandleKey(t.def.id)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {showCritical && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-[12px] text-slate-600">
              <span className="font-semibold text-slate-900">Critical path:</span>
              {criticalNames.map((n, i) => (
                <span key={n} className="flex items-center gap-2">
                  {i > 0 && <span className="text-slate-300">→</span>}
                  {n}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ───── Selected task / slider simulation ───── */}
        <div className="grid gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_0_rgb(15_23_42/0.05)] lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{selected.def.name}</h2>
              <span className="text-[12px] text-slate-500">· {MEMBERS[selected.def.owner].name}</span>
              {selected.critical ? (
                <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Critical path</span>
              ) : (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{formatDelta(selected.slack).replace("+", "")} slack</span>
              )}
            </div>
            {selected.def.reason && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-amber-900">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                AI: {selected.def.reason}
              </p>
            )}

            <dl className="mt-4 grid grid-cols-3 gap-3 text-[13px]">
              <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                <dt className="text-[11px] text-slate-500">Original end</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{formatDay(selected.planned.end)}</dd>
              </div>
              <div className={`rounded-lg px-3 py-2.5 ${selected.predicted.end > selected.planned.end ? "bg-amber-50" : "bg-slate-50"}`}>
                <dt className="text-[11px] text-slate-500">{adjusted ? "Simulated end" : "Predicted end"}</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{formatDay(selected.predicted.end)}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                <dt className="text-[11px] text-slate-500">Gap</dt>
                <dd className={`mt-0.5 font-semibold tabular-nums ${selected.predicted.end > selected.planned.end ? "text-amber-700" : "text-slate-900"}`}>
                  {formatDelta(selected.predicted.end - selected.planned.end)}
                </dd>
              </div>
            </dl>

            <div className="mt-5">
              <div className="flex items-center justify-between">
                <label htmlFor="duration-adjust" className="text-[13px] font-medium text-slate-900">
                  Simulate duration change
                </label>
                <span
                  className={`rounded-md px-2 py-0.5 text-[12px] font-semibold tabular-nums ${
                    (adjustments[selectedId] ?? 0) !== 0 ? "bg-amber-400 text-amber-950" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {formatDelta(adjustments[selectedId] ?? 0)}
                </span>
              </div>
              <input
                id="duration-adjust"
                type="range"
                min={-(selected.def.plannedDuration + selected.def.predictedDelay - MIN_DURATION)}
                max={6}
                step={0.5}
                value={adjustments[selectedId] ?? 0}
                onChange={(e) => setAdjustment(selectedId, Number(e.target.value))}
                className={`mt-3 w-full cursor-pointer ${(adjustments[selectedId] ?? 0) !== 0 ? "accent-amber-500" : "accent-slate-900"}`}
              />
              <p className="mt-1 text-[12px] text-slate-500">
                Duration {selected.predicted.end - selected.predicted.start}d (planned {selected.def.plannedDuration}d
                {selected.def.predictedDelay > 0 && `, AI adds ${selected.def.predictedDelay}d`})
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Downstream effect of your changes</p>
            {downstream.length === 0 ? (
              <p className="mt-3 text-[13px] text-slate-500">
                {adjusted ? "This change doesn't move any other task." : "Drag a handle or use the slider to see knock-on effects."}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {downstream.map((t) => {
                  const delta = t.predicted.end - baseline.get(t.def.id)!.predicted.end;
                  return (
                    <li key={t.def.id} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="truncate text-slate-700">{t.def.name}</span>
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset ${
                          delta > 0 ? "bg-amber-50 text-amber-900 ring-amber-300" : "bg-blue-50 text-slate-900 ring-blue-200"
                        }`}
                      >
                        {formatDelta(delta)} → {formatDay(t.predicted.end)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {selectedBase && adjusted && (
              <p className="mt-4 border-t border-slate-100 pt-3 text-[12px] text-slate-500">
                Project finish moves <span className="font-semibold tabular-nums text-slate-900">{formatDelta(predictedFinish - aiFinish)}</span> vs. the AI forecast.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
