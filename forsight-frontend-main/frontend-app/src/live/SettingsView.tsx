import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Card, CardHeader, Field, Icon } from "../ui";
import { inputClass } from "../styles";
import { ApiError, PROJECT_STATUSES, errorMessage, projects as projectsApi, workspaces as workspacesApi } from "../api";
import type { MemberView, ProjectRole, ProjectStatus, WorkspaceRole } from "../api";
import { Chip, Empty, Loading, Notice, PageTitle } from "./common";
import { btnPrimary, btnSecondary, fmtDate, humanize, selectClass } from "./format";
import type { Live } from "./useLive";

const WORKSPACE_ROLES: WorkspaceRole[] = ["OWNER", "ADMIN", "MEMBER"];
const PROJECT_ROLES: ProjectRole[] = ["LEAD", "CONTRIBUTOR", "VIEWER"];

/* ───── members table (workspace and project share it) ───── */

function Members<R extends string>({ members, roles, meId, canManage, onRole, onRemove }: {
  members: MemberView<R>[];
  roles: R[];
  meId: string | null;
  canManage: boolean;
  onRole: (m: MemberView<R>, role: R) => void;
  onRemove: (m: MemberView<R>) => void;
}) {
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
      {members.map((m) => {
        const self = m.userId === meId;
        return (
          <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {m.fullName}
                {self && <span className="ml-1.5 text-[12px] font-normal text-slate-400">(you)</span>}
              </p>
              <p className="truncate text-[12px] text-slate-500">
                {m.email} · joined {fmtDate(m.joinedAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canManage ? (
                <select aria-label={`Role of ${m.fullName}`} value={m.role} onChange={(e) => onRole(m, e.target.value as R)} className={selectClass}>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {humanize(r)}
                    </option>
                  ))}
                </select>
              ) : (
                <Chip>{humanize(m.role)}</Chip>
              )}
              {(canManage || self) && (
                <button type="button" onClick={() => onRemove(m)} className="rounded-md px-2 py-1 text-[12px] font-medium text-slate-500 hover:bg-amber-50 hover:text-amber-950">
                  {self ? "Leave" : "Remove"}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ───── workspace ───── */

function WorkspaceSection({ live, meId, onLeft }: { live: Live; meId: string | null; onLeft: () => void }) {
  const ws = live.workspace;
  const [name, setName] = useState(ws?.name ?? "");
  const [members, setMembers] = useState<MemberView<WorkspaceRole>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [newMember, setNewMember] = useState({ email: "", role: "MEMBER" as WorkspaceRole });
  const [newWorkspace, setNewWorkspace] = useState("");
  const [busy, setBusy] = useState(false);
  const wsId = ws?.id;
  const manage = ws?.myRole === "OWNER" || ws?.myRole === "ADMIN";

  useEffect(() => setName(ws?.name ?? ""), [ws?.name]);

  const loadMembers = useCallback(async () => {
    if (!wsId) return setMembers(null);
    try {
      setMembers((await workspacesApi.members(wsId)).content);
    } catch (e) {
      setError(errorMessage(e));
      setMembers([]);
    }
  }, [wsId]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const guard = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
      if (done) setInfo(done);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!ws) {
    return (
      <Card>
        <CardHeader eyebrow="Workspace" title="Create your first workspace" />
        <form
          className="space-y-4 p-6"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (newWorkspace.trim().length < 2) return setError("Name your workspace.");
            void guard(async () => {
              await workspacesApi.create(newWorkspace.trim());
              await live.reloadWorkspaces();
              setNewWorkspace("");
            });
          }}
        >
          {error && <Notice>{error}</Notice>}
          <Field id="ws-new" label="Workspace name">
            <input id="ws-new" value={newWorkspace} onChange={(e) => setNewWorkspace(e.target.value)} className={inputClass(false)} placeholder="Student Team Q4" />
          </Field>
          <button type="submit" disabled={busy} className={btnPrimary}>
            Create workspace
          </button>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        eyebrow="Workspace"
        title={ws.name}
        aside={
          <div className="flex items-center gap-2">
            <Chip>Your role: {humanize(ws.myRole)}</Chip>
            {live.workspaces.length > 1 && (
              <select aria-label="Switch workspace" value={ws.id} onChange={(e) => live.selectWorkspace(e.target.value)} className={selectClass}>
                {live.workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        }
      />
      <div className="space-y-6 p-6">
        {error && <Notice onDismiss={() => setError(null)}>{error}</Notice>}
        {info && <Notice tone="info" onDismiss={() => setInfo(null)}>{info}</Notice>}

        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!name.trim()) return setError("The workspace needs a name.");
            void guard(async () => {
              await workspacesApi.rename(ws.id, name.trim());
              await live.reloadWorkspaces();
            }, "Workspace renamed.");
          }}
        >
          <div className="min-w-[14rem] flex-1">
            <Field id="ws-name" label="Name" hint={manage ? undefined : "Only owners and admins can rename the workspace."}>
              <input id="ws-name" value={name} disabled={!manage || busy} onChange={(e) => setName(e.target.value)} className={inputClass(false)} />
            </Field>
          </div>
          {manage && (
            <button type="submit" disabled={busy || name.trim() === ws.name} className={btnPrimary}>
              Rename
            </button>
          )}
        </form>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-slate-900">Members</p>
          {members === null ? (
            <Loading />
          ) : (
            <Members
              members={members}
              roles={WORKSPACE_ROLES}
              meId={meId}
              canManage={manage}
              onRole={(m, role) => void guard(async () => { await workspacesApi.setMemberRole(ws.id, m.userId, role); await loadMembers(); })}
              onRemove={(m) =>
                void guard(async () => {
                  await workspacesApi.removeMember(ws.id, m.userId);
                  if (m.userId === meId) {
                    await live.reloadWorkspaces();
                    onLeft();
                  } else await loadMembers();
                })
              }
            />
          )}
        </div>

        {manage && (
          <form
            className="flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!newMember.email.trim()) return setError("Enter the email of an existing Foresight user.");
              void guard(async () => {
                await workspacesApi.addMember(ws.id, newMember.email.trim().toLowerCase(), newMember.role);
                setNewMember({ email: "", role: "MEMBER" });
                await loadMembers();
              }, "Member added.");
            }}
          >
            <div className="min-w-[14rem] flex-1">
              <Field id="wm-email" label="Add member by email" hint="The person must already have a Foresight account.">
                <input id="wm-email" type="email" value={newMember.email} onChange={(e) => setNewMember({ ...newMember, email: e.target.value })} className={inputClass(false)} placeholder="ulvi@demo.foresight.local" />
              </Field>
            </div>
            <select aria-label="Role for new member" value={newMember.role} onChange={(e) => setNewMember({ ...newMember, role: e.target.value as WorkspaceRole })} className={`${selectClass} mb-6 py-2`}>
              {WORKSPACE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {humanize(r)}
                </option>
              ))}
            </select>
            <button type="submit" disabled={busy} className={`${btnPrimary} mb-6`}>
              Add
            </button>
          </form>
        )}
      </div>
    </Card>
  );
}

/* ───── project ───── */

function ProjectSection({ live, meId }: { live: Live; meId: string | null }) {
  const project = live.project;
  const [wsMembers, setWsMembers] = useState<MemberView<WorkspaceRole>[]>([]);
  const [form, setForm] = useState({ name: "", description: "", startDate: "", deadline: "", status: "ACTIVE" as ProjectStatus });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState({ userId: "", role: "CONTRIBUTOR" as ProjectRole });
  const wsId = live.workspace?.id;

  useEffect(() => {
    if (!project) return;
    setForm({ name: project.name, description: project.description ?? "", startDate: project.startDate ?? "", deadline: project.deadline ?? "", status: project.status });
  }, [project]);

  useEffect(() => {
    if (!wsId) return;
    let cancelled = false;
    workspacesApi
      .members(wsId)
      .then((p) => !cancelled && setWsMembers(p.content))
      .catch(() => !cancelled && setWsMembers([]));
    return () => {
      cancelled = true;
    };
  }, [wsId]);

  if (!project) {
    return (
      <Card>
        <CardHeader eyebrow="Project" title="No project selected" />
        <Empty title="Pick or create a project" hint="Use the project switcher in the top bar." />
      </Card>
    );
  }

  const lead = project.myRole === "LEAD";
  const archived = project.status === "ARCHIVED";

  const guard = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
      if (done) setInfo(done);
    } catch (e) {
      if (e instanceof ApiError && e.code === "VERSION_CONFLICT") {
        setError("This project was changed by someone else. The latest version has been loaded; review it and try again.");
        await live.reloadProject();
      } else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("The project needs a name.");
    if (form.startDate && form.deadline && form.deadline < form.startDate) return setError("The deadline is before the start date.");
    void guard(async () => {
      const updated = await projectsApi.update(project.id, {
        version: project.version,
        name: form.name.trim(),
        description: form.description.trim(),
        startDate: form.startDate || null,
        deadline: form.deadline || null,
        clearStartDate: !form.startDate && !!project.startDate,
        clearDeadline: !form.deadline && !!project.deadline,
        status: form.status === "ARCHIVED" ? undefined : form.status,
      });
      live.patchProject(updated);
    }, "Project saved.");
  };

  const memberIds = new Set(live.members.map((m) => m.userId));
  const addable = wsMembers.filter((m) => !memberIds.has(m.userId));
  const dirty =
    form.name !== project.name ||
    form.description !== (project.description ?? "") ||
    form.startDate !== (project.startDate ?? "") ||
    form.deadline !== (project.deadline ?? "") ||
    form.status !== project.status;

  return (
    <Card>
      <CardHeader
        eyebrow="Project"
        title={project.name}
        aside={
          <div className="flex items-center gap-2">
            <Chip>Your role: {humanize(project.myRole)}</Chip>
            {lead && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void guard(async () => {
                    live.patchProject(archived ? await projectsApi.restore(project.id) : await projectsApi.archive(project.id));
                  }, archived ? "Project restored." : "Project archived. Its tasks are now read-only.")
                }
                className={btnSecondary}
              >
                {archived ? "Restore project" : "Archive project"}
              </button>
            )}
          </div>
        }
      />
      <div className="space-y-6 p-6">
        {error && <Notice onDismiss={() => setError(null)}>{error}</Notice>}
        {info && <Notice tone="info" onDismiss={() => setInfo(null)}>{info}</Notice>}

        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="pj-name" label="Name">
              <input id="pj-name" value={form.name} disabled={!lead || busy || archived} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass(false)} />
            </Field>
            <Field id="pj-status" label="Status" hint={archived ? "Use Restore to reactivate an archived project." : undefined}>
              <select id="pj-status" value={form.status} disabled={!lead || busy || archived} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })} className={inputClass(false)}>
                {PROJECT_STATUSES.filter((s) => s !== "ARCHIVED" || archived).map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field id="pj-desc" label="Description">
                <textarea id="pj-desc" rows={2} value={form.description} disabled={!lead || busy || archived} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass(false)} />
              </Field>
            </div>
            <Field id="pj-start" label="Start date">
              <input id="pj-start" type="date" value={form.startDate} disabled={!lead || busy || archived} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={inputClass(false)} />
            </Field>
            <Field id="pj-deadline" label="Deadline">
              <input id="pj-deadline" type="date" value={form.deadline} disabled={!lead || busy || archived} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className={inputClass(false)} />
            </Field>
          </div>
          {lead && !archived ? (
            <div className="flex justify-end">
              <button type="submit" disabled={!dirty || busy} className={btnPrimary}>
                Save project
              </button>
            </div>
          ) : (
            <p className="text-[12px] text-slate-500">{archived ? "Archived projects are read-only." : "Only the project Lead can edit these details."}</p>
          )}
        </form>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-slate-900">Project members</p>
          <Members
            members={live.members}
            roles={PROJECT_ROLES}
            meId={meId}
            canManage={lead && !archived}
            onRole={(m, role) => void guard(async () => { await projectsApi.setMemberRole(project.id, m.userId, role); await live.reloadProject(); })}
            onRemove={(m) =>
              void guard(async () => {
                await projectsApi.removeMember(project.id, m.userId);
                if (m.userId === meId) await live.reloadProjects();
                else await live.reloadProject();
              })
            }
          />
        </div>

        {lead && !archived && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-4">
            {addable.length === 0 ? (
              <p className="text-[13px] text-slate-500">Everyone in the workspace is already on this project. Add people to the workspace first.</p>
            ) : (
              <>
                <select aria-label="Workspace member to add" value={adding.userId} onChange={(e) => setAdding({ ...adding, userId: e.target.value })} className={`${selectClass} min-w-[12rem] py-2`}>
                  <option value="">Add a workspace member…</option>
                  {addable.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.fullName}
                    </option>
                  ))}
                </select>
                <select aria-label="Project role" value={adding.role} onChange={(e) => setAdding({ ...adding, role: e.target.value as ProjectRole })} className={`${selectClass} py-2`}>
                  {PROJECT_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {humanize(r)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!adding.userId || busy}
                  onClick={() =>
                    void guard(async () => {
                      await projectsApi.addMember(project.id, adding.userId, adding.role);
                      setAdding({ userId: "", role: "CONTRIBUTOR" });
                      await live.reloadProject();
                    }, "Member added to the project.")
                  }
                  className={btnPrimary}
                >
                  Add
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export function SettingsView({ live, meId }: { live: Live; meId: string | null }) {
  return (
    <div className="space-y-6">
      <PageTitle title="Settings" subtitle="Workspace and project administration, synced with the Foresight API" />
      <WorkspaceSection live={live} meId={meId} onLeft={() => undefined} />
      {live.workspace && <ProjectSection live={live} meId={meId} />}
      <p className="flex items-center gap-1.5 text-[12px] text-slate-400">
        <Icon name="settings" className="h-3.5 w-3.5" />
        Notification and profile preferences are stored in this browser and live on your profile page.
      </p>
    </div>
  );
}
