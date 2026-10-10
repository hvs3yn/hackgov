import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Field, Icon, Logo } from "../ui";
import { inputClass } from "../styles";
import { ApiError, auth, errorMessage, workspaces } from "../api";
import { saveTokens } from "../api/tokens";
import {
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  EMAIL_PATTERN,
  MIN_PASSWORD,
  passwordProblem,
  profileFromApi,
  startSession,
  type UserProfile,
} from "./session";

export type AuthTab = "signin" | "register";

export interface AuthModalProps {
  open: boolean;
  tab: AuthTab;
  onTabChange: (tab: AuthTab) => void;
  onClose: () => void;
  onAuthenticated: (user: UserProfile, remember: boolean, how: "signin" | "register" | "demo") => void;
}

type Errors = Partial<Record<"fullName" | "email" | "password" | "confirm" | "workspace" | "form", string>>;

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-950">
      {message}
    </p>
  );
}

/** Maps a server rejection onto the form fields it belongs to. */
function serverErrors(e: unknown): Errors {
  if (e instanceof ApiError) {
    if (e.code === "INVALID_CREDENTIALS" || e.code === "UNAUTHENTICATED") return { password: "Incorrect email or password." };
    if (e.code === "EMAIL_TAKEN") return { email: "An account with this email already exists." };
    const known = e.fieldErrors.filter((f) => f.field === "fullName" || f.field === "email" || f.field === "password");
    if (known.length) return Object.fromEntries(known.map((f) => [f.field, f.message])) as Errors;
  }
  return { form: errorMessage(e) };
}

function PasswordInput({ id, value, onChange, error, autoComplete }: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${inputClass(!!error)} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-700"
      >
        <Icon name={visible ? "eye-off" : "eye"} />
      </button>
    </div>
  );
}

function SignInForm({ onAuthenticated, onSwitch }: { onAuthenticated: AuthModalProps["onAuthenticated"]; onSwitch: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const login = async (key: string, credentials: { email: string; password: string }, how: "signin" | "demo") => {
    setBusy(key);
    setErrors({});
    try {
      const response = await auth.login(credentials);
      const profile = await startSession(response, remember);
      onAuthenticated(profile, remember, how);
    } catch (err) {
      if (!alive.current) return;
      setErrors(serverErrors(err));
      setBusy(null);
    }
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next: Errors = {};
    if (!EMAIL_PATTERN.test(email.trim())) next.email = "Enter a valid email address.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    if (Object.keys(next).length) return;
    void login("form", { email: email.trim().toLowerCase(), password }, "signin");
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field id="signin-email" label="Email" error={errors.email}>
        <input
          id="signin-email"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@team.dev"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "signin-email-error" : undefined}
          className={inputClass(!!errors.email)}
        />
      </Field>
      <Field id="signin-password" label="Password" error={errors.password}>
        <PasswordInput id="signin-password" value={password} onChange={setPassword} error={errors.password} autoComplete="current-password" />
      </Field>

      <FormError message={errors.form} />

      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-700">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-slate-900" />
          Remember me
        </label>
        <span className="text-[12px] text-slate-400" title="Password reset needs the auth backend">
          Forgot password?
        </span>
      </div>

      <button
        type="submit"
        disabled={busy !== null}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-wait disabled:bg-slate-700"
      >
        {busy === "form" && <Icon name="spinner" />}
        {busy === "form" ? "Signing in…" : "Sign In"}
      </button>

      <div className="relative py-1 text-center">
        <span className="absolute inset-x-0 top-1/2 h-px bg-slate-200" aria-hidden="true" />
        <span className="relative bg-white px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Demo quick-login</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {DEMO_ACCOUNTS.map((account) => (
          <button
            key={account.email}
            type="button"
            onClick={() => void login(account.email, { email: account.email, password: DEMO_PASSWORD }, "demo")}
            disabled={busy !== null}
            className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-2.5 text-center transition-colors hover:border-amber-300 hover:bg-amber-50 disabled:opacity-60"
          >
            <span className="text-[12px] font-semibold text-slate-900">{busy === account.email ? "Signing in…" : account.name}</span>
            <span className="truncate text-[11px] text-slate-500">demo account</span>
          </button>
        ))}
      </div>

      <p className="text-center text-[13px] text-slate-600">
        New to Foresight?{" "}
        <button type="button" onClick={onSwitch} className="font-semibold text-indigo-700 hover:text-slate-900">
          Create an account
        </button>
      </p>
    </form>
  );
}

function RegisterForm({ onAuthenticated, onSwitch }: { onAuthenticated: AuthModalProps["onAuthenticated"]; onSwitch: () => void }) {
  const [form, setForm] = useState({ fullName: "", email: "", password: "", confirm: "", workspace: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next: Errors = {};
    if (form.fullName.trim().length < 2) next.fullName = "Enter your full name.";
    if (!EMAIL_PATTERN.test(form.email.trim())) next.email = "Enter a valid email address.";
    const pwProblem = passwordProblem(form.password);
    if (pwProblem) next.password = pwProblem;
    if (form.confirm !== form.password) next.confirm = "Passwords don't match.";
    if (form.workspace.trim().length < 2) next.workspace = "Name your workspace or team.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    void (async () => {
      try {
        const response = await auth.register({ fullName: form.fullName.trim(), email: form.email.trim().toLowerCase(), password: form.password });
        saveTokens({ accessToken: response.accessToken, refreshToken: response.refreshToken }, true);
        // The creator becomes the workspace OWNER. If this fails the account still exists; Settings can create one later.
        const workspace = await workspaces.create(form.workspace.trim()).catch(() => null);
        onAuthenticated(profileFromApi(response.user, workspace), true, "register");
      } catch (err) {
        if (!alive.current) return;
        setErrors(serverErrors(err));
        setBusy(false);
      }
    })();
  };

  const text = (key: "fullName" | "email" | "workspace", label: string, type: string, autoComplete: string, placeholder: string) => (
    <Field id={`reg-${key}`} label={label} error={errors[key]}>
      <input
        id={`reg-${key}`}
        type={type}
        autoComplete={autoComplete}
        autoFocus={key === "fullName"}
        value={form[key]}
        onChange={(e) => set(key)(e.target.value)}
        placeholder={placeholder}
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `reg-${key}-error` : undefined}
        className={inputClass(!!errors[key])}
      />
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {text("fullName", "Full Name", "text", "name", "Anar Mammadov")}
      {text("email", "Email", "email", "email", "you@team.dev")}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="reg-password" label="Password" error={errors.password} hint={`${MIN_PASSWORD}+ characters, with a letter and a digit`}>
          <PasswordInput id="reg-password" value={form.password} onChange={set("password")} error={errors.password} autoComplete="new-password" />
        </Field>
        <Field id="reg-confirm" label="Confirm Password" error={errors.confirm}>
          <PasswordInput id="reg-confirm" value={form.confirm} onChange={set("confirm")} error={errors.confirm} autoComplete="new-password" />
        </Field>
      </div>
      {text("workspace", "Workspace / Team Name", "text", "organization", "Student Team Q4")}

      <FormError message={errors.form} />

      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-wait disabled:bg-slate-700"
      >
        {busy && <Icon name="spinner" />}
        {busy ? "Creating account…" : "Create Account"}
      </button>

      <p className="text-center text-[13px] text-slate-600">
        Already have an account?{" "}
        <button type="button" onClick={onSwitch} className="font-semibold text-indigo-700 hover:text-slate-900">
          Sign in
        </button>
      </p>
    </form>
  );
}

export function AuthModal({ open, tab, onTabChange, onClose, onAuthenticated }: AuthModalProps) {
  const returnFocus = useRef<Element | null>(null);
  // Kept in a ref so a new onClose identity doesn't re-run the effect (which would steal focus).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto px-4 py-10 sm:items-center">
      <div className="fixed inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="auth-title" className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20">
        <div className="flex items-start justify-between px-6 pt-6">
          <Logo />
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900">
            <Icon name="close" />
          </button>
        </div>

        <div className="px-6 pt-5">
          <h2 id="auth-title" className="text-xl font-semibold tracking-tight text-slate-900">
            {tab === "signin" ? "Welcome back" : "Create your workspace"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {tab === "signin" ? "Sign in to see live risk forecasts for your team." : "Start forecasting delivery risk in a couple of minutes."}
          </p>

          <div role="tablist" aria-label="Authentication" className="mt-5 grid grid-cols-2 rounded-lg bg-slate-100 p-1">
            {(["signin", "register"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => onTabChange(t)}
                className={`rounded-md py-1.5 text-[13px] font-semibold transition-colors ${
                  tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {t === "signin" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 pb-6 pt-5">
          {tab === "signin" ? (
            <SignInForm key="signin" onAuthenticated={onAuthenticated} onSwitch={() => onTabChange("register")} />
          ) : (
            <RegisterForm key="register" onAuthenticated={onAuthenticated} onSwitch={() => onTabChange("signin")} />
          )}
        </div>

        <p className="rounded-b-2xl border-t border-slate-100 bg-slate-50 px-6 py-3 text-center text-[11px] leading-relaxed text-slate-500">
          Connected to the Foresight API. Demo accounts exist when the backend runs with the <code className="font-mono">demo</code> profile.
        </p>
      </div>
    </div>
  );
}
