import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ReactNode } from "react";

/* ═════════════════════════════════ Types ═════════════════════════════════ */

export type AlertKind = "risk" | "success";

export interface NotificationAction {
  label: string;
  onAction: () => void;
}

export interface AppNotification {
  id: string;
  kind: AlertKind;
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
  action?: NotificationAction;
}

export interface NotifyInput {
  kind: AlertKind;
  title: string;
  message: string;
  action?: NotificationAction;
  /** Show a floating toast in addition to the bell list. Default true. */
  toast?: boolean;
  /** Auto-dismiss after ms; 0 keeps it until dismissed. Defaults: risk 9000, success 5000. */
  duration?: number;
  /** Seed historical items (e.g. from the server). */
  createdAt?: number;
  read?: boolean;
}

interface ToastEntry {
  id: string;
  duration: number;
  leaving: boolean;
}

interface State {
  items: AppNotification[];
  toasts: ToastEntry[];
}

type Action =
  | { type: "push"; item: AppNotification; toast: ToastEntry | null }
  | { type: "toast-leave"; id: string }
  | { type: "toast-remove"; id: string }
  | { type: "mark-read"; id: string }
  | { type: "mark-all-read" }
  | { type: "remove"; id: string }
  | { type: "clear" };

export interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  notify: (input: NotifyInput) => string;
  dismissToast: (id: string) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clearAll: () => void;
}

/* ═════════════════════════════════ Config ═════════════════════════════════ */

const MAX_ITEMS = 50;
const MAX_VISIBLE_TOASTS = 3;
const EXIT_MS = 200;
const DEFAULT_DURATION: Record<AlertKind, number> = { risk: 9000, success: 5000 };

const KIND_STYLE: Record<AlertKind, { accent: string; icon: string; tint: string; progress: string }> = {
  risk: {
    accent: "border-l-4 border-l-amber-500 bg-amber-50/30",
    icon: "bg-amber-400 text-amber-950",
    tint: "bg-amber-50 text-amber-700",
    progress: "bg-amber-400",
  },
  success: {
    accent: "border-l-4 border-l-indigo-600 bg-blue-50/30",
    icon: "bg-indigo-600 text-white",
    tint: "bg-blue-50 text-indigo-700",
    progress: "bg-indigo-600",
  },
};

/* ═════════════════════════════════ Store ═════════════════════════════════ */

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "push": {
      const items = [action.item, ...state.items].slice(0, MAX_ITEMS);
      if (!action.toast) return { ...state, items };
      // Newest on top; anything beyond the visible limit animates out.
      const toasts = [action.toast, ...state.toasts].map((t, i) =>
        i >= MAX_VISIBLE_TOASTS && !t.leaving ? { ...t, leaving: true } : t,
      );
      return { items, toasts };
    }
    case "toast-leave":
      return { ...state, toasts: state.toasts.map((t) => (t.id === action.id ? { ...t, leaving: true } : t)) };
    case "toast-remove":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    case "mark-read":
      return { ...state, items: state.items.map((n) => (n.id === action.id ? { ...n, read: true } : n)) };
    case "mark-all-read":
      return { ...state, items: state.items.map((n) => (n.read ? n : { ...n, read: true })) };
    case "remove":
      return {
        items: state.items.filter((n) => n.id !== action.id),
        toasts: state.toasts.map((t) => (t.id === action.id ? { ...t, leaving: true } : t)),
      };
    case "clear":
      return { items: [], toasts: state.toasts.map((t) => ({ ...t, leaving: true })) };
  }
}

let idCounter = 0;
const newId = () => `n_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used inside <NotificationProvider>");
  return ctx;
}

export function NotificationProvider({ children, initial = [] }: { children: ReactNode; initial?: NotifyInput[] }) {
  const [state, dispatch] = useReducer(reducer, initial, (seed): State => ({
    items: seed.map((s) => ({
      id: newId(),
      kind: s.kind,
      title: s.title,
      message: s.message,
      action: s.action,
      createdAt: s.createdAt ?? Date.now(),
      read: s.read ?? false,
    })),
    toasts: [],
  }));

  // Remove toasts from the DOM once their exit transition has played.
  useEffect(() => {
    const leaving = state.toasts.filter((t) => t.leaving);
    if (leaving.length === 0) return;
    const timers = leaving.map((t) => window.setTimeout(() => dispatch({ type: "toast-remove", id: t.id }), EXIT_MS));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [state.toasts]);

  const notify = useCallback((input: NotifyInput) => {
    const id = newId();
    const item: AppNotification = {
      id,
      kind: input.kind,
      title: input.title,
      message: input.message,
      action: input.action,
      createdAt: input.createdAt ?? Date.now(),
      read: input.read ?? false,
    };
    const toast = input.toast === false ? null : { id, duration: input.duration ?? DEFAULT_DURATION[input.kind], leaving: false };
    dispatch({ type: "push", item, toast });
    return id;
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications: state.items,
      unreadCount: state.items.filter((n) => !n.read).length,
      notify,
      dismissToast: (id) => dispatch({ type: "toast-leave", id }),
      markRead: (id) => dispatch({ type: "mark-read", id }),
      markAllRead: () => dispatch({ type: "mark-all-read" }),
      remove: (id) => dispatch({ type: "remove", id }),
      clearAll: () => dispatch({ type: "clear" }),
    }),
    [state.items, notify],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <ToastViewport toasts={state.toasts} items={state.items} />
    </NotificationContext.Provider>
  );
}

/* ═════════════════════════════════ Helpers ═════════════════════════════════ */

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function timeAgo(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}

/* ═════════════════════════════════ Icons ═════════════════════════════════ */

type IconName = "bell" | "spark" | "close" | "check" | "arrow";

function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      {name === "bell" && (
        <>
          <path d="M5.5 8.5a4.5 4.5 0 0 1 9 0c0 3.5 1.5 5 1.5 5H4s1.5-1.5 1.5-5Z" {...p} />
          <path d="M8.5 16a1.6 1.6 0 0 0 3 0" {...p} />
        </>
      )}
      {name === "spark" && <path d="M10 2.5 11.6 8.4 17.5 10l-5.9 1.6L10 17.5l-1.6-5.9L2.5 10l5.9-1.6L10 2.5Z" {...p} />}
      {name === "close" && <path d="m5.5 5.5 9 9m0-9-9 9" {...p} />}
      {name === "check" && <path d="m5 10.5 3.2 3L15 6.5" {...p} />}
      {name === "arrow" && <path d="M4 10h11m0 0-4-4m4 4-4 4" {...p} />}
    </svg>
  );
}

function KindIcon({ kind, size = "md" }: { kind: AlertKind; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-lg ${box} ${KIND_STYLE[kind].icon}`}>
      <Icon name={kind === "risk" ? "bell" : "check"} className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </span>
  );
}

/* ═════════════════════════════════ Toasts ═════════════════════════════════ */

const TOAST_KEYFRAMES = `@keyframes pai-toast-progress{from{transform:scaleX(1)}to{transform:scaleX(0)}}`;

function ToastViewport({ toasts, items }: { toasts: ToastEntry[]; items: AppNotification[] }) {
  return (
    <>
      <style>{TOAST_KEYFRAMES}</style>
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3 sm:right-6 sm:top-20"
      >
        {toasts.map((t) => {
          const item = items.find((n) => n.id === t.id);
          return item ? <Toast key={t.id} entry={t} item={item} /> : null;
        })}
      </div>
    </>
  );
}

function Toast({ entry, item }: { entry: ToastEntry; item: AppNotification }) {
  const { dismissToast, markRead } = useNotifications();
  const [entered, setEntered] = useState(false);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(entry.duration);
  const startedAt = useRef(0);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Auto-dismiss timer that pauses on hover/focus and resumes with the time left.
  useEffect(() => {
    if (entry.duration === 0 || entry.leaving || paused) return;
    startedAt.current = Date.now();
    const t = window.setTimeout(() => dismissToast(entry.id), remaining.current);
    return () => {
      window.clearTimeout(t);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [paused, entry.duration, entry.leaving, entry.id, dismissToast]);

  const visible = entered && !entry.leaving;
  const style = KIND_STYLE[item.kind];

  return (
    <div
      role={item.kind === "risk" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`pointer-events-auto relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg shadow-slate-900/10 transition-all ease-out ${
        visible ? "translate-x-0 opacity-100 duration-300" : "translate-x-6 opacity-0 duration-200"
      }`}
    >
      <div className={`flex gap-3 p-4 ${style.accent}`}>
        <KindIcon kind={item.kind} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
          <p className="mt-1 text-[13px] leading-snug text-slate-600">{item.message}</p>
          {item.action && (
            <button
              type="button"
              onClick={() => {
                item.action?.onAction();
                markRead(item.id);
                dismissToast(item.id);
              }}
              className={`mt-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                item.kind === "risk"
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "bg-white text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-blue-50"
              }`}
            >
              {item.kind === "risk" && <Icon name="spark" className="h-3.5 w-3.5 text-amber-400" />}
              {item.action.label}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => dismissToast(item.id)}
          aria-label="Dismiss notification"
          className="-mr-1 -mt-1 h-7 w-7 shrink-0 rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <Icon name="close" className="mx-auto h-4 w-4" />
        </button>
      </div>
      {entry.duration > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-slate-100">
          <div
            className={`h-full origin-left ${style.progress}`}
            style={{
              animation: `pai-toast-progress ${entry.duration}ms linear forwards`,
              animationPlayState: paused || entry.leaving ? "paused" : "running",
            }}
          />
        </div>
      )}
    </div>
  );
}

/* ═════════════════════════════════ Bell + dropdown ═════════════════════════════════ */

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead, remove, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [pulse, setPulse] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const prevUnread = useRef(unreadCount);
  const now = useNow(30_000);

  // Brief ping on the badge when a new unread alert arrives.
  useEffect(() => {
    if (unreadCount > prevUnread.current) {
      setPulse(true);
      const t = window.setTimeout(() => setPulse(false), 1600);
      prevUnread.current = unreadCount;
      return () => window.clearTimeout(t);
    }
    prevUnread.current = unreadCount;
  }, [unreadCount]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const list = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 ${
          open ? "border-slate-300 bg-slate-100 text-slate-900" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        }`}
      >
        <Icon name="bell" className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex">
            {pulse && <span className="absolute inset-0 animate-ping rounded-full bg-amber-400 opacity-75" />}
            <span className="relative flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold tabular-nums text-amber-950 ring-2 ring-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          </span>
        )}
      </button>

      <div
        className={`absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 transition-all duration-150 ease-out ${
          open ? "visible scale-100 opacity-100" : "invisible scale-95 opacity-0"
        }`}
        role="region"
        aria-label="Notification center"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            {unreadCount > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 py-px text-[11px] font-semibold tabular-nums text-amber-900">
                {unreadCount} new
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="text-[12px] font-medium text-indigo-700 hover:text-indigo-900 disabled:cursor-default disabled:text-slate-300"
          >
            Mark all as read
          </button>
        </div>

        <div className="flex gap-1 border-b border-slate-100 px-3 py-2" role="tablist">
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium capitalize transition-colors ${
                filter === f ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <ul className="max-h-[22rem] divide-y divide-slate-100 overflow-y-auto">
          {list.length === 0 ? (
            <li className="flex flex-col items-center px-6 py-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Icon name="bell" />
              </span>
              <p className="mt-3 text-sm font-medium text-slate-900">You're all caught up</p>
              <p className="mt-1 text-[12px] text-slate-500">New risk forecasts will show up here.</p>
            </li>
          ) : (
            list.map((n) => (
              <li
                key={n.id}
                className={`group relative flex gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 ${n.read ? "" : "bg-slate-50/60"}`}
              >
                <KindIcon kind={n.kind} size="sm" />
                <button type="button" onClick={() => markRead(n.id)} className="min-w-0 flex-1 text-left focus:outline-none">
                  <div className="flex items-start justify-between gap-2 pr-5">
                    <p className={`text-[13px] leading-snug ${n.read ? "font-medium text-slate-700" : "font-semibold text-slate-900"}`}>
                      {n.title}
                    </p>
                    {!n.read && <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.kind === "risk" ? "bg-amber-500" : "bg-indigo-600"}`} />}
                  </div>
                  <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{n.message}</p>
                  <p className="mt-1.5 text-[11px] tabular-nums text-slate-400">{timeAgo(n.createdAt, now)}</p>
                </button>
                {n.action && !n.read && (
                  <button
                    type="button"
                    onClick={() => {
                      n.action?.onAction();
                      markRead(n.id);
                    }}
                    className={`self-center whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold ${KIND_STYLE[n.kind].tint}`}
                  >
                    {n.action.label}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  aria-label="Remove notification"
                  className="absolute right-2 top-2 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:text-slate-600 focus:opacity-100 group-hover:opacity-100"
                >
                  <Icon name="close" className="h-3.5 w-3.5" />
                </button>
              </li>
            ))
          )}
        </ul>

        {notifications.length > 0 && (
          <div className="flex justify-end border-t border-slate-100 px-4 py-2.5">
            <button type="button" onClick={clearAll} className="text-[12px] font-medium text-slate-500 hover:text-slate-900">
              Clear all
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═════════════════════════════════ Demo ═════════════════════════════════ */

const MIN = 60_000;

function DemoPage() {
  const { notify } = useNotifications();
  const [liveEngine, setLiveEngine] = useState(false);
  const scriptIndex = useRef(0);

  const simulateSolution = useCallback(() => {
    window.setTimeout(
      () =>
        notify({
          kind: "success",
          title: "Resolution Simulated",
          message: "Mock API keeps Leyla and Elvin unblocked. On-time odds 28% → 88%.",
          action: { label: "View plan", onAction: () => undefined },
        }),
      900,
    );
  }, [notify]);

  const pushWarning = useCallback(() => {
    notify({
      kind: "risk",
      title: "Preemptive Warning Detected",
      message: "Anar's task delay will block Leyla in 24 hours.",
      action: { label: "Simulate Solution", onAction: simulateSolution },
    });
  }, [notify, simulateSolution]);

  // Show the headline warning shortly after load. The cleanup cancels the timer, so
  // StrictMode's mount → unmount → mount still produces exactly one toast.
  useEffect(() => {
    const t = window.setTimeout(pushWarning, 800);
    return () => window.clearTimeout(t);
  }, [pushWarning]);

  // Scripted "AI engine" events for the live demo.
  useEffect(() => {
    if (!liveEngine) return;
    const script: (() => void)[] = [
      () =>
        notify({
          kind: "risk",
          title: "New Bottleneck Detected",
          message: "Backend schema delay risks Frontend QA starting Thursday.",
          action: { label: "Simulate Solution", onAction: simulateSolution },
        }),
      () =>
        notify({
          kind: "risk",
          title: "Capacity Drop Forecast",
          message: "Elvin has 2 days off next week. E2E window shrinks to 1 day.",
          action: { label: "Simulate Solution", onAction: simulateSolution },
        }),
      () => notify({ kind: "success", title: "Risk Cleared", message: "Auth endpoints merged. Frontend integration unblocked." }),
    ];
    const tick = () => {
      script[scriptIndex.current % script.length]();
      scriptIndex.current += 1;
    };
    tick();
    const t = window.setInterval(tick, 12_000);
    return () => window.clearInterval(t);
  }, [liveEngine, notify, simulateSolution]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-700 antialiased">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-[15px] font-semibold tracking-tight text-slate-900">Foresight</span>
            <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">Risk</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-[12px] text-slate-500 sm:inline">Student Team Project Q4</span>
            <NotificationBell />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_0_rgb(15_23_42/0.05)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Demo controls</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Notification Center</h1>
          <p className="mt-1 text-sm text-slate-600">Trigger alerts manually or let the scripted AI engine push one every 12 seconds.</p>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={pushWarning}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Icon name="bell" className="h-4 w-4 text-amber-400" />
              Push risk warning
            </button>
            <button
              type="button"
              onClick={() => notify({ kind: "success", title: "Resolution Applied", message: "Mock API deployed. 2 tasks unblocked." })}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Push success
            </button>
          </div>

          <label className="mt-5 flex cursor-pointer items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-slate-900">Live AI engine</span>
              <span className="block text-[12px] text-slate-500">Scripted forecasts every 12s</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={liveEngine}
              onClick={() => setLiveEngine((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${liveEngine ? "bg-amber-400" : "bg-slate-300"}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${liveEngine ? "translate-x-[22px]" : "translate-x-0.5"}`} />
            </button>
          </label>
        </div>
      </main>
    </div>
  );
}

const SEED: NotifyInput[] = [
  {
    kind: "risk",
    title: "Preemptive Warning Detected",
    message: "Anar's task delay will block Leyla in 24 hours.",
    createdAt: Date.now() - 2 * MIN,
    toast: false,
  },
  {
    kind: "risk",
    title: "New Bottleneck Detected",
    message: "Backend schema delay risks Frontend QA.",
    createdAt: Date.now() - 60 * MIN,
    toast: false,
  },
  {
    kind: "success",
    title: "Resolution Applied",
    message: "CI pipeline fixed; deploys back to 4 minutes.",
    createdAt: Date.now() - 26 * 60 * MIN,
    read: true,
    toast: false,
  },
];

export default function NotificationCenterDemo() {
  return (
    <NotificationProvider initial={SEED}>
      <DemoPage />
    </NotificationProvider>
  );
}
