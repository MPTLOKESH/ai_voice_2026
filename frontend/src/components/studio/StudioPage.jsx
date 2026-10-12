import {
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, ChevronDown, ChevronLeft, History, LayoutGrid, Loader2,
  PanelRightClose, PanelRightOpen, Pause, Phone, Play, Redo2, RotateCcw, Settings2, Trash2, TriangleAlert, Undo2, Upload,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../lib/api.js";
import { cn } from "../../lib/cn.js";
import { PAIR_W, TIDY, layoutNodes } from "../../lib/layout.js";
import { sampleGreeting, speakLine } from "../../lib/speak.js";
import {
  OPEN, TILE, answerId, askId, buildSteps, clock, estimateSeconds, humanize, questionIssue,
} from "../../lib/thread.js";
import { NO_AUDIO, wait } from "../../lib/useVoice.js";
import { Button } from "../ui/Button.jsx";
import { ConfirmDialog } from "../ui/Dialog.jsx";
import { Menu } from "../ui/Menu.jsx";
import { useToast } from "../ui/Toasts.jsx";
import { Canvas } from "./Canvas.jsx";
import { SettingsDrawer } from "./SettingsDrawer.jsx";
import { StepCard } from "./StepCard.jsx";
import { Toolbar } from "./Toolbar.jsx";
import { VersionsDialog } from "./VersionsDialog.jsx";

const TYPE_LABELS = { text: "Text", number: "Number", date: "Date", time: "Time", yes_no: "Yes / No", choice: "Choice" };
const snippet = (text) => (text.trim().length > 26 ? `${text.trim().slice(0, 25)}…` : text.trim());
const isAsk = (question) => (question.kind || "ask") === "ask";

/** Under the flow's name: whether what is on screen is stored, and what to do when it couldn't be. */
function SaveStatus({ setupState, flow, onDiscard }) {
  const { status } = setupState;
  const changed = flow.status !== "Draft" && flow.unpublished_changes && status === "saved";
  const dot = { saved: "bg-live", saving: "bg-amber", failed: "bg-bad", conflict: "bg-bad" }[status];
  return (
    <span aria-live="polite" className="flex min-w-0 items-center gap-1.5 text-xs text-faint">
      <span className={cn("size-1.5 shrink-0 rounded-full", changed ? "bg-amber" : dot)} />
      {status === "saving" && "Saving…"}
      {status === "conflict" && <span className="font-medium text-bad">Changed in another tab</span>}
      {status === "failed" && (
        <>
          <span className="font-medium text-bad">Couldn’t save</span>
          <button type="button" onClick={() => setupState.save()} className="font-semibold text-ink underline-offset-2 hover:underline">Retry</button>
        </>
      )}
      {status === "saved" && !changed && "All changes saved"}
      {changed && (
        <>
          <span className="truncate">Saved · not published yet</span>
          <button type="button" onClick={onDiscard} className="shrink-0 font-semibold text-ink underline-offset-2 hover:underline">Discard</button>
        </>
      )}
    </span>
  );
}

/** Other ways to word the selected step, from the AI, to pick from. */
function Wording({ state, onPick, onAsk, canAsk }) {
  if (!canAsk) return null;
  return (
    <div className="mt-4 rounded-2xl bg-loop-soft/60 p-3">
      <div className="flex items-center gap-2">
        <WandSparkles aria-hidden="true" className="size-4 text-loop" strokeWidth={2} />
        <span className="flex-1 text-[13px] font-semibold text-ink">Other ways to say it</span>
        <button type="button" onClick={onAsk} disabled={state?.loading}
                className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink shadow-[0_1px_2px_rgb(17_17_20/0.08)] hover:bg-hover disabled:opacity-60">
          {state?.loading ? "Thinking…" : state?.options ? "Again" : "Suggest"}
        </button>
      </div>
      {state?.loading && (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted"><Loader2 aria-hidden="true" className="size-3.5 motion-safe:animate-spin" />Writing a few ways to put it…</p>
      )}
      {state?.problem && <p role="alert" className="mt-2 text-xs font-medium text-bad">{state.problem}</p>}
      {state?.options && state.options.length === 0 && <p className="mt-2 text-xs text-muted">Nothing different from what is there already.</p>}
      {state?.options?.map((option) => (
        <button key={option} type="button" onClick={() => onPick(option)}
                className="mt-2 block w-full rounded-xl bg-white px-3 py-2 text-left text-[13px] leading-snug text-ink shadow-[0_1px_2px_rgb(17_17_20/0.06)] transition-all hover:-translate-y-px hover:shadow-[0_6px_14px_rgb(17_17_20/0.1)]">
          {option}
        </button>
      ))}
    </div>
  );
}

/**
 * The studio: the call on a canvas where every step can be put anywhere. Blocks come from the bar along
 * the top; the editor for the selected step docks on the right, and can be minimised.
 */
export function StudioPage({ flow, setupState, voices, voice, onTest, onPublish, onBack }) {
  const toast = useToast();
  const { form, set, setup, name, setName, saving, conflict } = setupState;
  const [confirming, setConfirming] = useState(null);   // {kind: "remove", question, dependents} or {kind: "discard"}
  const [selectedId, setSelectedId] = useState(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [settings, setSettings] = useState(false);
  const [versions, setVersions] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);   // the step being spoken during Listen
  const [elapsed, setElapsed] = useState(0);
  const [ghost, setGhost] = useState(null);         // a block being carried: {x, y, block, tint}
  const [trashLit, setTrashLit] = useState(false);
  const [wording, setWording] = useState({});       // {stepId: {loading, options, problem}}
  const canvas = useRef(null);
  const trash = useRef(null);

  const questions = form.questions;
  const voiceName = voices.find((one) => one.id === form.voice_id)?.name || (form.voice_id ? "Custom voice" : "Default voice");

  const steps = useMemo(() => buildSteps(questions).map((step) => {
    if (step.kind === "open") {
      const ready = Boolean(form.purpose.trim());
      return { ...step, title: "Greeting", sub: ready ? voiceName : "Say why it is calling", flag: { ok: ready, note: ready ? "Ready" : "Say why it is calling" } };
    }
    if (step.kind === "ask") {
      const issue = questionIssue(step.question, step.index, questions);
      return { ...step, title: humanize(step.question.save_as) || "New question", sub: issue || voiceName, flag: { ok: !issue, note: issue || "Ready" } };
    }
    if (step.kind === "say") {
      const issue = questionIssue(step.question, step.index, questions);
      return { ...step, title: "Message", sub: issue || snippet(step.question.ask), flag: { ok: !issue, note: issue || "Ready" } };
    }
    if (step.kind === "end") {
      const issue = questionIssue(step.question, step.index, questions);
      const what = step.question.handoff ? "Hand over" : "End call";
      return { ...step, title: what, sub: issue || `if ${humanize(step.question.only_if)} is ${(step.question.only_if_is || []).join(" or ")}`, flag: { ok: !issue, note: issue || "Ready" } };
    }
    if (step.kind === "answer") {
      const { type, required } = step.question;
      return { ...step, title: "Customer", sub: TYPE_LABELS[type] + (required === false ? " · optional" : "") };
    }
    return { ...step, title: "Close", sub: form.confirm_at_end ? "Reads answers back" : "Ends the call" };
  }), [questions, form.purpose, form.confirm_at_end, voiceName]);

  const nodes = useMemo(() => layoutNodes(questions, form.open_at, form.close_at), [questions, form.open_at, form.close_at]);
  const details = useMemo(() => Object.fromEntries(steps.map((step) => [step.id, step])), [steps]);
  const selected = steps.find((step) => step.id === selectedId);
  const total = estimateSeconds(questions);
  const tooLong = total > Number(form.max_minutes || 4) * 60;

  // What is stopping it being tried or published, each one a step to jump to.
  const issues = useMemo(() => {
    const found = [];
    if (!form.purpose.trim()) found.push({ id: OPEN, text: "Say why it is calling" });
    if (!questions.some(isAsk)) found.push({ id: null, text: "Add at least one question" });
    steps.forEach((step) => {
      if (step.kind !== "open" && step.flag && !step.flag.ok) found.push({ id: step.id, text: `${step.title}: ${step.flag.note}` });
    });
    return found;
  }, [steps, form.purpose, questions]);

  // A step that goes away (removed, or the form cleared) can't stay selected.
  useEffect(() => { if (selectedId && !selected) { setSelectedId(null); setCardOpen(false); } }, [selectedId, selected]);

  const select = (id) => { setSelectedId(id); setCardOpen(true); setMinimized(false); };
  const byKey = (key) => questions.find((one) => one._key === key);

  /** Removes a step, asking first when others are only run after it. */
  function remove(question, sure = false) {
    const dependents = setupState.dependentsOf(question._key);
    if (dependents.length && !sure) { setConfirming({ kind: "remove", question, dependents }); return; }
    setupState.removeQuestion(question._key);
    setSelectedId(null);
  }

  // ── putting things on the canvas ──────────────────────────────────────────
  /** Adds a step at a position in the call, drawn at `where` (its middle) on the canvas. */
  function addAt(index, fields, where) {
    const width = (fields.kind || "ask") === "ask" ? PAIR_W : TILE;
    const placed = where ? { ...fields, x: Math.round(where.x - width / 2), y: Math.round(where.y - TILE / 2) } : fields;
    const made = setupState.addQuestion(index, placed);
    select(askId(made));
  }

  /** The step the selection means, as something blocks can be applied to. */
  const selectedNode = () => (selected?.question ? nodes.find((node) => node.id === selected.question._key) : null);

  /** A new step after the selected one if there is one, else at the end. */
  const addAfterSelected = (fields) => {
    const node = selectedNode();
    if (node) {
      addAt(node.index + 1, fields, { x: node.x + node.w + 90 + (((fields.kind || "ask") === "ask" ? PAIR_W : TILE) / 2), y: node.y + TILE / 2 });
    } else {
      const last = nodes[nodes.length - 2];
      const where = last && last.type === "question"
        ? { x: last.x + last.w + 90 + (((fields.kind || "ask") === "ask" ? PAIR_W : TILE) / 2), y: last.y + TILE / 2 }
        : undefined;
      addAt(undefined, fields, where);
    }
  };

  /** A "Customer answers" block applied to a question: how it is answered changes, what is asked doesn't. */
  function applyAnswer(question, fields) {
    setupState.changeQuestion(question._key, {
      type: fields.type, rule: fields.rule || "", options: fields.options || [], _optionsText: undefined,
    });
    select(answerId(question));
    toast(`The customer now answers with ${TYPE_LABELS[fields.type].toLowerCase()}.`);
  }

  /** A branch: the step waits on the question above it, to be told which answer. */
  function branch(question) {
    const at = questions.findIndex((one) => one._key === question._key);
    const parent = questions.slice(0, at).filter(isAsk).pop();
    if (!parent) { toast("There is no question above it to wait on.", "bad"); return; }
    setupState.changeQuestion(question._key, {
      only_if: parent.save_as, only_if_is: parent.type === "yes_no" ? ["no"] : [], _onlyIfIsText: undefined,
    });
    select(askId(question));
  }

  async function suggestQuestions() {
    const missing = await setupState.suggest();
    if (missing === "purpose") { toast("Say why it is calling first. It writes the questions from that.", "bad"); select(OPEN); }
  }

  /** Other ways to word one step's line, from the AI. */
  async function suggestWording(step) {
    const question = step.question;
    if (!question?.ask.trim()) { toast("Write something first. It suggests other ways to say it.", "bad"); return; }
    setWording((now) => ({ ...now, [step.id]: { loading: true } }));
    try {
      const { options, notices } = await api.reword(setup, question.ask, question.kind || "ask");
      setWording((now) => ({ ...now, [step.id]: { options } }));
      (notices || []).forEach((notice) => toast(notice));
    } catch (failure) {
      setWording((now) => ({ ...now, [step.id]: { problem: failure.message } }));
    }
  }

  /** What pressing a block does: the same as dropping it, with the selection standing in for the pointer. */
  function press(block) {
    const { payload } = block;
    const node = selectedNode();
    if (payload.kind === "new") addAfterSelected(payload.fields);
    else if (payload.kind === "answer") {
      if (node?.kind === "ask") applyAnswer(node.question, payload.fields);
      else addAfterSelected(payload.fields);
    } else if (payload.kind === "branch") {
      if (node && node.kind !== undefined) branch(node.question);
      else toast("Select a step first, or drag Branch onto one.");
    } else if (payload.kind === "suggest") suggestQuestions();
  }

  /** Where in the call a drop at a hit puts a new step, and where on the canvas. */
  function dropNew(fields, found) {
    const { hit, world } = found;
    if (hit?.type === "connector") return addAt(hit.connector.index, fields, world);
    if (hit?.type === "node") {
      const node = hit.node;
      const width = (fields.kind || "ask") === "ask" ? PAIR_W : TILE;
      const index = node.type === "open" ? 0 : node.type === "close" ? questions.length : node.index + 1;
      return addAt(index, fields, { x: node.x + node.w + 90 + width / 2, y: node.y + TILE / 2 });
    }
    return addAt(undefined, fields, world);
  }

  /** A block was put down at a point on the screen. */
  function drop(block, clientX, clientY) {
    const found = canvas.current?.hit(clientX, clientY);
    if (!found?.inside) return;
    const { payload } = block;
    const node = found.hit?.type === "node" ? found.hit.node : null;
    if (payload.kind === "new") dropNew(payload.fields, found);
    else if (payload.kind === "answer") {
      if (node?.kind === "ask") applyAnswer(node.question, payload.fields);
      else dropNew(payload.fields, found);
    } else if (payload.kind === "branch") {
      if (node?.type === "question") branch(node.question);
      else toast("Drop Branch onto a step to make it wait on an earlier answer.");
    } else if (payload.kind === "suggest") {
      if (node?.type === "question" && node.kind !== "end") {
        select(askId(node.question));
        suggestWording({ id: askId(node.question), question: node.question });
      } else suggestQuestions();
    }
  }

  /** A block was pressed. A press that goes nowhere is a click; one that is carried is put down on drop. */
  function grab(event, block, tint) {
    if (!event) { press(block); return; }
    if (event.button !== 0) return;
    const start = { x: event.clientX, y: event.clientY };
    let moved = false;
    const track = (move) => {
      if (!moved && Math.hypot(move.clientX - start.x, move.clientY - start.y) < 5) return;
      moved = true;
      setGhost({ x: move.clientX, y: move.clientY, block, tint });
    };
    const finish = (up) => {
      window.removeEventListener("pointermove", track);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      setGhost(null);
      if (up.type === "pointercancel") return;
      if (moved) drop(block, up.clientX, up.clientY); else press(block);
    };
    window.addEventListener("pointermove", track);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  /** Test and publish only go ahead when nothing is wrong; otherwise the list of what is, with where to go. */
  function guarded(next) {
    if (issues.length) {
      setIssuesOpen(true);
      toast(issues.length === 1 ? issues[0].text : `${issues.length} things need fixing first.`, "bad");
      return;
    }
    next();
  }

  /** What a block would do if put down here: said next to it as it is carried. */
  const caption = useMemo(() => {
    if (!ghost) return "";
    const found = canvas.current?.hit(ghost.x, ghost.y);
    if (!found?.inside) return "Bring it onto the canvas";
    const { kind } = ghost.block.payload;
    const hit = found.hit;
    if (kind === "branch") return hit?.type === "node" && hit.node.type === "question" ? `Make ${details[askId(hit.node.question)]?.title || "it"} conditional` : "Drop on a step";
    if (kind === "suggest") return hit?.type === "node" && hit.node.type === "question" ? "Other ways to word this" : "Suggest questions";
    if (kind === "answer" && hit?.type === "node" && hit.node.kind === "ask") return `Answered with ${ghost.block.label.toLowerCase()}`;
    if (hit?.type === "connector") return "Put it on this line";
    if (hit?.type === "node") return "Add it after this step";
    return "Add it at the end";
  }, [ghost, details]);

  // ── hearing ────────────────────────────────────────────────────────────────
  const hearing = (id) => voice.playing === `hear:${id}`;
  const hear = (step) => voice.run(`hear:${step.id}`, async (signal) => {
    const text = step.kind === "open" ? sampleGreeting(setup) : step.question.ask.trim();
    if (!text) { toast("Write what it should say first.", "bad"); return; }
    if (!(await speakLine(setup, text, signal)) && !signal.aborted) toast(NO_AUDIO, "bad");
  });

  const listening = voice.playing === "listen";
  const listen = () => voice.run("listen", async (signal) => {
    const started = performance.now();
    const tick = setInterval(() => setElapsed((performance.now() - started) / 1000), 200);
    try {
      for (const step of steps) {
        if (signal.aborted) return;
        if (step.kind === "end") continue;                      // an end only happens when an answer calls for it
        setActiveId(step.id);
        const said = step.kind === "open" ? sampleGreeting(setup) : step.kind === "ask" || step.kind === "say" ? step.question.ask.trim() : "";
        if (!said) { await wait(step.kind === "close" ? 600 : 1200, signal); continue; }
        if (!(await speakLine(setup, said, signal))) {
          if (!signal.aborted) toast(NO_AUDIO, "bad");
          return;
        }
      }
    } finally {
      clearInterval(tick);
      setActiveId(null);
      setElapsed(0);
    }
  });

  // ── keyboard ───────────────────────────────────────────────────────────────
  // The handler is kept in a ref so the listener is set up once and still sees the latest of everything.
  const keys = useRef(null);
  keys.current = (event) => {
    if (event.key === "Escape") {
      if (issuesOpen) setIssuesOpen(false);
      else if (!settings) setCardOpen(false);
      return;
    }
    // Typing, or a window over the page: the keys belong to that.
    if (event.target.closest?.("input, textarea, select, [contenteditable=true]")) return;
    if (settings || versions || confirming || document.querySelector("[role=dialog]")) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && key === "z") { event.preventDefault(); if (event.shiftKey) setupState.redo(); else setupState.undo(); return; }
    if (mod && key === "y") { event.preventDefault(); setupState.redo(); return; }
    if (mod && key === "d" && selected?.question) {
      event.preventDefault();
      const copy = setupState.duplicateQuestion(selected.question._key);
      if (copy) select(askId(copy));
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selected?.question) {
      event.preventDefault();
      remove(selected.question);
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const at = steps.findIndex((step) => step.id === selectedId);
      const next = steps[Math.max(0, Math.min(steps.length - 1, (at < 0 ? -1 : at) + (event.key === "ArrowRight" ? 1 : -1)))];
      if (next) { select(next.id); canvas.current?.focus(next.id); }
    }
  };
  useEffect(() => {
    const listener = (event) => keys.current(event);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  const editable = Boolean(selected && cardOpen);
  const card = editable ? (
    <>
      <StepCard key={selected.id} step={selected} form={form} set={set} voices={voices} questions={questions}
                hearing={hearing(selected.id)} onHear={() => hear(selected)}
                onClose={() => setCardOpen(false)}
                onRemove={selected.question && (() => remove(selected.question))}
                onMove={(to) => selected.question && setupState.moveQuestion(selected.question._key, to)}
                onDuplicate={() => { const copy = selected.question && setupState.duplicateQuestion(selected.question._key); if (copy) select(askId(copy)); }}
                onAddAfter={() => addAfterSelected({})}
                onChange={(patch) => setupState.changeQuestion(selected.question._key, patch)} />
      <Wording canAsk={selected.kind === "ask" || selected.kind === "say"} state={wording[selected.id]}
               onAsk={() => suggestWording(selected)} onPick={(option) => setupState.changeQuestion(selected.question._key, { ask: option })} />
    </>
  ) : null;

  const iconButton = "max-sm:size-9";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-[58px] shrink-0 items-center gap-1.5 border-b border-line bg-white px-2 sm:gap-2 sm:px-4">
        <button type="button" onClick={onBack} aria-label="Back to drafts" title="Back to drafts"
                className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-fill hover:text-ink">
          <ChevronLeft aria-hidden="true" className="size-[18px]" strokeWidth={2} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col sm:max-w-80 sm:flex-none sm:basis-80">
          <input aria-label="Flow name" value={name} onChange={(event) => setName(event.target.value)}
                 placeholder="Untitled flow"
                 className="-ml-1.5 w-full min-w-0 truncate rounded-lg border-0 bg-transparent px-1.5 py-[3px] text-[15px] font-semibold text-ink
                            placeholder:text-faint hover:bg-canvas focus:bg-fill focus:outline-none" />
          <SaveStatus setupState={setupState} flow={flow} onDiscard={() => setConfirming({ kind: "discard" })} />
        </div>
        <div className="hidden flex-1 sm:block" />
        <Button variant="ghost" size="icon" icon={Undo2} disabled={!setupState.canUndo} onClick={setupState.undo}
                aria-label="Undo" title="Undo (Ctrl+Z)" className={cn("max-sm:hidden", iconButton)} />
        <Button variant="ghost" size="icon" icon={Redo2} disabled={!setupState.canRedo} onClick={setupState.redo}
                aria-label="Redo" title="Redo (Ctrl+Shift+Z)" className={cn("max-sm:hidden", iconButton)} />
        <Button variant="ghost" size="icon" icon={History} onClick={() => setVersions(true)}
                aria-label="Versions" title="Published versions" className={iconButton} />
        {/* On a phone the actions are icons of one size; with room they say what they do */}
        <Button variant="ghost" icon={Settings2} onClick={() => setSettings(true)} aria-label="Call settings" title="Call settings"
                className="max-sm:w-10 max-sm:justify-center max-sm:px-0">
          <span className="hidden sm:inline">Settings</span>
        </Button>
        <Button variant="secondary" icon={Phone} disabled={saving} onClick={() => guarded(onTest)} aria-label="Test call" title="Test call"
                className="max-sm:w-10 max-sm:justify-center max-sm:px-0">
          <span className="hidden sm:inline">Test call</span>
        </Button>
        <Button variant="primary" icon={Upload} onClick={() => guarded(onPublish)} aria-label="Publish" title="Publish"
                className="max-sm:w-10 max-sm:justify-center max-sm:px-0">
          <span className="hidden sm:inline">{flow.status !== "Draft" && flow.unpublished_changes ? "Publish changes" : "Publish"}</span>
        </Button>
      </header>

      {conflict && (
        <div role="alert" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-bad-soft px-4 py-2.5 text-[13px] text-ink">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-bad" strokeWidth={2} />
          <span className="min-w-0 flex-1">
            This flow was saved in another tab or window. Pick which version to keep; the other one is lost.
          </span>
          <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => setupState.reload(conflict)}>Use the other version</Button>
          <Button size="sm" variant="primary" onClick={setupState.keepMine}>Keep this one</Button>
        </div>
      )}

      <Toolbar onGrab={grab} suggesting={setupState.suggesting} />

      <section className="relative flex min-h-0 flex-1 bg-white">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <Canvas ref={canvas} nodes={nodes} details={details} selectedId={editable ? selectedId : selectedId} activeId={activeId}
                  tries={Number(form.tries_per_question) || 3} probe={ghost ? { x: ghost.x, y: ghost.y } : null}
                  trashRef={trash} empty={questions.length === 0}
                  onSelect={select} onDeselect={() => setCardOpen(false)} onTrash={setTrashLit}
                  onPlace={(id, x, y) => setupState.placeNode(id, x, y)}
                  onRelocate={(key, to, x, y) => setupState.relocate(key, to, x, y)}
                  onDelete={(key) => { const question = byKey(key); if (question) remove(question); }}
                  onInsertHere={(index, middle) => addAt(index, {}, middle)} />

          {/* What is wrong, and Listen: floating over the canvas so it keeps all the room */}
          <div className="pointer-events-none absolute top-3 right-3 left-3 flex items-start gap-2">
            <button type="button" onClick={() => setIssuesOpen(!issuesOpen)} aria-expanded={issuesOpen}
                    className={cn("pointer-events-auto flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold shadow-card transition-colors",
                                  issues.length ? "bg-warn-soft text-warn hover:brightness-95" : "bg-good-soft text-good")}>
              <span className={cn("size-1.5 rounded-full", issues.length ? "bg-amber" : "bg-live")} />
              {issues.length ? `${issues.length} ${issues.length === 1 ? "issue" : "issues"}` : (
                <><span className="max-sm:hidden">Ready to test</span><span className="sm:hidden">Ready</span></>
              )}
            </button>
            <Menu label="Tidy up the layout" align="left" className="w-60"
                  buttonClassName="pointer-events-auto flex h-9 items-center gap-1.5 rounded-full border border-line bg-white px-3.5 text-[13px] font-semibold text-ink shadow-card transition-all hover:-translate-y-px hover:shadow-[0_6px_14px_rgb(17_17_20/0.1)]"
                  trigger={<><LayoutGrid aria-hidden="true" className="size-4 text-muted" strokeWidth={2} /><span className="max-sm:hidden">Tidy</span><ChevronDown aria-hidden="true" className="size-3.5 text-faint" strokeWidth={2.4} /></>}>
              {Object.entries(TIDY).map(([mode, info]) => (
                <button key={mode} type="button" onClick={() => { setupState.tidyUp(mode); setTimeout(() => canvas.current?.fit(), 60); }}
                        className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-fill">
                  <span className="grid size-8 place-items-center rounded-lg bg-fill text-body">
                    {mode === "vertical" ? <AlignVerticalDistributeCenter aria-hidden="true" className="size-4" strokeWidth={2} />
                      : mode === "horizontal" ? <AlignHorizontalDistributeCenter aria-hidden="true" className="size-4" strokeWidth={2} />
                        : <LayoutGrid aria-hidden="true" className="size-4" strokeWidth={2} />}
                  </span>
                  <span>
                    <span className="block text-[13px] font-semibold text-ink">{info.label}</span>
                    <span className="block text-xs text-muted">{info.hint}</span>
                  </span>
                </button>
              ))}
            </Menu>
            <button ref={trash} type="button" disabled={!selected?.question && !trashLit}
                    onClick={() => selected?.question && remove(selected.question)}
                    title="Drop a step here to delete it, or press to delete the selected one"
                    className={cn("pointer-events-auto flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold shadow-card transition-all duration-150",
                                  trashLit ? "scale-110 bg-bad text-white shadow-[0_8px_18px_rgb(196_55_43/0.4)]"
                                    : "border border-line bg-white text-bad hover:-translate-y-px hover:bg-bad-soft disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-white")}>
              <Trash2 aria-hidden="true" className={cn("size-4", trashLit && "motion-safe:animate-bounce")} strokeWidth={2.1} />
              <span className={cn(!trashLit && "max-sm:hidden")}>{trashLit ? "Let go to delete" : "Delete"}</span>
            </button>
            <span className="flex-1" />
            {selected && cardOpen && minimized && (
              <button type="button" onClick={() => setMinimized(false)}
                      aria-label={`Open the editor for ${selected.title}`}
                      className="pointer-events-auto flex h-9 items-center gap-2 rounded-full border border-line bg-white px-3.5 text-[13px] font-semibold text-ink shadow-card hover:bg-hover">
                <PanelRightOpen aria-hidden="true" className="size-4 text-muted" strokeWidth={2} /><span className="max-sm:hidden">Editing {selected.title}</span>
              </button>
            )}
            <div className="pointer-events-auto flex shrink-0 items-center gap-2 rounded-full border border-line bg-white py-1 pr-3 pl-1 shadow-card sm:gap-2.5 sm:pr-3.5">
              <button type="button" onClick={listen} aria-label={listening ? "Stop listening" : "Listen to the whole call"}
                      className="grid size-7 place-items-center rounded-full bg-ink text-white transition-colors hover:bg-brand">
                {listening ? <Pause aria-hidden="true" className="size-3" fill="currentColor" /> : <Play aria-hidden="true" className="size-3" fill="currentColor" />}
              </button>
              <span className="text-[13px] font-semibold">Listen</span>
              <span title={tooLong ? "Longer than the time it wraps up after" : "A rough guess at how long the call takes"}
                    className={cn("font-mono text-xs whitespace-nowrap max-sm:hidden", tooLong ? "text-warn" : "text-faint")}>
                {clock(elapsed)} / ≈{clock(total)}
              </span>
            </div>
          </div>

          {issuesOpen && (
            <>
              <button type="button" aria-label="Close the list of issues" className="absolute inset-0 z-20 cursor-default" onClick={() => setIssuesOpen(false)} />
              <div role="region" aria-label="Issues" className="absolute top-14 left-3 z-30 w-[min(360px,calc(100%-24px))] rounded-2xl border border-line bg-white p-1.5 shadow-float">
                {issues.length === 0 ? (
                  <p className="px-3 py-3 text-[13px] text-muted">Nothing is in the way. It can be tried or published.</p>
                ) : issues.map((issue, at) => (
                  <button key={`${issue.id}-${at}`} type="button"
                          onClick={() => { setIssuesOpen(false); if (issue.id) { select(issue.id); canvas.current?.focus(issue.id); } }}
                          className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-ink hover:bg-fill">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber" />
                    {issue.text}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* The editor for the selected step: docked beside the canvas, a sheet from the bottom on a phone */}
        {editable && !minimized && (
          <aside aria-label="Edit the selected step"
                 className="z-30 flex w-[380px] shrink-0 flex-col border-l border-line bg-white max-sm:fixed max-sm:inset-x-2 max-sm:bottom-[60px] max-sm:max-h-[58dvh] max-sm:w-auto max-sm:rounded-3xl max-sm:border max-sm:shadow-float">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{selected.title}</span>
              <button type="button" onClick={() => setMinimized(true)} aria-label="Minimise the editor" title="Minimise"
                      className="grid size-8 place-items-center rounded-lg text-muted hover:bg-fill hover:text-ink">
                <PanelRightClose aria-hidden="true" className="size-4" strokeWidth={2} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-[18px]">{card}</div>
          </aside>
        )}
      </section>

      {ghost && (
        <div aria-hidden="true" style={{ left: ghost.x, top: ghost.y }}
             className="pointer-events-none fixed z-[70] -translate-x-5 -translate-y-1/2">
          <div className="flex rotate-[-4deg] scale-105 items-center gap-2 rounded-2xl bg-white py-1.5 pr-3.5 pl-1.5 text-[13px] font-semibold text-ink shadow-[0_18px_36px_rgb(17_17_20/0.22)] ring-2 ring-brand/40">
            <span className={cn("grid size-[30px] place-items-center rounded-xl", ghost.tint.tile)}>
              <ghost.block.icon aria-hidden="true" className="size-[17px]" strokeWidth={2.1} />
            </span>
            {ghost.block.label}
          </div>
          <span className="mt-2 ml-1 inline-block rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-white shadow-lg">{caption}</span>
        </div>
      )}

      {confirming?.kind === "remove" && (
        <ConfirmDialog title="Remove this step?" confirm="Remove" danger onClose={() => setConfirming(null)}
                       onConfirm={() => remove(confirming.question, true)}>
          {confirming.dependents.length === 1 ? "One step is" : `${confirming.dependents.length} steps are`} only
          run after this one ({confirming.dependents.map((one) => humanize(one.save_as) || "unnamed").join(", ")}).
          Once it is gone, {confirming.dependents.length === 1 ? "that one runs" : "they run"} on every call.
        </ConfirmDialog>
      )}
      {confirming?.kind === "discard" && (
        <ConfirmDialog title="Discard unpublished changes?" confirm="Discard changes" danger onClose={() => setConfirming(null)}
                       onConfirm={setupState.discard}>
          The flow goes back to what was last published. Everything changed since then is lost.
        </ConfirmDialog>
      )}
      {versions && <VersionsDialog flow={flow} onClose={() => setVersions(false)} onRestore={setupState.restore} />}

      <SettingsDrawer open={settings} onClose={() => setSettings(false)} form={form} set={set} voices={voices}
                      hearing={hearing(OPEN)} onHear={() => hear(steps[0])} />
    </div>
  );
}
