import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode, Ref } from "react";
import { BRAND, Card, CardHeader, EYEBROW, Icon, Logo, Toggle } from "./ui";
import type { IconName } from "./ui";
import { AuthModal, type AuthTab } from "./auth/AuthModal";
import { UserAvatar, UserMenu } from "./auth/UserMenu";
import {
  clearSession,
  endSession,
  loadActivity,
  loadSession,
  roleLabel,
  saveActivity,
  savePrefs,
  saveSession,
  updateSession,
  type ActivityEntry,
  type ActivityKind,
  type UserProfile,
} from "./auth/session";
import { ProfileView, type AssignedTask, type RiskLevel } from "./profile/ProfileView";
import { setAuthLostHandler } from "./api";
import type { Severity } from "./api";
import { useLive, type Live } from "./live/useLive";
import { LiveRiskPanel } from "./live/LiveRiskPanel";
import { TasksView } from "./live/TasksView";
import { InboxView } from "./live/InboxView";
import { WorkloadView } from "./live/WorkloadView";
import { SettingsView } from "./live/SettingsView";
import { CreateProjectModal } from "./live/ProjectParts";
import { Empty, Loading, Notice } from "./live/common";
import { OPEN_STATUSES, btnPrimary, fmtDate, humanize } from "./live/format";

/* ═══════════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════════ */

type MemberId = "anar" | "leyla" | "elvin";
type TaskId = "backend" | "frontend" | "e2e";
type Trend = "better" | "same" | "worse" | "critical";
type NodeStatus = "behind" | "decoupled" | "blocked" | "in-progress" | "at-risk" | "on-track";

interface Member {
  id: MemberId;
  name: string;
  role: string;
  initials: string;
}

interface Project {
  id: string;
  name: string;
  live: boolean;
}

interface TaskDef {
  id: TaskId;
  name: string;
  short: string;
  owner: MemberId;
  plannedHours: number;
  aiDelayHours: number; // overrun the engine predicts from current signals
  dependsOn: TaskId | null;
}

interface Scenario {
  deadlineShift: number; // days, −5 … +5
  absent: MemberId[];
  workload: number; // multiplier, 1.0 … 1.5
}

interface TaskForecast {
  def: TaskDef;
  plannedStart: number;
  plannedEnd: number;
  start: number;
  end: number;
  hours: number;
}

interface Forecast {
  feasible: boolean;
  tasks: Record<TaskId, TaskForecast>;
  plannedFinish: number;
  finish: number;
  deadline: number;
  buffer: number;
  cascadeDelay: number;
  odds: number;
  health: number;
  bottleneck: TaskForecast;
  action: { text: string; severity: "none" | "moderate" | "high" };
}

interface ReasoningCard {
  problem: string;
  severity: "Critical" | "High";
  impacts: { task: string; effect: string }[];
  solution: { title: string; detail: string; oddsBefore: number; oddsAfter: number };
  action: { kind: "apply-mock"; label: string } | { kind: "simulate"; label: string; scenario: Scenario };
}

type ChatMessage =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; kind: "text"; text: string }
  | { id: number; role: "assistant"; kind: "card"; lead: string; card: ReasoningCard };

type AssistantReply =
  | { role: "assistant"; kind: "text"; text: string }
  | { role: "assistant"; kind: "card"; lead: string; card: ReasoningCard };

/* ═══════════════════════════════════════════════════════════════════════════
   Project data
   ═══════════════════════════════════════════════════════════════════════════ */

const MEMBERS: Record<MemberId, Member> = {
  anar: { id: "anar", name: "Anar", role: "Backend", initials: "AN" },
  leyla: { id: "leyla", name: "Leyla", role: "Frontend", initials: "LE" },
  elvin: { id: "elvin", name: "Elvin", role: "QA & Docs", initials: "EL" },
};

const PROJECTS: Project[] = [
  { id: "q4", name: "Student Team Project Q4", live: true },
  { id: "capstone", name: "Capstone Mobile App", live: false },
  { id: "hackathon", name: "GovTech Hackathon MVP", live: false },
];

const TASKS: TaskDef[] = [
  { id: "backend", name: "Backend REST API Endpoints", short: "Backend API", owner: "anar", plannedHours: 30, aiDelayHours: 18, dependsOn: null },
  { id: "frontend", name: "Frontend Integration", short: "Frontend Integration", owner: "leyla", plannedHours: 24, aiDelayHours: 3, dependsOn: "backend" },
  { id: "e2e", name: "E2E Integration Testing", short: "E2E Integration Testing", owner: "elvin", plannedHours: 18, aiDelayHours: 0, dependsOn: "frontend" },
];

const HOURS_PER_DAY = 6;
const PLANNED_DEADLINE = 13; // days from today
const MOCK_READY_DAY = 1; // frontend can start on mocks after a 1-day contract freeze
const INTEGRATION_SWAP_DAYS = 0.5; // swapping mocks for the live API
const ABSENT_FACTOR = 1.7; // reassigned work: ramp-up + context loss
const ABSORB_FACTOR = 0.15; // extra load on everyone else, per absence

const BASE_SCENARIO: Scenario = { deadlineShift: 0, absent: [], workload: 1 };

/* ═══════════════════════════════════════════════════════════════════════════
   Forecast engine
   ═══════════════════════════════════════════════════════════════════════════ */

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * On-time odds as a logistic function of schedule buffer (days).
 * Calibrated so the current plan reads 28% and the Mock API plan reads 85%.
 */
const oddsFor = (buffer: number) => Math.round(clamp(100 / (1 + Math.exp(-(0.73 + 0.67 * buffer))), 2, 98));
const healthFor = (odds: number) => Math.round(clamp(28 + 0.6 * odds, 0, 100));

function recommendAction(s: Scenario, buffer: number, mitigated: boolean): Forecast["action"] {
  if (s.absent.includes("anar") && !mitigated) return { text: "Deploy a Mock API Server and reassign endpoints to Leyla.", severity: "high" };
  if (s.absent.includes("leyla")) return { text: "Pair Anar on integration and freeze UI scope.", severity: "high" };
  if (s.absent.includes("elvin")) return { text: "Developers own E2E for the 5 critical flows.", severity: buffer < 0 ? "high" : "moderate" };
  if (buffer < 0 && !mitigated) return { text: "Deploy a Mock API Server to decouple Frontend.", severity: "high" };
  if (buffer < 0) return { text: `Negotiate +${Math.ceil(-buffer)}d on the deadline or descope P2 items.`, severity: "high" };
  if (buffer < 1) return { text: "Freeze new scope to protect the remaining buffer.", severity: "moderate" };
  return { text: "None. Plan holds; review at the weekly check-in.", severity: "none" };
}

function forecast(s: Scenario, mitigated: boolean): Forecast {
  const deadline = PLANNED_DEADLINE + s.deadlineShift;
  const feasible = s.absent.length < Object.keys(MEMBERS).length;

  const hoursFor = (t: TaskDef) => {
    let h = (t.plannedHours + t.aiDelayHours) * s.workload;
    if (s.absent.includes(t.owner)) h *= ABSENT_FACTOR;
    else h *= 1 + ABSORB_FACTOR * s.absent.length;
    return Math.round(h * 2) / 2;
  };

  const tasks = {} as Record<TaskId, TaskForecast>;
  let plannedCursor = 0;
  for (const def of TASKS) {
    const plannedStart = plannedCursor;
    const plannedEnd = plannedStart + def.plannedHours / HOURS_PER_DAY;
    plannedCursor = plannedEnd;

    const hours = hoursFor(def);
    const days = hours / HOURS_PER_DAY;
    const upstream = def.dependsOn ? tasks[def.dependsOn] : null;
    let start = upstream ? upstream.end : 0;
    let end = start + days;
    if (def.id === "frontend" && mitigated && upstream) {
      start = MOCK_READY_DAY;
      end = Math.max(start + days, upstream.end + INTEGRATION_SWAP_DAYS);
    }
    tasks[def.id] = { def, plannedStart, plannedEnd, start, end, hours };
  }

  const plannedFinish = tasks.e2e.plannedEnd;
  const finish = feasible ? tasks.e2e.end : Infinity;
  const buffer = deadline - finish;
  const odds = feasible ? oddsFor(buffer) : 0;
  const bottleneck = Object.values(tasks).reduce((a, b) => (b.hours - b.def.plannedHours > a.hours - a.def.plannedHours ? b : a));

  return {
    feasible,
    tasks,
    plannedFinish,
    finish,
    deadline,
    buffer,
    cascadeDelay: Math.max(0, finish - plannedFinish),
    odds,
    health: feasible ? healthFor(odds) : 0,
    bottleneck,
    action: feasible ? recommendAction(s, buffer, mitigated) : { text: "Restore team capacity. No one is left to execute.", severity: "high" },
  };
}

function sameScenario(a: Scenario, b: Scenario): boolean {
  return a.deadlineShift === b.deadlineShift && a.workload === b.workload && a.absent.length === b.absent.length && a.absent.every((m) => b.absent.includes(m));
}

/* ═══════════════════════════════════════════════════════════════════════════
   Formatting
   ═══════════════════════════════════════════════════════════════════════════ */

const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

function formatDay(offset: number): string {
  if (!Number.isFinite(offset)) return "Not deliverable";
  const d = new Date(TODAY);
  d.setDate(d.getDate() + Math.floor(offset));
  const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return offset % 1 >= 0.5 ? `${label} PM` : label;
}

function fmtDays(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? `${r}` : r.toFixed(1);
}

function signedDays(n: number): string {
  if (!Number.isFinite(n)) return "n/a";
  if (Math.abs(n) < 0.05) return "0d";
  return `${n > 0 ? "+" : "−"}${fmtDays(Math.abs(n))}d`;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

/* ═══════════════════════════════════════════════════════════════════════════
   Style tokens
   ═══════════════════════════════════════════════════════════════════════════ */


const NODE_STATUS: Record<NodeStatus, { label: string; badge: string; card: string }> = {
  behind: { label: "Behind", badge: "bg-amber-400 text-amber-950 ring-amber-500", card: "border-amber-300 bg-amber-50/60 ring-1 ring-amber-300" },
  decoupled: { label: "Behind · Decoupled", badge: "bg-amber-50 text-amber-900 ring-amber-300", card: "border-slate-200 bg-white" },
  blocked: { label: "Blocked", badge: "bg-amber-50 text-amber-900 ring-amber-300", card: "border-slate-200 bg-white" },
  "in-progress": { label: "In Progress", badge: "bg-blue-50 text-indigo-700 ring-blue-200", card: "border-slate-200 bg-white" },
  "at-risk": { label: "At Risk", badge: "bg-amber-50 text-amber-900 ring-amber-300", card: "border-slate-200 bg-white" },
  "on-track": { label: "On Track", badge: "bg-emerald-50 text-emerald-800 ring-emerald-200", card: "border-slate-200 bg-white" },
};

const TREND_PILL: Record<Trend, string> = {
  better: "bg-blue-50 text-indigo-700 ring-blue-200",
  same: "bg-slate-100 text-slate-600 ring-slate-200",
  worse: "bg-amber-50 text-amber-900 ring-amber-300",
  critical: "bg-amber-400 text-amber-950 ring-amber-500",
};

function Avatar({ member, highlight = false, size = "md" }: { member: Member; highlight?: boolean; size?: "sm" | "md" }) {
  return (
    <span
      title={`${member.name} · ${member.role}`}
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ring-2 ring-white transition-colors duration-500 ${
        size === "sm" ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-[11px]"
      } ${highlight ? "bg-amber-400 text-amber-950" : "bg-blue-50 text-indigo-700"}`}
    >
      {member.initials}
    </span>
  );
}

function Pill({ trend, children }: { trend: Trend; children: ReactNode }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TREND_PILL[trend]}`}>
      {children}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. Top navigation
   ═══════════════════════════════════════════════════════════════════════════ */

function ProjectSwitcher({ projects, activeId, onChange, onCreate, loading }: {
  projects: Project[];
  activeId: string | null;
  onChange: (id: string) => void;
  /** Present only when signed in: opens the "new project" dialog. */
  onCreate?: () => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = projects.find((p) => p.id === activeId);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-w-0 max-w-full items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 transition-colors hover:bg-slate-50"
      >
        <span className="hidden text-slate-400 sm:inline">Project</span>
        <span className="hidden h-4 w-px bg-slate-200 sm:inline" />
        <span className={`truncate font-semibold ${active ? "" : "text-slate-400"}`}>{active ? active.name : loading ? "Loading projects…" : "No project yet"}</span>
        <Icon name="chevron" className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul role="listbox" className="absolute left-0 z-30 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg shadow-slate-900/5">
          {projects.length === 0 && <li className="px-3.5 py-2.5 text-[13px] text-slate-500">No projects in this workspace.</li>}
          {projects.map((p) => (
            <li key={p.id} role="option" aria-selected={p.id === activeId}>
              <button
                type="button"
                disabled={!p.live}
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <span className={p.live ? "font-medium text-slate-900" : "text-slate-400"}>{p.name}</span>
                {p.id === activeId ? <Icon name="check" className="h-4 w-4 text-slate-900" /> : !p.live && <span className="text-[11px] text-slate-400">Forecast paused</span>}
              </button>
            </li>
          ))}
          {onCreate && (
            <li className="border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCreate();
                }}
                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50"
              >
                <span aria-hidden="true">+</span> New project
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function TopNav({ projects, projectId, projectsLoading, onProjectChange, onCreateProject, atRisk, onOpenCopilot, onOpenNav, userMenu }: {
  userMenu: ReactNode;
  projects: Project[];
  projectId: string | null;
  projectsLoading: boolean;
  onProjectChange: (id: string) => void;
  onCreateProject?: () => void;
  atRisk: boolean;
  onOpenCopilot: () => void;
  onOpenNav: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenNav}
            aria-label="Open navigation"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 lg:hidden"
          >
            <Icon name="menu" />
          </button>
          <ProjectSwitcher projects={projects} activeId={projectId} onChange={onProjectChange} onCreate={onCreateProject} loading={projectsLoading} />
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2.5">
          <span className="hidden items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white xl:inline-flex">
            <span className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${atRisk ? "bg-amber-400" : "bg-emerald-400"}`} />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${atRisk ? "bg-amber-400" : "bg-emerald-400"}`} />
            </span>
            Live Engine Active
          </span>
          <button
            type="button"
            onClick={onOpenCopilot}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white py-1.5 pl-2.5 pr-1.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
          >
            <Icon name="spark" className="h-4 w-4 text-amber-500" />
            <span className="hidden md:inline">Copilot</span>
            <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-500 lg:inline">{isMac ? "⌘" : "Ctrl"} K</kbd>
          </button>
          <span className="hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
          {userMenu}
        </div>
      </div>
    </header>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sidebar
   ═══════════════════════════════════════════════════════════════════════════ */

type NavId = "dashboard" | "cascade" | "simulator" | "inbox" | "tasks" | "workload" | "settings";

interface NavItem {
  id: NavId;
  label: string;
  icon: IconName;
  badge?: number;
}

const SIDEBAR_STORAGE_KEY = "foresight.sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* storage unavailable: preference just isn't remembered */
  }
}

function SidebarLink({ item, active, collapsed, onSelect }: { item: NavItem; active: boolean; collapsed: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "page" : undefined}
        className={`group relative flex w-full items-center gap-3 rounded-lg py-2 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
          collapsed ? "justify-center px-0" : "px-3"
        } ${active ? "bg-blue-50/70 text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
      >
        {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-slate-900" aria-hidden="true" />}
        <span className="relative">
          <Icon name={item.icon} className={`h-[18px] w-[18px] transition-colors ${active ? "text-indigo-700" : "text-slate-400 group-hover:text-slate-900"}`} />
          {collapsed && item.badge ? (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-bold text-amber-950 ring-2 ring-white">
              {item.badge}
            </span>
          ) : null}
        </span>
        {!collapsed && <span className="flex-1 truncate text-left">{item.label}</span>}
        {!collapsed && item.badge ? (
          <span className="rounded-full bg-amber-400 px-1.5 py-px text-[10px] font-bold tabular-nums text-amber-950">{item.badge} new</span>
        ) : null}
        {collapsed && (
          <span className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[12px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {item.label}
            {item.badge ? <span className="ml-1.5 text-amber-400">{item.badge}</span> : null}
          </span>
        )}
      </button>
    </li>
  );
}

function Sidebar({ items, active, collapsed, mobileOpen, user, onAccount, onSelect, onToggleCollapsed, onCloseMobile }: {
  user: UserProfile | null;
  onAccount: () => void;
  items: NavItem[];
  active: NavId | null;
  collapsed: boolean;
  mobileOpen: boolean;
  onSelect: (id: NavId) => void;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
}) {
  const main = items.filter((i) => i.id !== "settings");
  const settings = items.find((i) => i.id === "settings");

  // On mobile the drawer is always shown expanded.
  const body = (isCollapsed: boolean, mobile: boolean) => (
    <div className="flex h-full flex-col">
      <div className={`flex h-[61px] shrink-0 items-center border-b border-slate-200 ${isCollapsed ? "justify-center px-2" : "justify-between px-4"}`}>
        <Logo compact={isCollapsed} />
        {mobile && (
          <button type="button" onClick={onCloseMobile} aria-label="Close navigation" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900">
            <Icon name="close" />
          </button>
        )}
      </div>

      {/* Collapsed: overflow stays visible so hover tooltips aren't clipped */}
      <nav aria-label="Main" className={`flex-1 px-3 py-4 ${isCollapsed ? "overflow-visible" : "overflow-y-auto"}`}>
        {!isCollapsed && <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Workspace</p>}
        <ul className="space-y-0.5">
          {main.map((item) => (
            <SidebarLink key={item.id} item={item} active={item.id === active} collapsed={isCollapsed} onSelect={() => onSelect(item.id)} />
          ))}
        </ul>
      </nav>

      <div className="shrink-0 space-y-0.5 border-t border-slate-200 px-3 py-3">
        {settings && (
          <ul>
            <SidebarLink item={settings} active={active === "settings"} collapsed={isCollapsed} onSelect={() => onSelect("settings")} />
          </ul>
        )}
        {!mobile && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!isCollapsed}
            className={`flex w-full items-center gap-3 rounded-lg py-2 text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 ${
              isCollapsed ? "justify-center px-0" : "px-3"
            }`}
          >
            <Icon name="collapse" className={`h-[18px] w-[18px] transition-transform duration-300 ${isCollapsed ? "rotate-180" : ""}`} />
            {!isCollapsed && "Collapse"}
          </button>
        )}
        <button
          type="button"
          onClick={onAccount}
          title={user ? `${user.fullName} · View profile` : "Sign in"}
          className={`mt-2 flex w-full items-center gap-2.5 rounded-lg bg-slate-50 py-2 text-left transition-colors hover:bg-slate-100 ${isCollapsed ? "justify-center px-0" : "px-2.5"}`}
        >
          {user ? (
            <UserAvatar user={user} size="sm" />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400">
              <Icon name="user" className="h-3.5 w-3.5" />
            </span>
          )}
          {!isCollapsed && (
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-semibold text-slate-900">{user ? user.fullName : "Not signed in"}</span>
              <span className="block truncate text-[11px] text-slate-500">{user ? `${user.role} · ${user.workspace}` : "Sign in to save your work"}</span>
            </span>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: sticky, collapsible */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 border-r border-slate-200 bg-white transition-[width] duration-300 ease-out lg:block ${
          collapsed ? "w-[72px]" : "w-60"
        }`}
      >
        {body(collapsed, false)}
      </aside>

      {/* Mobile: off-canvas drawer */}
      <div className={`fixed inset-0 z-40 transition-[visibility] duration-300 lg:hidden ${mobileOpen ? "visible" : "invisible"}`} aria-hidden={!mobileOpen}>
        <div onClick={onCloseMobile} className={`absolute inset-0 bg-slate-900/25 transition-opacity duration-300 ${mobileOpen ? "opacity-100" : "opacity-0"}`} />
        <aside
          className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-2xl shadow-slate-900/10 transition-transform duration-300 ease-out ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {body(false, true)}
        </aside>
      </div>
    </>
  );
}

function PlaceholderView({ title, description, onBack, action }: { title: string; description: string; onBack: () => void; action?: { label: string; onClick: () => void } }) {
  return (
    <Card className="flex flex-col items-center px-6 py-16 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
        <Icon name={title === "Settings" ? "settings" : "users"} className="h-5 w-5" />
      </span>
      <h2 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-slate-600">{description}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        {action && (
          <button type="button" onClick={action.onClick} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            {action.label}
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          className={
            action
              ? "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              : "inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          }
        >
          Back to Dashboard
        </button>
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. Metric grid
   ═══════════════════════════════════════════════════════════════════════════ */

function MetricGrid({ current, unmitigated, mitigatedForecast, mitigated }: {
  current: Forecast;
  unmitigated: Forecast;
  mitigatedForecast: Forecast;
  mitigated: boolean;
}) {
  const atRisk = current.health < 60;
  const bottleneckOwner = MEMBERS[unmitigated.bottleneck.def.owner];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* Health */}
      <Card className={`p-5 transition-colors duration-500 ${atRisk ? "!border-amber-300 !bg-amber-50/50" : ""}`}>
        <div className="flex items-center justify-between">
          <p className={EYEBROW}>Project Health Score</p>
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
              atRisk ? "bg-amber-400 text-amber-950 ring-amber-500" : "bg-blue-50 text-indigo-700 ring-blue-200"
            }`}
          >
            {atRisk && <Icon name="alert" className="h-3 w-3" />}
            {atRisk ? "Warning" : "Healthy"}
          </span>
        </div>
        <p className="mt-3 text-4xl font-semibold tracking-tight tabular-nums text-slate-900">{current.health}%</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-slate-200">
          <div className={`h-full rounded-full transition-all duration-700 ${atRisk ? "bg-amber-400" : "bg-slate-900"}`} style={{ width: `${current.health}%` }} />
        </div>
        <p className="mt-2 text-[12px] text-slate-500">Healthy threshold: 60%</p>
      </Card>

      {/* Cascade delay */}
      <Card className="p-5">
        <p className={EYEBROW}>Expected Cascade Delay</p>
        <p className="mt-3 text-4xl font-semibold tracking-tight tabular-nums text-slate-900">
          {current.cascadeDelay > 0 ? `+${fmtDays(current.cascadeDelay)}` : "0"}
          <span className="ml-1.5 text-base font-medium text-slate-500">Days</span>
        </p>
        {current.buffer < 0 ? (
          <p className="mt-3 flex items-start gap-1.5 text-[13px] leading-snug text-amber-900">
            <Icon name="alert" className="mt-px h-4 w-4 shrink-0 text-amber-500" />
            Misses {formatDay(current.deadline)} deadline by {fmtDays(-current.buffer)} days.
          </p>
        ) : (
          <p className="mt-3 flex items-start gap-1.5 text-[13px] leading-snug text-slate-600">
            <Icon name="check" className="mt-px h-4 w-4 shrink-0 text-indigo-700" />
            Delivers {formatDay(current.finish)}, {fmtDays(current.buffer)}d before the deadline.
          </p>
        )}
      </Card>

      {/* Bottleneck */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <p className={EYEBROW}>Primary Bottleneck</p>
          <span
            className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
              mitigated ? "bg-slate-100 text-slate-600 ring-slate-200" : "bg-amber-400 text-amber-950 ring-amber-500"
            }`}
          >
            {mitigated ? "Decoupled" : `${fmtDays(unmitigated.bottleneck.def.aiDelayHours / HOURS_PER_DAY)}d behind`}
          </span>
        </div>
        <p className="mt-3 text-[17px] font-semibold leading-snug tracking-tight text-slate-900">{unmitigated.bottleneck.def.name}</p>
        <div className="mt-4 flex items-center gap-2.5 border-t border-slate-100 pt-4">
          <Avatar member={bottleneckOwner} highlight={!mitigated} />
          <div>
            <p className="text-sm font-medium text-slate-900">Assigned to {bottleneckOwner.name}</p>
            <p className="text-[12px] text-slate-500">{mitigated ? "No longer blocking downstream" : "Blocking 2 downstream tasks"}</p>
          </div>
        </div>
      </Card>

      {/* Odds */}
      <Card className="p-5">
        <p className={EYEBROW}>On-Time Success Odds</p>
        <p className="mt-3 flex items-baseline gap-2 text-4xl font-semibold tracking-tight tabular-nums text-slate-900">
          <span className={mitigated ? "text-2xl text-slate-400 line-through decoration-2" : "text-amber-600"}>{unmitigated.odds}%</span>
          <Icon name="arrow" className="h-5 w-5 self-center text-slate-300" />
          <span>{mitigatedForecast.odds}%</span>
        </p>
        <p className="mt-1 text-[13px] text-slate-500">{mitigated ? "Mock API fix applied" : "with Mock API fix"}</p>
        <div className="mt-3 space-y-1.5" aria-hidden="true">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-amber-400" style={{ width: `${unmitigated.odds}%` }} />
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-slate-900" style={{ width: `${mitigatedForecast.odds}%` }} />
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. Dependency cascade chain
   ═══════════════════════════════════════════════════════════════════════════ */

function nodeStatus(id: TaskId, f: Forecast, mitigated: boolean): NodeStatus {
  const t = f.tasks[id];
  if (id === "backend") return t.hours > t.def.plannedHours ? (mitigated ? "decoupled" : "behind") : "on-track";
  if (id === "frontend") return mitigated ? "in-progress" : f.tasks.backend.end > t.plannedStart ? "blocked" : "on-track";
  return f.buffer < 0 ? "at-risk" : "on-track";
}

function CascadeNode({ task, status, index }: { task: TaskForecast; status: NodeStatus; index: number }) {
  const owner = MEMBERS[task.def.owner];
  const meta = NODE_STATUS[status];
  const extra = task.hours - task.def.plannedHours;
  const isRoot = status === "behind";
  const label = status === "behind" ? `${fmtDays(extra / HOURS_PER_DAY)} Days Behind` : meta.label;

  return (
    <article className={`flex h-full flex-col rounded-xl border p-5 transition-colors duration-500 ${meta.card}`}>
      <div className="flex items-center justify-between gap-2">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold transition-colors duration-500 ${
            isRoot ? "bg-amber-400 text-amber-950" : "bg-slate-900 text-white"
          }`}
        >
          {index + 1}
        </span>
        <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset transition-colors duration-500 ${meta.badge}`}>
          {isRoot && <Icon name="alert" className="h-3 w-3" />}
          {label}
        </span>
      </div>

      <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-slate-900">{task.def.short}</h3>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-[13px]">
        <div>
          <p className="text-[11px] text-slate-500">Original</p>
          <p className="mt-0.5 font-medium tabular-nums text-slate-700">{task.def.plannedHours}h</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-500">AI predicted</p>
          <p className="mt-0.5 flex items-center gap-1.5 font-semibold tabular-nums text-slate-900">
            {task.hours}h
            {extra > 0 && <span className="rounded bg-amber-100 px-1 py-px text-[10px] font-bold text-amber-900">+{extra}h</span>}
          </p>
        </div>
      </div>

      <p className="mt-3 text-[12px] tabular-nums text-slate-500">
        Ends {formatDay(task.end)}
        {task.end - task.plannedEnd > 0.05 && <span className="ml-1 font-semibold text-amber-800">({signedDays(task.end - task.plannedEnd)} vs plan)</span>}
      </p>

      <div className="mt-auto flex items-center gap-2 border-t border-slate-200/80 pt-4">
        <Avatar member={owner} highlight={isRoot} size="sm" />
        <span className="text-[13px] font-medium text-slate-900">{owner.name}</span>
        <span className="text-[12px] text-slate-400">· {owner.role}</span>
      </div>
    </article>
  );
}

function CascadeConnector({ blocking, label }: { blocking: boolean; label: string }) {
  const stroke = blocking ? "stroke-amber-400" : "stroke-slate-400";
  return (
    <div className="flex items-center justify-center gap-3 py-2 lg:flex-col lg:gap-1.5 lg:py-0" aria-hidden="true">
      <span
        className={`order-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors duration-500 lg:order-1 ${
          blocking ? "bg-amber-400 text-amber-950" : "bg-slate-100 text-slate-600"
        }`}
      >
        {label}
      </span>
      <svg viewBox="0 0 96 16" preserveAspectRatio="none" className="order-2 hidden h-4 w-full lg:block">
        <circle cx="4" cy="8" r="3" className={blocking ? "fill-amber-400" : "fill-slate-400"} />
        <line x1="8" y1="8" x2="86" y2="8" strokeWidth="2" strokeDasharray={blocking ? undefined : "5 5"} className={stroke} />
        <path d="m84 3 7 5-7 5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={stroke} />
      </svg>
      <svg viewBox="0 0 16 40" className="order-1 h-10 w-4 lg:hidden">
        <line x1="8" y1="0" x2="8" y2="32" strokeWidth="2" strokeDasharray={blocking ? undefined : "5 5"} className={stroke} />
        <path d="m3 30 5 7 5-7" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={stroke} />
      </svg>
    </div>
  );
}

function CascadeChain({ current, mitigated, mitigatedForecast, strategy, onApply, onRevert }: {
  current: Forecast;
  mitigated: boolean;
  mitigatedForecast: Forecast;
  strategy: "idle" | "applying";
  onApply: () => void;
  onRevert: () => void;
}) {
  const ids: TaskId[] = ["backend", "frontend", "e2e"];
  const slip = fmtDays(current.tasks.backend.end - current.tasks.backend.plannedEnd);

  return (
    <Card>
      <CardHeader
        eyebrow="Dependency Cascade"
        title={mitigated ? "Mock API breaks the chain. Downstream work runs in parallel." : `A ${slip}-day backend slip becomes a ${fmtDays(current.cascadeDelay)}-day project delay`}
        aside={
          <div className="flex items-center gap-4 text-[12px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-5 rounded bg-amber-400" />
              Blocking
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 border-t-2 border-dashed border-slate-400" />
              Decoupled
            </span>
          </div>
        }
      />
      <div className="bg-slate-50 p-4 sm:p-6">
        <div className="grid grid-cols-1 items-stretch lg:grid-cols-[1fr_7rem_1fr_7rem_1fr]">
          {ids.map((id, i) => (
            <div key={id} className="contents">
              {i > 0 && (
                <CascadeConnector
                  blocking={!mitigated}
                  label={mitigated ? (i === 1 ? "mocked" : "parallel") : `+${fmtDays(current.tasks[ids[i - 1]].end - current.tasks[ids[i - 1]].plannedEnd)}d slip`}
                />
              )}
              <CascadeNode task={current.tasks[id]} status={nodeStatus(id, current, mitigated)} index={i} />
            </div>
          ))}
        </div>
      </div>

      {/* Inline AI recommendation */}
      <div
        className={`flex flex-col gap-4 border-t px-6 py-4 transition-colors duration-500 sm:flex-row sm:items-center sm:justify-between ${
          mitigated ? "border-slate-100 bg-white" : "border-amber-200 bg-amber-50/60"
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${mitigated ? "bg-slate-900 text-white" : "bg-amber-400 text-amber-950"}`}
          >
            <Icon name={mitigated ? "check" : "spark"} />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {mitigated ? "Strategy active: Mock API Server" : "AI recommends: Deploy a Mock API Server"}
            </p>
            <p className="mt-0.5 text-[13px] text-slate-600">
              {mitigated
                ? `Leyla builds on mocks from day ${MOCK_READY_DAY}; ${INTEGRATION_SWAP_DAYS}-day swap when the live API ships.`
                : `Freeze the OpenAPI contract so Leyla and Elvin continue in parallel. On-time odds ${current.odds}% → ${mitigatedForecast.odds}%.`}
            </p>
          </div>
        </div>
        {mitigated ? (
          <button
            type="button"
            onClick={onRevert}
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg px-3 py-2 text-[13px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900 sm:self-auto"
          >
            <Icon name="undo" />
            Revert
          </button>
        ) : (
          <button
            type="button"
            onClick={onApply}
            disabled={strategy === "applying"}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-wait disabled:bg-slate-700"
          >
            {strategy === "applying" ? (
              <>
                <Icon name="spinner" />
                Applying…
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
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. What-if simulator
   ═══════════════════════════════════════════════════════════════════════════ */

function RangeField({ id, label, hint, value, min, max, step, readout, ticks, active, onChange }: {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  readout: string;
  ticks: string[];
  active: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <label htmlFor={id} className="text-sm font-semibold text-slate-900">{label}</label>
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

function ScenarioSimulator({ scenario, onChange, baseline, simulated }: {
  scenario: Scenario;
  onChange: (s: Scenario) => void;
  baseline: Forecast;
  simulated: Forecast;
}) {
  const dirty = !sameScenario(scenario, BASE_SCENARIO);

  const rows: { metric: string; base: ReactNode; sim: ReactNode; change: ReactNode }[] = (() => {
    const dateDelta = simulated.finish - baseline.finish;
    const dateTrend: Trend = !simulated.feasible || (simulated.buffer < 0 && dateDelta > 0.05) ? "critical" : dateDelta > 0.05 ? "worse" : dateDelta < -0.05 ? "better" : "same";
    const oddsDelta = simulated.odds - baseline.odds;
    const oddsTrend: Trend = oddsDelta < 0 && simulated.odds < 40 ? "critical" : oddsDelta < 0 ? "worse" : oddsDelta > 0 ? "better" : "same";
    const healthDelta = simulated.health - baseline.health;

    const completion = (f: Forecast) => (
      <div>
        <p className="font-semibold tabular-nums text-slate-900">{formatDay(f.finish)}</p>
        <p className={`mt-0.5 text-[12px] ${f.buffer < 0 ? "font-medium text-amber-800" : "text-slate-500"}`}>
          {!f.feasible ? "—" : f.buffer < 0 ? `Misses ${formatDay(f.deadline)} by ${fmtDays(-f.buffer)}d` : `${fmtDays(f.buffer)}d buffer to ${formatDay(f.deadline)}`}
        </p>
      </div>
    );
    const bottleneck = (f: Forecast) => (
      <div>
        <p className="font-medium text-slate-900">{f.bottleneck.def.short}</p>
        <p className="mt-0.5 text-[12px] text-slate-500">
          {MEMBERS[f.bottleneck.def.owner].name} · +{f.bottleneck.hours - f.bottleneck.def.plannedHours}h over plan
        </p>
      </div>
    );
    const action = (f: Forecast) => (
      <p className={`text-[13px] leading-snug ${f.action.severity === "high" ? "font-medium text-amber-950" : "text-slate-700"}`}>{f.action.text}</p>
    );

    return [
      {
        metric: "Completion",
        base: completion(baseline),
        sim: completion(simulated),
        change: <Pill trend={dateTrend}>{!simulated.feasible ? "Blocked" : Math.abs(dateDelta) < 0.05 ? "No change" : `${signedDays(dateDelta)} ${dateDelta > 0 ? "later" : "earlier"}`}</Pill>,
      },
      {
        metric: "On-time odds",
        base: <span className="font-semibold tabular-nums text-slate-900">{baseline.odds}%</span>,
        sim: <span className="font-semibold tabular-nums text-slate-900">{simulated.odds}%</span>,
        change: <Pill trend={oddsTrend}>{oddsDelta === 0 ? "No change" : `${oddsDelta > 0 ? "+" : "−"}${Math.abs(oddsDelta)} pts`}</Pill>,
      },
      {
        metric: "Health score",
        base: <span className="font-semibold tabular-nums text-slate-900">{baseline.health}%</span>,
        sim: <span className="font-semibold tabular-nums text-slate-900">{simulated.health}%</span>,
        change: <Pill trend={healthDelta < 0 ? (simulated.health < 40 ? "critical" : "worse") : healthDelta > 0 ? "better" : "same"}>{healthDelta === 0 ? "No change" : `${healthDelta > 0 ? "+" : "−"}${Math.abs(healthDelta)} pts`}</Pill>,
      },
      {
        metric: "Bottleneck",
        base: bottleneck(baseline),
        sim: bottleneck(simulated),
        change: <Pill trend={baseline.bottleneck.def.id === simulated.bottleneck.def.id ? "same" : "worse"}>{baseline.bottleneck.def.id === simulated.bottleneck.def.id ? "Same task" : "Shifted"}</Pill>,
      },
      {
        metric: "Action required",
        base: action(baseline),
        sim: action(simulated),
        change: <Pill trend={simulated.action.text === baseline.action.text ? "same" : simulated.action.severity === "high" ? "critical" : "worse"}>{simulated.action.text === baseline.action.text ? "Unchanged" : "Revised"}</Pill>,
      },
    ];
  })();

  return (
    <Card className="overflow-hidden">
      <CardHeader
        eyebrow="What-If?"
        title="Scenario simulator"
        aside={
          <div className="flex items-center gap-3">
            {dirty && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-semibold text-amber-950">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-950" />
                Simulating
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange(BASE_SCENARIO)}
              disabled={!dirty}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reset
            </button>
          </div>
        }
      />
      <div className="grid lg:grid-cols-[minmax(300px,360px)_1fr]">
        {/* Controls */}
        <div className="space-y-8 border-b border-slate-200 bg-slate-50 p-6 lg:border-b-0 lg:border-r">
          <RangeField
            id="sim-deadline"
            label="Deadline Adjustment"
            hint={`Deadline becomes ${formatDay(simulated.deadline)}.`}
            value={scenario.deadlineShift}
            min={-5}
            max={5}
            step={1}
            readout={scenario.deadlineShift === 0 ? "No change" : `${scenario.deadlineShift > 0 ? "+" : "−"}${Math.abs(scenario.deadlineShift)} days`}
            ticks={["−5", "−4", "−3", "−2", "−1", "0", "+1", "+2", "+3", "+4", "+5"]}
            active={scenario.deadlineShift !== 0}
            onChange={(v) => onChange({ ...scenario, deadlineShift: v })}
          />

          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">Team Member Absence</legend>
            <p className="mt-0.5 text-[13px] text-slate-600">Absent members' tasks are reassigned at {ABSENT_FACTOR}× effort.</p>
            <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {Object.values(MEMBERS).map((m) => {
                const absent = scenario.absent.includes(m.id);
                return (
                  <li key={m.id} className={`flex items-center justify-between gap-3 px-3.5 py-3 transition-colors ${absent ? "bg-amber-50" : ""}`}>
                    <div className="flex items-center gap-3">
                      <Avatar member={m} highlight={absent} size="sm" />
                      <div>
                        <p className="text-sm font-medium">
                          <span className={absent ? "text-amber-950 line-through decoration-amber-500" : "text-slate-900"}>{m.name}</span>{" "}
                          <span className="font-normal text-slate-500">· {m.role}</span>
                        </p>
                        <p className={`text-[12px] ${absent ? "font-medium text-amber-800" : "text-slate-500"}`}>{absent ? "Absent · 0% capacity" : "Available"}</p>
                      </div>
                    </div>
                    <Toggle
                      checked={absent}
                      label={`Simulate ${m.name} absent`}
                      onChange={(v) => onChange({ ...scenario, absent: v ? [...scenario.absent, m.id] : scenario.absent.filter((x) => x !== m.id) })}
                    />
                  </li>
                );
              })}
            </ul>
          </fieldset>

          <RangeField
            id="sim-workload"
            label="Workload Multiplier"
            hint="Scope growth applied to every task."
            value={scenario.workload}
            min={1}
            max={1.5}
            step={0.05}
            readout={scenario.workload === 1 ? "1.00×" : `${scenario.workload.toFixed(2)}×`}
            ticks={["1.0×", "1.1×", "1.2×", "1.3×", "1.4×", "1.5×"]}
            active={scenario.workload !== 1}
            onChange={(v) => onChange({ ...scenario, workload: Math.round(v * 100) / 100 })}
          />
        </div>

        {/* Comparison table */}
        <div className="overflow-x-auto p-6">
          <table className="w-full min-w-[600px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                <th scope="col" className="w-32 border-b border-slate-200 pb-3 pr-4 font-semibold">Metric</th>
                <th scope="col" className="border-b border-slate-200 pb-3 pr-4 font-semibold">Baseline Status</th>
                <th scope="col" className="border-b border-slate-200 bg-amber-50/60 px-3 pb-3 pt-2 font-semibold text-amber-900">Simulated Scenario</th>
                <th scope="col" className="w-28 border-b border-slate-200 pb-3 pl-4 text-right font-semibold">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const cell = i === rows.length - 1 ? "" : "border-b border-slate-100";
                return (
                  <tr key={r.metric} className="align-top">
                    <th scope="row" className={`py-4 pr-4 text-[13px] font-medium text-slate-600 ${cell}`}>{r.metric}</th>
                    <td className={`py-4 pr-4 ${cell}`}>{r.base}</td>
                    <td className={`bg-amber-50/60 px-3 py-4 ${cell}`}>{r.sim}</td>
                    <td className={`py-4 pl-4 text-right ${cell}`}>{r.change}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-4 text-[12px] text-slate-500">
            Baseline is the current forecast{baseline.tasks.frontend.start === MOCK_READY_DAY ? " with the Mock API strategy applied" : ""}. Simulation never changes the plan.
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. Copilot drawer
   ═══════════════════════════════════════════════════════════════════════════ */

const QUICK_PROMPTS = [
  "What happens if we move the deadline 2 days earlier?",
  "How do we unblock Frontend integration today?",
  "Who is the biggest bottleneck right now?",
];

function buildReply(prompt: string, mitigated: boolean): AssistantReply {
  const q = prompt.toLowerCase();
  const now = forecast(BASE_SCENARIO, mitigated);
  const withMock = forecast(BASE_SCENARIO, true);

  const deadlineMatch = /deadline/.test(q);
  if (deadlineMatch) {
    const n = Number(q.match(/(\d+)\s*day/)?.[1] ?? 2);
    const earlier = /earlier|sooner|forward|pull/.test(q) || !/later|extend|push/.test(q);
    const shift = clamp(earlier ? -n : n, -5, 5);
    const scenario: Scenario = { ...BASE_SCENARIO, deadlineShift: shift };
    const moved = forecast(scenario, mitigated);
    const movedMock = forecast(scenario, true);
    const late = Object.values(moved.tasks).filter((t) => t.end > moved.deadline);
    return {
      role: "assistant",
      kind: "card",
      lead: `The deadline moves to ${formatDay(moved.deadline)}; the work itself doesn't change.`,
      card: {
        problem:
          moved.buffer < 0
            ? `Buffer drops to ${signedDays(moved.buffer)}. Delivery misses by ${fmtDays(-moved.buffer)} days.`
            : `Buffer shrinks to ${fmtDays(moved.buffer)} days.`,
        severity: moved.buffer < -2 ? "Critical" : "High",
        impacts: [
          ...late.map((t) => ({ task: t.def.short, effect: `ends ${formatDay(t.end)}, after the new deadline` })),
          { task: "On-time odds", effect: `${now.odds}% → ${moved.odds}%` },
        ],
        solution: mitigated
          ? {
              title: "Load into the simulator and descope",
              detail: "The Mock API is already active. Open this scenario in the simulator to test scope cuts or absences before committing.",
              oddsBefore: now.odds,
              oddsAfter: moved.odds,
            }
          : {
              title: "Deploy a Mock API Server",
              detail: "Decoupling Frontend from the late Backend recovers about 4 days, enough to absorb most of the earlier deadline.",
              oddsBefore: moved.odds,
              oddsAfter: movedMock.odds,
            },
        action: mitigated ? { kind: "simulate", label: "Open in Simulator", scenario } : { kind: "apply-mock", label: "Apply Strategy" },
      },
    };
  }

  if (/unblock|frontend|mock/.test(q)) {
    if (mitigated) {
      return { role: "assistant", kind: "text", text: `Frontend is already unblocked. Leyla is building on mocks from day ${MOCK_READY_DAY}. Forecast: ${formatDay(now.finish)}, ${fmtDays(now.buffer)}d before the deadline, ${now.odds}% on-time.` };
    }
    const be = now.tasks.backend;
    return {
      role: "assistant",
      kind: "card",
      lead: "Frontend is idle because every integration task needs the auth and user endpoints.",
      card: {
        problem: `Backend API is ${fmtDays((be.hours - be.def.plannedHours) / HOURS_PER_DAY)} days behind and blocks two tasks`,
        severity: "Critical",
        impacts: [
          { task: "Frontend Integration", effect: `can't start until ${formatDay(be.end)} (+${fmtDays(now.tasks.frontend.start - now.tasks.frontend.plannedStart)}d)` },
          { task: "E2E Integration Testing", effect: `pushed to ${formatDay(now.tasks.e2e.end)}, past the deadline` },
        ],
        solution: {
          title: "Deploy a Mock API Server",
          detail: "Freeze the OpenAPI contract today and serve /auth and /users through Mock Service Worker. Leyla starts tomorrow; swapping in the live API takes half a day.",
          oddsBefore: now.odds,
          oddsAfter: withMock.odds,
        },
        action: { kind: "apply-mock", label: "Apply Strategy" },
      },
    };
  }

  if (/bottleneck|who|blocker/.test(q)) {
    const b = now.bottleneck;
    return {
      role: "assistant",
      kind: "text",
      text: mitigated
        ? `${b.def.short} (${MEMBERS[b.def.owner].name}) is still the slowest task at +${b.hours - b.def.plannedHours}h, but it's decoupled. It no longer moves the release date.`
        : `${b.def.short}, owned by ${MEMBERS[b.def.owner].name}. It's forecast at ${b.hours}h against ${b.def.plannedHours}h planned, and it blocks Frontend and E2E behind it.`,
    };
  }

  return {
    role: "assistant",
    kind: "text",
    text: "I can forecast deadline changes, absences and blockers. Try: \"What if the deadline moves 3 days later?\" or \"How do we unblock Frontend integration today?\"",
  };
}

function ReasoningCardView({ card, done, busy, onAction }: { card: ReasoningCard; done: boolean; busy: boolean; onAction: () => void }) {
  return (
    <div className="overflow-hidden rounded-r-lg border-l-4 border-amber-400 bg-slate-50 ring-1 ring-inset ring-slate-200">
      <div className="space-y-2 px-4 pb-3.5 pt-4">
        <p className={EYEBROW}>Problem</p>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-400 px-1.5 py-0.5 text-[11px] font-semibold text-amber-950">
            <Icon name="alert" className="h-3 w-3" />
            {card.severity}
          </span>
          <p className="text-sm font-semibold leading-snug text-slate-900">{card.problem}</p>
        </div>
      </div>
      <div className="space-y-2 border-t border-slate-200 px-4 py-3.5">
        <p className={EYEBROW}>Impact</p>
        <ul className="space-y-1.5">
          {card.impacts.map((i) => (
            <li key={i.task} className="flex gap-2.5 text-[13px] leading-snug">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              <span className="text-slate-600">
                <span className="font-medium text-slate-900">{i.task}</span>: {i.effect}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-1.5 border-t border-slate-200 bg-white px-4 py-3.5">
        <p className={EYEBROW}>Recommended solution</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">{card.solution.title}</p>
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-indigo-700 ring-1 ring-inset ring-blue-200">
            <span className="text-amber-700">{card.solution.oddsBefore}%</span>
            <Icon name="arrow" className="h-3 w-3 text-slate-400" />
            {card.solution.oddsAfter}%
          </span>
        </div>
        <p className="text-[13px] leading-relaxed text-slate-600">{card.solution.detail}</p>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
        <p className="text-[12px] text-slate-500">{done ? "Done. Dashboard updated." : "Updates the dashboard immediately."}</p>
        {done ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-[13px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
            <Icon name="check" />
            Applied
          </span>
        ) : (
          <button
            type="button"
            onClick={onAction}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-700"
          >
            {busy ? <Icon name="spinner" /> : null}
            {card.action.label}
            {!busy && <Icon name="arrow" />}
          </button>
        )}
      </div>
    </div>
  );
}

function CopilotDrawer({ open, onClose, mitigated, strategyBusy, onApplyMock, onSimulate, inputRef }: {
  open: boolean;
  onClose: () => void;
  mitigated: boolean;
  strategyBusy: boolean;
  onApplyMock: () => void;
  onSimulate: (s: Scenario) => void;
  inputRef: Ref<HTMLInputElement>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      kind: "text",
      text: "Watching 3 tasks and 3 people. One critical cascade detected: Backend API → Frontend → E2E. Ask me a what-if question.",
    },
  ]);
  const [doneIds, setDoneIds] = useState<number[]>([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const nextId = useRef(2);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || typing) return;
    setMessages((m) => [...m, { id: nextId.current++, role: "user", text: trimmed }]);
    setDraft("");
    setTyping(true);
    const reply = buildReply(trimmed, mitigated);
    timers.current.push(
      window.setTimeout(() => {
        setMessages((m) => [...m, { ...reply, id: nextId.current++ } as ChatMessage]);
        setTyping(false);
      }, 800),
    );
  };

  const runAction = (msgId: number, card: ReasoningCard) => {
    if (card.action.kind === "apply-mock") onApplyMock();
    else onSimulate(card.action.scenario);
    setDoneIds((d) => [...d, msgId]);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    send(draft);
  };

  return (
    <div className={`fixed inset-0 z-50 transition-[visibility] duration-300 ${open ? "visible" : "invisible"}`} aria-hidden={!open}>
      <div onClick={onClose} className={`absolute inset-0 bg-slate-900/25 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="copilot-title"
        className={`absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col bg-white shadow-2xl shadow-slate-900/10 transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-start justify-between gap-3 bg-slate-900 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-amber-400 ring-1 ring-inset ring-white/10">
              <Icon name="spark" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="copilot-title" className="text-[15px] font-semibold tracking-tight">Risk Copilot</h2>
                <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950">Predictive Mode</span>
              </div>
              <p className="mt-0.5 text-[12px] text-slate-400">Student Team Project Q4</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close copilot" className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <Icon name="close" />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm leading-relaxed text-slate-900">{m.text}</p>
              </div>
            ) : (
              <div key={m.id} className="flex gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-amber-400">
                  <Icon name="spark" className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  {m.kind === "text" ? (
                    <p className="rounded-r-lg border-l-4 border-amber-400 bg-slate-50 px-3.5 py-2.5 text-sm leading-relaxed text-slate-700">{m.text}</p>
                  ) : (
                    <>
                      <p className="text-sm leading-relaxed text-slate-700">{m.lead}</p>
                      <ReasoningCardView
                        card={m.card}
                        done={doneIds.includes(m.id) || (m.card.action.kind === "apply-mock" && mitigated)}
                        busy={m.card.action.kind === "apply-mock" && strategyBusy}
                        onAction={() => runAction(m.id, m.card)}
                      />
                    </>
                  )}
                </div>
              </div>
            ),
          )}
          {typing && (
            <div className="flex gap-2.5" aria-live="polite">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-amber-400">
                <Icon name="spark" className="h-3.5 w-3.5" />
              </span>
              <div className="flex items-center gap-1 rounded-r-lg border-l-4 border-amber-400 bg-slate-50 px-3.5 py-3">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200">
          <div className="flex gap-2 overflow-x-auto px-5 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => send(p)}
                disabled={typing}
                className="shrink-0 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-950 disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="p-4 pt-3">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pl-3.5 pr-1.5 shadow-sm focus-within:border-slate-400">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask a scenario question..."
                aria-label="Ask a scenario question"
                className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!draft.trim() || typing}
                aria-label="Send"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
              >
                <Icon name="send" />
              </button>
            </div>
          </form>
        </div>
      </aside>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════════════════════ */

const NEW_INBOX_ALERTS = 3;
const SECTION_IDS = ["dashboard", "cascade", "simulator"] as const;
type SectionId = (typeof SECTION_IDS)[number];
type View = "dashboard" | "tasks" | "inbox" | "workload" | "settings" | "profile";

/* ═══════════════════════════════════════════════════════════════════════════
   Assigned tasks for the profile page
   ═══════════════════════════════════════════════════════════════════════════ */

const OTHER_PROJECT_TASKS: Record<string, AssignedTask[]> = {
  anar: [
    { id: "x-auth", task: "Auth service hardening", project: "Capstone Mobile App", due: "Nov 4", risk: "Low", note: "On plan; forecast paused for this project." },
    { id: "x-pay", task: "Payments API spike", project: "GovTech Hackathon MVP", due: "Oct 24", risk: "Medium", note: "Depends on a third-party sandbox that's often down." },
  ],
  leyla: [{ id: "x-onb", task: "Onboarding screens", project: "Capstone Mobile App", due: "Oct 30", risk: "Medium", note: "Design review still pending." }],
  elvin: [{ id: "x-a11y", task: "Accessibility audit", project: "GovTech Hackathon MVP", due: "Nov 7", risk: "Low", note: "Scoped and scheduled." }],
  nigar: [{ id: "x-access", task: "Workspace access review", project: "Student Team Project Q4", due: "Oct 20", risk: "Low", note: "Quarterly permissions check." }],
};

function liveRisk(id: TaskId, f: Forecast, mitigated: boolean): RiskLevel {
  if (id === "backend") return mitigated ? "Medium" : "Critical";
  if (id === "frontend") return mitigated ? "Low" : "High";
  return f.buffer < 0 ? "High" : "Low";
}

function assignedTasksFor(user: UserProfile, f: Forecast, mitigated: boolean): AssignedTask[] {
  const key = user.fullName.split(" ")[0].toLowerCase();
  const member = (Object.keys(MEMBERS) as MemberId[]).find((m) => m === key);
  const live: AssignedTask[] = member
    ? TASKS.filter((t) => t.owner === member).map((t) => {
        const tf = f.tasks[t.id];
        const extra = tf.hours - t.plannedHours;
        return {
          id: t.id,
          task: t.name,
          project: PROJECTS[0].name,
          due: formatDay(tf.plannedEnd),
          risk: liveRisk(t.id, f, mitigated),
          note:
            t.id === "backend" && mitigated
              ? `Still forecast at ${tf.hours}h, but decoupled by the Mock API.`
              : extra > 0
                ? `AI forecasts ${tf.hours}h against ${t.plannedHours}h planned; ends ${formatDay(tf.end)}.`
                : `Forecast on plan; ends ${formatDay(tf.end)}.`,
        };
      })
    : [];
  return [...live, ...(OTHER_PROJECT_TASKS[key] ?? [])];
}

const SEVERITY_RANK: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const SEVERITY_LEVEL: Record<Severity, RiskLevel> = { CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

/** The user's open tasks in the selected project, each with the worst active risk on it. */
function liveAssignedTasks(live: Live, userId: string): AssignedTask[] {
  if (!live.project) return [];
  return live.tasks
    .filter((t) => t.assignee?.id === userId && OPEN_STATUSES.includes(t.status))
    .map((t) => {
      const mine = live.risks.filter((r) => r.taskId === t.id || r.affectedTaskIds.includes(t.id));
      const worst = SEVERITY_RANK.find((sev) => mine.some((r) => r.severity === sev));
      const top = worst ? mine.find((r) => r.severity === worst) : undefined;
      return {
        id: t.id,
        task: t.title,
        project: live.project!.name,
        due: fmtDate(t.dueDate),
        risk: worst ? SEVERITY_LEVEL[worst] : "Low",
        note: top ? top.title : `${humanize(t.status)} · ${t.progressPercentage}% complete${t.overdue ? " · overdue" : ""}`,
      };
    });
}

/* ═══════════════════════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════════════════════ */

export default function PredictiveRiskManager() {
  const [projectId, setProjectId] = useState(PROJECTS[0].id);
  const [mitigated, setMitigated] = useState(false);
  const [strategy, setStrategy] = useState<"idle" | "applying">("idle");
  const [scenario, setScenario] = useState<Scenario>(BASE_SCENARIO);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [section, setSection] = useState<SectionId>("dashboard");
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [inboxUnread, setInboxUnread] = useState(NEW_INBOX_ALERTS);
  const [user, setUser] = useState<UserProfile | null>(loadSession);
  const [auth, setAuth] = useState<{ open: boolean; tab: AuthTab }>({ open: false, tab: "signin" });
  const [activity, setActivity] = useState<ActivityEntry[]>(() => loadActivity(loadSession()?.id ?? null));
  const [notice, setNotice] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const live = useLive(user !== null);
  const activityRef = useRef(activity);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingScroll = useRef<SectionId | null>(null);
  const timer = useRef<number | null>(null);
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    document.title = view === "profile" && user ? `${user.fullName} · ${BRAND}` : `${BRAND} · Risk forecast`;
  }, [view, user]);

  const current = useMemo(() => forecast(BASE_SCENARIO, mitigated), [mitigated]);
  const unmitigated = useMemo(() => forecast(BASE_SCENARIO, false), []);
  const withMock = useMemo(() => forecast(BASE_SCENARIO, true), []);
  const simulated = useMemo(() => forecast(scenario, mitigated), [scenario, mitigated]);

  /* ───── activity log (only recorded for a signed-in user) ───── */

  // The ref mirrors the state so several entries logged in one tick are all persisted.
  const logActivity = useCallback((kind: ActivityKind, text: string, detail?: string) => {
    const who = userRef.current;
    if (!who) return;
    const entry: ActivityEntry = { id: `a-${Date.now().toString(36)}-${activityRef.current.length}`, at: Date.now(), kind, text, detail };
    activityRef.current = [entry, ...activityRef.current];
    setActivity(activityRef.current);
    saveActivity(who.id, activityRef.current);
  }, []);

  const applyMock = useCallback(() => {
    if (mitigated) return;
    setStrategy("applying");
    timer.current = window.setTimeout(() => {
      setMitigated(true);
      setStrategy("idle");
      logActivity("ai", "Applied AI Mock API recommendation", `On-time odds ${unmitigated.odds}% → ${withMock.odds}%`);
    }, 1000);
  }, [mitigated, logActivity, unmitigated.odds, withMock.odds]);

  const revertMock = () => {
    setMitigated(false);
    logActivity("ai", "Reverted Mock API strategy", "Backend API is blocking downstream work again");
  };

  const openCopilot = useCallback(() => {
    setCopilotOpen(true);
    setInboxUnread(0);
    window.setTimeout(() => inputRef.current?.focus(), 320);
  }, []);

  /* ───── auth ───── */

  const openAuth = (tab: AuthTab) => setAuth({ open: true, tab });
  const closeAuth = useCallback(() => setAuth((a) => ({ ...a, open: false })), []);

  const onAuthenticated = (next: UserProfile, remember: boolean, how: "signin" | "register" | "demo") => {
    saveSession(next, remember);
    userRef.current = next;
    activityRef.current = loadActivity(next.id);
    setActivity(activityRef.current);
    setNotice(null);
    setUser(next);
    setAuth((a) => ({ ...a, open: false }));
    if (how === "register") logActivity("account", `Created workspace ${next.workspace}`);
    else logActivity("account", how === "demo" ? `Signed in with demo account (${next.role})` : "Signed in", remember ? "Session remembered on this device" : undefined);
  };

  const signedOut = useCallback(() => {
    userRef.current = null;
    activityRef.current = [];
    setActivity([]);
    setUser(null);
    setCopilotOpen(false);
    setView("dashboard");
  }, []);

  const logOut = () => {
    void endSession();
    signedOut();
  };

  // The API client calls this when the refresh token is rejected.
  useEffect(() => {
    setAuthLostHandler(() => {
      clearSession();
      signedOut();
      setNotice("Your session has expired. Sign in again to keep working.");
    });
    return () => setAuthLostHandler(null);
  }, [signedOut]);

  const saveProfile = (next: UserProfile) => {
    setUser(next);
    updateSession(next);
    savePrefs(next);
    logActivity("account", "Updated profile preferences");
  };

  /* ───── navigation ───── */

  const scrollToSection = (id: SectionId) => {
    if (id === "dashboard") window.scrollTo({ top: 0, behavior: "smooth" });
    else document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const goToSection = (id: SectionId) => {
    setSection(id);
    if (view === "dashboard") scrollToSection(id);
    else {
      pendingScroll.current = id;
      setView("dashboard");
    }
  };

  const showView = (next: Exclude<View, "dashboard">) => {
    setView(next);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0 });
  };

  // Scroll once the dashboard has re-rendered after leaving another view.
  useEffect(() => {
    if (view === "dashboard" && pendingScroll.current) {
      scrollToSection(pendingScroll.current);
      pendingScroll.current = null;
    }
  }, [view]);

  const onNavigate = (id: NavId) => {
    setMobileNavOpen(false);
    if (id === "inbox") {
      // Signed in: the real inbox. Signed out: the demo Copilot, as before.
      if (live.enabled) showView("inbox");
      else openCopilot();
    } else if (id === "tasks" || id === "workload" || id === "settings") showView(id);
    else goToSection(id);
  };

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      writeCollapsed(!c);
      return !c;
    });

  // Scroll-spy: highlight the dashboard section currently in view.
  useEffect(() => {
    if (view !== "dashboard") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setSection(visible.target.id as SectionId);
      },
      { rootMargin: "-35% 0px -60% 0px" },
    );
    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [view]);

  const simulateFromChat = (s: Scenario) => {
    setScenario(s);
    setCopilotOpen(false);
    logActivity("plan", `Opened a Copilot scenario in the simulator`, `Deadline ${s.deadlineShift > 0 ? "+" : "−"}${Math.abs(s.deadlineShift)} days`);
    window.setTimeout(() => goToSection("simulator"), 320);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (auth.open) return; // the modal owns the keyboard while open
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (copilotOpen) inputRef.current?.focus();
        else openCopilot();
      } else if (e.key === "Escape") {
        if (copilotOpen) setCopilotOpen(false);
        else if (mobileNavOpen) setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [auth.open, copilotOpen, mobileNavOpen, openCopilot]);

  const navItems: NavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "cascade", label: "Risk Cascade", icon: "cascade" },
    { id: "simulator", label: "What-If Simulator", icon: "sliders" },
    { id: "inbox", label: "AI Inbox", icon: "inbox", badge: (live.enabled ? live.unread : inboxUnread) || undefined },
    { id: "tasks", label: "Tasks", icon: "cascade" },
    { id: "workload", label: "Team Workload", icon: "users" },
    { id: "settings", label: "Settings", icon: "settings" },
  ];
  const activeView: View = view === "profile" && !user ? "dashboard" : view;
  const activeNav: NavId | null = copilotOpen && !live.enabled ? "inbox" : activeView === "dashboard" ? section : activeView === "profile" ? null : activeView;

  /* ───── what the signed-in UI shows, derived from the API ───── */

  const shownUser = useMemo<UserProfile | null>(
    () => (user && live.workspace ? { ...user, workspace: live.workspace.name, role: roleLabel(live.workspace.myRole, live.project?.myRole) } : user),
    [user, live.workspace, live.project?.myRole],
  );
  const switcherProjects: Project[] = live.enabled ? live.projects.map((p) => ({ id: p.id, name: p.status === "ARCHIVED" ? `${p.name} (archived)` : p.name, live: true })) : PROJECTS;
  const switcherActive = live.enabled ? (live.project?.id ?? null) : projectId;
  const liveAtRisk = live.summary?.overallSeverity === "HIGH" || live.summary?.overallSeverity === "CRITICAL";
  const signInAction = { label: "Sign in", onClick: () => openAuth("signin") };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-700 antialiased">
      <Sidebar
        items={navItems}
        active={activeNav}
        collapsed={collapsed}
        mobileOpen={mobileNavOpen}
        user={shownUser}
        onAccount={() => (user ? showView("profile") : openAuth("signin"))}
        onSelect={onNavigate}
        onToggleCollapsed={toggleCollapsed}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav
          projects={switcherProjects}
          projectId={switcherActive}
          projectsLoading={live.booting}
          onProjectChange={live.enabled ? live.selectProject : setProjectId}
          onCreateProject={live.workspace ? () => setCreatingProject(true) : undefined}
          atRisk={live.enabled && live.project ? liveAtRisk : current.buffer < 0}
          onOpenCopilot={openCopilot}
          onOpenNav={() => setMobileNavOpen(true)}
          userMenu={
            <UserMenu
              user={shownUser}
              onSignIn={() => openAuth("signin")}
              onRegister={() => openAuth("register")}
              onViewProfile={() => showView("profile")}
              onWorkspaceSettings={() => showView("settings")}
              onLogOut={logOut}
            />
          }
        />

        <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-8 sm:px-6 lg:px-8">
          {notice && <Notice onDismiss={() => setNotice(null)}>{notice}</Notice>}
          {live.enabled && live.error && !live.booting && <Notice>{live.error}</Notice>}

          {activeView === "dashboard" && (
            <>
              <section id="dashboard" className="scroll-mt-24 space-y-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                      {user ? `Good to see you, ${user.fullName.split(" ")[0]}` : "Risk forecast"}
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                      {live.enabled && live.project
                        ? `${live.project.name} · Deadline ${fmtDate(live.project.deadline)} · ${live.members.length} members · ${live.tasks.length} tasks`
                        : live.enabled
                          ? live.workspace?.name ?? "Your workspace"
                          : `Deadline ${formatDay(PLANNED_DEADLINE)} · ${Object.keys(MEMBERS).length} members · ${TASKS.length} dependent tasks · ${HOURS_PER_DAY}h working days`}
                    </p>
                  </div>
                  {!live.enabled && (
                    <div className="flex -space-x-1.5">
                      {Object.values(MEMBERS).map((m) => (
                        <Avatar key={m.id} member={m} highlight={m.id === "anar" && !mitigated} />
                      ))}
                    </div>
                  )}
                </div>

                {live.enabled &&
                  (live.booting ? (
                    <Card>
                      <Loading label="Loading your workspace…" />
                    </Card>
                  ) : !live.workspace ? (
                    <Card>
                      <Empty title="You don't have a workspace yet" hint="Create one in Settings to start tracking projects.">
                        <button type="button" onClick={() => showView("settings")} className={btnPrimary}>
                          Open settings
                        </button>
                      </Empty>
                    </Card>
                  ) : !live.project ? (
                    <Card>
                      <Empty title="No projects in this workspace" hint="Create a project, add tasks, then run a risk analysis.">
                        <button type="button" onClick={() => setCreatingProject(true)} className={btnPrimary}>
                          + New project
                        </button>
                      </Empty>
                    </Card>
                  ) : (
                    <LiveRiskPanel live={live} onOpenTasks={() => showView("tasks")} />
                  ))}

                {live.enabled && (
                  <Notice tone="info">
                    <span className="font-semibold text-slate-900">Illustrative forecast. </span>
                    The metrics, dependency cascade and what-if simulator below run on built-in sample data ({PROJECTS[0].name}). The API has no forecast or simulation endpoints yet, so
                    they do not reflect the project above.
                  </Notice>
                )}

                <MetricGrid current={current} unmitigated={unmitigated} mitigatedForecast={withMock} mitigated={mitigated} />
              </section>

              <section id="cascade" className="scroll-mt-24">
                <CascadeChain
                  current={current}
                  mitigated={mitigated}
                  mitigatedForecast={withMock}
                  strategy={strategy}
                  onApply={applyMock}
                  onRevert={revertMock}
                />
              </section>

              <section id="simulator" className="scroll-mt-24">
                <ScenarioSimulator scenario={scenario} onChange={setScenario} baseline={current} simulated={simulated} />
              </section>
            </>
          )}

          {activeView === "profile" && user && shownUser && (
            <ProfileView
              key={user.id}
              user={shownUser}
              accountManaged={live.enabled}
              tasks={live.enabled ? liveAssignedTasks(live, user.id) : assignedTasksFor(user, current, mitigated)}
              activity={activity}
              onSave={saveProfile}
              onBack={() => goToSection("dashboard")}
            />
          )}

          {activeView === "tasks" &&
            (live.enabled ? (
              <TasksView live={live} meId={user?.id ?? null} />
            ) : (
              <PlaceholderView title="Tasks" description="Sign in to see, create and update the tasks of your projects." onBack={() => goToSection("dashboard")} action={signInAction} />
            ))}

          {activeView === "inbox" && live.enabled && <InboxView live={live} />}

          {activeView === "workload" &&
            (live.enabled ? (
              <WorkloadView live={live} />
            ) : (
              <PlaceholderView title="Team Workload" description="Sign in to see how open work is spread across your team." onBack={() => goToSection("dashboard")} action={signInAction} />
            ))}

          {activeView === "settings" &&
            (live.enabled ? (
              <SettingsView live={live} meId={user?.id ?? null} />
            ) : (
              <PlaceholderView title="Settings" description="Sign in to manage your workspace, projects and members." onBack={() => goToSection("dashboard")} action={signInAction} />
            ))}
        </main>
      </div>

      <CopilotDrawer
        open={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        mitigated={mitigated}
        strategyBusy={strategy === "applying"}
        onApplyMock={applyMock}
        onSimulate={simulateFromChat}
        inputRef={inputRef}
      />

      {creatingProject && live.workspace && (
        <CreateProjectModal
          workspaceId={live.workspace.id}
          onClose={() => setCreatingProject(false)}
          onCreated={(created) => {
            setCreatingProject(false);
            void live.reloadProjects(created.id);
            logActivity("plan", `Created project ${created.name}`);
          }}
        />
      )}

      <AuthModal
        open={auth.open}
        tab={auth.tab}
        onTabChange={(tab) => setAuth({ open: true, tab })}
        onClose={closeAuth}
        onAuthenticated={onAuthenticated}
      />
    </div>
  );
}
