import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

/* ────────────────────────────── Types ────────────────────────────── */

type StageId = "backend" | "frontend" | "testing" | "release";
type MemberId = "none" | "backend-dev" | "frontend-dev" | "qa";
type MitigationId = "mock-api" | "knowledge-transfer" | "scope-cut";
type RiskLevel = "low" | "medium" | "high";

interface StageDef {
  id: StageId;
  name: string;
  owner: string;
  baseDuration: number;
  dependsOn: StageId | null;
}

interface TeamMember {
  id: Exclude<MemberId, "none">;
  name: string;
  role: string;
  initials: string;
  stage: StageId;
}

interface Scenario {
  deadlineShift: number; // mənfi = deadline qabağa çəkilir
  apiDelay: number; // backend API-nin əlavə gecikməsi (gün)
  memberOut: MemberId;
}

interface Slot {
  start: number;
  end: number;
}

interface StageResult extends Slot {
  id: StageId;
  name: string;
  owner: string;
  duration: number;
  delay: number; // baza plana nisbətən bitmə sürüşməsi
  inherited: number; // əvvəlki mərhələdən miras qalan sürüşmə
  level: RiskLevel;
}

interface Simulation {
  stages: StageResult[];
  finish: number;
  deadline: number;
  buffer: number;
  probability: number;
  level: RiskLevel;
}

interface Recommendation {
  id: MitigationId;
  title: string;
  detail: string;
  effort: string;
  savedDays: number;
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  proposal?: Scenario;
}

/* ──────────────────────────── Project data ──────────────────────────── */

const PROJECT = {
  name: "e-Xidmət Portalı",
  release: "v2.4 reliz",
  sprint: "Sprint 14",
  baseDeadline: 26, // bu gündən etibarən gün
};

const STAGES: StageDef[] = [
  { id: "backend", name: "Backend API", owner: "Rəşad M.", baseDuration: 9, dependsOn: null },
  { id: "frontend", name: "Frontend inteqrasiya", owner: "Nigar Ə.", baseDuration: 7, dependsOn: "backend" },
  { id: "testing", name: "Test və QA", owner: "Tural H.", baseDuration: 5, dependsOn: "frontend" },
  { id: "release", name: "Reliz", owner: "DevOps", baseDuration: 2, dependsOn: "testing" },
];

const TEAM: TeamMember[] = [
  { id: "backend-dev", name: "Rəşad Məmmədov", role: "Backend developer", initials: "RM", stage: "backend" },
  { id: "frontend-dev", name: "Nigar Əliyeva", role: "Frontend developer", initials: "NƏ", stage: "frontend" },
  { id: "qa", name: "Tural Həsənov", role: "QA mühəndisi", initials: "TH", stage: "testing" },
];

const BASELINE: Scenario = { deadlineShift: 0, apiDelay: 0, memberOut: "none" };
const NO_MITIGATIONS: ReadonlySet<MitigationId> = new Set();

const MONTHS = ["Yan", "Fev", "Mar", "Apr", "May", "İyn", "İyl", "Avq", "Sen", "Okt", "Noy", "Dek"];

const LEVEL_LABEL: Record<RiskLevel, string> = {
  low: "Nəzarət altında",
  medium: "Diqqət tələb edir",
  high: "Kritik risk",
};

const STAGE_LEVEL_LABEL: Record<RiskLevel, string> = {
  low: "Stabil",
  medium: "Risk altında",
  high: "Kritik",
};

// Tailwind v3/v4-də eyni işləyən incə "shadow-xs" ekvivalenti.
const ELEVATION = "shadow-[0_1px_2px_0_rgb(15_23_42/0.05)]";

const PILL_STYLE: Record<RiskLevel, string> = {
  low: "bg-sky-50 text-indigo-900 ring-sky-200",
  medium: "bg-amber-50 text-amber-900 ring-amber-300",
  high: "bg-amber-400 text-amber-950 ring-amber-500",
};

const DOT_STYLE: Record<RiskLevel, string> = {
  low: "bg-indigo-600",
  medium: "bg-amber-400",
  high: "bg-amber-950",
};

const BADGE_STYLE: Record<RiskLevel, string> = {
  low: "bg-sky-50 text-indigo-900 ring-sky-200",
  medium: "bg-amber-50 text-amber-900 ring-amber-300",
  high: "bg-amber-400 text-amber-950 ring-amber-500",
};

const STAGE_CARD_STYLE: Record<RiskLevel, string> = {
  low: "border-slate-200/80 bg-white",
  medium: "border-amber-300 bg-white",
  high: "border-amber-300 bg-amber-50/60",
};

const STAGE_ACCENT_STYLE: Record<RiskLevel, string> = {
  low: "bg-indigo-900",
  medium: "bg-amber-300",
  high: "bg-amber-400",
};

const SUGGESTED_PROMPTS = [
  "Deadline-ı 2 gün qabağa çəksək nə olar?",
  "API 3 gün gecikərsə Frontend necə təsirlənir?",
  "Nigar komandadan çıxsa nə baş verər?",
  "Hazırkı risk vəziyyəti necədir?",
];

/* ──────────────────────────── Helpers ──────────────────────────── */

const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

function formatDay(day: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + day);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function withMitigation(set: ReadonlySet<MitigationId>, id: MitigationId): Set<MitigationId> {
  const next = new Set(set);
  next.add(id);
  return next;
}

function memberById(id: MemberId): TeamMember | undefined {
  return TEAM.find((m) => m.id === id);
}

/* ──────────────────────────── Simulation engine ──────────────────────────── */

function schedule(s: Scenario, m: ReadonlySet<MitigationId>): Record<StageId, Slot> {
  const out = memberById(s.memberOut);
  const lossFactor = m.has("knowledge-transfer") ? 1.25 : 1.6;

  const duration = (def: StageDef): number => {
    let d = def.baseDuration;
    if (out?.stage === def.id) d = Math.ceil(d * lossFactor);
    if (def.id === "backend") d += s.apiDelay;
    if (m.has("scope-cut") && (def.id === "frontend" || def.id === "testing")) d = Math.max(1, d - 2);
    return d;
  };

  const slots = {} as Record<StageId, Slot>;
  for (const def of STAGES) {
    const d = duration(def);
    if (!def.dependsOn) {
      slots[def.id] = { start: 0, end: d };
    } else if (def.id === "frontend" && m.has("mock-api")) {
      // Mock API ilə frontend kontrakt hazır olan kimi (2-ci gün) başlayır,
      // real API gələndən sonra 1 günlük inteqrasiya qalır.
      const upstream = slots[def.dependsOn];
      slots[def.id] = { start: 2, end: Math.max(2 + d, upstream.end + 1) };
    } else {
      const upstream = slots[def.dependsOn];
      slots[def.id] = { start: upstream.end, end: upstream.end + d };
    }
  }
  return slots;
}

const BASE_SLOTS = schedule(BASELINE, NO_MITIGATIONS);
const BASE_FINISH = BASE_SLOTS.release.end;

function simulate(s: Scenario, m: ReadonlySet<MitigationId>): Simulation {
  const slots = schedule(s, m);
  const finish = slots.release.end;
  const deadline = PROJECT.baseDeadline + s.deadlineShift;
  const buffer = deadline - finish;

  const stages: StageResult[] = STAGES.map((def) => {
    const slot = slots[def.id];
    const base = BASE_SLOTS[def.id];
    const delay = slot.end - base.end;
    const inherited = def.dependsOn ? Math.max(0, slot.start - base.start) : 0;
    const level: RiskLevel = delay <= 0 ? "low" : finish > deadline ? "high" : "medium";
    return {
      id: def.id,
      name: def.name,
      owner: def.owner,
      start: slot.start,
      end: slot.end,
      duration: slot.end - slot.start,
      delay,
      inherited,
      level,
    };
  });

  // Bufer azaldıqca gecikmə ehtimalı logistik əyri ilə artır.
  const probability = Math.round(clamp(100 / (1 + Math.exp(0.6 * (buffer - 0.5))), 2, 98));
  const level: RiskLevel = probability < 30 ? "low" : probability < 60 ? "medium" : "high";

  return { stages, finish, deadline, buffer, probability, level };
}

function buildRecommendations(
  s: Scenario,
  m: ReadonlySet<MitigationId>,
  current: Simulation,
): Recommendation[] {
  const saved = (id: MitigationId) => current.finish - simulate(s, withMitigation(m, id)).finish;
  const list: Recommendation[] = [];
  const out = memberById(s.memberOut);

  if (!m.has("mock-api") && (s.apiDelay > 0 || s.memberOut === "backend-dev")) {
    list.push({
      id: "mock-api",
      title: "Mock API yaradaraq Frontend-i paralelləşdirin",
      detail:
        "Frontend hazırda Backend API-ni gözləyərək boş dayanır. OpenAPI kontraktı əsasında mock server (MSW və ya Prism) qaldırın; real API hazır olanda yalnız 1 günlük inteqrasiya qalacaq.",
      effort: "0.5 gün quraşdırma",
      savedDays: saved("mock-api"),
    });
  }

  if (!m.has("knowledge-transfer") && out) {
    list.push({
      id: "knowledge-transfer",
      title: `${out.name} üçün bilik transferi təşkil edin`,
      detail: `${out.role} vəzifəsindəki boşluq "${STAGES.find((st) => st.id === out.stage)?.name}" mərhələsini uzadır. Çıxışdan əvvəl 2 günlük pair-programming və sənədləşmə sessiyası məhsuldarlıq itkisini azaldır.`,
      effort: "2 gün üst-üstə düşmə",
      savedDays: saved("knowledge-transfer"),
    });
  }

  if (!m.has("scope-cut") && current.buffer < 0) {
    list.push({
      id: "scope-cut",
      title: "P2 funksionallıqları növbəti relizə keçirin",
      detail:
        "Bildiriş mərkəzi və PDF ixracı kimi kritik olmayan tapşırıqları v2.5-ə köçürün. Bu, Frontend və Test mərhələlərinin hər birini təxminən 2 gün qısaldır.",
      effort: "Məhsul sahibi ilə razılaşma",
      savedDays: saved("scope-cut"),
    });
  }

  return list.filter((r) => r.savedDays > 0).sort((a, b) => b.savedDays - a.savedDays);
}

const MITIGATION_LABEL: Record<MitigationId, string> = {
  "mock-api": "Mock API ilə paralelləşdirmə",
  "knowledge-transfer": "Bilik transferi",
  "scope-cut": "Scope azaldılması",
};

/* ──────────────────────────── Chat assistant ──────────────────────────── */

const NUMBER_WORDS: Record<string, number> = {
  bir: 1, iki: 2, üç: 3, dörd: 4, beş: 5, altı: 6, yeddi: 7, səkkiz: 8, doqquz: 9, on: 10,
};

function extractNumber(tokens: string[]): number | null {
  for (const t of tokens) {
    if (/^\d+$/.test(t)) return Number(t);
    if (t in NUMBER_WORDS) return NUMBER_WORDS[t];
  }
  return null;
}

function answerPrompt(
  raw: string,
  scenario: Scenario,
  mitigations: ReadonlySet<MitigationId>,
): Omit<ChatMessage, "id" | "role"> {
  const text = raw.toLocaleLowerCase("az");
  const tokens = text.split(/[^\p{L}\d]+/u).filter(Boolean);
  const n = extractNumber(tokens);
  const has = (re: RegExp) => re.test(text);

  const current = simulate(scenario, mitigations);
  const next: Scenario = { ...scenario };
  const changes: string[] = [];

  if (has(/sıfırla|ilkin|baza plan/)) {
    return {
      text: "İlkin plana qayıtmaq üçün aşağıdakı düyməni istifadə edin. Baza ssenaridə layihə " +
        `${formatDay(BASE_FINISH)} tarixində bitir, bufer ${PROJECT.baseDeadline - BASE_FINISH} gündür.`,
      proposal: BASELINE,
    };
  }

  if (has(/deadline|son tarix|müddət|təhvil/)) {
    if (n === null) {
      return { text: "Deadline-ı neçə gün dəyişmək istədiyinizi qeyd edin. Məsələn: \"Deadline-ı 3 gün uzatsaq?\"" };
    }
    const earlier = has(/qabağa|əvvəl|tez|qısalt|azalt|yaxınlaşdır/);
    const shift = clamp(scenario.deadlineShift + (earlier ? -n : n), -6, 6);
    next.deadlineShift = shift;
    changes.push(
      `deadline ${formatDay(current.deadline)} → ${formatDay(PROJECT.baseDeadline + shift)} (${earlier ? "qabağa" : "geri"} ${n} gün)`,
    );
  }

  const leaving = has(/çıx|get|ayrıl|xəstə|məzuniyyət|işdən/);
  if (leaving) {
    let member: TeamMember | undefined;
    if (has(/backend|rəşad/)) member = memberById("backend-dev");
    else if (has(/frontend|nigar/)) member = memberById("frontend-dev");
    else if (has(/qa|test|tural/)) member = memberById("qa");
    if (member) {
      next.memberOut = member.id;
      changes.push(`${member.name} (${member.role}) komandadan çıxır`);
    }
  }

  if (has(/api|backend/) && has(/gecik|ləng|uzan/)) {
    const delay = clamp(n ?? 3, 0, 10);
    next.apiDelay = delay;
    changes.push(`Backend API ${delay} gün gecikir`);
  }

  if (changes.length === 0) {
    if (has(/risk|vəziyyət|status|necədir/)) {
      const worst = [...current.stages].sort((a, b) => b.delay - a.delay)[0];
      const recs = buildRecommendations(scenario, mitigations, current);
      return {
        text: [
          `Cari proqnoz: layihə ${formatDay(current.finish)} tarixində bitir, deadline ${formatDay(current.deadline)}.`,
          `Bufer ${signed(current.buffer)} gün, gecikmə ehtimalı ${current.probability}% — ${LEVEL_LABEL[current.level].toLowerCase()}.`,
          worst.delay > 0 ? `Ən çox sürüşən mərhələ: ${worst.name} (${signed(worst.delay)} gün).` : "Bütün mərhələlər plan üzrədir.",
          recs[0] ? `Tövsiyə: ${recs[0].title}.` : "",
        ].filter(Boolean).join("\n"),
      };
    }
    return {
      text:
        "Bu sualı ssenariyə çevirə bilmədim. Mən deadline dəyişikliyi, API gecikməsi və komanda üzvünün çıxması ilə bağlı suallara cavab verirəm. Məsələn:\n• \"Deadline-ı 2 gün qabağa çəksək?\"\n• \"API 4 gün ləngisə?\"\n• \"Tural məzuniyyətə çıxsa?\"",
    };
  }

  const projected = simulate(next, mitigations);
  const worst = [...projected.stages].sort((a, b) => b.delay - a.delay)[0];
  const rec = buildRecommendations(next, mitigations, projected)[0];

  const lines = [
    `Ssenari: ${changes.join("; ")}.`,
    `Proqnoz: layihə ${formatDay(projected.finish)} tarixində bitir, deadline ${formatDay(projected.deadline)}. Bufer ${signed(projected.buffer)} gün.`,
    `Gecikmə ehtimalı: ${current.probability}% → ${projected.probability}%.`,
  ];
  if (worst.delay > 0) {
    const downstream = projected.stages.filter((st) => st.inherited > 0).map((st) => st.name);
    lines.push(
      `Ən çox təsirlənən: ${worst.name} (${signed(worst.delay)} gün)` +
        (downstream.length ? `, kaskad effekti ${downstream.join(" → ")} mərhələlərinə keçir.` : "."),
    );
  }
  if (projected.buffer < 0 && !worst.delay) {
    lines.push("İş həcmi dəyişmir, amma qısalan deadline bufer üçün yer qoymur.");
  }
  lines.push(
    rec
      ? `Tövsiyə: ${rec.title} — təxminən ${rec.savedDays} gün qazandırır.`
      : projected.buffer >= 0
        ? "Əlavə müdaxiləyə ehtiyac görünmür."
        : "Mövcud tədbirlərlə bufer bərpa olunmur — deadline barədə maraqlı tərəflərlə danışmaq lazımdır.",
  );

  return { text: lines.join("\n"), proposal: next };
}

/* ──────────────────────────── Small UI pieces ──────────────────────────── */

function Card({ title, subtitle, aside, children, className = "" }: {
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200/80 bg-white ${ELEVATION} ${className}`}>
      <header className="flex items-start justify-between gap-3 px-6 pb-4 pt-5">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

function Metric({ label, value, hint, tone = "default", children }: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn" | "good";
  children?: ReactNode;
}) {
  const hintColor = tone === "warn" ? "text-amber-700" : tone === "good" ? "text-indigo-600" : "text-slate-500";
  return (
    <div className={`rounded-xl border bg-white px-5 py-4 ${ELEVATION} ${tone === "warn" ? "border-amber-300" : "border-slate-200/80"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{value}</p>
      {hint && <p className={`mt-1 text-[13px] ${hintColor}`}>{hint}</p>}
      {children}
    </div>
  );
}

function Badge({ level, children }: { level: RiskLevel | "neutral"; children: ReactNode }) {
  const style = level === "neutral" ? "bg-slate-50 text-slate-600 ring-slate-200" : BADGE_STYLE[level];
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset ${style}`}>
      {children}
    </span>
  );
}

function ArrowRight({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M4 10h11m0 0-4-4m4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path d="m5 10.5 3.2 3L15 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]" aria-hidden="true">
      <path d="M10 6.5v4.5m0 2.75h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8.6 3.3 2.4 14.2A1.6 1.6 0 0 0 3.8 16.6h12.4a1.6 1.6 0 0 0 1.4-2.4L11.4 3.3a1.6 1.6 0 0 0-2.8 0Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M3.5 10h12m0 0-5-5m5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SliderField({ id, label, value, display, min, max, onChange, minLabel, maxLabel, active }: {
  id: string;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  onChange: (v: number) => void;
  minLabel: string;
  maxLabel: string;
  active: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-slate-900">{label}</label>
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset transition-colors ${
            active ? "bg-amber-50 text-amber-900 ring-amber-300" : "bg-slate-50 text-slate-600 ring-slate-200"
          }`}
        >
          {display}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`mt-3 w-full cursor-pointer ${active ? "accent-amber-400" : "accent-indigo-900"}`}
      />
      <div className="mt-1 flex justify-between text-[11px] font-medium text-slate-400">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

/* ──────────────────────────── Main component ──────────────────────────── */

export default function PredictiveRiskManagerAz() {
  const [scenario, setScenario] = useState<Scenario>(BASELINE);
  const [mitigations, setMitigations] = useState<Set<MitigationId>>(() => new Set());
  const [justApplied, setJustApplied] = useState<MitigationId | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      role: "assistant",
      text: "Salam! Layihə planı üzərində \"bəs belə olsa?\" suallarını verin — nəticəni hesablayıb kaskad təsirini göstərəcəyəm.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const nextId = useRef(1);
  const timers = useRef<number[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sim = useMemo(() => simulate(scenario, mitigations), [scenario, mitigations]);
  const unmitigated = useMemo(() => simulate(scenario, NO_MITIGATIONS), [scenario]);
  const recommendations = useMemo(
    () => buildRecommendations(scenario, mitigations, sim),
    [scenario, mitigations, sim],
  );

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const update = <K extends keyof Scenario>(key: K, value: Scenario[K]) =>
    setScenario((prev) => ({ ...prev, [key]: value }));

  const applyMitigation = (id: MitigationId) => {
    setMitigations((prev) => withMitigation(prev, id));
    setJustApplied(id);
    timers.current.push(window.setTimeout(() => setJustApplied(null), 2400));
  };

  const revertMitigation = (id: MitigationId) =>
    setMitigations((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const resetAll = () => {
    setScenario(BASELINE);
    setMitigations(new Set());
  };

  const ask = (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed || thinking) return;
    setMessages((prev) => [...prev, { id: nextId.current++, role: "user", text: trimmed }]);
    setDraft("");
    setThinking(true);
    const reply = answerPrompt(trimmed, scenario, mitigations);
    timers.current.push(
      window.setTimeout(() => {
        setMessages((prev) => [...prev, { id: nextId.current++, role: "assistant", ...reply }]);
        setThinking(false);
      }, 650),
    );
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    ask(draft);
  };

  const span = Math.max(sim.finish, sim.deadline, BASE_FINISH) + 2;
  const pct = (day: number) => `${(day / span) * 100}%`;
  const ticks = Array.from({ length: Math.floor(span / 5) + 1 }, (_, i) => i * 5);
  const outMember = memberById(scenario.memberOut);
  const featured = recommendations[0];
  const isModified =
    scenario.deadlineShift !== 0 || scenario.apiDelay !== 0 || scenario.memberOut !== "none" || mitigations.size > 0;

  const scenarioActive =
    scenario.deadlineShift !== 0 || scenario.apiDelay !== 0 || scenario.memberOut !== "none";
  const featuredProbability = featured
    ? simulate(scenario, withMitigation(mitigations, featured.id)).probability
    : sim.probability;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-700 antialiased">
      {/* ───────── Header ───────── */}
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <div className="flex items-center gap-3.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-900 text-[13px] font-bold tracking-tight text-white">
              eX
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[15px] font-semibold tracking-tight text-slate-900">{PROJECT.name}</h1>
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                  {PROJECT.release}
                </span>
              </div>
              <p className="mt-0.5 text-[13px] text-slate-500">
                {PROJECT.sprint} <span className="text-slate-300">/</span> Risk proqnozu
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex -space-x-1.5">
              {TEAM.map((m) => (
                <span
                  key={m.id}
                  title={`${m.name} — ${m.role}`}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-white ${
                    m.id === scenario.memberOut ? "bg-amber-400 text-amber-950 line-through" : "bg-sky-50 text-indigo-900"
                  }`}
                >
                  {m.initials}
                </span>
              ))}
            </div>
            <div className="hidden h-8 w-px bg-slate-200 sm:block" />
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${PILL_STYLE[sim.level]}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${DOT_STYLE[sim.level]}`} />
              {LEVEL_LABEL[sim.level]}
              <span className="font-medium opacity-70">· {sim.probability}%</span>
            </span>
          </div>
        </div>

        {scenarioActive && (
          <div className="border-t border-amber-300 bg-amber-50">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-8">
              <p className="flex items-center gap-2.5 text-[13px] text-amber-950">
                <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950">
                  What-if
                </span>
                Simulyasiya rejimindəsiniz — göstəricilər hipotetik ssenariyə əsaslanır.
              </p>
              <button
                type="button"
                onClick={() => setScenario(BASELINE)}
                className="text-[13px] font-semibold text-amber-950 underline decoration-amber-400 underline-offset-4 hover:decoration-amber-950"
              >
                İlkin plana qayıt
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Risk icmalı</h2>
            <p className="mt-1 text-sm text-slate-500">
              {formatDay(0)} tarixinə proqnoz · baza planda {BASE_FINISH} iş günü, {PROJECT.baseDeadline - BASE_FINISH} gün bufer
            </p>
          </div>
        </div>

        {/* ───────── Metrics ───────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Metric
            label="Proqnoz bitmə"
            value={formatDay(sim.finish)}
            hint={sim.finish === BASE_FINISH ? "Baza plan üzrə" : `Baza plana görə ${signed(sim.finish - BASE_FINISH)} gün`}
            tone={sim.finish > BASE_FINISH ? "warn" : sim.finish < BASE_FINISH ? "good" : "default"}
          />
          <Metric
            label="Deadline"
            value={formatDay(sim.deadline)}
            hint={scenario.deadlineShift === 0 ? "Razılaşdırılmış tarix" : `${signed(scenario.deadlineShift)} gün dəyişdirilib`}
          />
          <Metric
            label="Zaman buferi"
            value={`${signed(sim.buffer)} gün`}
            hint={sim.buffer < 0 ? "Deadline aşılır" : sim.buffer <= 1 ? "Minimal ehtiyat" : "Kifayət qədər ehtiyat"}
            tone={sim.buffer < 0 ? "warn" : sim.buffer >= 3 ? "good" : "default"}
          />
          <Metric
            label="Gecikmə ehtimalı"
            value={`${sim.probability}%`}
            tone={sim.level === "low" ? "default" : "warn"}
          >
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all duration-500 ${sim.level === "low" ? "bg-indigo-900" : "bg-amber-400"}`}
                style={{ width: `${sim.probability}%` }}
              />
            </div>
            {mitigations.size > 0 && unmitigated.probability !== sim.probability && (
              <p className="mt-2 text-[13px] text-slate-500">
                Tədbirsiz: <span className="tabular-nums line-through">{unmitigated.probability}%</span>
              </p>
            )}
          </Metric>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          {/* ───────── What-if panel ───────── */}
          <Card
            title="What-if simulyasiyası"
            subtitle="Parametrləri dəyişin, plan dərhal yenidən hesablanır"
            className={`lg:col-span-4 ${scenarioActive ? "!border-amber-300" : ""}`}
            aside={
              <button
                type="button"
                onClick={resetAll}
                disabled={!isModified}
                className="rounded-md px-2 py-1 text-[13px] font-medium text-indigo-600 hover:bg-slate-50 hover:text-indigo-900 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
              >
                Sıfırla
              </button>
            }
          >
            <div className="space-y-8 border-t border-slate-100 px-6 py-6">
              <SliderField
                id="deadline"
                label="Deadline"
                value={scenario.deadlineShift}
                display={`${formatDay(sim.deadline)} · ${signed(scenario.deadlineShift)} gün`}
                min={-6}
                max={6}
                onChange={(v) => update("deadlineShift", v)}
                minLabel="6 gün tez"
                maxLabel="6 gün gec"
                active={scenario.deadlineShift !== 0}
              />

              <SliderField
                id="api-delay"
                label="Backend API gecikməsi"
                value={scenario.apiDelay}
                display={scenario.apiDelay === 0 ? "Yoxdur" : `${scenario.apiDelay} gün`}
                min={0}
                max={10}
                onChange={(v) => update("apiDelay", v)}
                minLabel="0"
                maxLabel="10 gün"
                active={scenario.apiDelay > 0}
              />

              <fieldset>
                <legend className="text-sm font-medium text-slate-900">Komandadan çıxış ssenarisi</legend>
                <div className="mt-3 overflow-hidden rounded-lg border border-slate-200/80">
                  {[{ id: "none" as const, name: "Heç kim", role: "Tam komanda" }, ...TEAM].map((m, i) => {
                    const checked = scenario.memberOut === m.id;
                    const leaving = checked && m.id !== "none";
                    return (
                      <label
                        key={m.id}
                        className={`flex cursor-pointer items-center justify-between px-3.5 py-3 text-sm transition-colors ${
                          i > 0 ? "border-t border-slate-100" : ""
                        } ${leaving ? "bg-amber-50" : checked ? "bg-slate-50" : "bg-white hover:bg-slate-50"}`}
                      >
                        <span className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="member-out"
                            value={m.id}
                            checked={checked}
                            onChange={() => update("memberOut", m.id)}
                            className={leaving ? "accent-amber-500" : "accent-indigo-900"}
                          />
                          <span>
                            <span className="block font-medium text-slate-900">{m.name}</span>
                            <span className="block text-[13px] text-slate-500">{m.role}</span>
                          </span>
                        </span>
                        {leaving && <Badge level="high">Çıxır</Badge>}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {mitigations.size > 0 && (
                <div className="border-t border-slate-100 pt-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Tətbiq olunmuş tədbirlər
                  </p>
                  <ul className="mt-3 space-y-2">
                    {Array.from(mitigations).map((id) => (
                      <li key={id} className="flex items-center justify-between rounded-lg bg-sky-50 px-3 py-2 text-sm">
                        <span className="flex items-center gap-2 font-medium text-indigo-900">
                          <CheckIcon />
                          {MITIGATION_LABEL[id]}
                        </span>
                        <button
                          type="button"
                          onClick={() => revertMitigation(id)}
                          className="text-[13px] font-medium text-indigo-600 hover:text-indigo-900"
                        >
                          Geri al
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>

          {/* ───────── Dependency chain + timeline ───────── */}
          <Card
            title="Asılılıq zənciri"
            subtitle="Bir mərhələdəki ləngimənin sonrakı mərhələlərə kaskad təsiri"
            className="lg:col-span-8"
          >
            <div className="border-t border-slate-100 px-6 py-6">
              <ol className="grid grid-cols-1 items-stretch gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
                {sim.stages.map((st, i) => {
                  const parallel = st.id === "frontend" && mitigations.has("mock-api");
                  const affected = st.level !== "low";
                  return (
                    <li key={st.id} className="contents">
                      {i > 0 && (
                        <div className="flex flex-col items-center justify-center gap-1 py-1 md:w-8">
                          <ArrowRight
                            className={`h-4 w-4 rotate-90 md:rotate-0 ${
                              parallel ? "text-indigo-600" : st.inherited > 0 ? "text-amber-500" : "text-slate-300"
                            }`}
                          />
                          {parallel && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600">paralel</span>
                          )}
                        </div>
                      )}
                      <div
                        className={`relative overflow-hidden rounded-lg border p-4 transition-colors ${STAGE_CARD_STYLE[st.level]}`}
                      >
                        <span className={`absolute inset-x-0 top-0 h-[3px] ${STAGE_ACCENT_STYLE[st.level]}`} />
                        <div className="flex items-center justify-between">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                              affected ? "bg-amber-400 text-amber-950" : "bg-indigo-900 text-white"
                            }`}
                          >
                            {i + 1}
                          </span>
                          <span className="text-[12px] text-slate-500">{st.owner}</span>
                        </div>
                        <p className="mt-3 text-sm font-semibold tracking-tight text-slate-900">{st.name}</p>
                        <p className="mt-0.5 text-[12px] tabular-nums text-slate-500">
                          {formatDay(st.start)} – {formatDay(st.end)} · {st.duration} gün
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {st.delay > 0 ? (
                            <Badge level={st.level}>{signed(st.delay)} gün</Badge>
                          ) : st.delay < 0 ? (
                            <Badge level="low">{signed(st.delay)} gün qazanc</Badge>
                          ) : (
                            <Badge level="neutral">Plan üzrə</Badge>
                          )}
                          {affected && <Badge level="neutral">{STAGE_LEVEL_LABEL[st.level]}</Badge>}
                        </div>
                        {st.inherited > 0 && (
                          <p className="mt-3 border-t border-amber-200 pt-2.5 text-[12px] leading-snug text-amber-900">
                            {sim.stages[i - 1].name} səbəbindən {st.inherited} gün gec başlayır
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>

              {/* Timeline */}
              <div className="mt-8 rounded-lg border border-slate-200/80 bg-slate-50/60 p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Zaman xətti</p>
                  <div className="flex flex-wrap items-center gap-4 text-[12px] text-slate-500">
                    <span className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-slate-300" />Baza plan</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-indigo-900" />Simulyasiya</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-amber-400" />Gecikən</span>
                  </div>
                </div>

                {/* Deadline marker */}
                <div className="flex">
                  <span className="w-24 shrink-0 sm:w-36" />
                  <div className="relative h-6 flex-1">
                    <span
                      className="absolute -translate-x-1/2 whitespace-nowrap rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950 transition-all duration-500"
                      style={{ left: pct(sim.deadline) }}
                    >
                      Deadline · {formatDay(sim.deadline)}
                    </span>
                  </div>
                </div>

                {sim.stages.map((st) => {
                  const base = BASE_SLOTS[st.id];
                  return (
                    <div key={st.id} className="flex items-center">
                      <span className="w-24 shrink-0 truncate pr-3 text-[13px] font-medium text-slate-700 sm:w-36">{st.name}</span>
                      <div className="relative h-10 flex-1 border-l border-slate-200">
                        {ticks.slice(1).map((t) => (
                          <span key={t} className="absolute inset-y-0 border-l border-slate-200/70" style={{ left: pct(t) }} />
                        ))}
                        <div
                          className="absolute top-2.5 h-1.5 rounded-full bg-slate-300"
                          style={{ left: pct(base.start), width: pct(base.end - base.start) }}
                        />
                        <div
                          className={`absolute top-[19px] h-2.5 rounded-full transition-all duration-500 ${
                            st.delay > 0 ? "bg-amber-400" : "bg-indigo-900"
                          }`}
                          style={{ left: pct(st.start), width: pct(st.duration) }}
                        />
                        <div
                          className="absolute inset-y-0 border-l-2 border-amber-400 transition-all duration-500"
                          style={{ left: pct(sim.deadline) }}
                        />
                      </div>
                    </div>
                  );
                })}

                <div className="flex">
                  <span className="w-24 shrink-0 sm:w-36" />
                  <div className="relative mt-2 h-4 flex-1">
                    {ticks.map((t) => (
                      <span
                        key={t}
                        className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] tabular-nums text-slate-400"
                        style={{ left: pct(t) }}
                      >
                        {formatDay(t)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          {/* ───────── AI recommendation ───────── */}
          <Card
            title="AI tövsiyəsi"
            subtitle="Aşkarlanan risklər üçün konkret həll variantları"
            className="lg:col-span-7"
            aside={
              recommendations.length > 0 ? (
                <Badge level="medium">{recommendations.length} risk aşkarlandı</Badge>
              ) : undefined
            }
          >
            <div className="border-t border-slate-100 px-6 py-6">
              {featured ? (
                <>
                  <div className="rounded-lg border border-amber-300 bg-amber-50/50">
                    <div className="flex items-start gap-4 p-5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-amber-950">
                        <AlertIcon />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge level="high">Yüksək prioritet</Badge>
                          <span className="text-[13px] text-amber-900">
                            {scenario.apiDelay > 0 && featured.id === "mock-api"
                              ? `API ${scenario.apiDelay} gün gecikir → Frontend və Test sürüşür`
                              : outMember && featured.id === "knowledge-transfer"
                                ? `${outMember.role} boşluğu kritik yolu uzadır`
                                : `Deadline ${Math.abs(sim.buffer)} gün aşılır`}
                          </span>
                        </div>
                        <h3 className="mt-2.5 text-base font-semibold tracking-tight text-slate-900">{featured.title}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{featured.detail}</p>
                      </div>
                    </div>

                    <dl className="grid grid-cols-3 divide-x divide-amber-200 border-t border-amber-200 text-center">
                      <div className="px-3 py-3">
                        <dt className="text-[11px] font-semibold uppercase tracking-wider text-amber-800/80">Qazanc</dt>
                        <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">−{featured.savedDays} gün</dd>
                      </div>
                      <div className="px-3 py-3">
                        <dt className="text-[11px] font-semibold uppercase tracking-wider text-amber-800/80">Ehtimal</dt>
                        <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                          {sim.probability}% → {featuredProbability}%
                        </dd>
                      </div>
                      <div className="px-3 py-3">
                        <dt className="text-[11px] font-semibold uppercase tracking-wider text-amber-800/80">Səy</dt>
                        <dd className="mt-0.5 text-sm font-semibold text-slate-900">{featured.effort}</dd>
                      </div>
                    </dl>

                    <div className="flex justify-end border-t border-amber-200 px-5 py-3.5">
                      <button
                        type="button"
                        onClick={() => applyMitigation(featured.id)}
                        className="rounded-lg bg-indigo-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
                      >
                        Riski azalt
                      </button>
                    </div>
                  </div>

                  {recommendations.length > 1 && (
                    <ul className="mt-5 divide-y divide-slate-100 rounded-lg border border-slate-200/80">
                      {recommendations.slice(1).map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900">{r.title}</p>
                            <p className="mt-0.5 text-[13px] text-slate-500">
                              <span className="font-semibold tabular-nums text-indigo-600">−{r.savedDays} gün</span> · {r.effort}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => applyMitigation(r.id)}
                            className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-900 shadow-sm transition-colors hover:border-indigo-900 hover:text-indigo-900"
                          >
                            Tətbiq et
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <div className="flex items-start gap-4 rounded-lg border border-sky-200 bg-sky-50 p-5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-900 text-white">
                    <CheckIcon />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-indigo-900">
                      {sim.buffer >= 0 ? "Kritik problem aşkarlanmadı" : "Mövcud tədbirlər tükənib"}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      {sim.buffer >= 0
                        ? `Plan ${sim.buffer} günlük buferlə icra olunur. Ssenarini dəyişərək zəif nöqtələri yoxlaya bilərsiniz.`
                        : "Avtomatik tədbirlərlə deadline qorunmur. Deadline-ın yenidən razılaşdırılması tövsiyə olunur."}
                    </p>
                  </div>
                </div>
              )}

              {justApplied && (
                <p className="mt-4 flex items-center gap-2 text-[13px] font-medium text-indigo-900" role="status">
                  <CheckIcon />"{MITIGATION_LABEL[justApplied]}" tətbiq olundu — plan yenidən hesablandı.
                </p>
              )}
            </div>
          </Card>

          {/* ───────── Assistant chat ───────── */}
          <Card
            title="Risk assistenti"
            subtitle="Ssenarini sual kimi yazın"
            className="flex flex-col lg:col-span-5"
          >
            <div ref={scrollRef} className="h-80 flex-1 space-y-4 overflow-y-auto border-t border-slate-100 px-6 py-5">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <p className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-indigo-900 px-4 py-2.5 text-sm leading-relaxed text-white">
                      {m.text}
                    </p>
                  </div>
                ) : (
                  <div key={m.id} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-50 text-[10px] font-bold text-indigo-900 ring-1 ring-inset ring-sky-200">
                      AI
                    </span>
                    <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-slate-50 px-4 py-2.5 text-sm leading-relaxed text-slate-700 ring-1 ring-inset ring-slate-200/80">
                      <p className="whitespace-pre-line">{m.text}</p>
                      {m.proposal && (
                        <button
                          type="button"
                          onClick={() => setScenario(m.proposal as Scenario)}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-400 px-2.5 py-1 text-xs font-semibold text-amber-950 transition-colors hover:bg-amber-300"
                        >
                          Simulyatora tətbiq et
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ),
              )}
              {thinking && (
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-50 text-[10px] font-bold text-indigo-900 ring-1 ring-inset ring-sky-200">
                    AI
                  </span>
                  <div className="flex gap-1 rounded-2xl rounded-tl-md bg-slate-50 px-4 py-3.5 ring-1 ring-inset ring-slate-200/80">
                    {[0, 150, 300].map((d) => (
                      <span
                        key={d}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                        style={{ animationDelay: `${d}ms` }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 px-6 py-4">
              <div className="mb-3 flex flex-wrap gap-1.5">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => ask(p)}
                    disabled={thinking}
                    className="rounded-md bg-slate-50 px-2.5 py-1 text-[12px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200 transition-colors hover:bg-white hover:text-indigo-900 hover:ring-indigo-200 disabled:opacity-50"
                  >
                    {p}
                  </button>
                ))}
              </div>
              <form onSubmit={onSubmit} className="flex gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Məs: Deadline-ı 2 gün qabağa çəksək nə olar?"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/15"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || thinking}
                  aria-label="Göndər"
                  className="flex w-11 items-center justify-center rounded-lg bg-indigo-900 text-white shadow-sm transition-colors hover:bg-indigo-950 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                >
                  <SendIcon />
                </button>
              </form>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
