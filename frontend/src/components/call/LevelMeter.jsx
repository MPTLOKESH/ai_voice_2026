import { useEffect, useRef } from "react";
import { cn } from "../../lib/cn.js";

const scale = (level, startsAt) => Math.max(0.02, Math.min(1, level / ((startsAt || 1) * 2.5)));

/** A live bar of how much voice the microphone hears. Drawn straight onto the element, not through React:
 *  levels arrive dozens of times a second. The numbers underneath update five times a second at most. */
export function LevelMeter({ session, numbers = false, className }) {
  const bar = useRef(null);
  const text = useRef(null);

  useEffect(() => {
    let shownAt = 0;
    return session.onLevel((level, startsAt, doing) => {
      if (bar.current) bar.current.style.transform = `scaleX(${scale(level, startsAt)})`;
      const now = performance.now();
      if (!text.current || now - shownAt < 200) return;
      shownAt = now;
      // Silero reports its own numbers ("voice 12% · starts at 35% · …"); the loudness fallback doesn't.
      text.current.textContent = doing.startsWith("voice ")
        ? doing : `level ${level.toFixed(3)} · starts at ${startsAt.toFixed(3)} · ${doing}`;
    });
  }, [session]);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="h-1 overflow-hidden rounded-full bg-black/[0.07]">
        <div ref={bar} className="h-full origin-left scale-x-[0.02] rounded-full bg-brand transition-transform duration-75" />
      </div>
      {numbers && <p ref={text} className="truncate font-mono text-[11px] text-muted">waiting for the microphone…</p>}
    </div>
  );
}

const RING = {
  listening: "border-live/60", hearing: "border-live", thinking: "border-brand/30", speaking: "border-brand/50",
  idle: "border-line",
};

/**
 * Who is talking, drawn plainly: the assistant's initial in a circle of the brand colour, and a thin ring around it. The
 * ring turns green and widens with the caller's voice while it's their turn, and pulses while the
 * assistant thinks or speaks.
 */
export function Presence({ session, kind, initial, className }) {
  const ring = useRef(null);
  const yours = kind === "listening" || kind === "hearing";

  useEffect(() => {
    if (!yours) { if (ring.current) ring.current.style.transform = "scale(1)"; return undefined; }
    return session.onLevel((level, startsAt) => {
      if (ring.current) ring.current.style.transform = `scale(${1 + scale(level, startsAt) * 0.25})`;
    });
  }, [session, yours]);

  return (
    <span aria-hidden="true" className={cn("relative grid size-24 place-items-center", className)}>
      <span ref={ring} className={cn("absolute inset-0 rounded-full border-2 transition-[transform,border-color] duration-100",
                                     RING[kind] || RING.idle)} />
      {(kind === "thinking" || kind === "speaking") && (
        <span className="absolute inset-2 rounded-full border border-brand/40 motion-safe:animate-pulse-ring" />
      )}
      <span className={cn("relative grid size-[72px] place-items-center rounded-full text-[26px] font-medium text-white transition-colors",
                          kind === "idle" ? "bg-[#a1a1aa]" : "bg-brand")}>
        {initial}
      </span>
    </span>
  );
}
