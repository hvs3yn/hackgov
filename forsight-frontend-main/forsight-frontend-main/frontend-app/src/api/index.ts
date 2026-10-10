import { del, get, patch, post, put } from "./client";
import type {
  AnalysisResult,
  AuthResponse,
  Disposition,
  InboxItem,
  MemberView,
  Page,
  ProjectRole,
  ProjectStatus,
  ProjectView,
  RiskCategory,
  RiskDetail,
  RiskSummary,
  RiskView,
  Severity,
  TaskActivity,
  TaskDetail,
  TaskPriority,
  TaskRef,
  TaskStatus,
  TaskView,
  UserView,
  WorkspaceRole,
  WorkspaceView,
} from "./types";

export { ApiError, errorMessage, isNetworkError, setAuthLostHandler } from "./client";
export * from "./types";

/** Page through a list endpoint until everything is loaded (bounded). */
async function allPages<T>(load: (page: number) => Promise<Page<T>>, maxPages = 5): Promise<Page<T>> {
  const first = await load(0);
  const content = [...first.content];
  for (let p = 1; p < Math.min(first.totalPages, maxPages); p++) content.push(...(await load(p)).content);
  return { ...first, content };
}

const PAGE = 100;

/* ── auth ── */

export const auth = {
  register: (body: { fullName: string; email: string; password: string }) => post<AuthResponse>("/auth/register", body, { auth: false }),
  login: (body: { email: string; password: string }) => post<AuthResponse>("/auth/login", body, { auth: false }),
  logout: (refreshToken: string) => post<void>("/auth/logout", { refreshToken }, { auth: false }),
  me: () => get<UserView>("/users/me"),
};

/* ── workspaces ── */

export const workspaces = {
  list: () => allPages((page) => get<Page<WorkspaceView>>("/workspaces", { page, size: PAGE, sort: "createdAt,asc" })),
  create: (name: string) => post<WorkspaceView>("/workspaces", { name }),
  rename: (id: string, name: string) => patch<WorkspaceView>(`/workspaces/${id}`, { name }),
  members: (id: string) => allPages((page) => get<Page<MemberView<WorkspaceRole>>>(`/workspaces/${id}/members`, { page, size: PAGE, sort: "createdAt,asc" })),
  addMember: (id: string, email: string, role: WorkspaceRole) => post<MemberView<WorkspaceRole>>(`/workspaces/${id}/members`, { email, role }),
  setMemberRole: (id: string, userId: string, role: WorkspaceRole) => patch<MemberView<WorkspaceRole>>(`/workspaces/${id}/members/${userId}`, { role }),
  removeMember: (id: string, userId: string) => del(`/workspaces/${id}/members/${userId}`),
};

/* ── projects ── */

export interface ProjectInput {
  name: string;
  description?: string;
  startDate?: string | null;
  deadline?: string | null;
}

export interface ProjectUpdate extends ProjectInput {
  version: number;
  clearStartDate?: boolean;
  clearDeadline?: boolean;
  status?: ProjectStatus;
}

export const projects = {
  list: (workspaceId: string) => allPages((page) => get<Page<ProjectView>>(`/workspaces/${workspaceId}/projects`, { page, size: PAGE, sort: "createdAt,asc" })),
  create: (workspaceId: string, body: ProjectInput) => post<ProjectView>(`/workspaces/${workspaceId}/projects`, body),
  get: (id: string) => get<ProjectView>(`/projects/${id}`),
  update: (id: string, body: ProjectUpdate) => patch<ProjectView>(`/projects/${id}`, body),
  archive: (id: string) => post<ProjectView>(`/projects/${id}/archive`),
  restore: (id: string) => post<ProjectView>(`/projects/${id}/restore`),
  members: (id: string) => allPages((page) => get<Page<MemberView<ProjectRole>>>(`/projects/${id}/members`, { page, size: PAGE, sort: "createdAt,asc" })),
  addMember: (id: string, userId: string, role: ProjectRole) => post<MemberView<ProjectRole>>(`/projects/${id}/members`, { userId, role }),
  setMemberRole: (id: string, userId: string, role: ProjectRole) => patch<MemberView<ProjectRole>>(`/projects/${id}/members/${userId}`, { role }),
  removeMember: (id: string, userId: string) => del(`/projects/${id}/members/${userId}`),
};

/* ── tasks ── */

export interface TaskInput {
  title: string;
  description?: string;
  priority: TaskPriority;
  assigneeId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  estimatedHours?: number | null;
}

export interface TaskEdit {
  version: number;
  title: string;
  description?: string | null;
  priority: TaskPriority;
  startDate?: string | null;
  dueDate?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
}

export const tasks = {
  list: (projectId: string) => allPages((page) => get<Page<TaskView>>(`/projects/${projectId}/tasks`, { page, size: PAGE, sort: "dueDate,asc" })),
  create: (projectId: string, body: TaskInput) => post<TaskView>(`/projects/${projectId}/tasks`, body),
  get: (id: string) => get<TaskDetail>(`/tasks/${id}`),
  edit: (id: string, body: TaskEdit) => put<TaskView>(`/tasks/${id}`, body),
  setStatus: (id: string, version: number, status: TaskStatus) => post<TaskView>(`/tasks/${id}/status`, { version, status }),
  setProgress: (id: string, version: number, progressPercentage: number) => post<TaskView>(`/tasks/${id}/progress`, { version, progressPercentage }),
  setAssignee: (id: string, version: number, assigneeId: string | null) => put<TaskView>(`/tasks/${id}/assignee`, { version, assigneeId }),
  archive: (id: string, version: number) => del(`/tasks/${id}`, { version }),
  activity: (id: string) => get<Page<TaskActivity>>(`/tasks/${id}/activity`, { page: 0, size: 20, sort: "occurredAt,desc" }),
  dependencies: (id: string) => get<{ prerequisites: TaskRef[]; dependents: TaskRef[] }>(`/tasks/${id}/dependencies`),
  addDependency: (id: string, prerequisiteTaskId: string) => post<unknown>(`/tasks/${id}/dependencies`, { prerequisiteTaskId }),
  removeDependency: (id: string, prerequisiteTaskId: string) => del(`/tasks/${id}/dependencies/${prerequisiteTaskId}`),
  risks: (id: string) => get<RiskView[]>(`/tasks/${id}/risks`),
};

/* ── risks ── */

export interface RiskFilter {
  status?: "ACTIVE" | "RESOLVED";
  severity?: Severity;
  category?: RiskCategory;
  taskId?: string;
}

export const risks = {
  list: (projectId: string, filter: RiskFilter = {}) =>
    allPages((page) => get<Page<RiskView>>(`/projects/${projectId}/risks`, { ...filter, page, size: PAGE, sort: "score,desc" }), 2),
  detail: (riskId: string) => get<RiskDetail>(`/risks/${riskId}`),
  summary: (projectId: string) => get<RiskSummary>(`/projects/${projectId}/risk-summary`),
  analyze: (projectId: string) => post<AnalysisResult>(`/projects/${projectId}/risk-analysis`),
};

/* ── inbox ── */

export interface InboxFilter {
  read?: boolean;
  disposition?: Disposition[];
  severity?: Severity;
  projectId?: string;
}

export const inbox = {
  list: (filter: InboxFilter = {}, page = 0, size = 50) => get<Page<InboxItem>>("/inbox", { ...filter, page, size, sort: "lastDeliveredAt,desc" }),
  unread: () => get<{ unread: number }>("/inbox/unread-count"),
  markRead: (id: string) => post<InboxItem>(`/inbox/${id}/read`),
  markUnread: (id: string) => post<InboxItem>(`/inbox/${id}/unread`),
  acknowledge: (id: string) => post<InboxItem>(`/inbox/${id}/acknowledge`),
  dismiss: (id: string) => post<InboxItem>(`/inbox/${id}/dismiss`),
};
