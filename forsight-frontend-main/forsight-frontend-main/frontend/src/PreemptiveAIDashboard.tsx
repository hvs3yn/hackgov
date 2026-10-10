import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/* ─────────────────────────────── Types ─────────────────────────────── */

type MemberId = "anar" | "leyla" | "elvin";
type Phase = "base" | "mitigated";
type StrategyState = "idle" | "applying" | "applied";

type TaskStatus =
  | "delayed"
  | "decoupled"
  | "blocked"
  | "at-risk"
  | "in-progress"
  | "unblocked"
  | "on-track"
  | "done";

/** A value that differs before and after the mitigation is applied. */
interface Phased<T> {
  base: T;
  mitigated: T;
}

interface Member {
  id: MemberId;
  name: string;
  role: string;
  initials: string;
  load: Phased<number>; // effective utilisation %
  note: Phased<string>;
}

interface Task {
  id: string;
  title: string;
  owner: MemberId;
  status: Phased<TaskStatus>;
  dueOffset: number; // original due, days from today
}

interface ChainNode {
  taskId: string;
  step: string;
  title: string;
  owner: MemberId;
  originalEst: number; // days from today
  predictedEst: Phased<number>;
  status: Phased<TaskStatus>;
  statusDetail: Phased<string>;
  dependency: Phased<string>;
  dependencyClear: Phased<boolean>;
}

interface Link {
  label: Phased<string>;
}

interface Metrics {
  health: number;
  cascadeDelay: number;
  odds: number;
  riskLabel: string;
}

/* ─────────────────────────────── Data ─────────────────────────────── */

const PROJECT = {
  name: "Campus Services API",
  milestone: "Milestone 2 · Integration",
  deadlineOffset: 10,
  tasksMonitored: 8,
};

const METRICS: Phased<Metrics> = {
  base: { health: 45, cascadeDelay: 3.5, odds: 28, riskLabel: "Critical Risk" },
  mitigated: { health: 86, cascadeDelay: 0, odds: 88, riskLabel: "Healthy" },
};

const MEMBERS: Member[] = [
  {
    id: "anar",
    name: "Anar",
    role: "Backend",
    initials: "AN",
    load: { base: 100, mitigated: 92 },
    note: { base: "3 days behind on Auth & Schema", mitigated: "Focused on Auth & Schema, contract frozen" },
  },
  {
    id: "leyla",
    name: "Leyla",
    role: "Frontend",
    initials: "LE",
    load: { base: 35, mitigated: 85 },
    note: { base: "Idle on integration, waiting on API", mitigated: "Integrating UI against MSW mocks" },
  },
  {
    id: "elvin",
    name: "Elvin",
    role: "QA & Docs",
    initials: "EL",
    load: { base: 20, mitigated: 80 },
    note: { base: "Nothing testable yet", mitigated: "Writing E2E suites against contract" },
  },
];

const TASKS: Task[] = [
  { id: "T-01", title: "Backend API Authorization & Schema", owner: "anar", dueOffset: 4, status: { base: "delayed", mitigated: "decoupled" } },
  { id: "T-02", title: "Database migrations & seed data", owner: "anar", dueOffset: -2, status: { base: "done", mitigated: "done" } },
  { id: "T-03", title: "Frontend API Integration", owner: "leyla", dueOffset: 7, status: { base: "blocked", mitigated: "in-progress" } },
  { id: "T-04", title: "Dashboard UI components", owner: "leyla", dueOffset: 5, status: { base: "on-track", mitigated: "on-track" } },
  { id: "T-05", title: "E2E Integration Testing", owner: "elvin", dueOffset: 9, status: { base: "blocked", mitigated: "unblocked" } },
  { id: "T-06", title: "API reference documentation", owner: "elvin", dueOffset: 8, status: { base: "at-risk", mitigated: "in-progress" } },
  { id: "T-07", title: "Login & session flow UI", owner: "leyla", dueOffset: 6, status: { base: "at-risk", mitigated: "on-track" } },
  { id: "T-08", title: "CI deployment pipeline", owner: "anar", dueOffset: 9, status: { base: "on-track", mitigated: "on-track" } },
];

const CHAIN: ChainNode[] = [
  {
    taskId: "T-01",
    step: "Root cause",
    title: "Backend API",
    owner: "anar",
    originalEst: 4,
    predictedEst: { base: 7, mitigated: 7 },
    status: { base: "delayed", mitigated: "decoupled" },
    statusDetail: { base: "3 Days Delayed", mitigated: "Still late, no longer blocking" },
    dependency: { base: "No upstream dependency", mitigated: "No upstream dependency" },
    dependencyClear: { base: true, mitigated: true },
  },
  {
    taskId: "T-03",
    step: "Cascade 1",
    title: "Frontend API Integration",
    owner: "leyla",
    originalEst: 7,
    predictedEst: { base: 10.5, mitigated: 7.5 },
    status: { base: "blocked", mitigated: "in-progress" },
    statusDetail: { base: "Blocked, waiting on Node 1", mitigated: "Building against mock endpoints" },
    dependency: { base: "Needs /auth and /users endpoints", mitigated: "Served by MSW from OpenAPI contract" },
    dependencyClear: { base: false, mitigated: true },
  },
  {
    taskId: "T-05",
    step: "Cascade 2",
    title: "E2E Integration Testing",
    owner: "elvin",
    originalEst: 9,
    predictedEst: { base: 12.5, mitigated: 9.5 },
    status: { base: "blocked", mitigated: "unblocked" },
    statusDetail: { base: "Blocked, high failure risk", mitigated: "Suites run on mocks, live swap later" },
    dependency: { base: "Needs a working UI and live API", mitigated: "Mocked contract, live swap in 0.5 day" },
    dependencyClear: { base: false, mitigated: true },
  },
];

const LINKS: Link[] = [
  { label: { base: "blocks", mitigated: "mocked" } },
  { label: { base: "blocks", mitigated: "parallel" } },
];

const DETECTION_SIGNALS = [
  { label: "Commit velocity", value: "−62% vs. sprint avg" },
  { label: "Merged PRs (3 days)", value: "0 of 4 planned" },
  { label: "OpenAPI schema", value: "Still in draft" },
];

const STRATEGY_STEPS: { text: string; owner: MemberId; effort: string }[] = [
  { text: "Freeze the OpenAPI contract for /auth and /users", owner: "anar", effort: "2h" },
  { text: "Generate MSW handlers and fixtures from the schema", owner: "leyla", effort: "0.5d" },
  { text: "Point the E2E suite at the mock layer", owner: "elvin", effort: "2h" },
  { text: "Swap mocks for the live API once it ships", owner: "leyla", effort: "0.5d" },
];

/* ─────────────────────────────── Style maps ─────────────────────────────── */

// Equivalent to Tailwind v4 `shadow-xs`; written out so it also works on v3.
const SHADOW_XS = "shadow-[0_1px_2px_0_rgb(15_23_42/0.05)]";

const STATUS_META: Record<TaskStatus, { label: string; className: string }> = {
  delayed: { label: "Delayed", className: "bg-amber-400 text-amber-950 ring-amber-500" },
  decoupled: { label: "Delayed · Decoupled", className: "bg-amber-50 text-amber-900 ring-amber-300" },
  blocked: { label: "Blocked", className: "bg-amber-50 text-amber-900 ring-amber-300" },
  "at-risk": { label: "At Risk", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  "in-progress": { label: "In Progress", className: "bg-blue-50 text-indigo-700 ring-blue-200" },
  unblocked: { label: "Unblocked", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  "on-track": { label: "On Track", className: "bg-blue-50/60 text-slate-700 ring-slate-200" },
  done: { label: "Done", className: "bg-slate-100 text-slate-500 ring-slate-200" },
};

const NODE_FRAME: Record<TaskStatus, string> = {
  delayed: "border-amber-300 bg-amber-50/70 ring-1 ring-amber-300",
  decoupled: "border-amber-200 bg-white",
  blocked: "border-slate-200 bg-slate-50/80",
  "at-risk": "border-amber-200 bg-white",
  "in-progress": "border-blue-200 bg-white",
  unblocked: "border-emerald-200 bg-white",
  "on-track": "border-slate-200 bg-white",
  done: "border-slate-200 bg-white",
};

/* ─────────────────────────────── Helpers ─────────────────────────────── */

const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

function formatEst(offset: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + Math.floor(offset));
  const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return offset % 1 !== 0 ? `${label}, PM` : label;
}

function formatDays(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1);
}

function memberById(id: MemberId): Member {
  const member = MEMBERS.find((m) => m.id === id);
  if (!member) throw new Error(`Unknown member: ${id}`);
  return member;
}

/* ─────────────────────────────── Primitives ─────────────────────────────── */

function StatusBadge({ status, size = "sm" }: { status: TaskStatus; size?: "sm" | "xs" }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md font-semibold ring-1 ring-inset transition-colors duration-300 ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-1.5 py-0.5 text-[11px]"
      } ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white ${SHADOW_XS} ${className}`}>{children}</section>
  );
}

function PanelHeader({ eyebrow, title, aside }: { eyebrow?: string; title: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5">
      <div>
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{eyebrow}</p>
        )}
        <h2 className="mt-1 text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
      </div>
      {aside}
    </div>
  );
}

function Avatar({ member, tone = "navy" }: { member: Member; tone?: "navy" | "amber" }) {
  return (
    <span
      title={`${member.name} (${member.role})`}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ring-2 ring-white ${
        tone === "amber" ? "bg-amber-400 text-amber-950" : "bg-blue-50 text-indigo-700"
      }`}
    >
      {member.initials}
    </span>
  );
}

function HealthRing({ value, critical }: { value: number; critical: boolean }) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative h-[76px] w-[76px] shrink-0">
      <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="38" cy="38" r={radius} fill="none" strokeWidth="7" className="stroke-slate-100" />
        <circle
          cx="38"
          cy="38"
          r={radius}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
          className={`transition-all duration-700 ease-out ${critical ? "stroke-amber-400" : "stroke-indigo-700"}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums tracking-tight text-slate-900">
        {value}%
      </span>
    </div>
  );
}

function Icon({ name, className = "h-4 w-4" }: { name: "arrow" | "check" | "alert" | "spark" | "spinner" | "undo"; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      {name === "arrow" && <path d="M4 10h11m0 0-4-4m4 4-4 4" {...common} />}
      {name === "check" && <path d="m5 10.5 3.2 3L15 6.5" {...common} />}
      {name === "alert" && (
        <>
          <path d="M10 7v3.5m0 2.75h.01" {...common} strokeWidth={2} />
          <path d="M8.6 3.3 2.4 14.2A1.6 1.6 0 0 0 3.8 16.6h12.4a1.6 1.6 0 0 0 1.4-2.4L11.4 3.3a1.6 1.6 0 0 0-2.8 0Z" {...common} strokeWidth={1.5} />
        </>
      )}
      {name === "spark" && <path d="M10 3v3m0 8v3m7-7h-3M6 10H3m11.5-4.5-2 2m-5 5-2 2m9 0-2-2m-5-5-2-2" {...common} />}
      {name === "spinner" && <path d="M10 3a7 7 0 1 0 7 7" {...common} className="origin-center animate-spin" />}
      {name === "undo" && <path d="M7 6 4 9l3 3M4 9h8a4 4 0 0 1 0 8h-2" {...common} />}
    </svg>
  );
}

/* ─────────────────────────────── Sections ─────────────────────────────── */

function CascadeNode({ node, phase }: { node: ChainNode; phase: Phase }) {
  const owner = memberById(node.owner);
  const status = node.status[phase];
  const predicted = node.predictedEst[phase];
  const variance = predicted - node.originalEst;
  const isRoot = node.step === "Root cause";
  const clear = node.dependencyClear[phase];

  return (
    <article className={`relative flex h-full flex-col rounded-xl border p-5 transition-colors duration-500 ${NODE_FRAME[status]}`}>
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${
            isRoot ? "text-amber-700" : "text-slate-400"
          }`}
        >
          {node.step}
        </span>
        <StatusBadge status={status} />
      </div>

      <h3 className="mt-3 text-[15px] font-semibold tracking-tight text-slate-900">{node.title}</h3>
      <p className={`mt-1 text-[13px] ${status === "delayed" || status === "blocked" ? "text-amber-900" : "text-slate-500"}`}>
        {node.statusDetail[phase]}
      </p>

      <dl className="mt-5 space-y-3 border-t border-slate-200/80 pt-4 text-[13px]">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">Assigned</dt>
          <dd className="flex items-center gap-2 font-medium text-slate-900">
            <Avatar member={owner} tone={isRoot && phase === "base" ? "amber" : "navy"} />
            {owner.name} <span className="font-normal text-slate-400">· {owner.role}</span>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">Original EST</dt>
          <dd className="tabular-nums text-slate-700">{formatEst(node.originalEst)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">AI Predicted EST</dt>
          <dd className="flex items-center gap-2 tabular-nums">
            <span className="font-semibold text-slate-900">{formatEst(predicted)}</span>
            {variance > 0 ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
                +{formatDays(variance)}d
              </span>
            ) : (
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700">On EST</span>
            )}
          </dd>
        </div>
      </dl>

      <div
        className={`mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12px] leading-snug transition-colors duration-500 ${
          clear ? "bg-blue-50/60 text-slate-700" : "bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200"
        }`}
      >
        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${clear ? "bg-indigo-700" : "bg-amber-500"}`} />
        <span>
          <span className="font-semibold">Dependency: </span>
          {node.dependency[phase]}
        </span>
      </div>
    </article>
  );
}

function CascadeLink({ link, phase }: { link: Link; phase: Phase }) {
  const blocked = phase === "base";
  return (
    <div className="flex items-center justify-center py-1 lg:flex-col lg:py-0">
      <div className="flex flex-col items-center gap-1.5">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors duration-500 ${
            blocked ? "bg-amber-400 text-amber-950" : "bg-blue-50 text-indigo-700"
          }`}
        >
          {link.label[phase]}
        </span>
        <div className="flex items-center">
          <span
            className={`hidden h-0 w-10 border-t-2 lg:block ${
              blocked ? "border-amber-400" : "border-dashed border-indigo-300"
            }`}
          />
          <Icon
            name="arrow"
            className={`h-5 w-5 rotate-90 lg:-ml-1.5 lg:rotate-0 ${blocked ? "text-amber-500" : "text-indigo-400"}`}
          />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Main ─────────────────────────────── */

export default function PreemptiveAIDashboard() {
  const [strategy, setStrategy] = useState<StrategyState>("idle");
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const phase: Phase = strategy === "applied" ? "mitigated" : "base";
  const metrics = METRICS[phase];
  const critical = phase === "base";
  const bottleneckOwner = memberById("anar");
  const blockedCount = TASKS.filter((t) => t.status[phase] === "blocked").length;
  const atRiskCount = TASKS.filter((t) => ["blocked", "at-risk", "delayed"].includes(t.status[phase])).length;

  const applyStrategy = () => {
    if (strategy !== "idle") return;
    setStrategy("applying");
    timer.current = window.setTimeout(() => setStrategy("applied"), 1200);
  };

  const revertStrategy = () => setStrategy("idle");

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-700 antialiased">
      {/* ───────── System banner ───────── */}
      <div className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-[13px] sm:px-8">
          <p className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="font-semibold">Foresight Active</span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-300">
              Monitoring {MEMBERS.length} Team Members &amp; {PROJECT.tasksMonitored} Tasks
            </span>
          </p>
          <p className="text-slate-400">Last scan 2 min ago</p>
        </div>
      </div>

      {/* ───────── Header ───────── */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-8">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Icon name="spark" className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900">{PROJECT.name}</h1>
              <p className="text-[13px] text-slate-500">
                {PROJECT.milestone} <span className="text-slate-300">/</span> Deadline {formatEst(PROJECT.deadlineOffset)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex -space-x-1.5">
              {MEMBERS.map((m) => (
                <Avatar key={m.id} member={m} />
              ))}
            </div>
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition-colors duration-500 ${
                critical ? "bg-amber-400 text-amber-950 ring-amber-500" : "bg-blue-50 text-indigo-700 ring-blue-200"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${critical ? "bg-amber-950" : "bg-indigo-700"}`} />
              {critical ? `${atRiskCount} tasks at risk` : "Cascade contained"}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-8">
        {/* ───────── Live health metrics ───────── */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr]">
          <Panel className="flex items-center gap-5 p-5">
            <HealthRing value={metrics.health} critical={critical} />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Project Health</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{metrics.health}%</p>
              <span
                className={`mt-2 inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset transition-colors duration-500 ${
                  critical ? "bg-amber-400 text-amber-950 ring-amber-500" : "bg-blue-50 text-indigo-700 ring-blue-200"
                }`}
              >
                {metrics.riskLabel}
              </span>
            </div>
          </Panel>

          <Panel className={`p-5 transition-colors duration-500 ${critical ? "!border-amber-300" : ""}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Estimated Cascade Delay</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">
              {metrics.cascadeDelay > 0 ? `+${formatDays(metrics.cascadeDelay)} Days` : "0 Days"}
              <span className="ml-1.5 text-sm font-medium text-slate-500">expected</span>
            </p>
            {critical ? (
              <p className="mt-2 flex items-start gap-1.5 text-[13px] text-amber-900">
                <Icon name="alert" className="mt-px h-4 w-4 shrink-0 text-amber-500" />
                Deadline {formatEst(PROJECT.deadlineOffset)} will be missed. Final task lands {formatEst(CHAIN[2].predictedEst.base)}.
              </p>
            ) : (
              <p className="mt-2 flex items-start gap-1.5 text-[13px] text-indigo-700">
                <Icon name="check" className="mt-px h-4 w-4 shrink-0" />
                On track with a 0.5-day buffer before {formatEst(PROJECT.deadlineOffset)}.
              </p>
            )}
            <div className="mt-4 flex gap-1" aria-hidden="true">
              {Array.from({ length: PROJECT.deadlineOffset + 3 }, (_, i) => {
                const lastDay = CHAIN[2].predictedEst[phase];
                const over = i >= PROJECT.deadlineOffset && i < lastDay;
                const used = i < Math.min(lastDay, PROJECT.deadlineOffset);
                return (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${
                      over ? "bg-amber-400" : used ? "bg-slate-900" : "bg-slate-100"
                    } ${i === PROJECT.deadlineOffset ? "ml-1.5" : ""}`}
                  />
                );
              })}
            </div>
            <p className="mt-1.5 flex justify-between text-[11px] text-slate-400">
              <span>Today</span>
              <span>Deadline</span>
            </p>
          </Panel>

          <Panel
            className={`p-5 transition-colors duration-500 md:col-span-2 xl:col-span-1 ${
              critical ? "!border-amber-300 !bg-amber-50/50" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Primary Bottleneck</p>
              <StatusBadge status={TASKS[0].status[phase]} size="xs" />
            </div>
            <div className="mt-2.5 flex items-start gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-500 ${
                  critical ? "bg-amber-400 text-amber-950" : "bg-blue-50 text-indigo-700"
                }`}
              >
                <Icon name={critical ? "alert" : "check"} className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold tracking-tight text-slate-900">{TASKS[0].title}</h3>
                <p className="mt-0.5 text-[13px] text-slate-600">
                  Assigned to <span className="font-semibold text-slate-900">{bottleneckOwner.name} ({bottleneckOwner.role})</span>
                  {critical ? " · blocking 2 downstream tasks" : " · downstream decoupled"}
                </p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-amber-200/70 pt-3">
              {DETECTION_SIGNALS.map((s) => (
                <div key={s.label}>
                  <dt className="text-[11px] text-slate-500">{s.label}</dt>
                  <dd className="mt-0.5 text-[13px] font-semibold text-slate-900">{s.value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>

        {/* ───────── Cascade visualizer ───────── */}
        <Panel>
          <PanelHeader
            eyebrow="Bottleneck & Cascade"
            title={critical ? "One late API is about to stall the whole team" : "Cascade broken: downstream work runs in parallel"}
            aside={
              <div className="flex items-center gap-4 text-[12px] text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 bg-amber-400" />
                  Hard dependency
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-4 border-t-2 border-dashed border-indigo-300" />
                  Decoupled
                </span>
              </div>
            }
          />

          <div className="px-6 pb-6 pt-5">
            {/* Mock layer bar spans the two downstream nodes once applied */}
            <div className="hidden lg:grid lg:grid-cols-[1fr_5rem_1fr_5rem_1fr]">
              <div />
              <div />
              <div
                className={`col-span-3 mb-3 flex items-center justify-between rounded-lg border px-4 py-2 text-[12px] transition-all duration-500 ${
                  phase === "mitigated"
                    ? "border-blue-200 bg-blue-50/60 text-indigo-700 opacity-100"
                    : "pointer-events-none border-transparent opacity-0"
                }`}
              >
                <span className="font-semibold">Mock Service Worker layer</span>
                <span className="font-mono text-[11px] text-indigo-700/80">POST /auth/token · GET /users · GET /users/:id</span>
              </div>
            </div>

            <div className="grid grid-cols-1 items-stretch lg:grid-cols-[1fr_5rem_1fr_5rem_1fr]">
              {CHAIN.map((node, i) => (
                <div key={node.taskId} className="contents">
                  {i > 0 && <CascadeLink link={LINKS[i - 1]} phase={phase} />}
                  <CascadeNode node={node} phase={phase} />
                </div>
              ))}
            </div>

            <p className="mt-5 text-[13px] text-slate-500">
              {critical ? (
                <>
                  A status board would show <span className="font-medium text-slate-700">one</span> delayed task. Foresight sees{" "}
                  <span className="font-semibold text-amber-900">{blockedCount} blocked tasks</span> and two idle teammates behind it.
                </>
              ) : (
                <>
                  Backend is still {formatDays(CHAIN[0].predictedEst.mitigated - CHAIN[0].originalEst)} days late, but it's off the critical
                  path. Integration cost when the live API lands: about 0.5 day.
                </>
              )}
            </p>
          </div>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* ───────── AI mitigation ───────── */}
          <Panel
            className={`lg:col-span-7 transition-colors duration-500 ${
              phase === "mitigated" ? "!border-emerald-200" : "!border-amber-300"
            }`}
          >
            <div
              className={`flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-b px-6 py-3 transition-colors duration-500 ${
                phase === "mitigated" ? "border-emerald-100 bg-emerald-50/60" : "border-amber-200 bg-amber-50"
              }`}
            >
              <span
                className={`text-[11px] font-bold uppercase tracking-[0.08em] ${
                  phase === "mitigated" ? "text-emerald-800" : "text-amber-900"
                }`}
              >
                {phase === "mitigated" ? "Strategy active" : "Recommended action"}
              </span>
              <span className="inline-flex items-center gap-2 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 ring-1 ring-inset ring-slate-200">
                On-Time Completion Odds:
                <span className="tabular-nums text-amber-700">{METRICS.base.odds}%</span>
                <Icon name="arrow" className="h-3.5 w-3.5 text-slate-400" />
                <span className="tabular-nums text-indigo-700">{METRICS.mitigated.odds}%</span>
              </span>
            </div>

            <div className="px-6 py-6">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">AI Preventative Strategy: Generate Mock API</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Deploy{" "}
                <span className="rounded bg-amber-100 px-1 font-semibold text-amber-950">Mock Service Worker (MSW)</span>{" "}
                endpoints to unblock <span className="font-semibold text-slate-900">Leyla (Frontend)</span> and{" "}
                <span className="font-semibold text-slate-900">Elvin (QA)</span> immediately.
              </p>

              <ol className="mt-5 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {STRATEGY_STEPS.map((s, i) => {
                  const done = phase === "mitigated" && i < 3;
                  return (
                    <li key={s.text} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors duration-500 ${
                          done ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-900 text-white"
                        }`}
                      >
                        {done ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                      <span className={`flex-1 ${done ? "text-slate-500" : "text-slate-800"}`}>{s.text}</span>
                      <span className="hidden text-[12px] text-slate-500 sm:inline">{memberById(s.owner).name}</span>
                      <span className="w-10 text-right font-mono text-[12px] text-slate-400">{s.effort}</span>
                    </li>
                  );
                })}
              </ol>

              <div className="mt-6 grid grid-cols-3 divide-x divide-slate-200 rounded-lg bg-slate-50 py-3 text-center">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Days recovered</p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">3.0</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Hours unblocked</p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">26h</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Setup cost</p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">~1 day</p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[12px] text-slate-500" role="status">
                  {strategy === "idle" && "Downstream tasks stay blocked until this is applied."}
                  {strategy === "applying" && "Generating handlers from OpenAPI contract…"}
                  {strategy === "applied" && "Applied. 2 tasks unblocked, deadline back within reach."}
                </p>
                {strategy === "applied" ? (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={revertStrategy}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                    >
                      <Icon name="undo" className="h-4 w-4" />
                      Revert
                    </button>
                    <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
                      <Icon name="check" />
                      Mock API Strategy Active
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={applyStrategy}
                    disabled={strategy === "applying"}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:bg-slate-700"
                  >
                    {strategy === "applying" ? (
                      <>
                        <Icon name="spinner" />
                        Deploying mocks…
                      </>
                    ) : (
                      <>
                        Apply Mock API Strategy
                        <Icon name="arrow" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </Panel>

          {/* ───────── Team & tasks ───────── */}
          <div className="space-y-6 lg:col-span-5">
            <Panel>
              <PanelHeader eyebrow="Team" title="Effective utilisation" />
              <ul className="space-y-4 px-6 pb-6 pt-4">
                {MEMBERS.map((m) => {
                  const load = m.load[phase];
                  const idle = load < 50;
                  return (
                    <li key={m.id}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2.5">
                          <Avatar member={m} tone={m.id === "anar" && critical ? "amber" : "navy"} />
                          <span>
                            <span className="block text-sm font-medium text-slate-900">
                              {m.name} <span className="font-normal text-slate-400">· {m.role}</span>
                            </span>
                            <span className={`block text-[12px] ${idle ? "text-amber-800" : "text-slate-500"}`}>{m.note[phase]}</span>
                          </span>
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-slate-900">{load}%</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${idle ? "bg-amber-400" : "bg-slate-900"}`}
                          style={{ width: `${load}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>

            <Panel>
              <PanelHeader
                eyebrow="Monitored tasks"
                title={`${PROJECT.tasksMonitored} tasks`}
                aside={
                  <span className="text-[12px] text-slate-500">
                    <span className="font-semibold tabular-nums text-slate-900">{blockedCount}</span> blocked
                  </span>
                }
              />
              <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
                {TASKS.map((t) => {
                  const status = t.status[phase];
                  return (
                    <li
                      key={t.id}
                      className={`flex items-center gap-3 px-6 py-2.5 transition-colors duration-500 ${
                        status === "delayed" ? "bg-amber-50/60" : ""
                      }`}
                    >
                      <span className="w-9 shrink-0 font-mono text-[11px] text-slate-400">{t.id}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-slate-800">{t.title}</span>
                      <span className="hidden text-[12px] text-slate-500 sm:inline">{memberById(t.owner).name}</span>
                      <StatusBadge status={status} size="xs" />
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>
        </div>
      </main>
    </div>
  );
}
