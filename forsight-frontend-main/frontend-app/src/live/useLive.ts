import { useCallback, useEffect, useRef, useState } from "react";
import { inbox, projects as projectsApi, risks as risksApi, tasks as tasksApi, workspaces as workspacesApi } from "../api";
import { errorMessage } from "../api";
import type { MemberView, ProjectRole, ProjectView, RiskSummary, RiskView, TaskView, WorkspaceView } from "../api";

/**
 * Everything the signed-in UI reads from the API: workspaces, the selected
 * workspace's projects, and the selected project's members, tasks and risks.
 * When `enabled` is false (signed out) it holds nothing and makes no requests.
 */

const WS_KEY = "foresight.workspace";
const PROJECT_KEY = "foresight.project";
const INBOX_POLL_MS = 60_000;

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* preference just isn't remembered */
  }
};

export interface Live {
  enabled: boolean;
  /** True until the first workspace/project load settles. */
  booting: boolean;
  error: string | null;
  workspaces: WorkspaceView[];
  workspace: WorkspaceView | null;
  selectWorkspace: (id: string) => void;
  projects: ProjectView[];
  project: ProjectView | null;
  selectProject: (id: string) => void;
  /** Role of the signed-in user in the selected project (undefined when none is selected). */
  myProjectRole: ProjectRole | undefined;
  canEdit: boolean;
  members: MemberView<ProjectRole>[];
  tasks: TaskView[];
  risks: RiskView[];
  summary: RiskSummary | null;
  projectLoading: boolean;
  unread: number;
  reloadWorkspaces: () => Promise<WorkspaceView[]>;
  reloadProjects: (selectId?: string) => Promise<ProjectView[]>;
  reloadProject: () => Promise<void>;
  reloadRisks: () => Promise<void>;
  reloadUnread: () => Promise<void>;
  patchProject: (p: ProjectView) => void;
  upsertTask: (t: TaskView) => void;
  removeTask: (id: string) => void;
}

export function useLive(enabled: boolean): Live {
  const [workspaces, setWorkspaces] = useState<WorkspaceView[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(() => read(WS_KEY));
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [projectId, setProjectId] = useState<string | null>(() => read(PROJECT_KEY));
  const [members, setMembers] = useState<MemberView<ProjectRole>[]>([]);
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [risks, setRisks] = useState<RiskView[]>([]);
  const [summary, setSummary] = useState<RiskSummary | null>(null);
  const [booting, setBooting] = useState(enabled);
  const [projectLoading, setProjectLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  // Guards against a slow response for a previous selection overwriting a newer one.
  const projectSeq = useRef(0);
  const projectIdRef = useRef(projectId);
  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  const workspace = workspaces.find((w) => w.id === workspaceId) ?? null;
  const project = projects.find((p) => p.id === projectId) ?? null;

  /* signed out: drop everything */
  useEffect(() => {
    if (enabled) return;
    projectSeq.current++;
    setWorkspaces([]);
    setProjects([]);
    setMembers([]);
    setTasks([]);
    setRisks([]);
    setSummary(null);
    setUnread(0);
    setError(null);
    setBooting(false);
  }, [enabled]);

  const reloadWorkspaces = useCallback(async () => {
    const list = (await workspacesApi.list()).content;
    setWorkspaces(list);
    setWorkspaceId((current) => (current && list.some((w) => w.id === current) ? current : (list[0]?.id ?? null)));
    return list;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setBooting(true);
    reloadWorkspaces()
      .then(() => !cancelled && setError(null))
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setBooting(false));
    return () => {
      cancelled = true;
    };
  }, [enabled, reloadWorkspaces]);

  useEffect(() => write(WS_KEY, workspaceId), [workspaceId]);
  useEffect(() => write(PROJECT_KEY, projectId), [projectId]);

  const reloadProjects = useCallback(
    async (selectId?: string) => {
      if (!workspaceId) return [];
      const list = (await projectsApi.list(workspaceId)).content;
      setProjects(list);
      setProjectId((current) => {
        const wanted = selectId ?? current;
        if (wanted && list.some((p) => p.id === wanted)) return wanted;
        return (list.find((p) => p.status !== "ARCHIVED") ?? list[0])?.id ?? null;
      });
      return list;
    },
    [workspaceId],
  );

  useEffect(() => {
    if (!enabled || !workspaceId) {
      setProjects([]);
      return;
    }
    let cancelled = false;
    reloadProjects()
      .then(() => !cancelled && setError(null))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [enabled, workspaceId, reloadProjects]);

  const loadProject = useCallback(async (id: string) => {
    const seq = ++projectSeq.current;
    setProjectLoading(true);
    // Members, tasks and risks are independent: one failing (e.g. 403) shouldn't blank the rest.
    const [m, t, r, s, p] = await Promise.allSettled([
      projectsApi.members(id),
      tasksApi.list(id),
      risksApi.list(id),
      risksApi.summary(id),
      projectsApi.get(id),
    ]);
    if (seq !== projectSeq.current) return;
    setMembers(m.status === "fulfilled" ? m.value.content : []);
    setTasks(t.status === "fulfilled" ? t.value.content : []);
    setRisks(r.status === "fulfilled" ? r.value.content : []);
    setSummary(s.status === "fulfilled" ? s.value : null);
    if (p.status === "fulfilled") setProjects((list) => list.map((x) => (x.id === id ? p.value : x)));
    const failed = [m, t, r, s, p].find((x) => x.status === "rejected");
    setError(failed && failed.status === "rejected" ? errorMessage(failed.reason) : null);
    setProjectLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled || !projectId) {
      projectSeq.current++;
      setMembers([]);
      setTasks([]);
      setRisks([]);
      setSummary(null);
      setProjectLoading(false);
      return;
    }
    void loadProject(projectId);
  }, [enabled, projectId, loadProject]);

  const reloadProject = useCallback(async () => {
    if (projectIdRef.current) await loadProject(projectIdRef.current);
  }, [loadProject]);

  const reloadRisks = useCallback(async () => {
    const id = projectIdRef.current;
    if (!id) return;
    const [r, s] = await Promise.all([risksApi.list(id), risksApi.summary(id)]);
    if (id !== projectIdRef.current) return;
    setRisks(r.content);
    setSummary(s);
    setProjects((list) => list.map((p) => (p.id === id ? { ...p, lastAnalyzedAt: s.lastAnalyzedAt } : p)));
  }, []);

  const reloadUnread = useCallback(async () => {
    try {
      setUnread((await inbox.unread()).unread);
    } catch {
      /* the badge is non-critical; keep the last value */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void reloadUnread();
    const id = window.setInterval(() => void reloadUnread(), INBOX_POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, reloadUnread]);

  const selectWorkspace = useCallback((id: string) => {
    setProjectId(null);
    setWorkspaceId(id);
  }, []);

  const patchProject = useCallback((p: ProjectView) => setProjects((list) => list.map((x) => (x.id === p.id ? p : x))), []);
  const upsertTask = useCallback(
    (t: TaskView) => setTasks((list) => (list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t])),
    [],
  );
  const removeTask = useCallback((id: string) => setTasks((list) => list.filter((t) => t.id !== id)), []);

  const myProjectRole = project?.myRole;

  return {
    enabled,
    booting,
    error,
    workspaces,
    workspace,
    selectWorkspace,
    projects,
    project,
    selectProject: setProjectId,
    myProjectRole,
    canEdit: !!project && project.status !== "ARCHIVED" && (myProjectRole === "LEAD" || myProjectRole === "CONTRIBUTOR"),
    members,
    tasks,
    risks,
    summary,
    projectLoading,
    unread,
    reloadWorkspaces,
    reloadProjects,
    reloadProject,
    reloadRisks,
    reloadUnread,
    patchProject,
    upsertTask,
    removeTask,
  };
}
