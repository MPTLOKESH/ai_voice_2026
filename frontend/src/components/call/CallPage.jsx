import {
  ChevronRight, Circle, CircleCheck, CircleMinus, CircleX, ClipboardCheck, MicOff, PhoneOff, RotateCcw, RotateCw,
} from "lucide-react";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { cn } from "../../lib/cn.js";
import { Badge } from "../ui/Badge.jsx";
import { Button } from "../ui/Button.jsx";
import { Card, IconTile } from "../ui/Card.jsx";
import { Presence } from "./LevelMeter.jsx";
import { StartPanel } from "./StartPanel.jsx";

/** A test call: the start panel before it, the live conversation during it, the outcome after. */
export function CallPage({ session, setup }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);

  if (state.phase === "ready") return <StartPanel session={session} state={state} setup={setup} />;

  // Two things only: the call itself, and what it has saved. The rest is folded away until it's wanted.
  return (
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="flex min-w-0 flex-col overflow-hidden">
        <Stage session={session} state={state} setup={setup} />
        <Conversation state={state} />
      </Card>
      <Answers state={state} setup={setup} />
    </div>
  );
}

/** A round call control with its name underneath, as on a phone's call screen. */
function CallControl({ icon: Icon, label, onClick, tone = "plain", title }) {
  return (
    <button type="button" onClick={onClick} title={title}
            className="group flex flex-col items-center gap-2 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink/40">
      <span className={cn("grid size-12 place-items-center rounded-full transition-colors",
                          tone === "end" ? "bg-bad text-white group-hover:bg-[#b91c1c]"
                            : "border border-edge bg-white text-ink group-hover:bg-hover")}>
        <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
      </span>
      <span className="text-[12px] text-muted">{label}</span>
    </button>
  );
}

/** Who's talking and how the call is going: the assistant as an orb, the clock, and the call controls. */
function Stage({ session, state, setup }) {
  const { heard, think, speak, total } = state.timings;
  const ms = (value) => (value ? `${value} ms` : "–");
  const live = state.phase === "live";
  const name = setup?.assistant_name || "Assistant";

  return (
    <div>
      <div className="flex flex-col items-center px-5 pt-10 pb-8 text-center sm:px-8">
        <Presence session={session} kind={state.status.kind} initial={name[0].toUpperCase()} />
        <p className="mt-4 text-[13px] text-muted">{name} · {setup?.business_name || "your business"}</p>
        <p className="mt-1 text-[20px] font-semibold tracking-[-0.01em] text-ink" aria-live="polite">{state.status.text}</p>
        <p className="mt-0.5 font-mono text-[14px] text-muted tabular-nums">{formatClock(total)}</p>

        <div className="mt-7 flex items-start justify-center gap-10">
          {live ? (
            <>
              <CallControl icon={MicOff} label="Say nothing" title="A turn where the customer says nothing"
                           onClick={() => session.sayNothing()} />
              <CallControl icon={PhoneOff} label="End call" tone="end" onClick={() => session.hangUp()} />
            </>
          ) : (
            <Button variant="primary" icon={RotateCcw} onClick={() => session.reset()}>New call</Button>
          )}
        </div>

        {/* How quick the last turn was, for whoever is tuning it: kept to one quiet line */}
        <dl className="mt-7 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] text-muted">
          {[["Heard", ms(heard)], ["Thought", ms(think)], ["First audio", ms(speak)]].map(([label, value]) => (
            <div key={label} className="flex gap-1.5">
              <dt>{label}</dt>
              <dd className="font-mono text-body tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

const formatClock = (seconds) => {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

function Conversation({ state }) {
  const scroller = useRef(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [state.transcript.length]);

  const live = state.phase === "live";

  return (
    <div className="flex flex-col border-t border-line">
      <ol ref={scroller} aria-label="Conversation"
          className="flex max-h-[52vh] min-h-64 flex-1 flex-col gap-1.5 overflow-y-auto bg-canvas/60 px-4 py-6 sm:px-8">
        {state.transcript.length === 0 && (
          <li className="m-auto text-sm text-muted">Connecting…</li>
        )}
        {state.transcript.map((line, at) => {
          const customer = line.who === "customer";
          // Consecutive lines from one side sit closer together, like messages do.
          const sameAsBefore = state.transcript[at - 1]?.who === line.who;
          return (
            <li key={at} className={cn("flex", customer ? "justify-end" : "justify-start", !sameAsBefore && at > 0 && "mt-2")}>
              <p className={cn(
                "max-w-[80%] rounded-xl px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap",
                customer ? "bg-brand text-white" : "border border-line bg-white text-ink",
                line.cut && "opacity-55",
              )}>
                {line.text}
                {/* They talked over this reply, so may not have heard the end of it */}
                {line.cut && <span className="ml-1 text-xs italic opacity-80">— cut off</span>}
              </p>
            </li>
          );
        })}
      </ol>

      <footer className="border-t border-line px-5 py-3 text-center text-[12px] text-muted sm:px-8">
        {!live ? "The call has ended."
          : state.interruptible ? "Just talk. Interrupt whenever you like."
          : "Just talk. Wait for it to finish before you answer."}
      </footer>
    </div>
  );
}

const MARKS = {
  answered: [CircleCheck, "text-good"],
  waiting: [Circle, "text-edge"],
  retrying: [RotateCw, "text-warn"],
  skipped: [CircleX, "text-muted"],
  unneeded: [CircleMinus, "text-muted"],
};

function Answers({ state, setup }) {
  const call = state.call;
  const questions = setup?.questions || [];
  const done = call ? Object.keys(call.answers || {}).length : 0;
  const share = questions.length ? Math.round((done / questions.length) * 100) : 0;

  return (
    <Card>
      <header className="flex items-center gap-3 px-5 pt-5 pb-4">
        <IconTile icon={ClipboardCheck} tone="cyan" size="sm" />
        <h2 className="flex-1 text-[15px] font-semibold text-ink">Answers</h2>
        <p className="text-[13px] text-muted tabular-nums">{done} of {questions.length}</p>
      </header>
      <div className="px-5 pb-5">
        <div className="h-1 overflow-hidden rounded-full bg-black/[0.07]" role="progressbar" aria-label="Answers saved"
             aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={done}>
          <div className="h-full rounded-full bg-brand transition-[width] duration-500"
               style={{ width: `${share}%` }} />
        </div>
      </div>

      {state.phase === "ended" && state.outcome && (
        <div className="mx-5 mb-5 flex flex-col gap-2 rounded-lg border border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <Badge tone={state.outcome.outcome === "completed" ? "good" : "warn"}>
              {state.outcome.outcome === "completed" ? "Completed" : "Incomplete"}
            </Badge>
            {state.outcome.end_reason && <span className="text-xs text-muted">{state.outcome.end_reason}</span>}
          </div>
          {state.summary && <p className="text-[13px] leading-relaxed text-body">{state.summary}</p>}
        </div>
      )}

      <ul className="border-t border-line">
        {questions.map((question) => {
          const name = question.save_as;
          const answered = call && name in (call.answers || {});
          const skipped = call?.skipped?.includes(name);
          const unneeded = call?.not_needed?.includes(name);
          const tries = call?.failed?.[name];
          const status = answered ? null : unneeded ? "not needed" : skipped ? "given up on"
            : tries ? `asking again (${tries})` : "waiting";
          const [Mark, colour] = MARKS[answered ? "answered" : unneeded ? "unneeded" : skipped ? "skipped"
            : tries ? "retrying" : "waiting"];
          return (
            <li key={name} className="flex gap-3 border-b border-line px-5 py-3.5 last:border-b-0">
              <Mark aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", colour)} strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[12px] text-muted">{name.replace(/_/g, " ")}</span>
                  {!answered && (
                    <span className={cn("shrink-0 text-xs", tries && !skipped ? "text-warn" : "text-muted")}>{status}</span>
                  )}
                </div>
                {answered && (
                  <>
                    <p className="mt-0.5 text-[14px] font-medium text-ink">{call.answers[name]}</p>
                    {call.said?.[name] && <p className="mt-0.5 text-[12px] text-muted">“{call.said[name]}”</p>}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <DecisionLog state={state} />
    </Card>
  );
}

/** What the code decided, and what the browser noticed, in one list. The two clocks differ by however long
 *  the greeting took, since the server counts from when the call was made: close enough to read a call by. */
function DecisionLog({ state }) {
  const scroller = useRef(null);
  const events = useMemo(() => [
    ...(state.call?.events || []).map((event) => ({ ...event, ours: false })),
    ...state.notes.map((event) => ({ ...event, ours: true })),
  ].sort((a, b) => a.at - b.at), [state.call, state.notes]);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [events.length]);

  return (
    <details className="group border-t border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 text-[13px]
                          font-medium text-body transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
        Decision log
        <ChevronRight aria-hidden="true" strokeWidth={2} className="size-4 text-muted transition group-open:rotate-90" />
      </summary>
      <ol ref={scroller} className="mx-4 mb-4 max-h-72 overflow-y-auto rounded-lg bg-canvas px-3 py-2.5 font-mono text-xs">
        {events.length === 0 && <li className="py-1 text-muted">Nothing yet.</li>}
        {events.map((event, at) => (
          <li key={at} className={cn("flex gap-3 py-1", event.ours ? "text-muted" : "text-ink")}>
            <span className="w-12 shrink-0 text-right text-muted tabular-nums">{event.at.toFixed(1)}s</span>
            <span className="min-w-0 break-words">{event.text}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
