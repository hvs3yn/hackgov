/* Non-component style helpers (kept out of ui.tsx so React fast refresh works). */

export function inputClass(hasError: boolean): string {
  return `block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
    hasError ? "border-amber-400 focus:border-amber-500 focus:ring-amber-500/20" : "border-slate-300 focus:border-slate-900 focus:ring-slate-900/10"
  }`;
}
