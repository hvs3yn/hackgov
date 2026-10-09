/*
 * Client-side session model for Foresight.
 *
 * Sign-in goes through the real backend (`/auth/*`). JWTs are kept by
 * `api/tokens.ts`; this module persists only the display profile. The API has
 * no endpoint for job title, timezone or notification preferences, so those
 * are stored per user in this browser.
 */

import { auth, workspaces, type AuthResponse, type ProjectRole, type UserView, type WorkspaceRole, type WorkspaceView } from "../api";
import { clearTokens, loadTokens, saveTokens } from "../api/tokens";

export type AppRole = "Project Lead" | "Admin" | "Developer" | "Member";

export const ROLES: AppRole[] = ["Project Lead", "Admin", "Developer", "Member"];

export const TIMEZONES = [
  "Asia/Baku (GMT+4)",
  "Europe/Istanbul (GMT+3)",
  "Europe/London (GMT+0)",
  "America/New_York (GMT−5)",
  "Asia/Dubai (GMT+4)",
];

export interface NotificationPrefs {
  riskAlerts: boolean;
  weeklyDigest: boolean;
  mentions: boolean;
}

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  jobTitle: string;
  role: AppRole;
  timezone: string;
  workspace: string;
  joinedAt: string; // ISO date
  notifications: NotificationPrefs;
}

/** Accounts created by the backend's `demo` Spring profile. */
export const DEMO_ACCOUNTS = [
  { email: "ulvi@demo.foresight.local", name: "Ulvi" },
  { email: "aydan@demo.foresight.local", name: "Aydan" },
  { email: "huseyn@demo.foresight.local", name: "Huseyn" },
] as const;
export const DEMO_PASSWORD = "Password123";

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 128;
/** Backend rule: 8-128 characters with at least one letter and one digit. */
export const passwordProblem = (pw: string): string | null =>
  pw.length < MIN_PASSWORD || pw.length > MAX_PASSWORD
    ? `Use ${MIN_PASSWORD}-${MAX_PASSWORD} characters.`
    : !/[A-Za-z]/.test(pw) || !/\d/.test(pw)
      ? "Include at least one letter and one digit."
      : null;

/** Project role wins (it is what you do day to day), then the workspace role. */
export function roleLabel(workspaceRole?: WorkspaceRole, projectRole?: ProjectRole): AppRole {
  if (projectRole === "LEAD") return "Project Lead";
  if (workspaceRole === "OWNER" || workspaceRole === "ADMIN") return "Admin";
  if (projectRole === "CONTRIBUTOR") return "Developer";
  return "Member";
}

/* ───── local-only preferences (no backend endpoint) ───── */

type Prefs = Pick<UserProfile, "jobTitle" | "timezone" | "notifications">;

const DEFAULT_PREFS: Prefs = {
  jobTitle: "Team Member",
  timezone: TIMEZONES[0],
  notifications: { riskAlerts: true, weeklyDigest: true, mentions: true },
};

const prefsKey = (userId: string) => `foresight.prefs.${userId}`;

export function loadPrefs(userId: string): Prefs {
  try {
    const raw = window.localStorage.getItem(prefsKey(userId));
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    /* unreadable: fall back to defaults */
  }
  return DEFAULT_PREFS;
}

export function savePrefs(user: UserProfile) {
  try {
    const prefs: Prefs = { jobTitle: user.jobTitle, timezone: user.timezone, notifications: user.notifications };
    window.localStorage.setItem(prefsKey(user.id), JSON.stringify(prefs));
  } catch {
    /* storage unavailable */
  }
}

/* ───── sign-in against the API ───── */

export function profileFromApi(user: UserView, workspace: WorkspaceView | null): UserProfile {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: roleLabel(workspace?.myRole),
    workspace: workspace?.name ?? "No workspace yet",
    joinedAt: user.createdAt.slice(0, 10),
    ...loadPrefs(user.id),
  };
}

/** Stores the tokens from an auth response and builds the profile (first workspace wins). */
export async function startSession(response: AuthResponse, remember: boolean): Promise<UserProfile> {
  saveTokens({ accessToken: response.accessToken, refreshToken: response.refreshToken }, remember);
  let workspace: WorkspaceView | null = null;
  try {
    workspace = (await workspaces.list()).content[0] ?? null;
  } catch {
    /* the profile is still usable without the workspace name */
  }
  return profileFromApi(response.user, workspace);
}

export async function endSession() {
  const tokens = loadTokens();
  clearTokens();
  clearSession();
  if (tokens) {
    try {
      await auth.logout(tokens.refreshToken);
    } catch {
      /* already signed out locally; a failed revoke is not actionable */
    }
  }
}

/* ───── persistence of the display profile ───── */

const SESSION_KEY = "foresight.session";

function storages(): Storage[] {
  const out: Storage[] = [];
  try {
    out.push(window.localStorage);
  } catch {
    /* blocked */
  }
  try {
    out.push(window.sessionStorage);
  } catch {
    /* blocked */
  }
  return out;
}

/** The stored profile, only while tokens exist (profiles from the old simulated login are ignored). */
export function loadSession(): UserProfile | null {
  if (!loadTokens()) return null;
  for (const store of storages()) {
    try {
      const raw = store.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw) as UserProfile;
    } catch {
      /* unreadable or corrupt: ignore */
    }
  }
  return null;
}

export function saveSession(user: UserProfile, remember: boolean) {
  clearSession();
  try {
    (remember ? window.localStorage : window.sessionStorage).setItem(SESSION_KEY, JSON.stringify(user));
  } catch {
    /* storage unavailable: session lasts until reload */
  }
}

/** Keeps the session in whichever store it already lives in. */
export function updateSession(user: UserProfile) {
  for (const store of storages()) {
    try {
      if (store.getItem(SESSION_KEY)) store.setItem(SESSION_KEY, JSON.stringify(user));
    } catch {
      /* ignore */
    }
  }
}

export function clearSession() {
  for (const store of storages()) {
    try {
      store.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }
}

/* ───── activity log (the API has no per-user activity feed; kept in this browser) ───── */

export type ActivityKind = "ai" | "plan" | "account";

export interface ActivityEntry {
  id: string;
  at: number; // epoch ms
  kind: ActivityKind;
  text: string;
  detail?: string;
}

const ACTIVITY_LIMIT = 50;
const activityKey = (userId: string) => `foresight.activity.${userId}`;

export function loadActivity(userId: string | null): ActivityEntry[] {
  if (!userId) return [];
  try {
    const raw = window.localStorage.getItem(activityKey(userId));
    if (raw) return JSON.parse(raw) as ActivityEntry[];
  } catch {
    /* unreadable: start empty */
  }
  return [];
}

export function saveActivity(userId: string, entries: ActivityEntry[]) {
  try {
    window.localStorage.setItem(activityKey(userId), JSON.stringify(entries.slice(0, ACTIVITY_LIMIT)));
  } catch {
    /* storage unavailable */
  }
}

export function timeAgo(ts: number, now = Date.now()): string {
  const m = Math.round((now - ts) / 60_000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}
