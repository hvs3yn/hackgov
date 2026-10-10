import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Card, EYEBROW, Field, Icon } from "../ui";
import { inputClass } from "../styles";
import { ApiError, TASK_PRIORITIES, TASK_STATUSES, errorMessage, tasks as tasksApi } from "../api";
import type { TaskActivity, TaskDetail, TaskPriority, TaskStatus, TaskView, RiskView } from "../api";
import { Chip, Empty, Loading, NoProject, Notice, Overlay, OverlayHeader, PageTitle, SeverityBadge, StatusBadge } from "./common";
import { PRIORITY_STYLE, ago, btnPrimary, btnSecondary, fmtDate, humanize, selectClass } from "./format";
import type { Live } from "./useLive";

/* ───── shared form fields ───── */

interface Fields {
  title: string;
  description: string;
  priority: TaskPriority;
  assigneeId: string;
  startDate: string;
  dueDate: string;
  estimatedHours: string;
  actualHours: string;
}

const blankFields = (): Fields => ({ title: "", description: "", priority: "MEDIUM", assigneeId: "", startDate: "", dueDate: "", estimatedHours: "", actualHours: "" });

const fieldsOf = (t: TaskView): Fields => ({
  title: t.title,
  description: t.description ?? "",
  priority: t.priority,
  assigneeId: t.assignee?.id ?? "",
  startDate: t.startDate ?? "",
  dueDate: t.dueDate ?? "",
  estimatedHours: t.estimatedHours?.toString() ?? "",
  actualHours: t.actualHours?.toString() ?? "",
});

const num = (v: string): number | null => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));

function TaskFields({ value, onChange, assignees, showAssignee, showActual, disabled }: {
  value: Fields;
  onChange: (next: Fields) => void;
  assignees: { id: string; name: string }[];
  showAssignee: boolean;
  showActual: boolean;
  disabled?: boolean;
}) {
  const set = <K extends keyof Fields>(key: K) => (v: Fields[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field id="tf-title" label="Title">
          <input id="tf-title" value={value.title} maxLength={200} disabled={disabled} onChange={(e) => set("title")(e.target.value)} className={inputClass(false)} autoFocus />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field id="tf-desc" label="Description">
          <textarea id="tf-desc" rows={2} value={value.description} disabled={disabled} onChange={(e) => set("description")(e.target.value)} className={inputClass(false)} />
        </Field>
      </div>
      <Field id="tf-priority" label="Priority">
        <select id="tf-priority" value={value.priority} disabled={disabled} onChange={(e) => set("priority")(e.target.value as TaskPriority)} className={inputClass(false)}>
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {humanize(p)}
            </option>
          ))}
        </select>
      </Field>
      {showAssignee && (
        <Field id="tf-assignee" label="Assignee">
          <select id="tf-assignee" value={value.assigneeId} disabled={disabled} onChange={(e) => set("assigneeId")(e.target.value)} className={inputClass(false)}>
            <option value="">Unassigned</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field id="tf-start" label="Start date">
        <input id="tf-start" type="date" value={value.startDate} disabled={disabled} onChange={(e) => set("startDate")(e.target.value)} className={inputClass(false)} />
      </Field>
      <Field id="tf-due" label="Due date">
        <input id="tf-due" type="date" value={value.dueDate} min={value.startDate || undefined} disabled={disabled} onChange={(e) => set("dueDate")(e.target.value)} className={inputClass(false)} />
      </Field>
      <Field id="tf-est" label="Estimated hours">
        <input id="tf-est" type="number" min={0} step={0.5} value={value.estimatedHours} disabled={disabled} onChange={(e) => set("estimatedHours")(e.target.value)} className={inputClass(false)} />
      </Field>
      {showActual && (
        <Field id="tf-act" label="Actual hours">
          <input id="tf-act" type="number" min={0} step={0.5} value={value.actualHours} disabled={disabled} onChange={(e) => set("actualHours")(e.target.value)} className={inputClass(false)} />
        </Field>
      )}
    </div>
  );
}

/* ───── create ───── */

function CreateTask({ live, onClose }: { live: Live; onClose: () => void }) {
  const [fields, setFields] = useState<Fields>(blankFields);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assignees = live.members.filter((m) => m.role !== "VIEWER").map((m) => ({ id: m.userId, name: m.fullName }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fields.title.trim()) return setError("Give the task a title.");
    if (fields.startDate && fields.dueDate && fields.dueDate < fields.startDate) return setError("The due date is before the start date.");
    setBusy(true);
    setError(null);
    try {
      const created = await tasksApi.create(live.project!.id, {
        title: fields.title.trim(),
        description: fields.description.trim() || undefined,
        priority: fields.priority,
        assigneeId: fields.assigneeId || null,
        startDate: fields.startDate || null,
        dueDate: fields.dueDate || null,
        estimatedHours: num(fields.estimatedHours),
      });
      live.upsertTask(created);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Overlay label="New task" onClose={onClose}>
      <OverlayHeader title="New task" onClose={onClose} />
      <form onSubmit={submit} className="space-y-4 p-6">
        <TaskFields value={fields} onChange={setFields} assignees={assignees} showAssignee showActual={false} disabled={busy} />
        {error && <Notice>{error}</Notice>}
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy && <Icon name="spinner" />}
            Create task
          </button>
        </div>
      </form>
    </Overlay>
  );
}

/* ───── detail drawer ───── */

function TaskDrawer({ taskId, live, onClose, run }: { taskId: string; live: Live; onClose: () => void; run: Runner }) {
  const task = live.tasks.find((t) => t.id === taskId);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [activity, setActivity] = useState<TaskActivity[]>([]);
  const [taskRisks, setTaskRisks] = useState<RiskView[]>([]);
  const [fields, setFields] = useState<Fields | null>(task ? fieldsOf(task) : null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prereq, setPrereq] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const version = task?.version;

  // Reload the related data whenever the task itself changed (version bump) or its dependencies were edited.
  const [depTick, setDepTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([tasksApi.get(taskId), tasksApi.activity(taskId), tasksApi.risks(taskId)]).then(([d, a, r]) => {
      if (cancelled) return;
      if (d.status === "fulfilled") setDetail(d.value);
      else setError(errorMessage(d.reason));
      if (a.status === "fulfilled") setActivity(a.value.content);
      if (r.status === "fulfilled") setTaskRisks(r.value);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [taskId, version, depTick]);

  if (!task || !fields) {
    return (
      <Overlay label="Task" onClose={onClose} side>
        <OverlayHeader title="Task" onClose={onClose} />
        <Empty title="This task no longer exists" />
      </Overlay>
    );
  }

  const editable = live.canEdit;
  const dirty = JSON.stringify(fields) !== JSON.stringify(fieldsOf(task));
  const assignees = live.members.filter((m) => m.role !== "VIEWER").map((m) => ({ id: m.userId, name: m.fullName }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!fields.title.trim()) return setError("Give the task a title.");
    setBusy(true);
    setError(null);
    const ok = await run(task, () =>
      tasksApi.edit(task.id, {
        version: task.version,
        title: fields.title.trim(),
        description: fields.description.trim() || null,
        priority: fields.priority,
        startDate: fields.startDate || null,
        dueDate: fields.dueDate || null,
        estimatedHours: num(fields.estimatedHours),
        actualHours: num(fields.actualHours),
      }),
    );
    setBusy(false);
    if (ok) setFields(fieldsOf(ok));
  };

  const dependency = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      setPrereq("");
      setDepTick((n) => n + 1);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const archive = async () => {
    setBusy(true);
    try {
      await tasksApi.archive(task.id, task.version);
      live.removeTask(task.id);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
      setConfirmArchive(false);
      if (err instanceof ApiError && err.code === "VERSION_CONFLICT") void live.reloadProject();
    }
  };

  const linked = new Set([task.id, ...(detail?.prerequisites.map((p) => p.id) ?? [])]);
  const candidates = live.tasks.filter((t) => !linked.has(t.id));

  return (
    <Overlay label={`Task ${task.title}`} onClose={onClose} side>
      <OverlayHeader title="Task details" onClose={onClose} />
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={task.status} />
          {task.overdue && <Chip tone="warn">Overdue</Chip>}
          <span className="text-[12px] text-slate-500">
            {task.progressPercentage}% · updated {ago(task.updatedAt)}
            {task.reporter && ` · reported by ${task.reporter.fullName}`}
          </span>
        </div>

        {error && <Notice onDismiss={() => setError(null)}>{error}</Notice>}

        <form onSubmit={save} className="space-y-4">
          <TaskFields value={fields} onChange={setFields} assignees={assignees} showAssignee={false} showActual disabled={!editable || busy} />
          {editable && (
            <div className="flex justify-end gap-2.5">
              <button type="button" disabled={!dirty || busy} onClick={() => setFields(fieldsOf(task))} className={btnSecondary}>
                Discard
              </button>
              <button type="submit" disabled={!dirty || busy} className={btnPrimary}>
                Save changes
              </button>
            </div>
          )}
        </form>

        <section>
          <p className={EYEBROW}>Dependencies</p>
          {loading && !detail ? (
            <Loading />
          ) : (
            <div className="mt-2 space-y-3">
              {(
                [
                  ["Blocked by (must finish first)", detail?.prerequisites ?? [], true],
                  ["Blocks (waiting on this)", detail?.dependents ?? [], false],
                ] as const
              ).map(([label, refs, removable]) => (
                <div key={label}>
                  <p className="text-[12px] font-medium text-slate-500">{label}</p>
                  {refs.length === 0 ? (
                    <p className="mt-1 text-[13px] text-slate-400">None</p>
                  ) : (
                    <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {refs.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-slate-900">{r.title}</span>
                            <span className="text-[11px] text-slate-500">Due {fmtDate(r.dueDate)}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <StatusBadge status={r.status} />
                            {removable && editable && (
                              <button
                                type="button"
                                aria-label={`Remove dependency on ${r.title}`}
                                onClick={() => void dependency(() => tasksApi.removeDependency(task.id, r.id))}
                                className="text-slate-400 hover:text-slate-900"
                              >
                                <Icon name="close" className="h-4 w-4" />
                              </button>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {editable && candidates.length > 0 && (
                <div className="flex gap-2">
                  <select aria-label="Add prerequisite" value={prereq} onChange={(e) => setPrereq(e.target.value)} className={`${selectClass} min-w-0 flex-1`}>
                    <option value="">Add a prerequisite…</option>
                    {candidates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                  <button type="button" disabled={!prereq} onClick={() => void dependency(() => tasksApi.addDependency(task.id, prereq))} className={btnSecondary}>
                    Add
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <section>
          <p className={EYEBROW}>Active risks on this task</p>
          {taskRisks.length === 0 ? (
            <p className="mt-2 text-[13px] text-slate-400">{loading ? "Loading…" : "No active risks."}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {taskRisks.map((r) => (
                <li key={r.id} className="flex items-start gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-200">
                  <SeverityBadge severity={r.severity} />
                  <span className="text-[13px] leading-snug text-slate-700">{r.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <p className={EYEBROW}>Activity</p>
          {activity.length === 0 ? (
            <p className="mt-2 text-[13px] text-slate-400">{loading ? "Loading…" : "No activity recorded."}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {activity.map((a) => (
                <li key={a.id} className="text-[13px] text-slate-600">
                  <span className="font-medium text-slate-900">{a.actor?.fullName ?? "System"}</span> {humanize(a.type).toLowerCase()}
                  {(a.oldValue || a.newValue) && (
                    <span className="text-slate-500">
                      {" "}
                      ({a.oldValue ?? "—"} → {a.newValue ?? "—"})
                    </span>
                  )}
                  <span className="ml-1.5 text-[12px] text-slate-400">{ago(a.occurredAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {editable && (
          <section className="border-t border-slate-100 pt-5">
            {confirmArchive ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[13px] text-slate-700">Archive this task and unlink its dependencies?</p>
                <button type="button" onClick={archive} disabled={busy} className={btnPrimary}>
                  Archive
                </button>
                <button type="button" onClick={() => setConfirmArchive(false)} className={btnSecondary}>
                  Keep
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmArchive(true)} className="text-[13px] font-medium text-slate-500 hover:text-amber-800">
                Archive task…
              </button>
            )}
          </section>
        )}
      </div>
    </Overlay>
  );
}

/* ───── list ───── */

/** Runs a task mutation, stores the result, and turns failures into a message. Resolves to the updated task, or null. */
type Runner = (task: TaskView, action: () => Promise<TaskView>) => Promise<TaskView | null>;

function ProgressCell({ task, disabled, onCommit }: { task: TaskView; disabled: boolean; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<number | null>(null);
  const value = draft ?? task.progressPercentage;
  const commit = () => {
    if (draft !== null && draft !== task.progressPercentage) onCommit(draft);
    setDraft(null);
  };
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        disabled={disabled}
        aria-label={`Progress of ${task.title}`}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="h-1.5 w-24 cursor-pointer accent-slate-900 disabled:cursor-not-allowed"
      />
      <span className="w-9 text-right text-[12px] tabular-nums text-slate-600">{value}%</span>
    </div>
  );
}

export function TasksView({ live, meId }: { live: Live; meId: string | null }) {
  const { project, tasks, members, canEdit } = live;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<TaskStatus | "OPEN" | "ALL">("OPEN");
  const [mineOnly, setMineOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());

  const run: Runner = useCallback(
    async (task, action) => {
      setError(null);
      setPending((p) => new Set(p).add(task.id));
      try {
        const updated = await action();
        live.upsertTask(updated);
        return updated;
      } catch (e) {
        if (e instanceof ApiError && e.code === "VERSION_CONFLICT") {
          setError(`"${task.title}" was changed by someone else. The list was refreshed; try again.`);
          void live.reloadProject();
        } else setError(errorMessage(e));
        return null;
      } finally {
        setPending((p) => {
          const next = new Set(p);
          next.delete(task.id);
          return next;
        });
      }
    },
    [live],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (status === "OPEN" ? t.status === "DONE" || t.status === "CANCELLED" : status !== "ALL" && t.status !== status) return false;
      if (mineOnly && t.assignee?.id !== meId) return false;
      return !q || t.title.toLowerCase().includes(q);
    });
  }, [tasks, query, status, mineOnly, meId]);

  if (!project) return <NoProject />;

  const assignees = members.filter((m) => m.role !== "VIEWER");

  return (
    <div className="space-y-6">
      <PageTitle
        title="Tasks"
        subtitle={`${project.name} · ${tasks.length} task${tasks.length === 1 ? "" : "s"}${canEdit ? "" : " · read-only"}`}
        aside={
          canEdit && (
            <button type="button" onClick={() => setCreating(true)} className={btnPrimary}>
              + New task
            </button>
          )
        }
      />

      {!canEdit && <Notice tone="info">{project.status === "ARCHIVED" ? "This project is archived, so its tasks are read-only." : "You have the Viewer role in this project, so tasks are read-only."}</Notice>}
      {error && <Notice onDismiss={() => setError(null)}>{error}</Notice>}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-6 py-4">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks…"
            aria-label="Search tasks"
            className="w-56 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filter by status" className={selectClass}>
            <option value="OPEN">Open tasks</option>
            <option value="ALL">All statuses</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-700">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-slate-900" />
            Assigned to me
          </label>
          <span className="ml-auto text-[12px] text-slate-500">
            {visible.length} of {tasks.length}
          </span>
        </div>

        {live.projectLoading && tasks.length === 0 ? (
          <Loading label="Loading tasks…" />
        ) : visible.length === 0 ? (
          <Empty
            title={tasks.length === 0 ? "No tasks yet" : "No tasks match these filters"}
            hint={tasks.length === 0 ? "Create the first task to start tracking delivery risk." : undefined}
          >
            {tasks.length === 0 && canEdit && (
              <button type="button" onClick={() => setCreating(true)} className={btnPrimary}>
                + New task
              </button>
            )}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  <th scope="col" className="px-6 py-3 font-semibold">Task</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Assignee</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Due</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((t) => {
                  const busy = pending.has(t.id);
                  return (
                    <tr key={t.id} className={`align-middle ${t.overdue ? "bg-amber-50/40" : ""} ${busy ? "opacity-60" : ""}`}>
                      <td className="max-w-xs px-6 py-3">
                        <button type="button" onClick={() => setOpenId(t.id)} className="block max-w-full truncate text-left font-semibold text-slate-900 hover:text-indigo-700">
                          {t.title}
                        </button>
                        <span className={`text-[11px] font-semibold uppercase tracking-wide ${PRIORITY_STYLE[t.priority]}`}>{t.priority}</span>
                      </td>
                      <td className="px-3 py-3">
                        {canEdit ? (
                          <select
                            aria-label={`Status of ${t.title}`}
                            value={t.status}
                            disabled={busy}
                            onChange={(e) => void run(t, () => tasksApi.setStatus(t.id, t.version, e.target.value as TaskStatus))}
                            className={selectClass}
                          >
                            {TASK_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {humanize(s)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <StatusBadge status={t.status} />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {canEdit ? (
                          <select
                            aria-label={`Assignee of ${t.title}`}
                            value={t.assignee?.id ?? ""}
                            disabled={busy}
                            onChange={(e) => void run(t, () => tasksApi.setAssignee(t.id, t.version, e.target.value || null))}
                            className={`${selectClass} max-w-[10rem]`}
                          >
                            <option value="">Unassigned</option>
                            {assignees.map((m) => (
                              <option key={m.userId} value={m.userId}>
                                {m.fullName}
                              </option>
                            ))}
                            {t.assignee && !assignees.some((m) => m.userId === t.assignee!.id) && <option value={t.assignee.id}>{t.assignee.fullName}</option>}
                          </select>
                        ) : (
                          <span className="text-[13px] text-slate-700">{t.assignee?.fullName ?? "Unassigned"}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[13px] tabular-nums text-slate-700">
                        {fmtDate(t.dueDate)}
                        {t.overdue && <span className="ml-1.5"><Chip tone="warn">Overdue</Chip></span>}
                      </td>
                      <td className="px-6 py-3">
                        <ProgressCell task={t} disabled={!canEdit || busy} onCommit={(v) => void run(t, () => tasksApi.setProgress(t.id, t.version, v))} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && <CreateTask live={live} onClose={() => setCreating(false)} />}
      {openId && <TaskDrawer taskId={openId} live={live} onClose={() => setOpenId(null)} run={run} />}
    </div>
  );
}
