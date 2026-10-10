import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode, Ref } from "react";

/* ═════════════════════════════════ Types ═════════════════════════════════ */

type Severity = "Critical" | "High" | "Medium";
type ActionState = "idle" | "running" | "done";

interface ImpactItem {
  task: string;
  owner: string;
  effect: string;
}

interface ReasoningCard {
  problem: string;
  severity: Severity;
  impacts: ImpactItem[];
  solution: { title: string; detail: string; odds: [before: number, after: number] };
  actionLabel: string;
}

interface UserMessage {
  id: number;
  role: "user";
  text: string;
  time: string;
}

interface AssistantTextMessage {
  id: number;
  role: "assistant";
  kind: "text";
  text: string;
  time: string;
}

interface AssistantReasoningMessage {
  id: number;
  role: "assistant";
  kind: "reasoning";
  lead: string;
  card: ReasoningCard;
  time: string;
}

type Message = UserMessage | AssistantTextMessage | AssistantReasoningMessage;
type AssistantReply = Omit<AssistantTextMessage, "id" | "time"> | Omit<AssistantReasoningMessage, "id" | "time">;

/* ═════════════════════════════════ Dummy data ═════════════════════════════════ */

const PROJECT = { name: "Student Team Project Q4", tasks: 8, members: 3, deadline: "19 Okt" };

const QUICK_PROMPTS = [
  "Deadline-ı 2 gün qabağa çəksək nə baş verər?",
  "Backend ləngisə, Frontend neçə gün gecikəcək?",
  "Layihənin vaxtında bitməsi üçün hansı addımı atmalıyıq?",
];

const MOCK_API_SOLUTION = {
  title: "Mock API deployment",
  detail:
    "OpenAPI kontraktını dondurun və /auth, /users endpoint-lərini Mock Service Worker ilə təqdim edin. Leyla inteqrasiyaya, Elvin isə E2E testlərə Anarı gözləmədən başlayır. Real API gələndə 0.5 günlük keçid kifayətdir.",
};

const CARDS: Record<"deadline" | "backend" | "nextStep", ReasoningCard> = {
  deadline: {
    problem: "Deadline 2 gün qabağa çəkilərsə, bufer −2 günə düşür",
    severity: "High",
    impacts: [
      { task: "E2E Integration Testing", owner: "Elvin", effect: "test pəncərəsi 3 gündən 1 günə enir" },
      { task: "Frontend API Integration", owner: "Leyla", effect: "qalan 1 günlük ehtiyatı itirir" },
      { task: "Reliz", owner: "Komanda", effect: "yeni deadline-dan 2 gün sonra bitir" },
    ],
    solution: { ...MOCK_API_SOLUTION, odds: [31, 79] },
    actionLabel: "Tövsiyəni İcra Et",
  },
  backend: {
    problem: "Backend API 3 gün ləngisə, Frontend 3.5 gün gecikəcək",
    severity: "Critical",
    impacts: [
      { task: "Frontend API Integration", owner: "Leyla", effect: "+3.5 gün, endpoint-lər olmadan bloklanır" },
      { task: "E2E Integration Testing", owner: "Elvin", effect: "+3.5 gün, test ediləcək axın yoxdur" },
      { task: "API sənədləşməsi", owner: "Elvin", effect: "+3 gün, sxem hələ qaralama mərhələsindədir" },
    ],
    solution: { ...MOCK_API_SOLUTION, odds: [28, 85] },
    actionLabel: "Tövsiyəni İcra Et",
  },
  nextStep: {
    problem: "Kritik yol tək nöqtədən asılıdır: Backend API",
    severity: "High",
    impacts: [
      { task: "Frontend API Integration", owner: "Leyla", effect: "işin 60%-i API cavablarını gözləyir" },
      { task: "E2E Integration Testing", owner: "Elvin", effect: "son 3 günə sıxışdırılıb, uğursuzluq riski yüksəkdir" },
    ],
    solution: { ...MOCK_API_SOLUTION, odds: [28, 85] },
    actionLabel: "Tövsiyəni İcra Et",
  },
};

const INITIAL_MESSAGES: Message[] = [
  {
    id: 1,
    role: "assistant",
    kind: "text",
    text: "Plan analiz olundu: 8 tapşırıq, 3 üzv. Bir kritik risk aşkarlanıb. Ssenari sualı verin, kaskad təsirini hesablayım.",
    time: "09:41",
  },
  { id: 2, role: "user", text: QUICK_PROMPTS[1], time: "09:42" },
  {
    id: 3,
    role: "assistant",
    kind: "reasoning",
    lead: "Anarın commit sürəti son 3 gündə 62% azalıb. Bu tempdə gecikmə zəncirvari olacaq:",
    card: CARDS.backend,
    time: "09:42",
  },
];

/* ═════════════════════════════════ Reply logic (dummy) ═════════════════════════════════ */

function replyTo(prompt: string, mitigated: boolean): AssistantReply {
  const q = prompt.toLocaleLowerCase("az");

  if (mitigated && /backend|deadline|addım|gecik/.test(q)) {
    return {
      role: "assistant",
      kind: "text",
      text: "Mock API artıq aktivdir. Backend 3 gün gecikə bilər, amma Frontend və testlər paralel gedir. Proqnoz: 18 Okt, deadline-a 0.5 gün qalır. Vaxtında bitmə ehtimalı 85%.",
    };
  }
  if (/deadline|son tarix/.test(q)) {
    return { role: "assistant", kind: "reasoning", lead: "Deadline 17 Okt olur, iş həcmi isə dəyişmir:", card: CARDS.deadline };
  }
  if (/backend|api|ləng|gecik/.test(q)) {
    return { role: "assistant", kind: "reasoning", lead: "Asılılıq zəncirini 3 günlük Backend gecikməsi ilə yenidən hesabladım:", card: CARDS.backend };
  }
  if (/addım|vaxtında|nə etm|tövsiyə/.test(q)) {
    return { role: "assistant", kind: "reasoning", lead: "Ən çox gün qazandıran tək addım bu olacaq:", card: CARDS.nextStep };
  }
  return {
    role: "assistant",
    kind: "text",
    text: "Bunu ssenariyə çevirə bilmədim. Deadline dəyişikliyi, tapşırıq gecikməsi və ya komanda üzvünün çıxması haqqında soruşun. Məsələn: \"Elvin 2 gün olmasa nə olar?\"",
  };
}

/* ═════════════════════════════════ Helpers ═════════════════════════════════ */

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

function nowTime(): string {
  return new Date().toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" });
}

const SEVERITY_BADGE: Record<Severity, string> = {
  Critical: "bg-amber-400 text-amber-950 ring-amber-500",
  High: "bg-amber-400 text-amber-950 ring-amber-500",
  Medium: "bg-amber-50 text-amber-900 ring-amber-300",
};

const SEVERITY_LABEL: Record<Severity, string> = { Critical: "Kritik", High: "Yüksək risk", Medium: "Orta risk" };

/* ═════════════════════════════════ Icons ═════════════════════════════════ */

type IconName = "spark" | "close" | "send" | "alert" | "check" | "arrow" | "spinner";

function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      {name === "spark" && <path d="M10 2.5 11.6 8.4 17.5 10l-5.9 1.6L10 17.5l-1.6-5.9L2.5 10l5.9-1.6L10 2.5Z" {...p} />}
      {name === "close" && <path d="m5.5 5.5 9 9m0-9-9 9" {...p} />}
      {name === "send" && <path d="M10 16V4m0 0-5 5m5-5 5 5" {...p} strokeWidth={2} />}
      {name === "check" && <path d="m5 10.5 3.2 3L15 6.5" {...p} />}
      {name === "arrow" && <path d="M4 10h11m0 0-4-4m4 4-4 4" {...p} />}
      {name === "spinner" && <path d="M10 3a7 7 0 1 0 7 7" {...p} className="origin-center animate-spin" />}
      {name === "alert" && (
        <>
          <path d="M10 7v3.5m0 2.75h.01" {...p} strokeWidth={2} />
          <path d="M8.6 3.3 2.4 14.2A1.6 1.6 0 0 0 3.8 16.6h12.4a1.6 1.6 0 0 0 1.4-2.4L11.4 3.3a1.6 1.6 0 0 0-2.8 0Z" {...p} strokeWidth={1.5} />
        </>
      )}
    </svg>
  );
}

/* ═════════════════════════════════ Message parts ═════════════════════════════════ */

function SectionLabel({ n, children }: { n: number; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
      <span className="flex h-4 w-4 items-center justify-center rounded bg-slate-200 text-[9px] font-bold text-slate-700">{n}</span>
      {children}
    </p>
  );
}

function ReasoningCardView({ card, state, alreadyApplied, onExecute }: {
  card: ReasoningCard;
  state: ActionState;
  alreadyApplied: boolean;
  onExecute: () => void;
}) {
  const [before, after] = card.solution.odds;
  const done = state === "done" || alreadyApplied;

  return (
    <div className="overflow-hidden rounded-r-lg border-l-4 border-amber-400 bg-slate-50 ring-1 ring-inset ring-slate-200">
      {/* 1 · Problem */}
      <div className="space-y-2 px-4 pb-3.5 pt-4">
        <SectionLabel n={1}>Problem</SectionLabel>
        <div className="flex items-start gap-2.5">
          <span
            className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${SEVERITY_BADGE[card.severity]}`}
          >
            <Icon name="alert" className="h-3 w-3" />
            {SEVERITY_LABEL[card.severity]}
          </span>
          <h4 className="text-sm font-semibold leading-snug text-slate-900">{card.problem}</h4>
        </div>
      </div>

      {/* 2 · Impact */}
      <div className="space-y-2.5 border-t border-slate-200 px-4 py-3.5">
        <SectionLabel n={2}>Təsir xülasəsi</SectionLabel>
        <ul className="space-y-2">
          {card.impacts.map((item) => (
            <li key={item.task} className="flex gap-2.5 text-[13px] leading-snug">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              <span className="text-slate-600">
                <span className="font-medium text-slate-900">{item.task}</span>
                <span className="text-slate-400"> · {item.owner}</span>: {item.effect}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* 3 · Solution */}
      <div className="space-y-2 border-t border-slate-200 bg-white px-4 py-3.5">
        <SectionLabel n={3}>AI preventiv həll</SectionLabel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">{card.solution.title}</p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-900 ring-1 ring-inset ring-blue-200">
            <span className="text-amber-700">{before}%</span>
            <Icon name="arrow" className="h-3 w-3 text-slate-400" />
            {after}% vaxtında
          </span>
        </div>
        <p className="text-[13px] leading-relaxed text-slate-600">{card.solution.detail}</p>
      </div>

      {/* 4 · Action */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
        <p className="text-[12px] text-slate-500">
          {done ? "Plan yeniləndi, asılılıqlar ayrıldı." : "Tətbiq planı dərhal yeniləyəcək."}
        </p>
        {done ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-[13px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
            <Icon name="check" />
            İcra olundu
          </span>
        ) : (
          <button
            type="button"
            onClick={onExecute}
            disabled={state === "running"}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-wait disabled:bg-slate-700"
          >
            {state === "running" ? (
              <>
                <Icon name="spinner" />
                İcra olunur…
              </>
            ) : (
              <>
                {card.actionLabel}
                <Icon name="arrow" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function AssistantAvatar() {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-amber-400">
      <Icon name="spark" className="h-3.5 w-3.5" />
    </span>
  );
}

/* ═════════════════════════════════ Drawer ═════════════════════════════════ */

interface RiskCopilotDrawerProps {
  open: boolean;
  onClose: () => void;
  inputRef: Ref<HTMLInputElement>;
}

function RiskCopilotDrawer({ open, onClose, inputRef }: RiskCopilotDrawerProps) {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [actionStates, setActionStates] = useState<Record<number, ActionState>>({});
  const [mitigated, setMitigated] = useState(false);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const nextId = useRef(INITIAL_MESSAGES.length + 1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const pushAssistant = (reply: AssistantReply) =>
    setMessages((prev) => [...prev, { ...reply, id: nextId.current++, time: nowTime() } as Message]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || typing) return;
    setMessages((prev) => [...prev, { id: nextId.current++, role: "user", text: trimmed, time: nowTime() }]);
    setDraft("");
    setTyping(true);
    const reply = replyTo(trimmed, mitigated);
    later(() => {
      pushAssistant(reply);
      setTyping(false);
    }, 900);
  };

  const execute = (messageId: number) => {
    setActionStates((s) => ({ ...s, [messageId]: "running" }));
    later(() => {
      setActionStates((s) => ({ ...s, [messageId]: "done" }));
      setMitigated(true);
      pushAssistant({
        role: "assistant",
        kind: "text",
        text: "Mock API tətbiq olundu. Leyla və Elvin bloklanmadan davam edir. Yeni proqnoz: 18 Okt (deadline 19 Okt). Vaxtında bitmə ehtimalı 28%-dən 85%-ə qalxdı.",
      });
    }, 1200);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    send(draft);
  };

  return (
    <div
      className={`fixed inset-0 z-50 transition-[visibility] duration-300 ${open ? "visible" : "invisible"}`}
      aria-hidden={!open}
    >
      {/* Backdrop: flat tint, no blur */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-slate-900/25 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="copilot-title"
        className={`absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col bg-white shadow-2xl shadow-slate-900/10 transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <header className="bg-slate-900 px-5 pb-4 pt-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-amber-400 ring-1 ring-inset ring-white/10">
                <Icon name="spark" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="copilot-title" className="text-[15px] font-semibold tracking-tight">
                    Risk Copilot
                  </h2>
                  <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950">
                    Predictive Mode
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-slate-400">{PROJECT.name}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close copilot"
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="mt-4 flex items-center gap-4 border-t border-white/10 pt-3 text-[12px] text-slate-400">
            <span>
              <span className="font-semibold tabular-nums text-white">{PROJECT.tasks}</span> tapşırıq
            </span>
            <span>
              <span className="font-semibold tabular-nums text-white">{PROJECT.members}</span> üzv
            </span>
            <span>
              Deadline <span className="font-semibold text-white">{PROJECT.deadline}</span>
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${mitigated ? "bg-emerald-400" : "bg-amber-400"}`} />
              {mitigated ? "Risk azaldılıb" : "1 kritik risk"}
            </span>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto bg-white px-5 py-5">
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex flex-col items-end gap-1">
                <p className="max-w-[85%] rounded-2xl rounded-br-md border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm leading-relaxed text-slate-900">
                  {m.text}
                </p>
                <span className="text-[10px] tabular-nums text-slate-400">{m.time}</span>
              </div>
            ) : (
              <div key={m.id} className="flex gap-2.5">
                <AssistantAvatar />
                <div className="min-w-0 flex-1 space-y-2">
                  {m.kind === "text" ? (
                    <p className="rounded-r-lg border-l-4 border-amber-400 bg-slate-50 px-3.5 py-2.5 text-sm leading-relaxed text-slate-700">
                      {m.text}
                    </p>
                  ) : (
                    <>
                      <p className="text-sm leading-relaxed text-slate-700">{m.lead}</p>
                      <ReasoningCardView
                        card={m.card}
                        state={actionStates[m.id] ?? "idle"}
                        alreadyApplied={mitigated && actionStates[m.id] === undefined}
                        onExecute={() => execute(m.id)}
                      />
                    </>
                  )}
                  <span className="block text-[10px] tabular-nums text-slate-400">{m.time}</span>
                </div>
              </div>
            ),
          )}

          {typing && (
            <div className="flex gap-2.5" aria-live="polite">
              <AssistantAvatar />
              <div className="flex items-center gap-1 rounded-r-lg border-l-4 border-amber-400 bg-slate-50 px-3.5 py-3">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d}ms` }} />
                ))}
                <span className="sr-only">Copilot cavab yazır</span>
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-slate-200 bg-white">
          <div
            className="flex gap-2 overflow-x-auto px-5 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="list"
            aria-label="Quick prompts"
          >
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                role="listitem"
                onClick={() => send(p)}
                disabled={typing}
                className="shrink-0 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-950 disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="p-4 pt-3">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pl-3.5 pr-1.5 shadow-sm transition-colors focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-900/5">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask a scenario question..."
                aria-label="Ask a scenario question"
                className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <kbd className="hidden shrink-0 items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-500 sm:inline-flex">
                {isMac ? "⌘" : "Ctrl"} K
              </kbd>
              <button
                type="submit"
                disabled={!draft.trim() || typing}
                aria-label="Send"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white transition-colors hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
              >
                <Icon name="send" />
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-slate-400">
              Proqnozlar plan məlumatlarına əsaslanır. Kritik qərarları komanda ilə təsdiqləyin.
            </p>
          </form>
        </div>
      </aside>
    </div>
  );
}

/* ═════════════════════════════════ Demo host ═════════════════════════════════ */

export default function RiskCopilotDemo() {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const openDrawer = useCallback(() => {
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 320);
  }, []);

  const closeDrawer = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) inputRef.current?.focus();
        else openDrawer();
      } else if (e.key === "Escape" && open) {
        closeDrawer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openDrawer, closeDrawer]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-700 antialiased">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <span className="text-[15px] font-semibold tracking-tight text-slate-900">Foresight</span>
          <button
            ref={triggerRef}
            type="button"
            onClick={openDrawer}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 py-2 pl-3 pr-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            <Icon name="spark" className="h-4 w-4 text-amber-400" />
            Ask Copilot
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-300">
              {isMac ? "⌘" : "Ctrl"} K
            </kbd>
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-16 text-center">
        <p className="text-sm text-slate-500">
          Dashboard content goes here. Open the copilot with the button or{" "}
          <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[12px]">{isMac ? "⌘" : "Ctrl"} K</kbd>.
        </p>
      </main>

      <RiskCopilotDrawer open={open} onClose={closeDrawer} inputRef={inputRef} />
    </div>
  );
}

export { RiskCopilotDrawer };
