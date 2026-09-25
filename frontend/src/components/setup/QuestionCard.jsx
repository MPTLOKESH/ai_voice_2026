import { ArrowDown, ArrowUp, ChevronDown, GitBranch, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/cn.js";
import { TYPES, commas } from "../../lib/setupForm.js";
import { Field, Select, TextInput, Toggle } from "../ui/fields.jsx";

const typeLabel = (name) => name.replace("_", " / ");
const TYPE_OPTIONS = TYPES.map((name) => [name, typeLabel(name)]);

const IconButton = ({ label, icon: Icon, danger, ...props }) => (
  <button type="button" aria-label={label} title={label}
          className={"grid size-8 place-items-center rounded-md text-muted transition-colors disabled:opacity-30 "
                     + (danger ? "hover:bg-bad-soft hover:text-bad" : "hover:bg-black/[0.05] hover:text-ink")}
          {...props}>
    <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
  </button>
);

/**
 * One question. Closed, it's a single quiet row saying what's asked; open, it shows everything about it:
 * how it's asked, what it's saved as, and what makes an answer acceptable. Only one is open at a time.
 */
export function QuestionCard({ question, index, questions, open, onToggle, onChange, onRemove, onMove }) {
  const [conditionOpen, setConditionOpen] = useState(false);
  // Only a question above this one can decide it, so nothing ever waits on something asked later.
  const earlier = questions.slice(0, index).map((other) => other.save_as).filter(Boolean);
  const names = [...new Set([...earlier, question.only_if].filter(Boolean))];
  const parent = questions.find((other) => other.save_as === question.only_if);
  const answerHint = parent?.type === "yes_no" ? "no" : parent?.type === "choice" ? (parent.options || []).join(", ") : "";
  const about = [typeLabel(question.type), question.only_if && `only if ${question.only_if.replace(/_/g, " ")}`]
    .filter(Boolean).join(" · ");

  return (
    <li className={cn("transition-colors", open ? "bg-canvas" : "bg-white hover:bg-canvas")}>
      <button type="button" onClick={onToggle} aria-expanded={open}
              className="flex w-full items-center gap-4 px-4 py-3.5 text-left sm:px-5">
        <span className={cn("grid size-6 shrink-0 place-items-center rounded-md text-[12px] font-medium tabular-nums",
                            open ? "bg-brand text-white" : "bg-brand-soft text-brand-ink")}>
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[14px] font-medium", question.ask ? "text-ink" : "text-muted")}>
            {question.ask || "New question"}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-muted">{about}</span>
        </span>
        <ChevronDown aria-hidden="true" strokeWidth={2}
                     className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="flex flex-col gap-6 px-4 pt-2 pb-4 sm:pr-5 sm:pl-14">
          <Field label="Question, as it is spoken">
            <TextInput value={question.ask} onChange={(e) => onChange({ ask: e.target.value })}
                       placeholder="How many people are coming?" />
          </Field>

          <div className="grid gap-6 sm:grid-cols-2 sm:gap-4">
            <Field label="Saved as">
              <TextInput className="font-mono text-[14px]" value={question.save_as}
                         onChange={(e) => onChange({ save_as: e.target.value })} placeholder="party_size" />
            </Field>
            <Field label="Answer">
              <Select options={TYPE_OPTIONS} value={question.type} onChange={(e) => onChange({ type: e.target.value })} />
            </Field>
          </div>

          {question.type === "choice" && (
            <Field label="Options" hint="Separated by commas.">
              <TextInput value={question._optionsText ?? (question.options || []).join(", ")}
                         onChange={(e) => onChange({ _optionsText: e.target.value, options: commas(e.target.value) })}
                         placeholder="inside, outside" />
            </Field>
          )}

          <Field label="Rule for an acceptable answer">
            <TextInput value={question.rule || ""} onChange={(e) => onChange({ rule: e.target.value })}
                       placeholder="Between 1 and 20 people. We are closed on Mondays." />
          </Field>

          <Toggle label="Required" checked={question.required !== false} onChange={(on) => onChange({ required: on })} />

          {/* Most questions are always asked, so the condition stays folded away until it's wanted */}
          {names.length > 0 && !question.only_if && !conditionOpen && (
            <button type="button" onClick={() => setConditionOpen(true)}
                    className="flex h-8 items-center gap-2 self-start rounded-md border border-edge bg-white px-3 text-[13px] font-medium text-body transition-colors hover:bg-hover hover:text-ink">
              <GitBranch aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              Only ask if…
            </button>
          )}

          {names.length > 0 && (question.only_if || conditionOpen) && (
            <div className="grid gap-4 rounded-lg border border-line bg-white p-4 sm:grid-cols-2">
              <Field label="Ask it">
                <Select options={[["", "Always"], ...names.map((name) => [name, `When ${name} is…`])]}
                        value={question.only_if || ""} onChange={(e) => onChange({ only_if: e.target.value })} />
              </Field>
              {question.only_if && (
                <Field label="…any of these answers">
                  <TextInput value={question._onlyIfIsText ?? (question.only_if_is || []).join(", ")}
                             onChange={(e) => onChange({ _onlyIfIsText: e.target.value, only_if_is: commas(e.target.value) })}
                             placeholder={answerHint} />
                </Field>
              )}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-line pt-3">
            <div className="flex items-center gap-1">
              <IconButton label="Move up" icon={ArrowUp} disabled={index === 0} onClick={() => onMove(-1)} />
              <IconButton label="Move down" icon={ArrowDown} disabled={index === questions.length - 1}
                          onClick={() => onMove(1)} />
            </div>
            <button type="button" onClick={onRemove}
                    className="flex h-8 items-center gap-2 rounded-md px-3 text-[13px] font-medium text-bad transition-colors hover:bg-bad-soft">
              <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Remove
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
