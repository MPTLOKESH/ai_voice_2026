import {
  BarChart3, Copy, Filter, LayoutGrid, List, MoreHorizontal, Pencil, Plus, Search, Trash2, Undo2, Users, Workflow,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as api from "../../lib/api.js";
import { cn } from "../../lib/cn.js";
import { clock, estimateSeconds } from "../../lib/thread.js";
import { ago, dayAndTime } from "../../lib/time.js";
import { TEMPLATES } from "../../lib/templates.js";
import { PAGE_FRAME } from "../layout/Page.jsx";
import { Button } from "../ui/Button.jsx";
import { ConfirmDialog, Dialog } from "../ui/Dialog.jsx";
import { Select, TextInput } from "../ui/fields.jsx";
import { Menu } from "../ui/Menu.jsx";
import { EmptyState, ErrorNote, Skeleton } from "../ui/States.jsx";
import { useToast } from "../ui/Toasts.jsx";

const TABS = ["All", "Draft", "Live", "Scheduled"];
const STATUS = {
  Live: "bg-good-soft text-good",
  Draft: "bg-fill text-body",
  Scheduled: "bg-warn-soft text-warn",
};
const SORTS = [["edited", "Recently edited"], ["name", "Name"], ["calls", "Most calls"]];
const MAX_DOTS = 8;

// How the flows are laid out is remembered, but only as a convenience: storage can be off.
const VIEW_KEY = "voice-call-drafts-view";
const savedView = () => { try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid"; } catch { return "grid"; } };

/** A scheduled flow whose time has come and gone: nothing sends it yet, so it is due rather than scheduled. */
const isDue = (flow) => flow.status === "Scheduled" && flow.scheduled_for && new Date(flow.scheduled_for) < new Date();

const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

/** How many of a flow's steps are questions (the rest are messages and ends). */
const askCount = (flow) => flow.setup.questions.filter((one) => (one.kind || "ask") === "ask").length;

/** A flow drawn small: one dot on the line for each question, and the coral star where the call ends. */
function Thread({ questions }) {
  const dots = Math.min(questions, MAX_DOTS);
  const marks = [...Array(dots).fill("dot"), "star"];
  return (
    <div aria-hidden="true" className="absolute inset-0">
      <div className="absolute inset-x-[8%] top-[66px] h-[3px] rounded-sm bg-ink" />
      <div className="absolute inset-x-[8%] top-[59px] h-4">
        {marks.map((kind, at) => (
          <span key={at} style={{ left: `${((at + 1) / (marks.length + 1)) * 100}%` }}
                className={kind === "dot"
                  ? "absolute top-0 -ml-2 size-4 rounded-full border-2 border-canvas bg-brand"
                  : "absolute -top-0.5 -ml-2.5 size-5 bg-coral [clip-path:polygon(50%_0%,61%_35%,98%_35%,68%_57%,79%_91%,50%_70%,21%_91%,32%_57%,2%_35%,39%_35%)]"} />
        ))}
      </div>
    </div>
  );
}

function StatusBadges({ flow }) {
  const live = flow.status !== "Draft";
  return (
    <span className="flex flex-wrap gap-1.5">
      <span className={cn("rounded-full px-[9px] py-[3px] text-[11px] font-semibold", isDue(flow) ? "bg-bad-soft text-bad" : STATUS[flow.status])}>
        {isDue(flow) ? "Due" : flow.status}
      </span>
      {live && flow.unpublished_changes && (
        <span title="Edited since it was published. Customers still get the published version."
              className="rounded-full bg-white px-[9px] py-[3px] text-[11px] font-semibold text-warn ring-1 ring-line">Unpublished changes</span>
      )}
    </span>
  );
}

function Tile({ label, value, sub, tone }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3.5 shadow-card">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cn("mt-1 text-[26px] leading-none font-bold tracking-[-0.02em] tabular-nums", tone || "text-ink")}>{value}</p>
      {sub && <p className="mt-1.5 text-xs text-faint">{sub}</p>}
    </div>
  );
}

/** Naming (or renaming) a flow. */
function RenameDialog({ flow, onClose, onRename }) {
  const [name, setName] = useState(flow.name);
  return (
    <Dialog title="Rename flow" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onRename(name.trim()); onClose(); }}>
        <div className="px-6 py-3">
          <TextInput aria-label="Flow name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="flex justify-end gap-2 px-6 pt-2 pb-[22px]">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!name.trim() || name.trim() === flow.name}>Rename</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Where a new flow starts: nothing, or something close to what is usually asked. */
function NewFlowDialog({ onClose, onPick }) {
  return (
    <Dialog title="New flow" subtitle="Start from a template, or a blank page." onClose={onClose} className="w-[620px]">
      <div className="grid gap-2.5 px-6 pt-3 pb-6 sm:grid-cols-2">
        {TEMPLATES.map((one) => (
          <button key={one.id} type="button" onClick={() => { onPick(one); onClose(); }}
                  className="flex flex-col gap-1 rounded-2xl border border-line p-4 text-left transition-colors hover:border-brand hover:bg-brand-wash">
            <span className="text-sm font-semibold text-ink">{one.name}</span>
            <span className="text-[13px] leading-snug text-muted">{one.blurb}</span>
            <span className="mt-1 text-xs text-faint">
              {one.questions.length ? `${one.questions.length} questions` : "No questions yet"}
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

/**
 * Every flow: how it is doing, who it goes to, and what can be done with it. A flow is a setup with a name.
 * `onEdit(id)`, `onPublish(id)`, `onResults(id)` open the flow elsewhere; the rest is done here.
 */
export function DraftsPage({ flows, voices, activeBusiness, onEdit, onNew, onPublish, onDelete, onResults, onStored }) {
  const toast = useToast();
  const [tab, setTab] = useState("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("edited");
  const [view, setView] = useState(savedView);
  const [numbers, setNumbers] = useState(null);     // {flows, week}
  const [statsProblem, setStatsProblem] = useState("");
  const [groups, setGroups] = useState([]);
  const [dialog, setDialog] = useState(null);       // {kind: "new" | "rename" | "delete", flow}

  useEffect(() => {
    loadNumbers();
    api.groups().then((found) => setGroups(found.groups)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** The calls made, for the numbers on top and the line on each flow. A failure says so rather than showing zeros. */
  function loadNumbers() {
    setStatsProblem("");
    api.stats().then(setNumbers).catch((failure) => setStatsProblem(failure.message));
  }

  const chooseView = (next) => {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* not worth a message */ }
  };

  const of = (flow) => numbers?.flows[flow.id] || { calls: 0, completed: 0, average_seconds: 0 };
  const voiceOf = (flow) => {
    const found = voices.find((voice) => voice.id === flow.setup.voice_id)?.name;
    return found ? found.split(" - ")[0] : flow.setup.assistant_name;
  };
  const groupNames = (flow) => (flow.groups || []).map((id) => groups.find((group) => group.id === id)?.name).filter(Boolean);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = flows.filter((flow) => (tab === "All" || flow.status === tab) && (!term || flow.name.toLowerCase().includes(term)));
    const by = {
      edited: (a, b) => (b.edited || "").localeCompare(a.edited || ""),
      name: (a, b) => a.name.localeCompare(b.name),
      calls: (a, b) => (numbers?.flows[b.id]?.calls || 0) - (numbers?.flows[a.id]?.calls || 0),
    }[sort];
    return [...list].sort(by);
  }, [flows, tab, search, sort, numbers]);

  const counts = useMemo(() => ({
    live: flows.filter((flow) => flow.status === "Live").length,
    scheduled: flows.filter((flow) => flow.status === "Scheduled").length,
    draft: flows.filter((flow) => flow.status === "Draft").length,
  }), [flows]);

  async function run(job, message) {
    try {
      const result = await job();
      if (message) toast(message);
      return result;
    } catch (failure) {
      toast(failure.message, "bad");
      return null;
    }
  }

  const duplicate = (flow) => run(async () => onStored(await api.duplicateFlow(flow.id)), `Duplicated as “${flow.name} (copy)”.`);
  const unpublish = (flow) => run(async () => onStored(await api.unpublishFlow(flow.id)), `${flow.name} is a draft again.`);
  const rename = (flow, name) => run(async () => {
    onStored(await api.saveFlow(flow.id, { name, setup: flow.setup, version: flow.version }));
  }, "Renamed.");

  const week = numbers?.week;
  // While the numbers are on their way a grey block stands in; if they could not come, a dash.
  const waiting = statsProblem ? "—" : <Skeleton className="my-1 h-6 w-14" />;
  const Item = ({ icon: Icon, danger, children, ...props }) => (
    <button type="button" {...props}
            className={cn("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
                          danger ? "text-bad hover:bg-bad-soft" : "text-ink hover:bg-fill")}>
      <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.8} />{children}
    </button>
  );

  const menu = (flow) => (
    <Menu label={`More for ${flow.name}`} className="w-52"
          trigger={<MoreHorizontal aria-hidden="true" className="size-[18px]" strokeWidth={2} />}
          buttonClassName="grid size-8 place-items-center rounded-full text-faint transition hover:bg-fill hover:text-ink">
      <Item icon={Pencil} onClick={() => setDialog({ kind: "rename", flow })}>Rename</Item>
      <Item icon={Copy} onClick={() => duplicate(flow)}>Duplicate</Item>
      {flow.status !== "Draft" && <Item icon={Undo2} onClick={() => unpublish(flow)}>Back to draft</Item>}
      <Item icon={Trash2} danger onClick={() => setDialog({ kind: "delete", flow })}>Delete</Item>
    </Menu>
  );

  /** Calls made, and how many were finished, in a line. */
  const callsLine = (flow) => {
    const one = of(flow);
    if (!numbers) return "";
    return one.calls ? `${one.calls} ${one.calls === 1 ? "call" : "calls"} · ${percent(one.completed, one.calls)} completed` : "No calls yet";
  };

  const chips = (flow) => {
    const names = groupNames(flow);
    return (
      <div className="flex min-h-[22px] flex-wrap gap-1.5">
        {flow.channels.map((channel) => (
          <span key={channel} className="rounded-full bg-fill px-[9px] py-0.5 text-xs font-medium text-body">{channel}</span>
        ))}
        {names.slice(0, 2).map((name) => (
          <span key={name} className="flex items-center gap-1 rounded-full bg-brand-soft px-[9px] py-0.5 text-xs font-medium text-brand-ink">
            <Users aria-hidden="true" className="size-3" strokeWidth={2} />{name}
          </span>
        ))}
        {names.length > 2 && <span className="py-0.5 text-xs text-faint">+{names.length - 2}</span>}
        {flow.status === "Scheduled" && flow.scheduled_for && (
          <span className={cn("rounded-full px-[9px] py-0.5 text-xs font-medium", isDue(flow) ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn")}>
            {dayAndTime(flow.scheduled_for)}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className={PAGE_FRAME}>
      <div className="relative flex flex-wrap items-end justify-between gap-5 overflow-hidden rounded-3xl bg-[linear-gradient(120deg,#efeaff_0%,#f6f3ff_55%,#fff1ea_100%)] p-6 sm:p-8">
        <div className="max-w-[560px]">
          <p className="text-[13px] font-medium text-brand-ink">{activeBusiness || "Your business"} · Feedback flows</p>
          <h1 className="mt-2 text-[28px] leading-[1.15] font-bold tracking-[-0.025em] text-balance text-ink sm:text-[34px]">
            What do you want to ask your customers today?
          </h1>
        </div>
        <button type="button" onClick={() => setDialog({ kind: "new" })}
                className="flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgb(17_17_20/0.18)] transition-colors hover:bg-ink-hover">
          <Plus aria-hidden="true" className="size-4" strokeWidth={2.4} />New feedback flow
        </button>
      </div>

      {statsProblem && (
        <ErrorNote className="mt-5" onRetry={loadNumbers}>Couldn’t load the call numbers. {statsProblem}</ErrorNote>
      )}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Live now" value={counts.live}
              sub={`${counts.scheduled} scheduled · ${counts.draft} ${counts.draft === 1 ? "draft" : "drafts"}`} />
        <Tile label="Calls this week" value={week ? week.calls : waiting} sub="across every flow" />
        <Tile label="Completed" value={week ? percent(week.completed, week.calls) : waiting}
              sub={week?.calls ? `${week.completed} of ${week.calls} calls` : "this week"} tone={week?.calls ? "text-good" : undefined} />
        <Tile label="Average call" value={week?.calls ? clock(week.average_seconds) : week ? "—" : waiting} sub="minutes : seconds" />
      </div>

      <div className="mt-7 mb-4 flex flex-wrap items-center gap-2.5">
        <h2 className="mr-auto text-xl font-semibold tracking-[-0.01em] text-ink">Your flows</h2>
        <div className="relative min-w-40 max-sm:order-last max-sm:w-full">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" strokeWidth={2} />
          <TextInput aria-label="Search flows" value={search} onChange={(event) => setSearch(event.target.value)}
                     placeholder="Search" className="h-9 rounded-full pl-9" />
        </div>
        <Select aria-label="Sort by" className="h-9 w-auto rounded-full" value={sort} onChange={(event) => setSort(event.target.value)} options={SORTS} />
        <div role="tablist" className="flex rounded-full bg-active p-[3px]">
          {TABS.map((one) => (
            <button key={one} type="button" role="tab" aria-selected={tab === one} onClick={() => setTab(one)}
                    className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                                  tab === one ? "bg-white text-ink shadow-[0_1px_2px_rgb(17_17_20/0.1)]" : "text-muted hover:text-ink")}>
              {one}
            </button>
          ))}
        </div>
        <div className="flex rounded-full bg-active p-[3px]" role="group" aria-label="Layout">
          {[["grid", LayoutGrid, "Cards"], ["list", List, "List"]].map(([id, Icon, label]) => (
            <button key={id} type="button" aria-pressed={view === id} aria-label={label} title={label} onClick={() => chooseView(id)}
                    className={cn("grid size-[30px] place-items-center rounded-full transition-colors",
                                  view === id ? "bg-white text-ink shadow-[0_1px_2px_rgb(17_17_20/0.1)]" : "text-muted hover:text-ink")}>
              <Icon aria-hidden="true" className="size-4" strokeWidth={2} />
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 && (flows.length === 0 ? (
        <EmptyState icon={Workflow} title="No flows yet"
                    action={<Button variant="primary" icon={Plus} onClick={() => setDialog({ kind: "new" })}>New feedback flow</Button>}>
          A flow is the call you want made: why it is calling and the questions it asks.
        </EmptyState>
      ) : (
        <EmptyState icon={Filter} title={search.trim() ? `No flow is called “${search.trim()}”` : `Nothing is ${tab.toLowerCase()} right now`}
                    action={<Button variant="secondary" onClick={() => { setSearch(""); setTab("All"); }}>Show every flow</Button>}>
          Try a different search, or look at every flow.
        </EmptyState>
      ))}

      {view === "grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-4">
          {shown.map((flow) => {
            const questions = askCount(flow);
            const meta = [`${questions} ${questions === 1 ? "question" : "questions"}`,
                          clock(estimateSeconds(flow.setup.questions)), voiceOf(flow)].join(" · ");
            const live = flow.status !== "Draft";
            return (
              <article key={flow.id}
                       className="flex flex-col overflow-hidden rounded-[18px] border border-line bg-white transition-shadow hover:shadow-[0_12px_32px_rgb(17_17_20/0.1)]">
                <div role="button" tabIndex={0} onClick={() => onEdit(flow.id)} aria-label={`Open ${flow.name}`}
                     onKeyDown={(event) => { if (event.key === "Enter") onEdit(flow.id); }}
                     className="relative m-2 mb-0 h-[132px] cursor-pointer rounded-xl bg-canvas [background-size:14px_14px] [background-image:radial-gradient(#e3e3e9_1px,transparent_1px)]">
                  <Thread questions={questions} />
                  <span className="absolute top-2.5 left-2.5"><StatusBadges flow={flow} /></span>
                </div>

                <div className="flex flex-1 flex-col gap-2.5 px-3.5 pt-3 pb-3.5">
                  <div className="flex items-start gap-1">
                    <div className="min-w-0 flex-1">
                      <button type="button" onClick={() => onEdit(flow.id)}
                              className="block max-w-full truncate text-left text-[15px] font-semibold text-ink hover:text-brand-ink">
                        {flow.name}
                      </button>
                      <p className="mt-0.5 text-xs text-faint">{meta} · {ago(flow.edited)}</p>
                    </div>
                    <div className="-mt-1 -mr-1.5">{menu(flow)}</div>
                  </div>
                  <p className={cn("text-[13px]", of(flow).calls ? "font-medium text-body" : "text-faint")}>{callsLine(flow)}</p>
                  {chips(flow)}
                  <div className="mt-auto flex gap-2">
                    <button type="button" onClick={() => onEdit(flow.id)}
                            className="flex-1 rounded-full border border-edge bg-white px-3 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-hover">
                      Edit
                    </button>
                    {of(flow).calls > 0 && (
                      <button type="button" onClick={() => onResults(flow.id)} aria-label={`Results of ${flow.name}`} title="Results"
                              className="grid w-10 place-items-center rounded-full border border-edge bg-white text-ink transition-colors hover:bg-hover">
                        <BarChart3 aria-hidden="true" className="size-4" strokeWidth={2} />
                      </button>
                    )}
                    <button type="button" onClick={() => onPublish(flow.id)}
                            className={cn("flex-1 rounded-full px-3 py-2 text-[13px] font-semibold transition-opacity hover:opacity-90",
                                          live && !flow.unpublished_changes ? "bg-fill text-ink" : "bg-ink text-white")}>
                      {live ? (flow.unpublished_changes ? "Publish changes" : "Update") : "Publish"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {shown.map((flow) => {
            const questions = askCount(flow);
            return (
              <li key={flow.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-hover/60">
                <div className="min-w-0 flex-[2_1_220px]">
                  <button type="button" onClick={() => onEdit(flow.id)}
                          className="block max-w-full truncate text-left text-[15px] font-semibold text-ink hover:text-brand-ink">{flow.name}</button>
                  <p className="text-xs text-faint">
                    {questions} {questions === 1 ? "question" : "questions"} · {clock(estimateSeconds(flow.setup.questions))} · {ago(flow.edited)}
                  </p>
                </div>
                <StatusBadges flow={flow} />
                <p className={cn("flex-[1_1_150px] text-[13px]", of(flow).calls ? "text-body" : "text-faint")}>{callsLine(flow)}</p>
                <div className="flex-[1_1_180px]">{chips(flow)}</div>
                <div className="ml-auto flex items-center gap-1.5">
                  {of(flow).calls > 0 && (
                    <Button variant="ghost" size="sm" icon={BarChart3} onClick={() => onResults(flow.id)}>Results</Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => onEdit(flow.id)}>Edit</Button>
                  <Button variant={flow.status !== "Draft" && !flow.unpublished_changes ? "subtle" : "primary"} size="sm" onClick={() => onPublish(flow.id)}>
                    {flow.status !== "Draft" ? (flow.unpublished_changes ? "Publish changes" : "Update") : "Publish"}
                  </Button>
                  {menu(flow)}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {dialog?.kind === "new" && <NewFlowDialog onClose={() => setDialog(null)} onPick={onNew} />}
      {dialog?.kind === "rename" && (
        <RenameDialog flow={dialog.flow} onClose={() => setDialog(null)} onRename={(name) => rename(dialog.flow, name)} />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog title={`Delete “${dialog.flow.name}”?`} confirm="Delete flow" danger onClose={() => setDialog(null)}
                       onConfirm={() => onDelete(dialog.flow.id)}>
          {dialog.flow.status !== "Draft" && <>It is {dialog.flow.status.toLowerCase()} right now. </>}
          The flow and its questions are removed for good. Calls already made stay in History.
        </ConfirmDialog>
      )}
    </div>
  );
}
