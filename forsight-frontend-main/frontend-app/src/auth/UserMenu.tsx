import { useEffect, useRef, useState } from "react";
import { Icon } from "../ui";
import type { IconName } from "../ui";
import { initialsOf, type UserProfile } from "./session";

export function UserAvatar({ user, size = "md" }: { user: UserProfile; size?: "sm" | "md" | "xl" }) {
  const sizes = { sm: "h-7 w-7 text-[10px]", md: "h-8 w-8 text-[11px]", xl: "h-16 w-16 text-xl" };
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-slate-900 font-bold text-white ${sizes[size]}`} aria-hidden="true">
      {initialsOf(user.fullName)}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  return <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-inset ring-blue-200">{role}</span>;
}

export interface UserMenuProps {
  user: UserProfile | null;
  onSignIn: () => void;
  onRegister: () => void;
  onViewProfile: () => void;
  onWorkspaceSettings: () => void;
  onLogOut: () => void;
}

export function UserMenu({ user, onSignIn, onRegister, onViewProfile, onWorkspaceSettings, onLogOut }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRegister}
          className="hidden rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 sm:inline-flex"
        >
          Register
        </button>
        <button
          type="button"
          onClick={onSignIn}
          className="inline-flex rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          Sign In
        </button>
      </div>
    );
  }

  const item = (icon: IconName, label: string, onClick: () => void, tone: "default" | "danger" = "default") => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium transition-colors ${
        tone === "danger" ? "text-slate-700 hover:bg-amber-50 hover:text-amber-950" : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      <Icon name={icon} className="h-4 w-4 text-slate-400" />
      {label}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.fullName}`}
        className={`flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
          open ? "bg-slate-100" : "hover:bg-slate-50"
        }`}
      >
        <UserAvatar user={user} />
        <span className="hidden min-w-0 text-left md:block">
          <span className="block max-w-[10rem] truncate text-[13px] font-semibold leading-tight text-slate-900">{user.fullName}</span>
          <span className="mt-0.5 block">
            <RoleBadge role={user.role} />
          </span>
        </span>
        <Icon name="chevron" className={`hidden h-4 w-4 text-slate-400 transition-transform md:block ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl shadow-slate-900/10">
          <div className="flex items-center gap-3 border-b border-slate-100 px-3.5 py-3">
            <UserAvatar user={user} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-slate-900">{user.fullName}</p>
              <p className="truncate text-[12px] text-slate-500">{user.email}</p>
            </div>
          </div>
          <div className="py-1">
            {item("user", "View Profile", onViewProfile)}
            {item("settings", "Workspace Settings", onWorkspaceSettings)}
          </div>
          <div className="border-t border-slate-100 py-1">{item("logout", "Log Out", onLogOut, "danger")}</div>
        </div>
      )}
    </div>
  );
}
