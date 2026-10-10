import { useMemo, useState } from "react";
import type { ReactNode } from "react";

/* ═════════════════════════════════ Types ═════════════════════════════════ */

type MemberId = "anar" | "leyla" | "elvin";
type EventKind = "prevented" | "resolved";
type ImpactTone = "amber" | "navy" | "neutral";

interface Member {
  id: MemberId;
  name: string;
  role: string;
  initials: string;
}

interface Kpi {
  id: string;
  label: string;
  value: string;
  unit?: string;
  caption: string;
  trend: string;
  accent: "amber" | "navy";
  meter?: number; // 0–100, optional progress meter
}

interface MilestoneForecast {
  id: string;
  name: string;
  /** Delivery variance vs. plan in days, positive = late. */
  predicted: number;
  actual: number;
}

interface ImpactPill {
  label: string;
  tone: ImpactTone;
}

interface AuditEvent {
  id: string;
  kind: EventKind;
  title: string;
  detail: string;
  timestamp: string; // ISO
  member: MemberId;
  impacts: ImpactPill[];
}

/* ═════════════════════════════════ Data ═════════════════════════════════ */

const MEMBERS: Record<MemberId, Member> = {
  anar: { id: "anar", name: "Anar", role: "Backend", initials: "AN" },
  leyla: { id: "leyla", name: "Leyla", role: "Frontend", initials: "LE" },
  elvin: { id: "elvin", name: "Elvin", role: "QA & Docs", initials: "EL" },
};

const KPIS: Kpi[] = [
  {
    id: "prevented",
    label: "Risks Prevented",
    value: "12",
    caption: "Bottlenecks caught early",
    trend: "+3 vs. last sprint",
    accent: "amber",
  },
  {
    id: "time-saved",
    label: "Time Saved",
    value: "+8.5",
    unit: "days",
    caption: "Saved via early interventions",
    trend: "≈ 1.4 days per sprint",
    accent: "amber",
  },
  {
    id: "accuracy",
    label: "AI Accuracy Rate",
    value: "94",
    unit: "%",
    caption: "Predictive accuracy (±1 day)",
    trend: "17 of 18 forecasts",
    accent: "navy",
    meter: 94,
  },
  {
    id: "on-time",
    label: "On-Time Delivery Success Rate",
    value: "88",
    unit: "%",
    caption: "Milestones delivered on plan",
    trend: "Up from 61% before AI",
    accent: "navy",
    meter: 88,
  },
];

const FORECASTS: MilestoneForecast[] = [
  { id: "m1", name: "Requirements sign-off", predicted: 0, actual: 0 },
  { id: "m2", name: "Data model & migrations", predicted: 1, actual: 1 },
  { id: "m3", name: "Auth API", predicted: 2, actual: 1.5 },
  { id: "m4", name: "UI integration", predicted: 0.5, actual: 0.5 },
  { id: "m5", name: "E2E test pass", predicted: 0, actual: 0.5 },
  { id: "m6", name: "Release candidate", predicted: -0.5, actual: 0 },
];

const EVENTS: AuditEvent[] = [
  {
    id: "e7",
    kind: "prevented",
    title: "Mock API Deployed",
    detail: "Prevented 3-day delay on Frontend. Leyla integrated against MSW handlers while auth endpoints were finished.",
    timestamp: "2026-10-08T14:20:00",
    member: "leyla",
    impacts: [
      { label: "Prevented 3-day delay", tone: "amber" },
      { label: "+3.0 days saved", tone: "neutral" },
    ],
  },
  {
    id: "e6",
    kind: "prevented",
    title: "Task Reassigned",
    detail: "Prevented QA bottleneck. API docs moved from Elvin to Anar so E2E prep could start on schedule.",
    timestamp: "2026-10-06T10:05:00",
    member: "elvin",
    impacts: [
      { label: "QA bottleneck prevented", tone: "amber" },
      { label: "+1.5 days saved", tone: "neutral" },
    ],
  },
  {
    id: "e5",
    kind: "resolved",
    title: "Milestone Resolved: Data model & migrations",
    detail: "Delivered 1 day late, matching the AI forecast made 6 days earlier.",
    timestamp: "2026-10-03T17:40:00",
    member: "anar",
    impacts: [
      { label: "Milestone closed", tone: "navy" },
      { label: "Forecast exact", tone: "neutral" },
    ],
  },
  {
    id: "e4",
    kind: "prevented",
    title: "Schema Review Fast-Tracked",
    detail: "Flagged a 2-day review queue on the auth schema; review was pulled into the same day.",
    timestamp: "2026-10-01T09:15:00",
    member: "anar",
    impacts: [
      { label: "Prevented 2-day delay", tone: "amber" },
      { label: "+2.0 days saved", tone: "neutral" },
    ],
  },
  {
    id: "e3",
    kind: "prevented",
    title: "Test Data Seeded Early",
    detail: "Predicted E2E suite would stall on missing fixtures; seed data generated from the contract ahead of time.",
    timestamp: "2026-09-29T15:30:00",
    member: "elvin",
    impacts: [
      { label: "Prevented 1-day delay", tone: "amber" },
      { label: "+1.0 day saved", tone: "neutral" },
    ],
  },
  {
    id: "e2",
    kind: "resolved",
    title: "Milestone Resolved: Requirements sign-off",
    detail: "Closed on plan. No risks were open at sign-off.",
    timestamp: "2026-09-26T12:00:00",
    member: "leyla",
    impacts: [{ label: "Milestone closed", tone: "navy" }],
  },
];

/* ═════════════════════════════════ Tokens ═════════════════════════════════ */

// Chart series colours: validated for CVD separation and ≥3:1 contrast on white.
const SERIES = {
  predicted: { label: "AI Predicted", color: "#D97706" }, // amber-600
  actual: { label: "Actual", color: "#4338CA" }, // indigo-700
} as const;

const SHADOW_XS = "shadow-[0_1px_2px_0_rgb(15_23_42/0.05)]";
const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500";

const PILL_STYLE: Record<ImpactTone, string> = {
  amber: "bg-amber-50 text-amber-900 ring-amber-300",
  navy: "bg-blue-50 text-slate-900 ring-blue-200",
  neutral: "bg-slate-50 text-slate-600 ring-slate-200",
};

/* ═════════════════════════════════ Helpers ═════════════════════════════════ */

function formatVariance(d: number): string {
  if (d === 0) return "On plan";
  const abs = Number.isInteger(d) ? Math.abs(d) : Math.abs(d).toFixed(1);
  return d > 0 ? `+${abs}d late` : `${abs}d early`;
}

function formatTimestamp(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

/* ═════════════════════════════════ Primitives ═════════════════════════════════ */

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-slate-200 bg-white ${SHADOW_XS} ${className}`}>{children}</section>;
}

function CardHeader({ eyebrow, title, aside }: { eyebrow: string; title: string; aside?: ReactNode }) {
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

function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
            value === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ═════════════════════════════════ KPI cards ═════════════════════════════════ */

function KpiCard({ kpi }: { kpi: Kpi }) {
  const amber = kpi.accent === "amber";
  return (
    <Card className="relative overflow-hidden p-5">
      <span className={`absolute inset-x-0 top-0 h-[3px] ${amber ? "bg-amber-400" : "bg-slate-900"}`} aria-hidden="true" />
      <p className={EYEBROW}>{kpi.label}</p>
      <p className="mt-3 flex items-baseline gap-1 text-[32px] font-semibold leading-none tracking-tight tabular-nums text-slate-900">
        {kpi.value}
        {kpi.unit && <span className="text-base font-medium text-slate-500">{kpi.unit}</span>}
      </p>
      <p className="mt-2 text-[13px] text-slate-600">{kpi.caption}</p>
      {kpi.meter !== undefined && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <div className="h-full rounded-full bg-slate-900" style={{ width: `${kpi.meter}%` }} />
        </div>
      )}
      <p
        className={`mt-3 inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
          amber ? "bg-amber-50 text-amber-900" : "bg-blue-50 text-slate-900"
        }`}
      >
        {kpi.trend}
      </p>
    </Card>
  );
}

/* ═════════════════════════════════ Predicted vs Actual (dot plot) ═════════════════════════════════ */

const DOMAIN: [number, number] = [-1, 3];
const TICKS = [-1, 0, 1, 2, 3];

function pct(v: number): string {
  return `${((v - DOMAIN[0]) / (DOMAIN[1] - DOMAIN[0])) * 100}%`;
}

function Marker({ series, value }: { series: keyof typeof SERIES; value: number }) {
  const color = SERIES[series].color;
  // Predicted = hollow ring, Actual = solid dot: shape backs up colour.
  return (
    <span
      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${series === "predicted" ? "h-3.5 w-3.5 ring-2 ring-white" : "h-2.5 w-2.5"}`}
      style={{
        left: pct(value),
        backgroundColor: series === "actual" ? color : "#FFFFFF",
        boxShadow: series === "predicted" ? `inset 0 0 0 2.5px ${color}` : undefined,
      }}
      aria-hidden="true"
    />
  );
}

function ForecastChart({ data }: { data: MilestoneForecast[] }) {
  const [active, setActive] = useState<string | null>(null);

  return (
    <div>
      {/* Legend */}
      <div className="mb-4 flex flex-wrap items-center gap-4 text-[12px] text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-white" style={{ boxShadow: `inset 0 0 0 2.5px ${SERIES.predicted.color}` }} />
          {SERIES.predicted.label}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: SERIES.actual.color }} />
          {SERIES.actual.label}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-px bg-slate-400" />
          Planned date
        </span>
      </div>

      <div className="space-y-0.5">
        {data.map((m, i) => {
          const lo = Math.min(m.predicted, m.actual);
          const hi = Math.max(m.predicted, m.actual);
          const gap = Math.abs(m.predicted - m.actual);
          const isActive = active === m.id;
          return (
            <div
              key={m.id}
              tabIndex={0}
              onMouseEnter={() => setActive(m.id)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(m.id)}
              onBlur={() => setActive(null)}
              aria-label={`${m.name}: predicted ${formatVariance(m.predicted)}, actual ${formatVariance(m.actual)}`}
              className={`relative flex items-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                isActive ? "bg-slate-50" : ""
              }`}
            >
              <span className="w-28 shrink-0 truncate py-3 pl-2 pr-3 text-[13px] text-slate-700 sm:w-44">{m.name}</span>

              <div className="relative h-10 flex-1">
                {/* Grid */}
                {TICKS.map((t) => (
                  <span
                    key={t}
                    className={`absolute inset-y-0 border-l ${t === 0 ? "border-slate-400" : "border-slate-100"}`}
                    style={{ left: pct(t) }}
                    aria-hidden="true"
                  />
                ))}
                {/* Connector */}
                {gap > 0 && (
                  <span
                    className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-slate-300"
                    style={{ left: pct(lo), width: `calc(${pct(hi)} - ${pct(lo)})` }}
                    aria-hidden="true"
                  />
                )}
                <Marker series="predicted" value={m.predicted} />
                <Marker series="actual" value={m.actual} />

                {/* Selective direct labels on the first row only */}
                {i === 0 && (
                  <span
                    className="pointer-events-none absolute -top-0.5 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-slate-500"
                    style={{ left: pct(m.actual) }}
                  >
                    Predicted = Actual
                  </span>
                )}

                {/* Tooltip */}
                {isActive && (
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full z-10 mb-1 w-44 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-lg shadow-slate-900/10"
                    style={{ left: `clamp(88px, ${pct((m.predicted + m.actual) / 2)}, calc(100% - 88px))` }}
                  >
                    <p className="text-[11px] font-medium text-slate-500">{m.name}</p>
                    <div className="mt-1.5 space-y-1 text-[12px]">
                      {(["predicted", "actual"] as const).map((s) => (
                        <p key={s} className="flex items-center gap-2">
                          <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: SERIES[s].color }} />
                          <span className="font-semibold tabular-nums text-slate-900">{formatVariance(m[s])}</span>
                          <span className="text-slate-500">{SERIES[s].label}</span>
                        </p>
                      ))}
                    </div>
                    <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-[11px] text-slate-500">
                      Forecast error <span className="font-semibold tabular-nums text-slate-900">{gap === 0 ? "0d" : `${gap}d`}</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Axis */}
      <div className="flex">
        <span className="w-28 shrink-0 sm:w-44" />
        <div className="relative mt-1 h-5 flex-1">
          {TICKS.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2 text-[11px] tabular-nums text-slate-400"
              style={{ left: pct(t) }}
            >
              {t === 0 ? "Plan" : t > 0 ? `+${t}d` : `${t}d`}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-1 text-right text-[11px] text-slate-400">Delivery variance vs. plan (days)</p>
    </div>
  );
}

function ForecastTable({ data }: { data: MilestoneForecast[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            <th scope="col" className="py-2.5 pr-4 font-semibold">Milestone</th>
            <th scope="col" className="py-2.5 pr-4 text-right font-semibold">AI Predicted</th>
            <th scope="col" className="py-2.5 pr-4 text-right font-semibold">Actual</th>
            <th scope="col" className="py-2.5 text-right font-semibold">Error</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((m) => {
            const gap = Math.abs(m.predicted - m.actual);
            return (
              <tr key={m.id}>
                <th scope="row" className="py-3 pr-4 font-medium text-slate-900">{m.name}</th>
                <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{formatVariance(m.predicted)}</td>
                <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{formatVariance(m.actual)}</td>
                <td className="py-3 text-right">
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset ${
                      gap <= 0.5 ? PILL_STYLE.navy : PILL_STYLE.amber
                    }`}
                  >
                    {gap === 0 ? "Exact" : `±${gap}d`}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ForecastCard() {
  const [view, setView] = useState<"chart" | "table">("chart");
  const meanError = FORECASTS.reduce((s, m) => s + Math.abs(m.predicted - m.actual), 0) / FORECASTS.length;

  return (
    <Card>
      <CardHeader
        eyebrow="Predicted vs Actual"
        title="Delivery forecasts by milestone"
        aside={
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: "chart", label: "Chart" },
              { value: "table", label: "Table" },
            ]}
          />
        }
      />
      <div className="px-6 py-5">{view === "chart" ? <ForecastChart data={FORECASTS} /> : <ForecastTable data={FORECASTS} />}</div>
      <footer className="grid grid-cols-3 divide-x divide-slate-200 border-t border-slate-100 bg-slate-50 px-2 py-3 text-center">
        <div>
          <p className="text-[11px] text-slate-500">Milestones tracked</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{FORECASTS.length}</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-500">Mean forecast error</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{meanError.toFixed(2)}d</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-500">Within ±0.5 day</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
            {FORECASTS.filter((m) => Math.abs(m.predicted - m.actual) <= 0.5).length} / {FORECASTS.length}
          </p>
        </div>
      </footer>
    </Card>
  );
}

/* ═════════════════════════════════ Audit log ═════════════════════════════════ */

function AuditLogCard() {
  const [filter, setFilter] = useState<"all" | EventKind>("all");
  const events = useMemo(
    () =>
      [...EVENTS]
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .filter((e) => filter === "all" || e.kind === filter),
    [filter],
  );

  return (
    <Card className="flex flex-col">
      <CardHeader
        eyebrow="Audit log"
        title="AI interventions"
        aside={
          <Segmented
            label="Filter events"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "prevented", label: "Prevented" },
              { value: "resolved", label: "Resolved" },
            ]}
          />
        }
      />
      <ol className="flex-1 px-6 py-5">
        {events.map((e, i) => {
          const member = MEMBERS[e.member];
          const { date, time } = formatTimestamp(e.timestamp);
          const prevented = e.kind === "prevented";
          const last = i === events.length - 1;
          return (
            <li key={e.id} className="relative flex gap-4 pb-6 last:pb-0">
              {!last && <span className="absolute left-[11px] top-7 bottom-0 w-px bg-slate-200" aria-hidden="true" />}
              <span
                className={`relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${
                  prevented ? "bg-amber-400 text-amber-950" : "bg-slate-900 text-white"
                }`}
                aria-hidden="true"
              >
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  {prevented ? <path d="M10 3 4 5.5v4c0 3.6 2.5 6.3 6 7.5 3.5-1.2 6-3.9 6-7.5v-4L10 3Z" /> : <path d="m5 10.5 3.2 3L15 6.5" />}
                </svg>
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <h3 className="text-sm font-semibold tracking-tight text-slate-900">{e.title}</h3>
                  <time dateTime={e.timestamp} className="text-[12px] tabular-nums text-slate-400">
                    {date} · {time}
                  </time>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{e.detail}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 pr-1 text-[12px] text-slate-600">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-700">
                      {member.initials}
                    </span>
                    {member.name} <span className="text-slate-400">· {member.role}</span>
                  </span>
                  {e.impacts.map((p) => (
                    <span key={p.label} className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${PILL_STYLE[p.tone]}`}>
                      {p.label}
                    </span>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <footer className="border-t border-slate-100 px-6 py-3 text-[12px] text-slate-500">
        Showing {events.length} most recent of 14 logged events
      </footer>
    </Card>
  );
}

/* ═════════════════════════════════ Panel ═════════════════════════════════ */

export default function RiskAnalyticsPanel() {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-700 antialiased">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-3 px-4 py-6 sm:px-8">
          <div>
            <p className={EYEBROW}>Foresight · Student Team Project Q4</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Risk Forecast History &amp; Performance</h1>
            <p className="mt-1 text-sm text-slate-600">Delays the AI caught early, and how close its forecasts landed. Sep 22 – Oct 9.</p>
          </div>
          <div className="flex items-center gap-4 text-[12px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Prevented risk
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-900" />
              Resolved milestone
            </span>
          </div>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-6 sm:grid-cols-2 sm:px-8 xl:grid-cols-4">
          {KPIS.map((k) => (
            <KpiCard key={k.id} kpi={k} />
          ))}
        </div>
      </div>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-8 lg:grid-cols-[1.15fr_1fr]">
        <ForecastCard />
        <AuditLogCard />
      </main>
    </div>
  );
}
