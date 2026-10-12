import { Play, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn.js";
import { OPTIONS } from "../../lib/setupForm.js";
import { Button } from "../ui/Button.jsx";
import { Choices, Field, Select, TextArea, TextInput, Toggle, UnitInput } from "../ui/fields.jsx";

const TABS = [["about", "About"], ["personality", "Personality"], ["voice", "Voice"], ["knowledge", "Knowledge"], ["pacing", "Pacing"]];

const Row = ({ children }) => <div className="grid gap-5 sm:grid-cols-2">{children}</div>;
const Switches = ({ children }) => <div className="divide-y divide-line rounded-2xl border border-line">{children}</div>;

// Each pane gets the form and `set(name, value)`, and draws its own fields.

function About({ form, set }) {
  return (
    <>
      <Row>
        <Field label="Business name">
          <TextInput value={form.business_name} onChange={(e) => set("business_name", e.target.value)} placeholder="The Blue Door" />
        </Field>
        <Field label="Assistant’s name">
          <TextInput value={form.assistant_name} onChange={(e) => set("assistant_name", e.target.value)} placeholder="Maya" />
        </Field>
      </Row>
      <Field label="Calling from" hint="Optional. Said as “Maya from The Blue Door, from …”">
        <TextInput value={form.calling_from} onChange={(e) => set("calling_from", e.target.value)} placeholder="the customer care team" />
      </Field>
      <Field label="Language">
        <TextInput value={form.language} onChange={(e) => set("language", e.target.value)} placeholder="English" />
      </Field>
    </>
  );
}

function Personality({ form, set }) {
  return (
    <>
      <Choices label="Tone" options={OPTIONS.tone} value={form.tone} onChange={(value) => set("tone", value)} />
      <Choices label="How much it says" options={OPTIONS.reply_length} value={form.reply_length}
               onChange={(value) => set("reply_length", value)} />
      <Choices label="Formality" options={OPTIONS.formality} value={form.formality}
               onChange={(value) => set("formality", value)} />
    </>
  );
}

function Voice({ form, set, voices, hearing, onHear }) {
  const known = voices.find((voice) => voice.id === form.voice_id);
  // A saved voice this account no longer lists still needs an option to show as chosen.
  const options = [["", "Default voice"], ...voices.map((voice) => [voice.id, voice.name]),
                   ...(form.voice_id && !known ? [[form.voice_id, `Voice ${form.voice_id}`]] : [])];
  const speed = Number(form.speaking_speed || 1);
  return (
    <>
      <Field label="Voice" hint={known?.about || (form.voice_id ? "" : "The one set in settings.py. Browse them all under Voices.")}>
        <Select options={options} value={form.voice_id} onChange={(e) => set("voice_id", e.target.value)} />
      </Field>
      <Field label="Speed" aside={<span className="font-mono text-xs font-medium text-ink">{speed.toFixed(2)}×</span>}>
        <div className="flex flex-col justify-center">
          <input type="range" min="0.7" max="1.2" step="0.05" value={speed} onChange={(e) => set("speaking_speed", e.target.value)}
                 className="w-full cursor-pointer accent-brand" />
          <div className="mt-1 flex justify-between text-[11px] text-faint"><span>Slower</span><span>Faster</span></div>
        </div>
      </Field>
      <Field label="Other languages it may switch to" hint="Separated by commas. It replies in the language the customer uses.">
        <TextInput value={form.other_languages} onChange={(e) => set("other_languages", e.target.value)} placeholder="Hindi, Tamil" />
      </Field>
      <Button variant="tinted" size="sm" icon={hearing ? Square : Play} onClick={onHear} className="self-start">
        {hearing ? "Stop" : "Hear it"}
      </Button>
    </>
  );
}

function Knowledge({ form, set }) {
  return (
    <>
      <Field label="Facts it may share" hint="One per line. Asked anything else, it says a colleague will follow up.">
        <TextArea rows={4} value={form.business_info} onChange={(e) => set("business_info", e.target.value)}
                  placeholder={"Open 12:00 to 23:00, Tuesday to Sunday.\nFree parking behind the restaurant."} />
      </Field>
      <Field label="Rules it must follow" hint="One per line. Boundaries go here too: topics to avoid, angry callers, handing over to a person.">
        <TextArea rows={4} value={form.rules} onChange={(e) => set("rules", e.target.value)}
                  placeholder={"Never offer discounts, refunds or free items.\nNever ask for card or payment details."} />
      </Field>
    </>
  );
}

function Pacing({ form, set }) {
  return (
    <>
      <Row>
        <Field label="Wrap up after">
          <UnitInput unit="min" min="1" max="30" step="0.5" placeholder="4" value={form.max_minutes}
                     onChange={(e) => set("max_minutes", e.target.value)} />
        </Field>
        <Field label="Tries per question">
          <UnitInput unit="times" min="1" max="5" step="1" placeholder="3" value={form.tries_per_question}
                     onChange={(e) => set("tries_per_question", e.target.value)} />
        </Field>
      </Row>
      <Field label="Hangs up after">
        <UnitInput unit="silences" min="1" max="5" step="1" placeholder="2" value={form.silences_before_ending}
                   onChange={(e) => set("silences_before_ending", e.target.value)} />
      </Field>
      <Choices label="Waits after they stop talking" options={OPTIONS.wait_after_speech_ms}
               value={form.wait_after_speech_ms} onChange={(value) => set("wait_after_speech_ms", value)} />
      <Switches>
        <Toggle className="px-4 py-3.5" checked={form.confirm_at_end} onChange={(on) => set("confirm_at_end", on)}
                label="Read the answers back" description="Confirms everything at the end of the call" />
        <Toggle className="px-4 py-3.5" checked={form.allow_interruptions} onChange={(on) => set("allow_interruptions", on)}
                label="Can be interrupted" description="The customer can talk over it, and it listens to what they say" />
      </Switches>
    </>
  );
}

/** Everything about the call that is not a step on the line, in a panel that slides in from the right. */
export function SettingsDrawer({ open, onClose, form, set, voices, hearing, onHear }) {
  const [tab, setTab] = useState("about");
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return;
    const escape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", escape);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", escape);
  }, [open, onClose]);

  if (!open) return null;
  const panes = { about: About, personality: Personality, voice: Voice, knowledge: Knowledge, pacing: Pacing };
  const Pane = panes[tab];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/30 backdrop-blur-[3px]" onClick={onClose}>
      <aside ref={panel} tabIndex={-1} role="dialog" aria-label="Call settings" onClick={(event) => event.stopPropagation()}
             className="flex h-full w-[440px] max-w-full animate-[slide-in_.18s_ease-out] flex-col bg-white shadow-float outline-none">
        <header className="flex items-start gap-3 px-6 pt-5 pb-3">
          <div className="flex-1">
            <h2 className="text-xl font-bold tracking-[-0.015em] text-ink">Call settings</h2>
            <p className="mt-0.5 text-[13px] text-muted">Everything about the call that is not a step.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close settings"
                  className="grid size-8 place-items-center rounded-[10px] text-muted hover:bg-fill hover:text-ink">
            <X aria-hidden="true" className="size-4" strokeWidth={2.2} />
          </button>
        </header>

        <div role="tablist" className="no-scrollbar mx-6 mb-1 flex gap-1 overflow-x-auto rounded-full bg-fill p-[3px]">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                    className={cn("h-8 flex-1 shrink-0 rounded-full px-3 text-[13px] font-semibold transition-colors",
                                  tab === id ? "bg-white text-ink shadow-[0_1px_2px_rgb(17_17_20/0.1)]" : "text-muted hover:text-ink")}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
          <Pane form={form} set={set} voices={voices} hearing={hearing} onHear={onHear} />
        </div>
      </aside>
    </div>
  );
}
