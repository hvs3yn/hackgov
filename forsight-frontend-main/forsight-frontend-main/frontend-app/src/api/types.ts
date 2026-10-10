/* Types mirroring the Foresight REST API (see API_DOCUMENTATION.md). */

export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER";
export type ProjectRole = "LEAD" | "CONTRIBUTOR" | "VIEWER";
export type ProjectStatus = "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "IN_REVIEW" | "DONE" | "CANCELLED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RiskCategory =
  | "OVERDUE_TASK"
  | "APPROACHING_DEADLINE"
  | "STALLED_TASK"
  | "BLOCKED_DEPENDENCY"
  | "PROJECT_DEADLINE"
  | "WORKLOAD_IMBALANCE";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Confidence = "LOW" | "MEDIUM" | "HIGH";
export type AssessmentStatus = "ACTIVE" | "RESOLVED";
export type Disposition = "OPEN" | "ACKNOWLEDGED" | "DISMISSED";

export const TASK_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "DONE", "CANCELLED"];
export const TASK_PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
export const PROJECT_STATUSES: ProjectStatus[] = ["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"];

export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: string;
  timestamp?: string;
  requestId?: string;
  errors?: { field: string; message: string }[];
}

/* ── auth & users ── */

export interface UserView {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
  user: UserView;
}

/* ── workspaces & projects ── */

export interface WorkspaceView {
  id: string;
  name: string;
  myRole: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
}

export interface MemberView<R extends string = string> {
  userId: string;
  fullName: string;
  email: string;
  role: R;
  joinedAt: string;
}

export interface ProjectView {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  startDate: string | null;
  deadline: string | null;
  myRole: ProjectRole;
  version: number;
  createdAt: string;
  updatedAt: string;
  lastAnalyzedAt: string | null;
}

/* ── tasks ── */

export interface UserRef {
  id: string;
  fullName: string;
}

export interface TaskView {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: UserRef | null;
  reporter: UserRef | null;
  startDate: string | null;
  dueDate: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  progressPercentage: number;
  overdue: boolean;
  lastProgressAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface TaskRef {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: string | null;
  assigneeId: string | null;
}

export interface TaskDetail {
  task: TaskView;
  prerequisites: TaskRef[];
  dependents: TaskRef[];
}

export interface TaskActivity {
  id: string;
  type: string;
  actor: UserRef | null;
  oldValue: string | null;
  newValue: string | null;
  occurredAt: string;
}

/* ── risks ── */

export interface RiskView {
  id: string;
  projectId: string;
  taskId: string | null;
  subjectUserId: string | null;
  category: RiskCategory;
  status: AssessmentStatus;
  severity: Severity;
  score: number;
  confidence: Confidence;
  title: string;
  summary: string;
  affectedTaskIds: string[];
  firstDetectedAt: string;
  lastEvaluatedAt: string;
  lastChangedAt: string;
  resolvedAt: string | null;
  resolutionReason: string | null;
  revision: number;
}

export interface RiskFactor {
  code: string;
  description: string;
  points: number;
}

export interface RiskEvidence {
  kind: string;
  statement: string;
  data?: Record<string, unknown>;
}

export interface RecommendedAction {
  priority: number;
  action: string;
  rationale: string;
}

export interface Explanation {
  source: "ANTHROPIC" | "FALLBACK" | string;
  summary: string;
  observedFacts: string[];
  inferences: string[];
  potentialConsequences: string[];
  recommendedActions: RecommendedAction[];
  assumptions: string[];
  unknowns: string[];
  confidenceNote: string;
  generatedAt: string;
}

export interface RiskDetail {
  risk: RiskView;
  factors: RiskFactor[];
  evidence: RiskEvidence[];
  missingData: string[];
  explanation: Explanation | null;
}

export interface RiskSummary {
  projectId: string;
  overallSeverity: Severity | null;
  maxScore: number;
  activeRisks: number;
  bySeverity: Partial<Record<Severity, number>>;
  byCategory: Partial<Record<RiskCategory, number>>;
  topRisks: RiskView[];
  lastAnalyzedAt: string | null;
}

export interface AnalysisResult {
  projectId: string;
  analyzedAt: string;
  dataVersion: number;
  activeRisks: number;
  detected: number;
  escalated: number;
  mitigated: number;
  updated: number;
  resolved: number;
  reopened: number;
  unchanged: number;
}

/* ── inbox ── */

export interface InboxItem {
  id: string;
  projectId: string;
  projectName: string;
  taskId: string | null;
  taskTitle: string | null;
  riskId: string;
  riskStatus: AssessmentStatus;
  currentSeverity: Severity;
  category: RiskCategory;
  severity: Severity;
  title: string;
  explanation: Explanation | null;
  read: boolean;
  readAt: string | null;
  disposition: Disposition;
  dispositionAt: string | null;
  deliveredRevision: number;
  createdAt: string;
  lastDeliveredAt: string;
  updatedAt: string;
}
