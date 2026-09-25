import { ChevronRight, PhoneCall, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import * as api from "../../lib/api.js";
import { cn } from "../../lib/cn.js";
import { TopBarActions } from "../layout/TopBarSlot.jsx";
import { Badge } from "../ui/Badge.jsx";
import { Button } from "../ui/Button.jsx";
import { Card } from "../ui/Card.jsx";

const when = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso || "—"
    : date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

/** Finished calls, newest first, as saved in data/calls/. A row opens to show its answers. */
export function HistoryPage({ onCall }) {
  const [calls, setCalls] = useState(null);
  const [problem, setProblem] = useState("");
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setProblem("");
    try { setCalls(await api.recentCalls()); } catch (failure) { setProblem(failure.message); setCalls([]); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <TopBarActions>
        <Button variant="secondary" icon={RefreshCw} onClick={load}>
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </TopBarActions>

      <div className="max-w-5xl">
        {problem && <p role="alert" className="mb-6 text-sm font-medium text-bad">{problem}</p>}

        {calls === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : calls.length === 0 ? (
          <Card className="flex flex-col items-center px-6 py-16 text-center">
            <span className="grid size-10 place-items-center text-muted">
              <PhoneCall aria-hidden="true" className="size-6" strokeWidth={1.5} />
            </span>
            <p className="mt-4 text-[15px] font-semibold text-ink">No calls yet</p>
            <p className="mt-1 text-[13px] text-muted">Finished test calls are saved and listed here.</p>
            <Button variant="secondary" className="mt-6" onClick={onCall}>Make a test call</Button>
          </Card>
        ) : (
          <Card as="div" className="overflow-hidden">
            <div className="hidden grid-cols-[150px_120px_80px_minmax(0,1fr)_24px] gap-4 border-b border-line px-6 pt-4 pb-3 text-[11px] font-semibold tracking-wide text-muted uppercase md:grid">
              <span>When</span><span>Outcome</span><span>Length</span><span>Summary</span><span />
            </div>
            <ul className="divide-y divide-line">
              {calls.map((call) => {
                const expanded = open === call.call;
                const answers = Object.entries(call.answers || {});
                return (
                  <li key={call.call}>
                    <button type="button" onClick={() => setOpen(expanded ? null : call.call)} aria-expanded={expanded}
                            className="grid w-full grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 px-5 py-4 text-left transition hover:bg-fill/60 md:grid-cols-[150px_120px_80px_minmax(0,1fr)_24px] md:items-center md:px-6">
                      <span className="text-sm font-semibold text-ink">{when(call.at)}</span>
                      <span className="justify-self-end md:justify-self-start">
                        <Badge tone={call.outcome === "completed" ? "good" : "warn"}>
                          {call.outcome === "completed" ? "Completed" : "Incomplete"}
                        </Badge>
                      </span>
                      <span className="font-mono text-[13px] text-body tabular-nums">
                        {call.seconds != null ? `${Math.round(call.seconds)}s` : "—"}
                      </span>
                      <span className="col-span-2 line-clamp-2 text-[13px] text-body md:col-span-1 md:line-clamp-1">
                        {call.summary || <span className="text-muted">No summary</span>}
                      </span>
                      <ChevronRight aria-hidden="true" strokeWidth={1.75}
                                    className={cn("hidden size-4 text-muted transition md:block", expanded && "rotate-90")} />
                    </button>

                    {expanded && (
                      <div className="border-t border-line bg-canvas px-5 py-5 md:px-6">
                        {call.summary && <p className="max-w-3xl text-sm leading-relaxed text-body">{call.summary}</p>}
                        {answers.length ? (
                          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {answers.map(([name, value]) => (
                              <div key={name} className="rounded-lg border border-line bg-white px-4 py-3">
                                <dt className="text-xs text-muted">{name.replace(/_/g, " ")}</dt>
                                <dd className="mt-0.5 text-sm font-semibold text-ink">{value}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                          <p className="mt-3 text-[13px] text-muted">No answers were saved on this call.</p>
                        )}
                        <p className="mt-4 font-mono text-[11px] text-muted">data/calls/{call.call}.json</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
