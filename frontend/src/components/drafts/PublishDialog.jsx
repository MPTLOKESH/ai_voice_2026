import { Check, Globe, Info, MessageCircle, Phone, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../../lib/cn.js";
import * as api from "../../lib/api.js";
import { dayAndTime } from "../../lib/time.js";
import { Dialog } from "../ui/Dialog.jsx";
import { Pills } from "../ui/fields.jsx";
import { useToast } from "../ui/Toasts.jsx";

const CHANNELS = [
  { name: "Website", icon: Globe, desc: "Embeddable voice widget for any page" },
  { name: "WhatsApp", icon: MessageCircle, desc: "Voice note sent to the contact’s number" },
  { name: "Call", icon: Phone, desc: "Outbound phone call at the scheduled time" },
];

/** Where a flow should go, to whom, and when. Publishing marks it live and keeps those choices. */
export function PublishDialog({ flow, onClose, onPublished, onContacts }) {
  const toast = useToast();
  const [channels, setChannels] = useState(() => (flow.channels.length ? flow.channels : ["Website", "WhatsApp"]));
  const [picked, setPicked] = useState(flow.groups || []);
  const [groups, setGroups] = useState(null);
  const [reach, setReach] = useState(null);
  const [when, setWhen] = useState(flow.when);
  const [at, setAt] = useState(flow.scheduled_for);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.groups().then((found) => {
      setGroups(found.groups);
      // A group deleted since it was last published can't still be picked.
      setPicked((now) => now.filter((id) => found.groups.some((group) => group.id === id)));
    }).catch(() => setGroups([]));
  }, []);

  // Who the picked groups reach: each number once, without anyone who opted out.
  useEffect(() => {
    if (!picked.length) { setReach(null); return; }
    let current = true;
    api.reach(picked).then((found) => { if (current) setReach(found); }).catch(() => {});
    return () => { current = false; };
  }, [picked]);

  const needsPeople = channels.some((name) => name !== "Website");
  const pick = (id) => setPicked((all) => (all.includes(id) ? all.filter((one) => one !== id) : [...all, id]));

  const toggle = (name) => setChannels((all) => (all.includes(name) ? all.filter((one) => one !== name) : [...all, name]));

  // The earliest a schedule can be: now, as the date box writes it (local time, to the minute).
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  async function publish() {
    if (when === "Schedule" && (!at || at < now)) {
      toast(at ? "That time has already passed. Pick one in the future." : "Pick a date and time to schedule it for.", "bad");
      return;
    }
    if (needsPeople && !picked.length) {
      toast("Pick the groups of contacts it goes to.", "bad");
      return;
    }
    setSending(true);
    try {
      const stored = await api.publishFlow(flow.id, { channels, groups: picked, audience: flow.audience, when, scheduled_for: at });
      onPublished(stored);
      toast(when === "Schedule" ? `Scheduled for ${dayAndTime(at)}` : `Published to ${channels.join(", ")}`);
      onClose();
    } catch (failure) {
      toast(failure.message, "bad");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog title="Publish flow" subtitle={flow.name} onClose={onClose} className="w-[560px]">
      <div className="flex flex-col gap-[18px] px-6 py-3.5">
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink">Where should it go?</p>
          <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1">
            {CHANNELS.map(({ name, icon: Icon, desc }) => {
              const on = channels.includes(name);
              return (
                <button key={name} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(name)}
                        className={cn("relative flex flex-col gap-2.5 rounded-2xl border-[1.5px] p-3.5 text-left transition-colors",
                                      on ? "border-brand bg-brand-wash" : "border-line bg-white hover:bg-hover")}>
                  <span className="grid size-[34px] place-items-center rounded-[10px] bg-fill text-ink">
                    <Icon aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-ink">{name}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted">{desc}</span>
                  </span>
                  <span className={cn("absolute top-3 right-3 grid size-[18px] place-items-center rounded-full border-[1.5px] text-white",
                                      on ? "border-brand bg-brand" : "border-[#d4d4da]")}>
                    {on && <Check aria-hidden="true" className="size-2.5" strokeWidth={4} />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink">
            Who it goes to {!needsPeople && <span className="font-normal text-muted">(not needed for the website)</span>}
          </p>
          {groups === null ? <p className="text-[13px] text-muted">Loading groups…</p> : groups.length === 0 ? (
            <div className="flex items-center gap-3 rounded-2xl border border-dashed border-edge px-4 py-3.5">
              <Users aria-hidden="true" className="size-5 shrink-0 text-muted" strokeWidth={1.8} />
              <p className="min-w-0 flex-1 text-[13px] text-muted">No contact groups yet. Import or add the people it should call.</p>
              {onContacts && (
                <button type="button" onClick={onContacts} className="shrink-0 text-[13px] font-semibold text-brand-ink hover:underline">
                  Go to Contacts
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {groups.map((group) => {
                  const on = picked.includes(group.id);
                  return (
                    <button key={group.id} type="button" role="checkbox" aria-checked={on} onClick={() => pick(group.id)}
                            className={cn("flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
                                          on ? "border-brand bg-brand-wash text-brand-ink" : "border-edge bg-white text-ink hover:bg-hover")}>
                      {on && <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />}
                      {group.name}
                      <span className={cn("font-mono text-xs font-normal", on ? "text-brand-ink/70" : "text-faint")}>{group.count}</span>
                    </button>
                  );
                })}
              </div>
              {reach && (
                <p className="mt-2 text-[13px] text-body">
                  Reaches <span className="font-semibold text-ink">{reach.people.toLocaleString()} {reach.people === 1 ? "person" : "people"}</span>
                  {(reach.opted_out > 0 || reach.in_several > 0) && (
                    <span className="text-muted">
                      {" "}({[reach.opted_out > 0 && `${reach.opted_out} opted out`, reach.in_several > 0 && `${reach.in_several} in more than one group, reached once`]
                        .filter(Boolean).join(", ")})
                    </span>
                  )}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] font-semibold text-ink">When</span>
          <Pills label="When" options={[["Now", "Now"], ["Schedule", "Schedule"]]} value={when} onChange={setWhen} />
          {when === "Schedule" && (
            <input type="datetime-local" aria-label="Date and time" value={at} min={now} onChange={(event) => setAt(event.target.value)}
                   className="rounded-xl border border-edge bg-white px-3 py-1.5 text-[13px] text-ink focus:border-brand focus:ring-3 focus:ring-brand/15 focus:outline-none" />
          )}
        </div>

        <p className="flex items-start gap-2 rounded-xl bg-canvas px-3.5 py-2.5 text-xs leading-relaxed text-muted">
          <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={2} />
          Publishing marks the flow live and keeps these choices. Sending it to customers is not connected yet.
        </p>
      </div>

      <div className="flex justify-end gap-2 px-6 pt-3.5 pb-[22px]">
        <button type="button" onClick={onClose}
                className="rounded-full border border-edge bg-white px-[18px] py-2.5 text-sm font-semibold text-ink hover:bg-hover">
          Cancel
        </button>
        <button type="button" onClick={publish} disabled={sending}
                className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand disabled:opacity-60">
          {sending ? "Publishing…" : flow.status === "Live" ? "Update flow" : "Publish flow"}
        </button>
      </div>
    </Dialog>
  );
}
