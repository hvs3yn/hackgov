import { useEffect, useState } from "react";
import { EYEBROW, Icon } from "../ui";
import { errorMessage, risks as risksApi } from "../api";
import type { Explanation, RiskDetail } from "../api";
import { Chip, Loading, Notice } from "./common";
import { ago, humanize } from "./format";

/** AI-written (or rule-based fallback) explanation of a risk, shared by the risk list and the inbox. */
export function ExplanationView({ explanation }: { explanation: Explanation }) {
  const list = (title: string, items: string[]) =>
    items.length > 0 && (
      <div>
        <p className={EYEBROW}>{title}</p>
        <ul className="mt-1.5 space-y-1">
          {items.map((t, i) => (
            <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-slate-600">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              {t}
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="space-y-4 rounded-r-lg border-l-4 border-amber-400 bg-slate-50 px-4 py-4 ring-1 ring-inset ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{explanation.summary}</p>
        <Chip tone={explanation.source === "FALLBACK" ? "neutral" : "warn"}>{explanation.source === "FALLBACK" ? "Rule-based" : "AI generated"}</Chip>
      </div>
      {list("Observed facts", explanation.observedFacts)}
      {list("Inferences", explanation.inferences)}
      {list("Potential consequences", explanation.potentialConsequences)}
      {explanation.recommendedActions.length > 0 && (
        <div>
          <p className={EYEBROW}>Recommended actions</p>
          <ol className="mt-1.5 space-y-2">
            {[...explanation.recommendedActions]
              .sort((a, b) => a.priority - b.priority)
              .map((a) => (
                <li key={a.priority} className="flex gap-3 rounded-lg bg-white px-3 py-2.5 ring-1 ring-inset ring-slate-200">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-900 text-[11px] font-bold text-white">{a.priority}</span>
                  <div>
                    <p className="text-[13px] font-semibold text-slate-900">{a.action}</p>
                    <p className="mt-0.5 text-[12px] text-slate-500">{a.rationale}</p>
                  </div>
                </li>
              ))}
          </ol>
        </div>
      )}
      {list("Assumptions", explanation.assumptions)}
      {list("Unknowns", explanation.unknowns)}
      <p className="text-[12px] text-slate-500">
        {explanation.confidenceNote} · generated {ago(explanation.generatedAt)}
      </p>
    </div>
  );
}

/** Loads and shows the full evaluation (factors, evidence, explanation) of one risk. */
export function RiskDetailView({ riskId }: { riskId: string }) {
  const [state, setState] = useState<{ id: string; detail?: RiskDetail; error?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    risksApi
      .detail(riskId)
      .then((detail) => !cancelled && setState({ id: riskId, detail }))
      .catch((e) => !cancelled && setState({ id: riskId, error: errorMessage(e) }));
    return () => {
      cancelled = true;
    };
  }, [riskId]);

  if (!state || state.id !== riskId) return <Loading label="Loading evaluation…" />;
  if (state.error) return <Notice>{state.error}</Notice>;
  const { risk, factors, evidence, missingData, explanation } = state.detail!;

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-slate-600">{risk.summary}</p>

      <div className="grid gap-4 md:grid-cols-2">
        {factors.length > 0 && (
          <div>
            <p className={EYEBROW}>Score factors · {risk.score}/100</p>
            <ul className="mt-1.5 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {factors.map((f) => (
                <li key={f.code} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                  <span className="text-slate-600">{f.description}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-900">+{f.points}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {evidence.length > 0 && (
          <div>
            <p className={EYEBROW}>Evidence</p>
            <ul className="mt-1.5 space-y-1.5">
              {evidence.map((e, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-snug text-slate-600">
                  <Chip>{humanize(e.kind)}</Chip>
                  <span>{e.statement}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {missingData.length > 0 && (
        <Notice tone="info">
          <span className="font-semibold text-slate-900">Missing data: </span>
          {missingData.join("; ")}
        </Notice>
      )}

      {explanation ? <ExplanationView explanation={explanation} /> : <Notice tone="info">No explanation has been generated for this risk yet.</Notice>}

      <p className="flex items-center gap-1.5 text-[12px] text-slate-400">
        <Icon name="clock" className="h-3.5 w-3.5" />
        First detected {ago(risk.firstDetectedAt)} · last evaluated {ago(risk.lastEvaluatedAt)} · revision {risk.revision}
      </p>
    </div>
  );
}
