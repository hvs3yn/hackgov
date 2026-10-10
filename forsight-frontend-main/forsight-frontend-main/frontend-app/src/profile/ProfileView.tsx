import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Card, EYEBROW, Field, Icon, Toggle } from "../ui";
import { inputClass } from "../styles";
import type { IconName } from "../ui";
import { RoleBadge, UserAvatar } from "../auth/UserMenu";
import {
  EMAIL_PATTERN,
  ROLES,
  TIMEZONES,
  timeAgo,
  type ActivityEntry,
  type ActivityKind,
  type AppRole,
  type NotificationPrefs,
  type UserProfile,
} from "../auth/session";

export type RiskLevel = "Critical" | "High" | "Medium" | "Low";

export interface AssignedTask {
  id: string;
  task: string;
  project: string;
  due: string;
  risk: RiskLevel;
  note: string;
}

export interface ProfileViewProps {
  user: UserProfile;
  tasks: AssignedTask[];
  activity: ActivityEntry[];
  /** Name, email and role come from the API and can't be edited here; only local preferences can. */
  accountManaged?: boolean;
  onSave: (next: UserProfile) => void;
  onBack: () => void;
}

type Tab = "details" | "tasks" | "activity";

const RISK_STYLE: Record<RiskLevel, string> = {
  Critical: "bg-amber-400 text-amber-950 ring-amber-500",
  High: "bg-amber-50 text-amber-900 ring-amber-300",
  Medium: "bg-slate-100 text-slate-700 ring-slate-200",
  Low: "bg-blue-50 text-indigo-700 ring-blue-200",
};

const ACTIVITY_ICON: Record<ActivityKind, { icon: IconName; className: string }> = {
  ai: { icon: "spark", className: "bg-amber-400 text-amber-950" },
  plan: { icon: "sliders", className: "bg-slate-900 text-white" },
  account: { icon: "user", className: "bg-blue-50 text-indigo-700 ring-1 ring-inset ring-blue-200" },
};

const LOCKED = "cursor-not-allowed bg-slate-50 text-slate-500";

const NOTIFICATION_LABELS: Record<keyof NotificationPrefs, { title: string; hint: string }> = {
  riskAlerts: { title: "Risk alerts", hint: "Push and email when a new bottleneck is forecast" },
  weeklyDigest: { title: "Weekly digest", hint: "Monday summary of forecasts and interventions" },
  mentions: { title: "Mentions & assignments", hint: "When someone assigns you a task or mentions you" },
};

function formatJoined(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/* ───── Personal details ───── */

function DetailsForm({ user, managed, onSave }: { user: UserProfile; managed: boolean; onSave: (next: UserProfile) => void }) {
  const [draft, setDraft] = useState<UserProfile>(user);
  const [errors, setErrors] = useState<{ fullName?: string; email?: string }>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const dirty = JSON.stringify(draft) !== JSON.stringify(user);
  const set = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (draft.fullName.trim().length < 2) next.fullName = "Enter your full name.";
    if (!EMAIL_PATTERN.test(draft.email.trim())) next.email = "Enter a valid email address.";
    setErrors(next);
    if (Object.keys(next).length) return;
    onSave({ ...draft, fullName: draft.fullName.trim(), email: draft.email.trim().toLowerCase() });
    setSavedAt(Date.now());
    timer.current = window.setTimeout(() => setSavedAt(null), 3000);
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="grid gap-5 p-6 sm:grid-cols-2">
        <Field id="pf-name" label="Full Name" error={errors.fullName} hint={managed ? "Managed by your Foresight account." : undefined}>
          <input id="pf-name" value={draft.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="name" disabled={managed} className={`${inputClass(!!errors.fullName)} ${managed ? LOCKED : ""}`} />
        </Field>
        <Field id="pf-email" label="Email" error={errors.email}>
          <input id="pf-email" type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" disabled={managed} className={`${inputClass(!!errors.email)} ${managed ? LOCKED : ""}`} />
        </Field>
        <Field id="pf-title" label="Job Title" hint={managed ? "Saved in this browser only." : undefined}>
          <input id="pf-title" value={draft.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} className={inputClass(false)} />
        </Field>
        <Field id="pf-role" label="Role" hint={managed ? "Derived from your workspace and project roles." : "Controls what you can change in this workspace."}>
          <select id="pf-role" value={draft.role} onChange={(e) => set("role", e.target.value as AppRole)} disabled={managed} className={`${inputClass(false)} ${managed ? LOCKED : ""}`}>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field id="pf-tz" label="Timezone" hint={managed ? "Saved in this browser only." : undefined}>
          <select id="pf-tz" value={draft.timezone} onChange={(e) => set("timezone", e.target.value)} className={inputClass(false)}>
            {TIMEZONES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field id="pf-workspace" label="Workspace">
          <input id="pf-workspace" value={draft.workspace} disabled className={`${inputClass(false)} cursor-not-allowed bg-slate-50 text-slate-500`} />
        </Field>
      </div>

      <fieldset className="border-t border-slate-100 px-6 py-5">
        <legend className="sr-only">Notification preferences</legend>
        <p className={EYEBROW}>Notification Preferences{managed && " · saved in this browser"}</p>
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {(Object.keys(NOTIFICATION_LABELS) as (keyof NotificationPrefs)[]).map((key) => (
            <li key={key} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-[13px] font-medium text-slate-900">{NOTIFICATION_LABELS[key].title}</p>
                <p className="text-[12px] text-slate-500">{NOTIFICATION_LABELS[key].hint}</p>
              </div>
              <Toggle
                checked={draft.notifications[key]}
                label={NOTIFICATION_LABELS[key].title}
                onChange={(v) => set("notifications", { ...draft.notifications, [key]: v })}
              />
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] text-slate-500" role="status">
          {savedAt ? <span className="font-medium text-slate-900">Profile saved.</span> : dirty ? "You have unsaved changes." : "All changes saved."}
        </p>
        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={!dirty}
            onClick={() => {
              setDraft(user);
              setErrors({});
            }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Discard
          </button>
          <button
            type="submit"
            disabled={!dirty}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Save Changes
          </button>
        </div>
      </div>
    </form>
  );
}

/* ───── Assigned tasks ───── */

function TasksList({ tasks }: { tasks: AssignedTask[] }) {
  if (tasks.length === 0) {
    return (
      <div className="px-6 py-14 text-center">
        <p className="text-sm font-medium text-slate-900">No tasks assigned yet</p>
        <p className="mt-1 text-[13px] text-slate-500">Tasks assigned to you in any project will appear here with their forecast risk.</p>
      </div>
    );
  }
  const order: RiskLevel[] = ["Critical", "High", "Medium", "Low"];
  const sorted = [...tasks].sort((a, b) => order.indexOf(a.risk) - order.indexOf(b.risk));
  return (
    <ul className="divide-y divide-slate-100">
      {sorted.map((t) => (
        <li key={t.id} className={`flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between ${t.risk === "Critical" ? "bg-amber-50/50" : ""}`}>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{t.task}</p>
            <p className="mt-0.5 text-[12px] text-slate-500">
              {t.project} · Due {t.due}
            </p>
            <p className="mt-1 text-[13px] text-slate-600">{t.note}</p>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1 self-start rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset sm:self-center ${RISK_STYLE[t.risk]}`}>
            {(t.risk === "Critical" || t.risk === "High") && <Icon name="alert" className="h-3 w-3" />}
            {t.risk} risk
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ───── Activity log ───── */

function ActivityLog({ entries }: { entries: ActivityEntry[] }) {
  const sorted = [...entries].sort((a, b) => b.at - a.at);
  if (sorted.length === 0) {
    return (
      <div className="px-6 py-14 text-center">
        <p className="text-sm font-medium text-slate-900">No activity yet</p>
        <p className="mt-1 text-[13px] text-slate-500">Actions you take here are logged on this device.</p>
      </div>
    );
  }
  return (
    <ol className="px-6 py-5">
      {sorted.map((e, i) => {
        const meta = ACTIVITY_ICON[e.kind];
        return (
          <li key={e.id} className="relative flex gap-4 pb-5 last:pb-0">
            {i < sorted.length - 1 && <span className="absolute bottom-0 left-[13px] top-8 w-px bg-slate-200" aria-hidden="true" />}
            <span className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${meta.className}`}>
              <Icon name={meta.icon} className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-[13px] font-semibold text-slate-900">{e.text}</p>
                <time dateTime={new Date(e.at).toISOString()} className="text-[12px] tabular-nums text-slate-400">
                  {timeAgo(e.at)}
                </time>
              </div>
              {e.detail && <p className="mt-0.5 text-[12px] text-slate-500">{e.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ───── Page ───── */

export function ProfileView({ user, tasks, activity, accountManaged = false, onSave, onBack }: ProfileViewProps) {
  const [tab, setTab] = useState<Tab>("details");
  const atRisk = tasks.filter((t) => t.risk === "Critical" || t.risk === "High").length;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "details", label: "Personal Details" },
    { id: "tasks", label: "Assigned Tasks & Risks", count: tasks.length },
    { id: "activity", label: "Activity Log", count: activity.length },
  ];

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
      >
        <Icon name="back" />
        Back to Dashboard
      </button>

      {/* Header */}
      <Card className="overflow-hidden">
        <div className="h-16 border-b border-slate-200 bg-slate-50" aria-hidden="true" />
        <div className="flex flex-col gap-5 px-6 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="-mt-8 flex flex-col gap-4 sm:flex-row sm:items-end">
            <span className="rounded-full ring-4 ring-white">
              <UserAvatar user={user} size="xl" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{user.fullName}</h1>
                <RoleBadge role={user.role} />
              </div>
              <p className="mt-0.5 text-sm text-slate-600">
                {user.jobTitle} · {user.workspace}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-500">
                <Icon name="clock" className="h-3.5 w-3.5" />
                Joined {formatJoined(user.joinedAt)}
              </p>
            </div>
          </div>
          <dl className="flex gap-6">
            <div>
              <dt className="text-[11px] text-slate-500">Assigned tasks</dt>
              <dd className="text-lg font-semibold tabular-nums text-slate-900">{tasks.length}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">At risk</dt>
              <dd className={`text-lg font-semibold tabular-nums ${atRisk ? "text-amber-700" : "text-slate-900"}`}>{atRisk}</dd>
            </div>
          </dl>
        </div>
      </Card>

      {/* Tabs */}
      <Card>
        <div role="tablist" aria-label="Profile sections" className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex shrink-0 items-center gap-2 px-3 py-3.5 text-[13px] font-semibold transition-colors ${
                tab === t.id ? "text-slate-900" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span className={`rounded-full px-1.5 py-px text-[10px] tabular-nums ${tab === t.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{t.count}</span>
              )}
              {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-slate-900" aria-hidden="true" />}
            </button>
          ))}
        </div>

        <div role="tabpanel">
          {tab === "details" && <DetailsForm user={user} managed={accountManaged} onSave={onSave} />}
          {tab === "tasks" && <TasksList tasks={tasks} />}
          {tab === "activity" && <ActivityLog entries={activity} />}
        </div>
      </Card>
    </div>
  );
}
