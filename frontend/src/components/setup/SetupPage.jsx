import { ChevronLeft, ChevronRight, CircleAlert, ListPlus, Phone, Plus, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../lib/api.js";
import { Player, audioContext } from "../../lib/audio.js";
import { cn } from "../../lib/cn.js";
import { EMPTY, blankQuestion, collect, normalise, problems, toForm } from "../../lib/setupForm.js";
import { TopBarActions } from "../layout/TopBarSlot.jsx";
import { Button } from "../ui/Button.jsx";
import { IconTile } from "../ui/Card.jsx";
import { useToast } from "../ui/Toasts.jsx";
import { QuestionCard } from "./QuestionCard.jsx";
import { SECTIONS } from "./sectionList.js";
import {
  BusinessSection, FlowSection, KnowledgeSection, PersonalitySection, SetupSection, VoiceSection,
} from "./sections.jsx";

/** Everything a business decides, and nothing else, one section at a time. Nothing is written until Save. */
export function SetupPage({ active, saved, onSaved, onCall }) {
  const toast = useToast();
  const [form, setForm] = useState(() => toForm(saved));
  const [voices, setVoices] = useState([]);
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [current, setCurrent] = useState(SECTIONS[0].id);   // the one section on screen
  const [openQuestion, setOpenQuestion] = useState(null);    // the one question opened for editing
  const sample = useRef(null);                  // the sample playing, so a second click stops it

  const set = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  const setup = useMemo(() => collect(form), [form]);
  const unsaved = useMemo(() => JSON.stringify(setup) !== JSON.stringify(normalise(saved)), [setup, saved]);

  useEffect(() => {
    api.voices().then(({ voices: found }) => setVoices(found || [])).catch(() => setVoices([]));
  }, []);

  // Armed Reset gives up after a few seconds: a click meant for something else shouldn't stay armed.
  useEffect(() => {
    if (!resetArmed) return;
    const timer = setTimeout(() => setResetArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [resetArmed]);

  useEffect(() => () => sample.current?.abort(), []);

  async function save() {
    const found = problems(setup);
    setProblem(found[0] || "");
    if (found.length) { toast(found[0], "bad"); return null; }
    setSaving(true);
    try {
      const stored = await api.saveSetup(setup);
      setResetArmed(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
      onSaved(stored);
      return stored;
    } catch (failure) {
      toast(failure.message, "bad");
      return null;
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    if (JSON.stringify(setup) === JSON.stringify(normalise(EMPTY))) {
      setResetArmed(false);
      toast("The form is already empty.");
      return;
    }
    // Clearing throws away everything on screen in one click, so it asks first, on the button itself.
    if (!resetArmed) { setResetArmed(true); return; }
    setResetArmed(false);
    // Only the form is cleared. The setup on disk, and any call started meanwhile, are untouched until Save.
    setForm(toForm(EMPTY));
    setProblem("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast("Cleared. Fill it in and save.");
  }

  async function suggest() {
    if (!setup.purpose.trim()) { toast("Say why it is calling first.", "bad"); return; }
    setSuggesting(true);
    try {
      const { questions: found, notices } = await api.suggestQuestions(setup);
      setForm((current) => ({
        ...current,
        questions: [...current.questions,
                    ...found.map((question) => ({ ...blankQuestion(), ...question, only_if: "", only_if_is: [] }))],
      }));
      toast(`Added ${found.length}. Edit or remove any of them.`);
      (notices || []).forEach((notice) => toast(notice));
    } catch (failure) {
      toast(failure.message, "bad");
    } finally {
      setSuggesting(false);
    }
  }

  async function hear() {
    if (sample.current) { sample.current.abort(); return; }
    const text = `Hi, this is ${setup.assistant_name || "your assistant"} from ${setup.business_name || "us"}. `
      + "Is now a good time for a quick chat?";
    const player = new Player(await audioContext());
    const controller = new AbortController();
    sample.current = controller;
    setHearing(true);
    try {
      const head = await api.turn({
        url: "/api/hear", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setup, text }), signal: controller.signal,
        onAudio: (bytes) => player.push(bytes),
      });
      if (!head?.audioBytes) toast("No audio came back. The speech service may be out of credit.", "bad");
      while (player.secondsLeft() > 0 && !controller.signal.aborted) await new Promise((r) => setTimeout(r, 100));
    } catch (failure) {
      if (failure.name !== "AbortError") toast(failure.message, "bad");
    } finally {
      player.stop();
      sample.current = null;
      setHearing(false);
    }
  }

  // ── questions ────────────────────────────────────────────────────────────
  const setQuestions = (change) => setForm((current) => ({ ...current, questions: change(current.questions) }));
  const addQuestion = () => {
    const question = blankQuestion();
    setQuestions((all) => [...all, question]);
    setOpenQuestion(question._key);
  };
  const changeQuestion = (at, patch) => setQuestions((all) => all.map((q, i) => (i === at ? { ...q, ...patch } : q)));
  const removeQuestion = (at) => setQuestions((all) => all.filter((_, i) => i !== at));
  const moveQuestion = (at, by) => setQuestions((all) => {
    const next = [...all];
    [next[at], next[at + by]] = [next[at + by], next[at]];
    return next;
  });

  // Showing another section starts it from the top, as turning a page would.
  const show = (id) => {
    setCurrent(id);
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const at = SECTIONS.findIndex(({ id }) => id === current);
  const [previous, next] = [SECTIONS[at - 1], SECTIONS[at + 1]];

  const panes = {
    business: <BusinessSection form={form} set={set} />,
    personality: <PersonalitySection form={form} set={set} />,
    voice: <VoiceSection form={form} set={set} voices={voices} hearing={hearing} onHear={hear} />,
    knowledge: <KnowledgeSection form={form} set={set} />,
    flow: <FlowSection form={form} set={set} />,
    questions: (
      <SetupSection
        id="questions"
        actions={
          <>
            <Button variant="tinted" size="sm" icon={Sparkles} onClick={suggest} disabled={suggesting}>
              {suggesting ? "Thinking…" : "Suggest"}
            </Button>
            <Button variant="primary" size="sm" icon={Plus} onClick={addQuestion}>Add</Button>
          </>
        }
      >
        {form.questions.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-edge px-6 py-12 text-center">
            <ListPlus aria-hidden="true" className="size-5 text-muted" strokeWidth={1.5} />
            <p className="mt-3 text-[14px] font-medium text-ink">No questions yet</p>
            <p className="mt-1 text-[13px] text-muted">Add one, or let the AI suggest some from your purpose.</p>
          </div>
        ) : (
          <ol className="divide-y divide-line overflow-hidden rounded-lg border border-line">
            {form.questions.map((question, index) => (
              <QuestionCard key={question._key} question={question} index={index} questions={form.questions}
                            open={openQuestion === question._key}
                            onToggle={() => setOpenQuestion(openQuestion === question._key ? null : question._key)}
                            onChange={(patch) => changeQuestion(index, patch)}
                            onRemove={() => removeQuestion(index)} onMove={(by) => moveQuestion(index, by)} />
            ))}
          </ol>
        )}
        <p className="text-[13px] leading-relaxed text-muted">
          Each answer is checked against its rule. One that breaks it isn't saved, and the assistant asks again.
        </p>
      </SetupSection>
    ),
  };

  return (
    <>
      {active && <TopBarActions>
        <span aria-live="polite" className="hidden text-xs font-medium xl:block">
          {justSaved ? <span className="text-good">Saved</span>
            : unsaved ? <span className="flex items-center gap-1.5 text-muted">
                <span className="size-1.5 rounded-full bg-warn" />Unsaved changes</span>
            : null}
        </span>
        <Button variant={resetArmed ? "danger" : "ghost"} icon={RotateCcw} onClick={reset}
                title="Empty every field and start a new setup" aria-label={resetArmed ? "Clear everything?" : "Reset"}
                className={resetArmed ? undefined : "max-xl:px-2.5"}>
          <span className={resetArmed ? "hidden sm:inline" : "hidden xl:inline"}>
            {resetArmed ? "Clear everything?" : "Reset"}
          </span>
        </Button>
        <Button variant="secondary" onClick={save} disabled={saving}>
          {/* Where there's no room to say so in words, a dot on Save marks unsaved changes */}
          {unsaved && !justSaved && <span aria-hidden="true" className="size-1.5 rounded-full bg-warn xl:hidden" />}
          Save
        </Button>
        <Button variant="primary" icon={Phone} disabled={saving}
                onClick={async () => { if (await save()) onCall(); }}>
          <span className="hidden sm:inline">Save and call</span>
          <span className="sm:hidden">Call</span>
        </Button>
      </TopBarActions>}

      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <Identity form={form} />
            <SectionList current={current} onShow={show} questions={form.questions.length} />
          </div>
        </aside>

        <div className="flex max-w-[720px] min-w-0 flex-col gap-6">
          <SectionChips current={current} onShow={show} />

          {problem && (
            <div role="alert" className="flex items-start gap-3 rounded-lg border border-bad/20 bg-bad-soft px-4 py-3 text-sm text-ink">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-bad" strokeWidth={2} />
              <span>{problem}</span>
            </div>
          )}

          {panes[current]}

          {/* Walk through the sections in order, like the pages of a set-up assistant */}
          <div className="flex items-center justify-between gap-3">
            {previous ? (
              <Button variant="ghost" onClick={() => show(previous.id)}>
                <ChevronLeft aria-hidden="true" className="-ml-1 size-4" strokeWidth={2} />{previous.label}
              </Button>
            ) : <span />}
            {next && (
              <Button variant="secondary" onClick={() => show(next.id)}>
                {next.label}<ChevronRight aria-hidden="true" className="-mr-1 size-4" strokeWidth={2} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** Whose setup this is, above the section list, as the Settings app shows your account above its own. */
function Identity({ form }) {
  const name = form.assistant_name.trim();
  return (
    <div className="mb-5 flex items-center gap-3 border-b border-line px-2.5 pb-5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-[14px] font-medium text-white">
        {(name[0] || "A").toUpperCase()}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold text-ink">{name || "Unnamed assistant"}</p>
        <p className="truncate text-[13px] text-muted">{form.business_name.trim() || "Your business"}</p>
      </div>
    </div>
  );
}

/** The sections as a list beside the pane on wide screens, like the side of a Settings window. */
function SectionList({ current, onShow, questions }) {
  return (
    <nav aria-label="Setup sections">
      <ul className="flex flex-col gap-0.5">
        {SECTIONS.map(({ id, label, icon, tone }) => {
          const here = current === id;
          return (
            <li key={id}>
              <button type="button" onClick={() => onShow(id)} aria-current={here ? "page" : undefined}
                      className={cn("flex h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-[14px] transition-colors",
                                    here ? "bg-white font-medium text-ink shadow-[0_0_0_1px_var(--color-line),0_1px_2px_rgb(0_0_0/0.04)]"
                                      : "text-body hover:bg-black/[0.03] hover:text-ink")}>
                <IconTile icon={icon} tone={tone} size="sm" />
                <span className="flex-1 truncate">{label}</span>
                {id === "questions" && <span className="text-[12px] text-muted tabular-nums">{questions}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The sections as a row of chips on small screens, scrolling sideways. */
function SectionChips({ current, onShow }) {
  const bar = useRef(null);

  // Keep the chip for the section on screen in view, without moving the page itself.
  useEffect(() => {
    const chip = bar.current?.querySelector(`[data-id="${current}"]`);
    if (!chip || !bar.current) return;
    bar.current.scrollTo({ left: chip.offsetLeft - (bar.current.clientWidth - chip.clientWidth) / 2, behavior: "smooth" });
  }, [current]);

  return (
    <nav aria-label="Setup sections" className="-mx-4 sm:-mx-6 lg:hidden">
      <ul ref={bar} className="no-scrollbar flex gap-2 overflow-x-auto px-4 sm:px-6">
        {SECTIONS.map(({ id, label }) => (
          <li key={id} data-id={id} className="shrink-0">
            <button type="button" onClick={() => onShow(id)} aria-current={current === id ? "page" : undefined}
                    className={cn("flex h-8 items-center rounded-md px-3 text-[13px] font-medium transition-colors",
                                  current === id ? "bg-brand text-white" : "border border-line bg-white text-body")}>
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
