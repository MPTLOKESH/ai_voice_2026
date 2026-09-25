import { Mic, Phone } from "lucide-react";
import { useState } from "react";
import { Badge } from "../ui/Badge.jsx";
import { Button } from "../ui/Button.jsx";
import { Card, IconTile } from "../ui/Card.jsx";
import { Field, TextInput, Toggle } from "../ui/fields.jsx";
import { LevelMeter } from "./LevelMeter.jsx";

/** Before a call: who's calling, who the customer is, whether to speak aloud, and a microphone check. */
export function StartPanel({ session, state, setup }) {
  const [customer, setCustomer] = useState("");
  const [speak, setSpeak] = useState(true);
  const [starting, setStarting] = useState(false);
  const questions = setup?.questions?.length || 0;
  const name = setup?.assistant_name || "Assistant";

  async function start() {
    setStarting(true);
    try { await session.begin({ customer, speak }); } finally { setStarting(false); }
  }

  return (
    <Card className="max-w-2xl">
      {/* Who the customer will hear */}
      <div className="flex items-start gap-4 border-b border-line px-6 py-6 sm:px-8">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand text-[18px] font-medium text-white">
          {name[0].toUpperCase()}
        </span>
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold text-ink">
            {name} <span className="font-normal text-muted">· {setup?.business_name || "your business"}</span>
          </h2>
          {setup?.purpose && <p className="mt-0.5 text-[14px] text-body">{setup.purpose}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="brand">{questions} {questions === 1 ? "question" : "questions"}</Badge>
            <Badge tone="brand">Up to {setup?.max_minutes || 4} min</Badge>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6 px-6 py-7 sm:px-8">
        <Field label="Customer's name, if known">
          <TextInput value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Priya Sharma" />
        </Field>

        <div className="divide-y divide-line rounded-lg border border-line">
          <Toggle className="px-4 py-3.5" checked={speak} onChange={setSpeak} label="Speak out loud"
                  description="Turn off to test the logic without using speech credits" />
          <div className="flex flex-col gap-3 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <IconTile icon={Mic} tone="rose" size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-ink">Microphone</p>
                <p className="text-[13px] text-muted">
                  {state.micOpen ? "Say something and watch the bar." : "Check it before you start."}
                </p>
              </div>
              {!state.micOpen && (
                <Button variant="secondary" size="sm" onClick={() => session.checkMic()}>Check</Button>
              )}
            </div>
            {state.micOpen && <LevelMeter session={session} numbers />}
          </div>
        </div>

        {state.problem && <p role="alert" className="text-sm font-medium text-bad">{state.problem}</p>}

        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-muted">Uses the saved setup. Unsaved changes aren't included.</p>
          <Button variant="primary" size="lg" icon={Phone} onClick={start} disabled={starting} className="justify-center">
            {starting ? "Connecting…" : "Start the call"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
