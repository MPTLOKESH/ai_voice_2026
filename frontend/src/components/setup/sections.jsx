import { Play, Square } from "lucide-react";
import { OPTIONS } from "../../lib/setupForm.js";
import { Button } from "../ui/Button.jsx";
import { Card, IconTile } from "../ui/Card.jsx";
import { Choices, Field, Select, TextArea, TextInput, Toggle, UnitInput } from "../ui/fields.jsx";
import { section } from "./sectionList.js";

/** One setup section, shown on its own like a pane of the Settings app: its title, then its fields
 *  with plenty of room between them. */
export function SetupSection({ id, actions, children }) {
  const { title, description, icon, tone } = section(id);
  return (
    <Card id={id} aria-labelledby={`${id}-title`}>
      <header className="flex items-center justify-between gap-4 border-b border-line px-6 py-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3.5">
          <IconTile icon={icon} tone={tone} />
          <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          <p className="mt-0.5 text-[13px] text-muted">{description}</p>
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap justify-end gap-2">{actions}</div>}
      </header>
      <div className="flex flex-col gap-7 px-6 py-7 sm:px-8 sm:py-8">{children}</div>
    </Card>
  );
}

const Row = ({ children }) => <div className="grid gap-7 sm:grid-cols-2 sm:gap-5">{children}</div>;

/** Settings that are simply on or off, grouped in one inset list. */
const SwitchList = ({ children }) => (
  <div className="divide-y divide-line rounded-lg border border-line">{children}</div>
);

// Every section gets the form and `set(name, value)`, and draws its own fields.

export function BusinessSection({ form, set }) {
  return (
    <SetupSection id="business">
      <Row>
        <Field label="Business name">
          <TextInput value={form.business_name} onChange={(e) => set("business_name", e.target.value)}
                     placeholder="The Blue Door" />
        </Field>
        <Field label="Assistant's name">
          <TextInput value={form.assistant_name} onChange={(e) => set("assistant_name", e.target.value)}
                     placeholder="Maya" />
        </Field>
      </Row>
      <Field label="Why it is calling" hint="Suggested questions are written from this.">
        <TextInput value={form.purpose} onChange={(e) => set("purpose", e.target.value)}
                   placeholder="Call customers to confirm their table booking." />
      </Field>
      <Field label="Calling from" hint={'Optional. Said as "Maya from The Blue Door, from …"'}>
        <TextInput value={form.calling_from} onChange={(e) => set("calling_from", e.target.value)}
                   placeholder="the customer care team" />
      </Field>
      <Choices label="Says it's an AI" options={OPTIONS.ai_disclosure} value={form.ai_disclosure}
               onChange={(value) => set("ai_disclosure", value)} />
      <Row>
        <Field label="Language">
          <TextInput value={form.language} onChange={(e) => set("language", e.target.value)} placeholder="English" />
        </Field>
        <Field label="Wrap up after">
          <UnitInput unit="min" min="1" max="30" step="0.5" placeholder="4" value={form.max_minutes}
                     onChange={(e) => set("max_minutes", e.target.value)} />
        </Field>
      </Row>
    </SetupSection>
  );
}

export function PersonalitySection({ form, set }) {
  return (
    <SetupSection id="personality">
      <Choices label="Tone" options={OPTIONS.tone} value={form.tone} onChange={(value) => set("tone", value)} />
      <Row>
        <Choices label="How much it says" options={OPTIONS.reply_length} value={form.reply_length}
                 onChange={(value) => set("reply_length", value)} />
        <Choices label="Formality" options={OPTIONS.formality} value={form.formality}
                 onChange={(value) => set("formality", value)} />
      </Row>
    </SetupSection>
  );
}

export function VoiceSection({ form, set, voices, hearing, onHear }) {
  const known = voices.find((voice) => voice.id === form.voice_id);
  // A saved voice this account no longer lists still needs an option to show as chosen.
  const options = [
    ["", "Default voice"],
    ...voices.map((voice) => [voice.id, voice.name]),
    ...(form.voice_id && !known ? [[form.voice_id, `Voice ${form.voice_id}`]] : []),
  ];
  const speed = Number(form.speaking_speed || 1);
  return (
    <SetupSection
      id="voice"
      actions={
        <Button variant="tinted" size="sm" icon={hearing ? Square : Play} onClick={onHear}>
          {hearing ? "Stop" : "Hear it"}
        </Button>
      }
    >
      <Row>
        <Field label="Voice" hint={known?.about || (form.voice_id ? "" : "The one set in settings.py.")}>
          <Select options={options} value={form.voice_id} onChange={(e) => set("voice_id", e.target.value)} />
        </Field>
        <Field label="Speed" aside={<span className="font-mono text-xs font-medium text-ink">{speed.toFixed(2)}×</span>}>
          <div className="flex h-10 flex-col justify-center">
            <input type="range" min="0.7" max="1.2" step="0.05" value={speed}
                   onChange={(e) => set("speaking_speed", e.target.value)}
                   className="w-full cursor-pointer accent-brand" />
            <div className="mt-1 flex justify-between text-[11px] text-muted"><span>Slower</span><span>Faster</span></div>
          </div>
        </Field>
      </Row>
      <Field label="Other languages it may switch to"
             hint="Separated by commas. It replies in the language the customer uses.">
        <TextInput value={form.other_languages} onChange={(e) => set("other_languages", e.target.value)}
                   placeholder="Hindi, Tamil" />
      </Field>
    </SetupSection>
  );
}

export function KnowledgeSection({ form, set }) {
  return (
    <SetupSection id="knowledge">
      <Field label="Facts it may share"
             hint="One per line. Asked anything else, it says a colleague will follow up.">
        <TextArea rows={3} value={form.business_info} onChange={(e) => set("business_info", e.target.value)}
                  placeholder={"Open 12:00 to 23:00, Tuesday to Sunday.\nFree parking behind the restaurant."} />
      </Field>
      <Field label="Rules it must follow"
             hint="One per line. Boundaries go here too: topics to avoid, angry callers, handing over to a person.">
        <TextArea rows={3} value={form.rules} onChange={(e) => set("rules", e.target.value)}
                  placeholder={"Never offer discounts, refunds or free items.\nNever ask for card or payment details."} />
      </Field>
    </SetupSection>
  );
}

export function FlowSection({ form, set }) {
  return (
    <SetupSection id="flow">
      <Row>
        <Field label="Re-asks an unclear answer">
          <UnitInput unit="times" min="1" max="5" step="1" placeholder="3" value={form.tries_per_question}
                     onChange={(e) => set("tries_per_question", e.target.value)} />
        </Field>
        <Field label="Hangs up after">
          <UnitInput unit="silences" min="1" max="5" step="1" placeholder="2" value={form.silences_before_ending}
                     onChange={(e) => set("silences_before_ending", e.target.value)} />
        </Field>
      </Row>
      <Choices label="Waits after they stop talking" options={OPTIONS.wait_after_speech_ms}
               value={form.wait_after_speech_ms} onChange={(value) => set("wait_after_speech_ms", value)} />
      <SwitchList>
        <Toggle className="px-4 py-3.5" checked={form.confirm_at_end} onChange={(on) => set("confirm_at_end", on)}
                label="Read the answers back" description="Confirms everything at the end of the call" />
        <Toggle className="px-4 py-3.5" checked={form.allow_interruptions}
                onChange={(on) => set("allow_interruptions", on)}
                label="Can be interrupted" description="The customer can talk over it, and it listens to what they say" />
      </SwitchList>
    </SetupSection>
  );
}
