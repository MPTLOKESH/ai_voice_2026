import { ArrowLeft, Download, PhoneCall, Users } from "lucide-react";
import { useEffect, useState } from "react";
import * as api from "../../lib/api.js";
import { cn } from "../../lib/cn.js";
import { clock, humanize } from "../../lib/thread.js";
import { ago } from "../../lib/time.js";
import { PAGE_FRAME } from "../layout/Page.jsx";
import { Badge } from "../ui/Badge.jsx";
import { Button } from "../ui/Button.jsx";
import { Card } from "../ui/Card.jsx";
import { EmptyState, ErrorNote, Skeleton } from "../ui/States.jsx";

const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

function Tile({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3.5 shadow-card">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-[26px] leading-none font-bold tracking-[-0.02em] tabular-nums text-ink">{value}</p>
      {sub && <p className="mt-1.5 text-xs text-faint">{sub}</p>}
    </div>
  );
}

/** A row of bars: what each answer was, and how many gave it. */
function Bars({ counts, total }) {
  const most = Math.max(1, ...counts.map((one) => one.count));
  return (
    <ul className="flex flex-col gap-2">
      {counts.map((one) => (
        <li key={one.value} className="grid grid-cols-[minmax(0,110px)_1fr_auto] items-center gap-3 text-[13px]">
          <span className="truncate font-medium text-ink capitalize">{one.value}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-fill">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${(one.count / most) * 100}%` }} />
          </span>
          <span className="w-20 text-right font-mono text-xs text-muted tabular-nums">{one.count} · {percent(one.count, total)}%</span>
        </li>
      ))}
    </ul>
  );
}

function QuestionResult({ one }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[15px] font-semibold text-ink">{humanize(one.save_as)}</h3>
        {one.removed && <Badge tone="warn">No longer asked</Badge>}
        <span className="ml-auto text-xs text-muted">{one.answered} of {one.calls} answered</span>
      </div>
      {one.ask && <p className="mt-0.5 text-[13px] text-muted">“{one.ask}”</p>}

      <div className="mt-4">
        {one.answered === 0 ? (
          <p className="text-[13px] text-faint">No answers yet.</p>
        ) : one.type === "number" ? (
          <>
            <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
              <span><span className="text-muted">Average </span><span className="font-semibold text-ink tabular-nums">{one.average}</span></span>
              <span><span className="text-muted">Lowest </span><span className="font-semibold text-ink tabular-nums">{one.low}</span></span>
              <span><span className="text-muted">Highest </span><span className="font-semibold text-ink tabular-nums">{one.high}</span></span>
            </div>
            {one.counts && <Bars counts={one.counts} total={one.answered} />}
          </>
        ) : one.counts ? (
          <Bars counts={one.counts} total={one.answered} />
        ) : (
          <ul className="flex max-h-60 flex-col gap-1.5 overflow-auto">
            {one.values.map((value, at) => (
              <li key={at} className="rounded-xl bg-canvas px-3 py-2 text-[13px] leading-snug text-body">{value}</li>
            ))}
            {one.answered > one.values.length && (
              <li className="px-1 text-xs text-faint">…and {one.answered - one.values.length} more. They are all in the export.</li>
            )}
          </ul>
        )}
      </div>
    </Card>
  );
}

/** What the calls of one flow said: how they went, who is still to call, and every question's answers. */
export function ResultsPage({ flow, onBack, onTest }) {
  const [data, setData] = useState(null);
  const [problem, setProblem] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setData(null);
    setProblem("");
    api.flowResults(flow.id).then((found) => { if (current) setData(found); })
      .catch((failure) => { if (current) setProblem(failure.message); });
    return () => { current = false; };
  }, [flow.id, attempt]);

  const when = (iso) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className={PAGE_FRAME}>
      <button type="button" onClick={onBack}
              className="mb-4 flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink">
        <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={2} />All flows
      </button>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-[28px] leading-tight font-bold tracking-[-0.025em] text-ink">{flow.name}</h1>
          <p className="mt-1 text-sm text-muted">Results · {flow.status}</p>
        </div>
        {data?.calls > 0 && (
          <a href={api.exportUrl(flow.id)} download
             className="inline-flex h-10 items-center gap-2 rounded-full border border-edge bg-white px-4 text-[14px] font-semibold text-ink hover:bg-hover">
            <Download aria-hidden="true" className="size-4" strokeWidth={2} />Export CSV
          </a>
        )}
      </header>

      {problem && <ErrorNote onRetry={() => setAttempt((now) => now + 1)}>{problem}</ErrorNote>}
      {!data && !problem && (
        <div role="status" aria-label="Loading the results">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((one) => <Skeleton key={one} className="h-[88px] rounded-2xl" />)}
          </div>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {[0, 1].map((one) => <Skeleton key={one} className="h-44 rounded-3xl" />)}
          </div>
        </div>
      )}

      {data && data.calls === 0 && (
        <EmptyState icon={PhoneCall} title="No calls yet"
                    action={<Button variant="secondary" onClick={onTest}>Make a test call</Button>}>
          Calls made from this flow, including test calls, show up here with their answers.
        </EmptyState>
      )}

      {data && data.calls > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Calls" value={data.calls} sub={data.last_call ? `last ${ago(data.last_call).toLowerCase()}` : ""} />
            <Tile label="Completed" value={`${percent(data.completed, data.calls)}%`} sub={`${data.completed} of ${data.calls}`} />
            <Tile label="Average call" value={clock(data.average_seconds)} sub="minutes : seconds" />
            <Tile label="Still to call"
                  value={data.audience?.people ? data.audience.waiting : "—"}
                  sub={data.audience?.people ? `of ${data.audience.people} in its groups` : "no groups picked"} />
          </div>

          {data.audience?.people > 0 && (
            <div className="mt-4 rounded-2xl border border-line bg-white px-5 py-4">
              <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink">
                <Users aria-hidden="true" className="size-4 text-muted" strokeWidth={1.8} />
                {data.audience.called} of {data.audience.people} people called
              </p>
              <span className="block h-2.5 overflow-hidden rounded-full bg-fill">
                <span className="block h-full rounded-full bg-live" style={{ width: `${percent(data.audience.called, data.audience.people)}%` }} />
              </span>
            </div>
          )}

          <h2 className="mt-8 mb-3 text-lg font-semibold text-ink">Answers</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.questions.map((one) => <QuestionResult key={one.save_as} one={one} />)}
          </div>

          <h2 className="mt-8 mb-3 text-lg font-semibold text-ink">Recent calls</h2>
          <Card as="div" className="overflow-hidden">
            <ul className="divide-y divide-line">
              {data.recent.map((call) => (
                <li key={call.call} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-[13px]">
                  <span className="w-32 shrink-0 font-semibold text-ink">{when(call.at)}</span>
                  <span className="w-32 shrink-0 truncate text-body">{call.customer?.name || "Unknown"}</span>
                  <Badge tone={call.outcome === "completed" ? "good" : "warn"}>{call.outcome === "completed" ? "Completed" : "Incomplete"}</Badge>
                  <span className={cn("min-w-0 flex-[1_1_220px] truncate", call.summary ? "text-body" : "text-faint")}>
                    {call.summary || "No summary"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
