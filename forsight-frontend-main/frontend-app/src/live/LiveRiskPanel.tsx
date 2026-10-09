import { useEffect, useRef, useState } from "react";
import { Card, CardHeader, EYEBROW, Icon } from "../ui";
import { ApiError, errorMessage, risks as risksApi, SEVERITIES } from "../api";
import type { AnalysisResult } from "../api";
import { Chip, Empty, Loading, Notice, SeverityBadge } from "./common";
import { CATEGORY_LABEL, SEVERITY_STYLE, ago, btnPrimary, humanize } from "./format";
import { RiskDetailView } from "./RiskParts";
import type { Live } from "./useLive";

const BAR: Record<string, string> = { CRITICAL: "bg-amber-400", HIGH: "bg-amber-300", MEDIUM: "bg-slate-400", LOW: "bg-blue-300" };

function analysisLine(r: AnalysisResult): string {
  const parts = [
    r.detected && `${r.detected} detected`,
    r.escalated && `${r.escalated} escalated`,
    r.mitigated && `${r.mitigated} mitigated`,
    r.resolved && `${r.resolved} resolved`,
    r.reopened && `${r.reopened} reopened`,
    r.updated && `${r.updated} updated`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No changes since the last analysis";
}

/** Live risk summary and risk list for the selected project, with on-demand analysis. */
export function LiveRiskPanel({ live, onOpenTasks }: { live: Live; onOpenTasks: () => void }) {
  const { project, summary, risks, projectLoading, canEdit } = live;
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // New project → forget the previous run's outcome.
  const projectId = project?.id;
  useEffect(() => {
    setResult(null);
    setError(null);
    setOpenId(null);
  }, [projectId]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  if (!project) return null;

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const r = await risksApi.analyze(project.id);
      if (!alive.current) return;
      setResult(r);
      await live.reloadRisks();
      void live.reloadUnread();
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof ApiError && e.code === "ANALYSIS_COOLDOWN") {
        setCooldown(e.retryAfter ?? 10);
        setError(null);
      } else setError(errorMessage(e));
    } finally {
      if (alive.current) setRunning(false);
    }
  };

  const total = summary?.activeRisks ?? 0;

  return (
    <Card>
      <CardHeader
        eyebrow="Live risk analysis"
        title={`${project.name} · from the Foresight API`}
        aside={
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-slate-500">Analyzed {ago(summary?.lastAnalyzedAt ?? project.lastAnalyzedAt)}</span>
            <button
              type="button"
              onClick={run}
              disabled={running || cooldown > 0 || !canEdit}
              title={canEdit ? undefined : "Needs the Lead or Contributor role on an active project"}
              className={btnPrimary}
            >
              {running ? <Icon name="spinner" /> : <Icon name="spark" />}
              {running ? "Analyzing…" : cooldown > 0 ? `Wait ${cooldown}s` : "Run analysis"}
            </button>
          </div>
        }
      />

      <div className="space-y-5 p-6">
        {error && <Notice onDismiss={() => setError(null)}>{error}</Notice>}
        {cooldown > 0 && <Notice tone="info">Analysis was run a moment ago. You can run it again in {cooldown}s.</Notice>}
        {result && (
          <Notice tone="info" onDismiss={() => setResult(null)}>
            Analysis finished: {analysisLine(result)}.
          </Notice>
        )}

        {projectLoading && !summary ? (
          <Loading label="Loading risks…" />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className={EYEBROW}>Overall severity</p>
                <div className="mt-2">{summary?.overallSeverity ? <SeverityBadge severity={summary.overallSeverity} /> : <Chip>No active risks</Chip>}</div>
              </div>
              <div>
                <p className={EYEBROW}>Highest score</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
                  {summary?.maxScore ?? 0}
                  <span className="ml-1 text-base font-medium text-slate-400">/100</span>
                </p>
              </div>
              <div>
                <p className={EYEBROW}>Active risks</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{total}</p>
              </div>
              <div>
                <p className={EYEBROW}>By severity</p>
                <div className="mt-2 space-y-1">
                  {SEVERITIES.map((s) => {
                    const n = summary?.bySeverity?.[s] ?? 0;
                    return (
                      <div key={s} className="flex items-center gap-2 text-[11px] text-slate-500">
                        <span className="w-14">{humanize(s)}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className={`h-full rounded-full ${BAR[s]}`} style={{ width: total ? `${(n / total) * 100}%` : "0%" }} />
                        </div>
                        <span className="w-4 text-right tabular-nums text-slate-700">{n}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {summary && Object.keys(summary.byCategory).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(summary.byCategory).map(([cat, n]) => (
                  <Chip key={cat}>
                    {CATEGORY_LABEL[cat as keyof typeof CATEGORY_LABEL] ?? humanize(cat)} · {n}
                  </Chip>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="border-t border-slate-100">
        {risks.length === 0 && !projectLoading ? (
          <Empty
            title="No active risks"
            hint={live.tasks.length === 0 ? "Add tasks with due dates and estimates, then run an analysis to see delivery risks." : "Run an analysis to refresh the risk picture."}
          >
            {live.tasks.length === 0 && (
              <button type="button" onClick={onOpenTasks} className={btnPrimary}>
                Go to tasks
              </button>
            )}
          </Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {risks.map((r) => {
              const open = openId === r.id;
              return (
                <li key={r.id} className={r.severity === "CRITICAL" ? "bg-amber-50/40" : ""}>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : r.id)}
                    aria-expanded={open}
                    className="flex w-full items-start gap-3 px-6 py-4 text-left transition-colors hover:bg-slate-50"
                  >
                    <span className={`mt-0.5 flex h-7 w-10 shrink-0 items-center justify-center rounded-md text-[12px] font-bold tabular-nums ring-1 ring-inset ${SEVERITY_STYLE[r.severity]}`}>
                      {r.score}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{r.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <SeverityBadge severity={r.severity} />
                        <Chip>{CATEGORY_LABEL[r.category]}</Chip>
                        <Chip>{humanize(r.confidence)} confidence</Chip>
                        <span className="text-[12px] text-slate-400">changed {ago(r.lastChangedAt)}</span>
                      </span>
                    </span>
                    <Icon name="chevron" className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && (
                    <div className="px-6 pb-5">
                      <RiskDetailView riskId={r.id} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
