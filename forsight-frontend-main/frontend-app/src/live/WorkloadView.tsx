import { useMemo } from "react";
import { Card, CardHeader } from "../ui";
import { Chip, Empty, Loading, NoProject, PageTitle, SeverityBadge } from "./common";
import { OPEN_STATUSES, fmtDate, humanize } from "./format";
import type { Live } from "./useLive";

interface Row {
  key: string;
  name: string;
  subtitle: string;
  open: number;
  overdue: number;
  blocked: number;
  hours: number;
  unestimated: number;
  progress: number;
}

/** Per-member workload for the selected project, computed from its tasks, plus the engine's imbalance warnings. */
export function WorkloadView({ live }: { live: Live }) {
  const { project, tasks, members, risks } = live;

  const rows = useMemo<Row[]>(() => {
    const open = tasks.filter((t) => OPEN_STATUSES.includes(t.status));
    const build = (key: string, name: string, subtitle: string, mine: typeof open): Row => ({
      key,
      name,
      subtitle,
      open: mine.length,
      overdue: mine.filter((t) => t.overdue).length,
      blocked: mine.filter((t) => t.status === "BLOCKED").length,
      hours: mine.reduce((sum, t) => sum + (t.estimatedHours ?? 0), 0),
      unestimated: mine.filter((t) => t.estimatedHours == null).length,
      progress: mine.length ? Math.round(mine.reduce((s, t) => s + t.progressPercentage, 0) / mine.length) : 0,
    });
    const known = new Set(members.map((m) => m.userId));
    const list = members.map((m) => build(m.userId, m.fullName, humanize(m.role), open.filter((t) => t.assignee?.id === m.userId)));
    // Someone assigned but no longer listed (e.g. visibility rules) still shows up.
    const strays = new Map<string, string>();
    open.forEach((t) => t.assignee && !known.has(t.assignee.id) && strays.set(t.assignee.id, t.assignee.fullName));
    strays.forEach((name, id) => list.push(build(id, name, "Not a project member", open.filter((t) => t.assignee?.id === id))));
    list.push(build("unassigned", "Unassigned", "No owner yet", open.filter((t) => !t.assignee)));
    return list;
  }, [tasks, members]);

  if (!project) return <NoProject />;

  const maxHours = Math.max(1, ...rows.map((r) => r.hours));
  const imbalance = risks.filter((r) => r.category === "WORKLOAD_IMBALANCE");
  const nameOf = (id: string | null) => members.find((m) => m.userId === id)?.fullName;

  return (
    <div className="space-y-6">
      <PageTitle title="Team Workload" subtitle={`${project.name} · open tasks and estimated hours per person`} />

      {imbalance.length > 0 && (
        <Card>
          <CardHeader eyebrow="Engine warnings" title="Workload imbalance detected" />
          <ul className="divide-y divide-slate-100">
            {imbalance.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-6 py-4">
                <SeverityBadge severity={r.severity} />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                  <p className="mt-0.5 text-[13px] text-slate-600">{r.summary}</p>
                  {nameOf(r.subjectUserId) && <p className="mt-1 text-[12px] text-slate-500">Concerns {nameOf(r.subjectUserId)}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader eyebrow="Capacity" title="Open work by person" />
        {live.projectLoading && tasks.length === 0 ? (
          <Loading label="Loading workload…" />
        ) : members.length === 0 && tasks.length === 0 ? (
          <Empty title="No members or tasks yet" hint="Add members and tasks to see how work is spread." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.key} className={`grid gap-3 px-6 py-4 md:grid-cols-[14rem_1fr_auto] md:items-center ${r.key === "unassigned" && r.open > 0 ? "bg-amber-50/40" : ""}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{r.name}</p>
                  <p className="text-[12px] text-slate-500">{r.subtitle}</p>
                </div>
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${r.hours} estimated hours`}>
                    <div className={`h-full rounded-full ${r.overdue || r.blocked ? "bg-amber-400" : "bg-slate-900"}`} style={{ width: `${(r.hours / maxHours) * 100}%` }} />
                  </div>
                  <p className="mt-1.5 text-[12px] text-slate-500">
                    {r.hours}h estimated · {r.progress}% average progress
                    {r.unestimated > 0 && ` · ${r.unestimated} without an estimate`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                  <Chip>{r.open} open</Chip>
                  {r.overdue > 0 && <Chip tone="warn">{r.overdue} overdue</Chip>}
                  {r.blocked > 0 && <Chip tone="warn">{r.blocked} blocked</Chip>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {tasks.some((t) => OPEN_STATUSES.includes(t.status) && t.dueDate) && (
        <p className="text-[12px] text-slate-500">
          Next due: {fmtDate(tasks.filter((t) => OPEN_STATUSES.includes(t.status) && t.dueDate).map((t) => t.dueDate!).sort()[0])}. Hours are summed from each open task's estimate; tasks without one count as 0h.
        </p>
      )}
    </div>
  );
}
