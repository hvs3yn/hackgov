import { useCallback, useEffect, useState } from "react";
import { Card, Icon } from "../ui";
import { errorMessage, inbox as inboxApi } from "../api";
import type { Disposition, InboxItem } from "../api";
import { Chip, Empty, Loading, Notice, PageTitle, SeverityBadge } from "./common";
import { CATEGORY_LABEL, ago, btnSecondary, humanize } from "./format";
import { ExplanationView } from "./RiskParts";
import type { Live } from "./useLive";

type Tab = "active" | "unread" | "dismissed";

const TABS: { id: Tab; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "unread", label: "Unread" },
  { id: "dismissed", label: "Dismissed" },
];

const DISPOSITIONS: Record<Tab, Disposition[]> = {
  active: ["OPEN", "ACKNOWLEDGED"],
  unread: ["OPEN", "ACKNOWLEDGED"],
  dismissed: ["DISMISSED"],
};

/** The signed-in user's AI recommendations (`/inbox`). */
export function InboxView({ live }: { live: Live }) {
  const [tab, setTab] = useState<Tab>("active");
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { reloadUnread } = live;

  const load = useCallback(async () => {
    try {
      const page = await inboxApi.list({ disposition: DISPOSITIONS[tab], read: tab === "unread" ? false : undefined });
      setItems(page.content);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
      setItems((current) => current ?? []);
    }
  }, [tab]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  const act = async (item: InboxItem, call: (id: string) => Promise<InboxItem>, drop = false) => {
    setBusyId(item.id);
    setError(null);
    try {
      const updated = await call(item.id);
      setItems((list) => (list ?? []).flatMap((x) => (x.id !== item.id ? [x] : drop ? [] : [updated])));
      void reloadUnread();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const toggle = (item: InboxItem) => {
    const opening = openId !== item.id;
    setOpenId(opening ? item.id : null);
    if (opening && !item.read) void act(item, inboxApi.markRead);
  };

  return (
    <div className="space-y-6">
      <PageTitle title="AI Inbox" subtitle={`Recommendations addressed to you · ${live.unread} unread`} />

      {error && <Notice onDismiss={() => setError(null)}>{error}</Notice>}

      <Card>
        <div role="tablist" aria-label="Inbox filter" className="flex gap-1 border-b border-slate-200 px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`relative px-3 py-3.5 text-[13px] font-semibold transition-colors ${tab === t.id ? "text-slate-900" : "text-slate-500 hover:text-slate-900"}`}
            >
              {t.label}
              {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-slate-900" aria-hidden="true" />}
            </button>
          ))}
        </div>

        {items === null ? (
          <Loading label="Loading inbox…" />
        ) : items.length === 0 ? (
          <Empty
            title={tab === "dismissed" ? "Nothing dismissed" : tab === "unread" ? "You're all caught up" : "Your inbox is empty"}
            hint={tab === "active" ? "New recommendations show up here when a risk is detected or escalates." : undefined}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => {
              const open = openId === item.id;
              const busy = busyId === item.id;
              return (
                <li key={item.id} className={item.read ? "" : "bg-blue-50/30"}>
                  <button type="button" onClick={() => toggle(item)} aria-expanded={open} className="flex w-full items-start gap-3 px-6 py-4 text-left transition-colors hover:bg-slate-50">
                    <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${item.read ? "bg-transparent" : "bg-amber-400"}`} aria-label={item.read ? "Read" : "Unread"} />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm text-slate-900 ${item.read ? "font-medium" : "font-semibold"}`}>{item.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <SeverityBadge severity={item.currentSeverity} />
                        <Chip>{CATEGORY_LABEL[item.category]}</Chip>
                        <span className="text-[12px] text-slate-500">
                          {item.projectName}
                          {item.taskTitle && ` · ${item.taskTitle}`}
                        </span>
                        {item.riskStatus === "RESOLVED" && <Chip>Risk resolved</Chip>}
                        {item.disposition === "ACKNOWLEDGED" && <Chip>Acknowledged</Chip>}
                        <span className="text-[12px] text-slate-400">{ago(item.lastDeliveredAt)}</span>
                      </span>
                    </span>
                    <Icon name="chevron" className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>

                  {open && (
                    <div className="space-y-4 px-6 pb-5 pl-11">
                      {item.explanation ? <ExplanationView explanation={item.explanation} /> : <Notice tone="info">No explanation is attached to this recommendation.</Notice>}
                      <div className="flex flex-wrap gap-2">
                        {item.disposition === "DISMISSED" ? (
                          <button type="button" disabled={busy} onClick={() => void act(item, inboxApi.acknowledge, tab === "dismissed")} className={btnSecondary}>
                            Restore
                          </button>
                        ) : (
                          <>
                            {item.disposition === "OPEN" && (
                              <button type="button" disabled={busy} onClick={() => void act(item, inboxApi.acknowledge)} className={btnSecondary}>
                                <Icon name="check" />
                                Acknowledge
                              </button>
                            )}
                            <button type="button" disabled={busy} onClick={() => void act(item, inboxApi.dismiss, true)} className={btnSecondary}>
                              Dismiss
                            </button>
                          </>
                        )}
                        <button type="button" disabled={busy} onClick={() => void act(item, item.read ? inboxApi.markUnread : inboxApi.markRead, tab === "unread" && !item.read)} className={btnSecondary}>
                          Mark as {item.read ? "unread" : "read"}
                        </button>
                      </div>
                      <p className="text-[12px] text-slate-400">
                        {humanize(item.disposition)} · delivered revision {item.deliveredRevision}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
