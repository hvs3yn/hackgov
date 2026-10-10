import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

/* ═════════════════════════════════ Types ═════════════════════════════════ */

type MemberId = "anar" | "leyla" | "elvin";
type Severity = "none" | "moderate" | "high";
type RiskLevel = "Low" | "Elevated" | "High";
type Trend = "better" | "same" | "worse" | "critical";

interface Member {
  id: MemberId;
  name: string;
  role: string;
  initials: string;
}

interface TaskDef {
  id: string;
  name: string;
  owner: MemberId;
  duration: number; // working days
  dependsOn: string[];
}

interface Scenario {
  deadlineShift: number; // -5 … +5 days
  departed: MemberId[];
  scopeIncrease: number; // 0 … 50 %
}

interface ScheduledTask extends TaskDef {
  start: number;
  end: number;
  effectiveDuration: number;
}

interface SimulationResult {
  feasible: boolean;
  tasks: ScheduledTask[];
  completion: number;
  deadline: number;
  buffer: number;
  criticalPath: string[];
  bottleneck: { task: ScheduledTask; reason: string } | null;
  risk: { score: number; level: RiskLevel };
  action: { text: string; severity: Severity };
}

/* ═════════════════════════════════ Project plan ═════════════════════════════════ */

const MEMBERS: Member[] = [
  { id: "anar", name: "Anar", role: "Backend Developer", initials: "AN" },
  { id: "leyla", name: "Leyla", role: "Frontend Developer", initials: "LE" },
  { id: "elvin", name: "Elvin", role: "QA & Documentation", initials: "EL" },
];

const TASKS: TaskDef[] = [
  { id: "T1", name: "Data model & migrations", owner: "anar", duration: 3, dependsOn: [] },
  { id: "T2", name: "Backend API endpoints", owner: "anar", duration: 6, dependsOn: ["T1"] },
  { id: "T3", name: "UI component library", owner: "leyla", duration: 5, dependsOn: [] },
  { id: "T4", name: "Frontend integration", owner: "leyla", duration: 4, dependsOn: ["T2", "T3"] },
  { id: "T5", name: "E2E testing", owner: "elvin", duration: 3, dependsOn: ["T4"] },
  { id: "T6", name: "API documentation", owner: "elvin", duration: 2, dependsOn: ["T2"] },
];

const BASE_DEADLINE = 18; // days from today
const DEPARTED_TASK_FACTOR = 1.7; // reassigned work: ramp-up + context loss
const ABSORB_FACTOR = 0.15; // extra load on everyone else, per departure

const EMPTY_SCENARIO: Scenario = { deadlineShift: 0, departed: [], scopeIncrease: 0 };

/* ═════════════════════════════════ Simulation engine ═════════════════════════════════ */

const roundHalf = (n: number) => Math.ceil(n * 2) / 2;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const memberById = (id: MemberId) => MEMBERS.find((m) => m.id === id) as Member;

function simulate(s: Scenario): SimulationResult {
  const deadline = BASE_DEADLINE + s.deadlineShift;

  if (s.departed.length === MEMBERS.length) {
    return {
      feasible: false,
      tasks: [],
      completion: Infinity,
      deadline,
      buffer: -Infinity,
      criticalPath: [],
      bottleneck: null,
      risk: { score: 100, level: "High" },
      action: { text: "Restore team capacity. No one is left to execute the plan.", severity: "high" },
    };
  }

  const scope = 1 + s.scopeIncrease / 100;
  const byId = new Map<string, ScheduledTask>();

  for (const t of TASKS) {
    let d = t.duration * scope;
    if (s.departed.includes(t.owner)) d *= DEPARTED_TASK_FACTOR;
    else d *= 1 + ABSORB_FACTOR * s.departed.length;
    const effectiveDuration = roundHalf(d);
    const start = Math.max(0, ...t.dependsOn.map((dep) => byId.get(dep)?.end ?? 0));
    byId.set(t.id, { ...t, start, end: start + effectiveDuration, effectiveDuration });
  }

  const tasks = [...byId.values()];
  const last = tasks.reduce((a, b) => (b.end > a.end ? b : a));
  const completion = last.end;
  const buffer = deadline - completion;

  // Walk back from the last task through the dependency that dictated each start.
  const criticalPath: string[] = [];
  for (let cur: ScheduledTask | undefined = last; cur; ) {
    criticalPath.unshift(cur.id);
    const start: number = cur.start;
    cur = cur.dependsOn.map((id) => byId.get(id)!).find((dep) => dep.end === start);
  }

  const critical = criticalPath.map((id) => byId.get(id)!);
  const grown = critical
    .map((t) => ({ t, growth: t.effectiveDuration - t.duration }))
    .sort((a, b) => b.growth - a.growth)[0];
  const bottleneck =
    grown && grown.growth > 0
      ? {
          task: grown.t,
          reason: s.departed.includes(grown.t.owner)
            ? `+${grown.growth}d, owner departs`
            : `+${grown.growth}d from scope/load`,
        }
      : (() => {
          const longest = critical.reduce((a, b) => (b.effectiveDuration > a.effectiveDuration ? b : a));
          return { task: longest, reason: "Longest task on critical path" };
        })();

  const criticalDepartures = s.departed.filter((m) => critical.some((t) => t.owner === m)).length;
  const score = Math.round(clamp(100 / (1 + Math.exp(0.7 * (buffer - 0.5))) + 8 * criticalDepartures, 3, 99));
  const level: RiskLevel = score < 35 ? "Low" : score < 65 ? "Elevated" : "High";

  return {
    feasible: true,
    tasks,
    completion,
    deadline,
    buffer,
    criticalPath,
    bottleneck,
    risk: { score, level },
    action: recommendAction(s, buffer, bottleneck.task),
  };
}

function recommendAction(s: Scenario, buffer: number, bottleneck: ScheduledTask): SimulationResult["action"] {
  if (s.departed.includes("anar") && ["T1", "T2"].includes(bottleneck.id)) {
    return { text: "Stand up a Mock API from the contract and reassign endpoints to Leyla.", severity: "high" };
  }
  if (s.departed.includes("leyla")) {
    return { text: "Pair Anar on integration and freeze UI scope at current designs.", severity: "high" };
  }
  if (s.departed.includes("elvin")) {
    return { text: "Shift-left testing: developers own E2E for the 5 critical flows.", severity: buffer < 0 ? "high" : "moderate" };
  }
  if (buffer < 0 && s.scopeIncrease >= 20) {
    return { text: `Cut new scope back to ≤10%. Current +${s.scopeIncrease}% overruns by ${-buffer}d.`, severity: "high" };
  }
  if (buffer < 0) {
    return { text: `Negotiate +${Math.ceil(-buffer)}d on the deadline or descope P2 items.`, severity: "high" };
  }
  if (buffer < 2) {
    return { text: "Protect the remaining buffer: freeze new scope until release.", severity: "moderate" };
  }
  return { text: "None. Plan holds; review at the weekly check-in.", severity: "none" };
}

/* ═════════════════════════════════ Formatting ═════════════════════════════════ */

const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

function formatDate(offset: number): string {
  if (!Number.isFinite(offset)) return "Not deliverable";
  const d = new Date(TODAY);
  d.setDate(d.getDate() + Math.floor(offset));
  const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return offset % 1 === 0 ? label : `${label} (PM)`;
}

function signedDays(n: number): string {
  const abs = Number.isInteger(Math.abs(n)) ? Math.abs(n) : Math.abs(n).toFixed(1);
  if (n > 0) return `+${abs}d`;
  if (n < 0) return `−${abs}d`;
  return "0d";
}

function sameScenario(a: Scenario, b: Scenario): boolean {
  return (
    a.deadlineShift === b.deadlineShift &&
    a.scopeIncrease === b.scopeIncrease &&
    a.departed.length === b.departed.length &&
    a.departed.every((m) => b.departed.includes(m))
  );
}

/* ═════════════════════════════════ Styles ═════════════════════════════════ */

// Tailwind v4 `shadow-xs`, written out so it also works on v3.
const SHADOW_XS = "shadow-[0_1px_2px_0_rgb(15_23_42/0.05)]";

const TREND_PILL: Record<Trend, string> = {
  better: "bg-blue-50 text-slate-900 ring-blue-200",
  same: "bg-slate-100 text-slate-600 ring-slate-200",
  worse: "bg-amber-50 text-amber-900 ring-amber-300",
  critical: "bg-amber-400 text-amber-950 ring-amber-500",
};

const RISK_BADGE: Record<RiskLevel, string> = {
  Low: "bg-blue-50 text-slate-900 ring-blue-200",
  Elevated: "bg-amber-50 text-amber-900 ring-amber-300",
  High: "bg-amber-400 text-amber-950 ring-amber-500",
};

/* ═════════════════════════════════ Primitives ═════════════════════════════════ */

function Pill({ trend, children }: { trend: Trend; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TREND_PILL[trend]}`}
    >
      {trend === "critical" && (
        <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" aria-hidden="true">
          <path d="M10 6.5v4.5m0 2.75h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      )}
      {children}
    </span>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 ${
        checked ? "bg-amber-400" : "bg-slate-300"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-slate-900/5 transition-transform duration-200 ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function RangeControl({ id, label, hint, value, min, max, step, readout, ticks, onChange }: {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  readout: string;
  ticks: string[];
  onChange: (v: number) => void;
}) {
  const active = value !== 0;
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <label htmlFor={id} className="text-sm font-semibold text-slate-900">
            {label}
          </label>
          <p className="mt-0.5 text-[13px] text-slate-600">{hint}</p>
        </div>
        <output
          htmlFor={id}
          className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold tabular-nums ring-1 ring-inset transition-colors ${
            active ? "bg-amber-400 text-amber-950 ring-amber-500" : "bg-white text-slate-600 ring-slate-200"
          }`}
        >
          {readout}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`mt-4 w-full cursor-pointer ${active ? "accent-amber-500" : "accent-slate-900"}`}
      />
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-slate-400">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  );
}

/* ═════════════════════════════════ Control panel ═════════════════════════════════ */

function ControlPanel({ draft, onChange, deadlineLabel }: {
  draft: Scenario;
  onChange: (next: Scenario) => void;
  deadlineLabel: string;
}) {
  const toggleMember = (id: MemberId, departs: boolean) =>
    onChange({
      ...draft,
      departed: departs ? [...draft.departed, id] : draft.departed.filter((m) => m !== id),
    });

  return (
    <div className="space-y-8 bg-slate-50 p-6">
      <RangeControl
        id="deadline-shift"
        label="Deadline Adjustment"
        hint={`Moves the delivery date to ${deadlineLabel}.`}
        value={draft.deadlineShift}
        min={-5}
        max={5}
        step={1}
        readout={draft.deadlineShift === 0 ? "No change" : `${draft.deadlineShift > 0 ? "+" : "−"}${Math.abs(draft.deadlineShift)} days`}
        ticks={["−5", "−4", "−3", "−2", "−1", "0", "+1", "+2", "+3", "+4", "+5"]}
        onChange={(v) => onChange({ ...draft, deadlineShift: v })}
      />

      <fieldset>
        <legend className="text-sm font-semibold text-slate-900">Team Member Capacity</legend>
        <p className="mt-0.5 text-[13px] text-slate-600">Simulate a member leaving. Their tasks are reassigned at 1.7× effort.</p>
        <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {MEMBERS.map((m) => {
            const departs = draft.departed.includes(m.id);
            return (
              <li
                key={m.id}
                className={`flex items-center justify-between gap-3 px-3.5 py-3 transition-colors ${departs ? "bg-amber-50" : ""}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                      departs ? "bg-amber-400 text-amber-950" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {m.initials}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      <span className={departs ? "text-amber-950 line-through decoration-amber-500" : "text-slate-900"}>{m.name}</span>{" "}
                      <span className="font-normal text-slate-500">· {m.role}</span>
                    </p>
                    <p className={`text-[12px] ${departs ? "font-medium text-amber-800" : "text-slate-500"}`}>
                      {departs ? "Leaves project · 0% capacity" : "Available · 100% capacity"}
                    </p>
                  </div>
                </div>
                <Toggle checked={departs} onChange={(v) => toggleMember(m.id, v)} label={`Simulate ${m.name} leaving`} />
              </li>
            );
          })}
        </ul>
      </fieldset>

      <RangeControl
        id="scope-increase"
        label="Task Scope Expansion"
        hint="Extra workload applied to every remaining task."
        value={draft.scopeIncrease}
        min={0}
        max={50}
        step={5}
        readout={draft.scopeIncrease === 0 ? "No change" : `+${draft.scopeIncrease}%`}
        ticks={["0%", "10%", "20%", "30%", "40%", "50%"]}
        onChange={(v) => onChange({ ...draft, scopeIncrease: v })}
      />
    </div>
  );
}

/* ═════════════════════════════════ Results ═════════════════════════════════ */

interface ComparisonRow {
  metric: string;
  baseline: ReactNode;
  simulated: ReactNode;
  change: ReactNode;
}

function buildRows(base: SimulationResult, sim: SimulationResult): ComparisonRow[] {
  /* Completion date */
  const dateDelta = sim.completion - base.completion;
  const missesDeadline = sim.buffer < 0;
  const dateTrend: Trend = !sim.feasible || (missesDeadline && dateDelta > 0) ? "critical" : dateDelta > 0 ? "worse" : dateDelta < 0 ? "better" : "same";

  const completionCell = (r: SimulationResult) => (
    <div>
      <p className="font-semibold tabular-nums text-slate-900">{formatDate(r.completion)}</p>
      <p className={`mt-0.5 text-[12px] ${r.buffer < 0 ? "font-medium text-amber-800" : "text-slate-500"}`}>
        {!r.feasible
          ? `Deadline ${formatDate(r.deadline)}`
          : r.buffer < 0
            ? `Misses ${formatDate(r.deadline)} by ${signedDays(-r.buffer).slice(1)}`
            : `${signedDays(r.buffer).replace("+", "")} buffer to ${formatDate(r.deadline)}`}
      </p>
    </div>
  );

  /* Bottleneck */
  const bottleneckCell = (r: SimulationResult) =>
    r.bottleneck ? (
      <div>
        <p className="font-medium text-slate-900">{r.bottleneck.task.name}</p>
        <p className="mt-0.5 text-[12px] text-slate-500">
          {memberById(r.bottleneck.task.owner).name} · {r.bottleneck.reason}
        </p>
      </div>
    ) : (
      <p className="font-medium text-amber-900">Entire plan</p>
    );
  const bottleneckChanged = base.bottleneck?.task.id !== sim.bottleneck?.task.id;
  const bottleneckGrew = (sim.bottleneck?.task.effectiveDuration ?? Infinity) > (base.bottleneck?.task.effectiveDuration ?? 0);

  /* Risk */
  const riskDelta = sim.risk.score - base.risk.score;
  const riskTrend: Trend = sim.risk.level === "High" && riskDelta > 0 ? "critical" : riskDelta > 0 ? "worse" : riskDelta < 0 ? "better" : "same";
  const riskCell = (r: SimulationResult) => (
    <div className="flex items-center gap-2.5">
      <span className="w-8 text-right font-semibold tabular-nums text-slate-900">{r.risk.score}</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${r.risk.level === "Low" ? "bg-slate-900" : "bg-amber-400"}`}
          style={{ width: `${r.risk.score}%` }}
        />
      </div>
      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${RISK_BADGE[r.risk.level]}`}>
        {r.risk.level}
      </span>
    </div>
  );

  /* Action */
  const severityRank: Record<Severity, number> = { none: 0, moderate: 1, high: 2 };
  const actionDelta = severityRank[sim.action.severity] - severityRank[base.action.severity];
  const actionCell = (r: SimulationResult) => (
    <p className={`text-[13px] leading-snug ${r.action.severity === "high" ? "font-medium text-amber-950" : "text-slate-700"}`}>
      {r.action.text}
    </p>
  );

  return [
    {
      metric: "Completion Date",
      baseline: completionCell(base),
      simulated: completionCell(sim),
      change: (
        <Pill trend={dateTrend}>
          {!sim.feasible ? "Blocked" : dateDelta === 0 ? "No change" : `${signedDays(dateDelta)} ${dateDelta > 0 ? "later" : "earlier"}`}
        </Pill>
      ),
    },
    {
      metric: "Critical Bottleneck",
      baseline: bottleneckCell(base),
      simulated: bottleneckCell(sim),
      change: !bottleneckChanged ? (
        <Pill trend="same">Same task</Pill>
      ) : (
        <Pill trend={bottleneckGrew ? "worse" : "better"}>Shifted</Pill>
      ),
    },
    {
      metric: "Risk Score",
      baseline: riskCell(base),
      simulated: riskCell(sim),
      change: <Pill trend={riskTrend}>{riskDelta === 0 ? "No change" : `${riskDelta > 0 ? "+" : "−"}${Math.abs(riskDelta)} pts`}</Pill>,
    },
    {
      metric: "Action Required",
      baseline: actionCell(base),
      simulated: actionCell(sim),
      change:
        actionDelta > 0 ? (
          <Pill trend={sim.action.severity === "high" ? "critical" : "worse"}>Escalated</Pill>
        ) : actionDelta < 0 ? (
          <Pill trend="better">Relaxed</Pill>
        ) : (
          <Pill trend="same">{sim.action.text === base.action.text ? "Unchanged" : "Revised"}</Pill>
        ),
    },
  ];
}

function ComparisonTable({ base, sim }: { base: SimulationResult; sim: SimulationResult }) {
  const rows = buildRows(base, sim);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            <th scope="col" className="w-36 border-b border-slate-200 pb-3 pr-4 font-semibold">Metric</th>
            <th scope="col" className="border-b border-slate-200 pb-3 pr-4 font-semibold">Baseline plan</th>
            <th scope="col" className="border-b border-slate-200 bg-amber-50/60 px-3 pb-3 pt-2 font-semibold text-amber-900">
              Simulated
            </th>
            <th scope="col" className="w-32 border-b border-slate-200 pb-3 pl-4 text-right font-semibold">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const last = i === rows.length - 1;
            const cell = last ? "" : "border-b border-slate-100";
            return (
              <tr key={row.metric} className="align-top">
                <th scope="row" className={`py-4 pr-4 text-[13px] font-medium text-slate-600 ${cell}`}>
                  {row.metric}
                </th>
                <td className={`py-4 pr-4 ${cell}`}>{row.baseline}</td>
                <td className={`bg-amber-50/60 px-3 py-4 ${cell}`}>{row.simulated}</td>
                <td className={`py-4 pl-4 text-right ${cell}`}>{row.change}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MiniTimeline({ base, sim }: { base: SimulationResult; sim: SimulationResult }) {
  if (!sim.feasible) return null;
  const span = Math.max(base.completion, sim.completion, base.deadline, sim.deadline) + 1;
  const pct = (d: number) => `${(d / span) * 100}%`;
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Simulated schedule</p>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-slate-900" />Critical path</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-slate-300" />Other</span>
          <span className="flex items-center gap-1.5"><span className="h-3 border-l-2 border-amber-500" />Deadline</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {sim.tasks.map((t) => {
          const critical = sim.criticalPath.includes(t.id);
          const isBottleneck = sim.bottleneck?.task.id === t.id;
          return (
            <div key={t.id} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-[12px] text-slate-600">{t.name}</span>
              <div className="relative h-4 flex-1">
                <div
                  className={`absolute inset-y-0.5 rounded-sm transition-all duration-500 ${
                    isBottleneck ? "bg-amber-400" : critical ? "bg-slate-900" : "bg-slate-300"
                  }`}
                  style={{ left: pct(t.start), width: pct(t.effectiveDuration) }}
                />
                <div className="absolute inset-y-[-3px] border-l-2 border-amber-500 transition-all duration-500" style={{ left: pct(sim.deadline) }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═════════════════════════════════ Main panel ═════════════════════════════════ */

export default function WhatIfSimulatorPanel() {
  const [plan, setPlan] = useState<Scenario>(EMPTY_SCENARIO); // committed project plan
  const [draft, setDraft] = useState<Scenario>(EMPTY_SCENARIO); // scenario being explored
  const [appliedAt, setAppliedAt] = useState<Date | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const baseline = useMemo(() => simulate(plan), [plan]);
  const simulated = useMemo(() => simulate(draft), [draft]);

  const dirty = !sameScenario(plan, draft);
  const planModified = !sameScenario(plan, EMPTY_SCENARIO);
  const changeCount =
    Number(plan.deadlineShift !== draft.deadlineShift) +
    Number(plan.scopeIncrease !== draft.scopeIncrease) +
    MEMBERS.filter((m) => plan.departed.includes(m.id) !== draft.departed.includes(m.id)).length;

  const applyScenario = () => {
    setPlan(draft);
    setAppliedAt(new Date());
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setAppliedAt(null), 3500);
  };

  const resetSimulation = () => setDraft(plan);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 font-sans text-slate-700 antialiased sm:px-8">
      <section className={`mx-auto max-w-6xl overflow-hidden rounded-xl border border-slate-200 bg-white ${SHADOW_XS}`}>
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">What-If Scenario Simulator</h2>
            <p className="mt-1 text-sm text-slate-600">
              Test deadline, staffing and scope changes against the current plan before committing to them.
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition-colors ${
              dirty ? "bg-amber-400 text-amber-950 ring-amber-500" : "bg-slate-100 text-slate-600 ring-slate-200"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${dirty ? "bg-amber-950" : "bg-slate-400"}`} />
            {dirty ? `Simulating ${changeCount} change${changeCount === 1 ? "" : "s"}` : "Matches project plan"}
          </span>
        </header>

        <div className="grid lg:grid-cols-[minmax(320px,380px)_1fr]">
          {/* Controls */}
          <aside className="border-b border-slate-200 lg:border-b-0 lg:border-r">
            <ControlPanel draft={draft} onChange={setDraft} deadlineLabel={formatDate(simulated.deadline)} />
          </aside>

          {/* Results */}
          <div className="space-y-6 p-6">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Completion", value: formatDate(simulated.completion), warn: simulated.buffer < 0 },
                {
                  label: "Buffer",
                  value: simulated.feasible ? signedDays(simulated.buffer) : "n/a",
                  warn: simulated.buffer < 0,
                },
                { label: "Risk score", value: `${simulated.risk.score}/100`, warn: simulated.risk.level !== "Low" },
              ].map((s) => (
                <div key={s.label} className={`rounded-lg border px-4 py-3 ${s.warn ? "border-amber-300 bg-amber-50/50" : "border-slate-200"}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{s.label}</p>
                  <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums text-slate-900">{s.value}</p>
                </div>
              ))}
            </div>

            <ComparisonTable base={baseline} sim={simulated} />
            <MiniTimeline base={baseline} sim={simulated} />
          </div>
        </div>

        {/* Footer / CTAs */}
        <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-slate-600" role="status">
            {appliedAt ? (
              <span className="font-medium text-slate-900">
                Scenario applied to project plan at{" "}
                {appliedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.
              </span>
            ) : dirty ? (
              "Baseline reflects the current project plan. Nothing is saved until you apply."
            ) : planModified ? (
              <>
                Plan includes applied changes.{" "}
                <button
                  type="button"
                  onClick={() => {
                    setPlan(EMPTY_SCENARIO);
                    setDraft(EMPTY_SCENARIO);
                  }}
                  className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
                >
                  Restore original plan
                </button>
              </>
            ) : (
              "Adjust a control to start a simulation."
            )}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={resetSimulation}
              disabled={!dirty}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset Simulation
            </button>
            <button
              type="button"
              onClick={applyScenario}
              disabled={!dirty || !simulated.feasible}
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Apply Scenario to Project Plan
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
