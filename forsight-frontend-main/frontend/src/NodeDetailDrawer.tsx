import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/* ═════════════════════════════════ Public types ═════════════════════════════════ */

export type MemberId = "anar" | "leyla" | "elvin";
export type MemberImpact = "blocked" | "partial" | "reassigned" | "unblocked";

export interface TeamMember {
  id: MemberId;
  name: string;
  role: string;
  initials: string;
}

export interface BlockedMember {
  member: TeamMember;
  waitingOn: string;
  idleHours: number;
}

export interface DelayDriver {
  label: string;
  value: string;
}

export interface ResolutionOutcome {
  cascadeDelayDays: number;
  memberImpact: Partial<Record<MemberId, MemberImpact>>;
  summary: string;
}

export interface ResolutionOption {
  id: string;
  label: "A" | "B" | "C";
  title: string;
  description: string;
  odds: number; // % on-time completion after applying
  effort: string;
  tradeoff: string;
  recommended?: boolean;
  outcome: ResolutionOutcome;
}

export interface TaskNodeDetail {
  id: string;
  nodeLabel: string;
  title: string;
  assignee: TeamMember;
  daysBehind: number;
  priority: string;
  progress: { actual: number; expected: number };
  drivers: DelayDriver[];
  blockedMembers: BlockedMember[];
  cascadeDelayDays: number;
  release: { planned: string; projected: string };
  currentOdds: number;
  options: ResolutionOption[];
}

export interface NodeDetailDrawerProps {
  open: boolean;
  node: TaskNodeDetail | null;
  appliedOptionId: string | null;
  onClose: () => void;
  onApply: (option: ResolutionOption) => Promise<void>;
  onUndo: () => void;
}

/* ═════════════════════════════════ Styling tokens ═════════════════════════════════ */

const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500";

const IMPACT_META: Record<MemberImpact, { label: string; className: string }> = {
  blocked: { label: "Blocked", className: "bg-amber-50 text-amber-900 ring-amber-300" },
  partial: { label: "Partially blocked", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  reassigned: { label: "Reassigned", className: "bg-blue-50 text-slate-900 ring-blue-200" },
  unblocked: { label: "Unblocked", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
};

/* ═════════════════════════════════ Icons ═════════════════════════════════ */

type IconName = "close" | "alert" | "check" | "arrow" | "spinner" | "undo" | "spark" | "clock";

function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      {name === "close" && <path d="m5.5 5.5 9 9m0-9-9 9" {...p} />}
      {name === "check" && <path d="m5 10.5 3.2 3L15 6.5" {...p} />}
      {name === "arrow" && <path d="M4 10h11m0 0-4-4m4 4-4 4" {...p} />}
      {name === "undo" && <path d="M7 6 4 9l3 3M4 9h8a4 4 0 0 1 0 8h-2" {...p} />}
      {name === "spinner" && <path d="M10 3a7 7 0 1 0 7 7" {...p} className="origin-center animate-spin" />}
      {name === "spark" && <path d="M10 2.5 11.6 8.4 17.5 10l-5.9 1.6L10 17.5l-1.6-5.9L2.5 10l5.9-1.6L10 2.5Z" {...p} />}
      {name === "clock" && (
        <>
          <circle cx="10" cy="10" r="7" {...p} />
          <path d="M10 6.5V10l2.5 1.5" {...p} />
        </>
      )}
      {name === "alert" && (
        <>
          <path d="M10 7v3.5m0 2.75h.01" {...p} strokeWidth={2} />
          <path d="M8.6 3.3 2.4 14.2A1.6 1.6 0 0 0 3.8 16.6h12.4a1.6 1.6 0 0 0 1.4-2.4L11.4 3.3a1.6 1.6 0 0 0-2.8 0Z" {...p} strokeWidth={1.5} />
        </>
      )}
    </svg>
  );
}

/* ═════════════════════════════════ Small parts ═════════════════════════════════ */

function Avatar({ member, size = "md", tone = "slate" }: { member: TeamMember; size?: "sm" | "md" | "lg"; tone?: "slate" | "amber" | "dark" }) {
  const sizes = { sm: "h-7 w-7 text-[10px]", md: "h-8 w-8 text-[11px]", lg: "h-10 w-10 text-xs" };
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-400 text-amber-950",
    dark: "bg-white/10 text-white ring-1 ring-inset ring-white/20",
  };
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-bold ${sizes[size]} ${tones[tone]}`}>
      {member.initials}
    </span>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className={EYEBROW}>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function OddsBar({ value, highlight }: { value: number; highlight: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full transition-all duration-500 ${highlight ? "bg-slate-900" : value >= 60 ? "bg-slate-400" : "bg-amber-400"}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

/* ═════════════════════════════════ Resolution option card ═════════════════════════════════ */

interface OptionCardProps {
  option: ResolutionOption;
  selected: boolean;
  disabled: boolean;
  applying: boolean;
  currentOdds: number;
  onSelect: () => void;
  onQuickApply: () => void;
}

function OptionCard({ option, selected, disabled, applying, currentOdds, onSelect, onQuickApply }: OptionCardProps) {
  const gain = option.odds - currentOdds;
  return (
    <div
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onSelect()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === " " || e.key === "Enter")) {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group relative rounded-xl border p-4 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 ${
        disabled ? "cursor-default" : "cursor-pointer"
      } ${
        selected
          ? option.recommended
            ? "border-amber-300 bg-amber-50 ring-1 ring-amber-300"
            : "border-slate-900 bg-white ring-1 ring-slate-900"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${
            selected ? "border-slate-900 bg-slate-900" : "border-slate-300 bg-white group-hover:border-slate-400"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full bg-white transition-transform ${selected ? "scale-100" : "scale-0"}`} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400">Option {option.label}</span>
            {option.recommended && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950">
                <Icon name="spark" className="h-3 w-3" />
                Recommended
              </span>
            )}
          </div>
          <p className="mt-1 text-sm font-semibold tracking-tight text-slate-900">{option.title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{option.description}</p>

          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1">
              <OddsBar value={option.odds} highlight={!!option.recommended} />
            </div>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-slate-900">{option.odds}%</span>
          </div>
          <p className="mt-1 text-[12px] text-slate-500">
            On-time completion <span className="font-medium text-slate-700">+{gain} pts</span> vs. today
          </p>

          <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200/80 pt-3 text-[12px]">
            <div>
              <dt className="text-slate-400">Effort</dt>
              <dd className="mt-0.5 font-medium text-slate-700">{option.effort}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Trade-off</dt>
              <dd className="mt-0.5 font-medium text-slate-700">{option.tradeoff}</dd>
            </div>
          </dl>

          {option.recommended && !disabled && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickApply();
                }}
                disabled={applying}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-[13px] font-semibold text-amber-950 transition-colors hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
              >
                {applying ? <Icon name="spinner" /> : <Icon name="check" />}
                Apply Fix
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════ Drawer ═════════════════════════════════ */

export function NodeDetailDrawer({ open, node, appliedOptionId, onClose, onApply, onUndo }: NodeDetailDrawerProps) {
  // Keep the last node rendered while the panel animates out.
  const [shown, setShown] = useState<TaskNodeDetail | null>(node);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (node) {
      setShown(node);
      setSelectedId(node.options.find((o) => o.recommended)?.id ?? node.options[0]?.id ?? null);
    }
  }, [node]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => closeRef.current?.focus(), 250);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const apply = async (option: ResolutionOption) => {
    if (applyingId) return;
    setApplyingId(option.id);
    try {
      await onApply(option);
    } finally {
      setApplyingId(null);
    }
  };

  const applied = shown?.options.find((o) => o.id === appliedOptionId) ?? null;
  const selected = shown?.options.find((o) => o.id === selectedId) ?? null;
  const cascade = applied ? applied.outcome.cascadeDelayDays : shown?.cascadeDelayDays ?? 0;
  const odds = applied ? applied.odds : shown?.currentOdds ?? 0;

  return (
    <div
      className={`fixed inset-0 z-50 transition-[visibility] duration-300 ${open ? "visible" : "invisible"}`}
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-slate-900/25 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="node-drawer-title"
        className={`absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col bg-white shadow-2xl shadow-slate-900/10 transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {shown && (
          <>
            {/* ───── Header ───── */}
            <header className="bg-slate-900 px-6 pb-5 pt-4 text-white">
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-slate-400">
                  Dependency Graph <span className="text-slate-600">/</span> {shown.nodeLabel}
                </p>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={onClose}
                  aria-label="Close panel"
                  className="-mr-1.5 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  <Icon name="close" />
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-amber-950">
                  <Icon name="alert" className="h-3.5 w-3.5" />
                  {shown.priority}
                </span>
                {applied && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-inset ring-white/10">
                    <Icon name="check" className="h-3.5 w-3.5" />
                    Option {applied.label} applied
                  </span>
                )}
              </div>

              <h2 id="node-drawer-title" className="mt-3 text-xl font-semibold tracking-tight">
                {shown.title}
              </h2>

              <div className="mt-4 flex items-center gap-3">
                <Avatar member={shown.assignee} size="lg" tone="dark" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {shown.assignee.name} <span className="text-slate-400">({shown.assignee.role})</span>
                    <span className="mx-1.5 text-slate-600">•</span>
                    <span className="font-semibold text-amber-400">{shown.daysBehind} Days Behind Schedule</span>
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="absolute inset-y-0 left-0 rounded-full bg-white/25" style={{ width: `${shown.progress.expected}%` }} />
                      <div className="absolute inset-y-0 left-0 rounded-full bg-amber-400" style={{ width: `${shown.progress.actual}%` }} />
                    </div>
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                      {shown.progress.actual}% done · {shown.progress.expected}% expected
                    </span>
                  </div>
                </div>
              </div>
            </header>

            {/* ───── Body ───── */}
            <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
              <Section title="Why it's delayed">
                <ul className="grid grid-cols-3 gap-2">
                  {shown.drivers.map((d) => (
                    <li key={d.label} className="rounded-lg border border-slate-200 px-3 py-2.5">
                      <p className="text-[11px] text-slate-500">{d.label}</p>
                      <p className="mt-0.5 text-[13px] font-semibold text-slate-900">{d.value}</p>
                    </li>
                  ))}
                </ul>
              </Section>

              <Section title="Impact analysis">
                <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
                  {/* Blocked members */}
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="text-[13px] font-semibold text-slate-900">Blocked Team Members</p>
                    <ul className="mt-3 space-y-3">
                      {shown.blockedMembers.map(({ member, waitingOn, idleHours }) => {
                        const impact: MemberImpact = applied?.outcome.memberImpact[member.id] ?? "blocked";
                        const stillBlocked = impact === "blocked" || impact === "partial";
                        return (
                          <li key={member.id} className="flex items-start gap-2.5">
                            <div className="relative">
                              <Avatar member={member} size="sm" />
                              <span
                                className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-white transition-colors duration-300 ${
                                  stillBlocked ? "bg-amber-400 text-amber-950" : "bg-emerald-500 text-white"
                                }`}
                              >
                                <Icon name={stillBlocked ? "alert" : "check"} className="h-2.5 w-2.5" />
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[13px] font-medium text-slate-900">
                                  {member.name} <span className="font-normal text-slate-400">({member.role})</span>
                                </span>
                                <span
                                  className={`rounded px-1.5 py-px text-[10px] font-semibold ring-1 ring-inset transition-colors duration-300 ${IMPACT_META[impact].className}`}
                                >
                                  {IMPACT_META[impact].label}
                                </span>
                              </div>
                              <p className="mt-0.5 text-[12px] leading-snug text-slate-500">
                                {stillBlocked ? (
                                  <>
                                    Waiting on {waitingOn} · <span className="tabular-nums">{idleHours}h</span> idle
                                  </>
                                ) : impact === "reassigned" ? (
                                  "Moved to schema design"
                                ) : (
                                  "Continuing in parallel"
                                )}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {/* Cascade delay */}
                  <div
                    className={`flex flex-col rounded-xl border p-4 transition-colors duration-300 ${
                      cascade > 0 ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
                    }`}
                  >
                    <p className="text-[13px] font-semibold text-slate-900">Estimated Cascade Delay</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-slate-900">
                      {cascade > 0 ? `+${cascade}` : "0"}
                      <span className="ml-1 text-sm font-medium text-slate-500">Days</span>
                    </p>
                    <p className={`mt-1 text-[12px] ${cascade > 0 ? "text-amber-900" : "text-slate-500"}`}>
                      {cascade > 0 ? "Added to total project release" : "Release back on plan"}
                    </p>
                    <div className="mt-auto flex items-center gap-1.5 pt-3 text-[12px] tabular-nums text-slate-600">
                      <Icon name="clock" className="h-3.5 w-3.5 text-slate-400" />
                      {shown.release.planned}
                      {cascade > 0 && (
                        <>
                          <Icon name="arrow" className="h-3 w-3 text-slate-400" />
                          <span className="font-semibold text-amber-900">{shown.release.projected}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Section>

              <Section
                title="AI suggested resolutions"
                aside={
                  <span className="text-[12px] text-slate-500">
                    Today: <span className="font-semibold tabular-nums text-amber-700">{shown.currentOdds}%</span> on-time
                  </span>
                }
              >
                {applied ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                        <Icon name="check" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">
                          Option {applied.label}: {applied.title}
                        </p>
                        <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{applied.outcome.summary}</p>
                        <p className="mt-2 text-[12px] text-slate-500">
                          On-time odds <span className="tabular-nums text-amber-700">{shown.currentOdds}%</span> →{" "}
                          <span className="font-semibold tabular-nums text-slate-900">{odds}%</span>
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div role="radiogroup" aria-label="Resolution options" className="space-y-3">
                    {shown.options.map((o) => (
                      <OptionCard
                        key={o.id}
                        option={o}
                        selected={o.id === selectedId}
                        disabled={applyingId !== null}
                        applying={applyingId === o.id}
                        currentOdds={shown.currentOdds}
                        onSelect={() => setSelectedId(o.id)}
                        onQuickApply={() => apply(o)}
                      />
                    ))}
                  </div>
                )}
              </Section>
            </div>

            {/* ───── Footer ───── */}
            <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4">
              {applied ? (
                <button
                  type="button"
                  onClick={onUndo}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  <Icon name="undo" />
                  Undo resolution
                </button>
              ) : (
                <p className="text-[12px] text-slate-500">
                  {selected ? (
                    <>
                      Selected: <span className="font-medium text-slate-900">Option {selected.label}</span>
                    </>
                  ) : (
                    "Select a resolution"
                  )}
                </p>
              )}
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200"
                >
                  {applied ? "Done" : "Close"}
                </button>
                {!applied && (
                  <button
                    type="button"
                    onClick={() => selected && apply(selected)}
                    disabled={!selected || applyingId !== null}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {applyingId !== null && applyingId === selectedId ? (
                      <>
                        <Icon name="spinner" />
                        Applying…
                      </>
                    ) : (
                      "Apply Selected Resolution"
                    )}
                  </button>
                )}
              </div>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}

/* ═════════════════════════════════ Demo data ═════════════════════════════════ */

const TEAM: Record<MemberId, TeamMember> = {
  anar: { id: "anar", name: "Anar", role: "Backend Dev", initials: "AN" },
  leyla: { id: "leyla", name: "Leyla", role: "Frontend", initials: "LE" },
  elvin: { id: "elvin", name: "Elvin", role: "QA", initials: "EL" },
};

const BACKEND_NODE: TaskNodeDetail = {
  id: "backend-api",
  nodeLabel: "Node 1",
  title: "Backend REST API Endpoints",
  assignee: TEAM.anar,
  daysBehind: 3,
  priority: "Critical Path Blocker",
  progress: { actual: 40, expected: 70 },
  drivers: [
    { label: "Commit velocity", value: "−62% / 3 days" },
    { label: "Schema review", value: "Pending 2 days" },
    { label: "Auth spec", value: "Changed twice" },
  ],
  blockedMembers: [
    { member: TEAM.leyla, waitingOn: "/auth and /users endpoints", idleHours: 14 },
    { member: TEAM.elvin, waitingOn: "a testable API build", idleHours: 12 },
  ],
  cascadeDelayDays: 3.5,
  release: { planned: "Oct 19", projected: "Oct 22 PM" },
  currentOdds: 28,
  options: [
    {
      id: "mock-api",
      label: "A",
      title: "Generate Mock API Server",
      description: "Freeze the OpenAPI contract and serve it through Mock Service Worker so frontend and QA work continue in parallel.",
      odds: 88,
      effort: "~1 day setup",
      tradeoff: "0.5 day to swap in live API",
      recommended: true,
      outcome: {
        cascadeDelayDays: 0,
        memberImpact: { leyla: "unblocked", elvin: "unblocked" },
        summary: "Leyla integrates against mock endpoints and Elvin runs E2E suites on the contract. The backend is still 3 days late, but no longer on the critical path.",
      },
    },
    {
      id: "reassign-schema",
      label: "B",
      title: "Reassign Schema Design to Leyla",
      description: "Leyla takes over the data schema so Anar can focus only on endpoint implementation.",
      odds: 65,
      effort: "1.5 days of Leyla's time",
      tradeoff: "Pauses UI integration",
      outcome: {
        cascadeDelayDays: 1.5,
        memberImpact: { leyla: "reassigned", elvin: "partial" },
        summary: "Anar recovers about 2 days on endpoints. Leyla's own integration work moves back, and Elvin still waits for a testable build.",
      },
    },
    {
      id: "extend-deadline",
      label: "C",
      title: "Extend Milestone Deadline by 3 Days",
      description: "Move the milestone to absorb the slip. Work order and assignments stay the same.",
      odds: 40,
      effort: "Stakeholder approval",
      tradeoff: "Leaves zero buffer",
      outcome: {
        cascadeDelayDays: 0.5,
        memberImpact: { leyla: "blocked", elvin: "blocked" },
        summary: "The new milestone absorbs most of the slip, but Leyla and Elvin stay blocked and any further backend delay misses the extended date.",
      },
    },
  ],
};

/* ═════════════════════════════════ Demo host: mini dependency graph ═════════════════════════════════ */

interface GraphNode {
  id: string;
  label: string;
  title: string;
  owner: TeamMember;
  detail?: TaskNodeDetail;
}

const GRAPH: GraphNode[] = [
  { id: "backend-api", label: "Node 1", title: "Backend API Endpoint", owner: TEAM.anar, detail: BACKEND_NODE },
  { id: "frontend", label: "Node 2", title: "Frontend Integration", owner: TEAM.leyla },
  { id: "e2e", label: "Node 3", title: "E2E Testing", owner: TEAM.elvin },
];

export default function NodeDetailDrawerDemo() {
  const [activeNode, setActiveNode] = useState<TaskNodeDetail | null>(null);
  const [appliedOptionId, setAppliedOptionId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const applied = BACKEND_NODE.options.find((o) => o.id === appliedOptionId) ?? null;
  const memberImpact = (id: MemberId): MemberImpact => applied?.outcome.memberImpact[id] ?? "blocked";

  const close = useCallback(() => {
    setActiveNode(null);
    triggerRef.current?.focus();
  }, []);

  // Simulates a network round-trip to the planning backend.
  const handleApply = (option: ResolutionOption) =>
    new Promise<void>((resolve) =>
      window.setTimeout(() => {
        setAppliedOptionId(option.id);
        resolve();
      }, 1100),
    );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-700 antialiased">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <p className={EYEBROW}>Dependency Graph</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Student Team Project Q4</h1>
        <p className="mt-1 text-sm text-slate-500">Click the delayed node to open its detail panel.</p>

        <div className="mt-8 grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {GRAPH.map((n, i) => {
            const isRoot = !!n.detail;
            const impact = isRoot ? null : memberImpact(n.owner.id);
            const hot = isRoot && !applied;
            return (
              <div key={n.id} className="contents">
                {i > 0 && (
                  <Icon
                    name="arrow"
                    className={`mx-auto h-5 w-5 rotate-90 md:rotate-0 ${applied?.id === "mock-api" ? "text-slate-300" : "text-amber-500"}`}
                  />
                )}
                <button
                  type="button"
                  disabled={!isRoot}
                  ref={isRoot ? triggerRef : undefined}
                  onClick={() => n.detail && setActiveNode(n.detail)}
                  className={`rounded-xl border bg-white p-4 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 ${
                    hot
                      ? "border-amber-300 bg-amber-50 ring-1 ring-amber-300 hover:-translate-y-0.5 hover:shadow-md hover:shadow-amber-900/5"
                      : isRoot
                        ? "border-slate-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-900/5"
                        : "cursor-default border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-400">{n.label}</span>
                    {isRoot ? (
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                          hot ? "bg-amber-400 text-amber-950" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {hot ? "3 Days Delayed" : `Option ${applied?.label} applied`}
                      </span>
                    ) : (
                      impact && (
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${IMPACT_META[impact].className}`}>
                          {IMPACT_META[impact].label}
                        </span>
                      )
                    )}
                  </div>
                  <p className="mt-2 text-sm font-semibold tracking-tight text-slate-900">{n.title}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <Avatar member={n.owner} size="sm" tone={hot ? "amber" : "slate"} />
                    <span className="text-[12px] text-slate-500">
                      {n.owner.name} · {n.owner.role}
                    </span>
                  </div>
                  {isRoot && <p className="mt-3 text-[11px] font-medium text-slate-400">View details →</p>}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <NodeDetailDrawer
        open={activeNode !== null}
        node={activeNode}
        appliedOptionId={appliedOptionId}
        onClose={close}
        onApply={handleApply}
        onUndo={() => setAppliedOptionId(null)}
      />
    </div>
  );
}
