import { ArrowLeft, ArrowRight, CopyPlus, GitBranch, Minus, Play, Plus, Square, Trash2, X } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/cn.js";
import { OPTIONS, TYPES, commas } from "../../lib/setupForm.js";
import { orb } from "../../lib/thread.js";
import { Pills, Select, TextInput } from "../ui/fields.jsx";

const ANSWER_TYPES = [["text", "Text"], ["number", "Number"], ["date", "Date"], ["time", "Time"],
                      ["yes_no", "Yes / No"], ["choice", "Choice"]];
const TRIES = [1, 2, 3, 4, 5].map((n) => [String(n), String(n)]);

const IconButton = ({ label, icon: Icon, danger, ...props }) => (
  <button type="button" aria-label={label} title={label}
          className={cn("grid size-[30px] place-items-center rounded-[10px] text-[#a3a3ad] transition-colors disabled:opacity-30",
                        danger ? "hover:bg-bad-soft hover:text-bad" : "hover:bg-fill hover:text-ink")}
          {...props}>
    <Icon aria-hidden="true" className="size-[15px]" strokeWidth={2} />
  </button>
);

/** The big soft box every card begins with: what the step says, in the size it will be read. */
const hasKeyboard = () => window.matchMedia?.("(pointer: fine)").matches;

const Say = ({ value, onChange, placeholder, rows = 3 }) => (
  <textarea autoFocus={hasKeyboard()} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={rows}
            className="block w-full resize-none rounded-2xl bg-canvas px-4 py-3.5 text-[17px] leading-normal text-ink
                       placeholder:text-faint focus:bg-[#f3f0ff] focus:ring-2 focus:ring-brand focus:outline-none" />
);

const Label = ({ children }) => <span className="text-[13px] text-muted">{children}</span>;

/** Who is speaking: an orb in the voice's own colours, and the voice to pick. One voice speaks the whole call. */
function VoiceChip({ form, voices, set }) {
  const known = voices.some((voice) => voice.id === form.voice_id);
  const options = [["", "Default voice"], ...voices.map((voice) => [voice.id, voice.name]),
                   ...(form.voice_id && !known ? [[form.voice_id, `Voice ${form.voice_id}`]] : [])];
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-canvas py-1 pr-2 pl-1">
      <span aria-hidden="true" className="size-[26px] shrink-0 rounded-full" style={{ background: orb(form.voice_id || "default") }} />
      <select aria-label="Voice" value={form.voice_id} onChange={(event) => set("voice_id", event.target.value)}
              className="max-w-[150px] cursor-pointer border-0 bg-transparent text-[13px] font-semibold text-ink">
        {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
  );
}

const HearButton = ({ hearing, onClick }) => (
  <button type="button" onClick={onClick}
          className="flex items-center gap-1.5 rounded-full bg-brand px-[18px] py-[11px] text-sm font-semibold whitespace-nowrap text-white transition-colors hover:bg-brand-hover">
    {hearing ? <Square aria-hidden="true" className="size-3.5" fill="currentColor" /> : <Play aria-hidden="true" className="size-3.5" fill="currentColor" />}
    {hearing ? "Stop" : "Hear it"}
  </button>
);

/** Head of every card: what this step is, then remove and close. */
function Head({ kicker, onRemove, onClose }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-[13px] font-medium text-faint">{kicker}</span>
      <span className="flex-1" />
      {onRemove && <IconButton label="Remove this question" icon={Trash2} danger onClick={onRemove} />}
      <IconButton label="Close" icon={X} onClick={onClose} />
    </div>
  );
}

/**
 * The editor under a selected step. Each kind of step asks for just what it is: the greeting for why it is
 * calling, a question for its wording, an answer for what counts, the close for how it ends.
 */
export function StepCard({ step, form, set, voices, questions, hearing, onHear, onClose, onRemove, onMove, onChange, onDuplicate, onAddAfter }) {

  if (step.kind === "open") {
    return (
      <>
        <Head kicker="The AI opens with…" onClose={onClose} />
        <Say value={form.purpose} onChange={(value) => set("purpose", value)}
             placeholder="Why is it calling? e.g. “Call customers to confirm their table booking”" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <VoiceChip form={form} voices={voices} set={set} />
          <span className="flex-1" />
          <HearButton hearing={hearing} onClick={onHear} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Label>Says it’s an AI</Label>
          <Pills label="When it says it is an AI" options={OPTIONS.ai_disclosure.map(([value, text]) => [value, value === "at_start" ? "In the greeting" : text])}
                 value={form.ai_disclosure} onChange={(value) => set("ai_disclosure", value)} />
        </div>
      </>
    );
  }

  if (step.kind === "close") {
    const minutes = Number(form.max_minutes || 4);
    const bump = (by) => set("max_minutes", String(Math.min(30, Math.max(1, minutes + by))));
    return (
      <>
        <Head kicker="To finish…" onClose={onClose} />
        <div className="flex flex-wrap items-center gap-2">
          <Label>Read the answers back</Label>
          <Pills label="Read the answers back" options={[["on", "Yes"], ["off", "No"]]}
                 value={form.confirm_at_end ? "on" : "off"} onChange={(value) => set("confirm_at_end", value === "on")} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Label>Wrap up after</Label>
          <div className="flex items-center gap-1 rounded-full border border-edge p-0.5">
            <button type="button" aria-label="Shorter" onClick={() => bump(-0.5)}
                    className="grid size-7 place-items-center rounded-full text-muted hover:bg-fill hover:text-ink">
              <Minus aria-hidden="true" className="size-3.5" strokeWidth={2.4} />
            </button>
            <span className="min-w-14 text-center font-mono text-[13px] font-semibold text-ink">{minutes} min</span>
            <button type="button" aria-label="Longer" onClick={() => bump(0.5)}
                    className="grid size-7 place-items-center rounded-full text-muted hover:bg-fill hover:text-ink">
              <Plus aria-hidden="true" className="size-3.5" strokeWidth={2.4} />
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-faint">
          It thanks them and ends the call, or sooner if every answer is in. More about how a call runs is in Settings.
        </p>
      </>
    );
  }

  const { question, index } = step;
  // Only a question asked above can be waited on.
  const earlier = questions.slice(0, index).filter((other) => (other.kind || "ask") === "ask").map((other) => other.save_as).filter(Boolean);
  const names = [...new Set([...earlier, question.only_if].filter(Boolean))];

  /** Move, duplicate, add another after it: along the bottom of every step that is in the line. */
  const Along = (
    <div className="mt-3 flex items-center gap-1 border-t border-line pt-3">
      <IconButton label="Earlier" icon={ArrowLeft} disabled={index === 0} onClick={() => onMove(index - 1)} />
      <IconButton label="Later" icon={ArrowRight} disabled={index === questions.length - 1} onClick={() => onMove(index + 2)} />
      <IconButton label="Duplicate" icon={CopyPlus} onClick={onDuplicate} />
      <IconButton label="Add a question after this" icon={Plus} onClick={onAddAfter} />
      <span className="ml-1 text-xs text-faint">Step {index + 1} of {questions.length}. Drag a tile to move it.</span>
    </div>
  );

  if (step.kind === "say") {
    return (
      <>
        <Head kicker="The AI tells them…" onRemove={onRemove} onClose={onClose} />
        <Say value={question.ask} onChange={(value) => onChange({ ask: value })} rows={3}
             placeholder="What should it say? e.g. “Just so you know, a receipt will be emailed to you.”" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <VoiceChip form={form} voices={voices} set={set} />
          <span className="flex-1" />
          <HearButton hearing={hearing} onClick={onHear} />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-faint">
          Said in its own words, just before the next question. It doesn’t wait for an answer.
        </p>
        <Condition question={question} names={names} questions={questions} onChange={onChange} label="Only say it if…" />
        {Along}
      </>
    );
  }

  if (step.kind === "end") {
    return (
      <>
        <Head kicker={question.handoff ? "The AI hands over…" : "The call ends…"} onRemove={onRemove} onClose={onClose} />
        <Condition question={question} names={names} questions={questions} onChange={onChange} mandatory
                   label={question.handoff ? "Hand over when…" : "End the call when…"} />
        <div className="mt-3">
          <Say value={question.ask} onChange={(value) => onChange({ ask: value })} rows={2}
               placeholder={question.handoff ? "What it says last. Leave empty and it will say someone will be in touch."
                 : "What it says last. Leave empty and it will write a goodbye."} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Label>Kind of ending</Label>
          <Pills label="Kind of ending" options={[["end", "End the call"], ["handoff", "Hand over to a person"]]}
                 value={question.handoff ? "handoff" : "end"} onChange={(value) => onChange({ handoff: value === "handoff" })} />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-faint">
          {question.handoff
            ? "The call is marked for a person to follow up. Nothing is dialled for you yet: it is recorded in the call."
            : "Questions after it are not asked, and don’t count against the call being complete."}
        </p>
        {Along}
      </>
    );
  }

  if (step.kind === "ask") {
    return (
      <>
        <Head kicker="The AI asks…" onRemove={onRemove} onClose={onClose} />
        <Say value={question.ask} onChange={(value) => onChange({ ask: value })}
             placeholder="What should it ask? e.g. “How many people are coming?”" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <VoiceChip form={form} voices={voices} set={set} />
          <span className="flex-1" />
          <HearButton hearing={hearing} onClick={onHear} />
        </div>
        <Condition question={question} names={names} questions={questions} onChange={onChange} label="Only ask if…" />
        {Along}
      </>
    );
  }

  // The customer's answer
  return (
    <>
      <Head kicker="The customer answers…" onRemove={onRemove} onClose={onClose} />
      <Say value={question.rule || ""} onChange={(value) => onChange({ rule: value })} rows={2}
           placeholder="What counts as a good answer? e.g. “Between 1 and 20 people. We are closed on Mondays.”" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Label>Answer is a</Label>
        <Pills label="Kind of answer" options={ANSWER_TYPES.filter(([type]) => TYPES.includes(type))} value={question.type}
               onChange={(type) => onChange({ type })} />
      </div>
      {question.type === "choice" && (
        <div className="mt-3 flex flex-col gap-1.5">
          <Label>Options, separated by commas</Label>
          <TextInput value={question._optionsText ?? (question.options || []).join(", ")} placeholder="inside, outside"
                     onChange={(event) => onChange({ _optionsText: event.target.value, options: commas(event.target.value) })} />
        </div>
      )}
      <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Saved as</Label>
          <TextInput className="font-mono text-[13px]" value={question.save_as} placeholder="party_size"
                     onChange={(event) => onChange({ save_as: event.target.value })} />
        </div>
        <Pills label="Required" options={[["yes", "Required"], ["no", "Optional"]]}
               value={question.required !== false ? "yes" : "no"} onChange={(value) => onChange({ required: value === "yes" })} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Label>If unclear, tries</Label>
        <Pills label="Tries per question" options={TRIES} value={String(Number(form.tries_per_question) || 3)}
               onChange={(value) => set("tries_per_question", value)} />
        <span className="text-xs text-faint">for every question</span>
      </div>
    </>
  );
}

/**
 * "Only if…": a step that waits on an earlier answer. `mandatory` is for an end, which without a condition
 * would end every call, so there is no "always".
 */
function Condition({ question, names, questions, onChange, label, mandatory = false }) {
  const [open, setOpen] = useState(false);
  const parent = questions.find((other) => other.save_as === question.only_if && (other.kind || "ask") === "ask");
  const hint = parent?.type === "yes_no" ? "no" : parent?.type === "choice" ? (parent.options || []).join(", ") : "";

  if (!names.length) {
    return mandatory
      ? <p className="mt-3 rounded-2xl bg-canvas px-3.5 py-3 text-[13px] text-muted">Add a question above it first: this waits on an answer.</p>
      : null;
  }
  if (!mandatory && !question.only_if && !open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
              className="mt-3 flex h-8 items-center gap-2 rounded-full border border-edge px-3.5 text-[13px] font-semibold text-body hover:bg-hover hover:text-ink">
        <GitBranch aria-hidden="true" className="size-3.5" strokeWidth={2} />{label}
      </button>
    );
  }
  return (
    <div className="mt-3 grid gap-3 rounded-2xl bg-canvas p-3.5 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label>{mandatory ? label.replace("…", "") : label.replace("…", "")}</Label>
        <Select aria-label="Question it waits on" options={[["", mandatory ? "Pick a question" : "Always"], ...names.map((name) => [name, `When ${name} is…`])]}
                value={question.only_if || ""} onChange={(event) => onChange({ only_if: event.target.value })} />
      </div>
      {question.only_if && (
        <div className="flex flex-col gap-1.5">
          <Label>…any of these answers</Label>
          <TextInput aria-label="Answers it waits for" value={question._onlyIfIsText ?? (question.only_if_is || []).join(", ")} placeholder={hint}
                     onChange={(event) => onChange({ _onlyIfIsText: event.target.value, only_if_is: commas(event.target.value) })} />
        </div>
      )}
    </div>
  );
}
