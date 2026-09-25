import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn.js";

/** A button that opens a small panel beneath it. Closes on a click elsewhere or Escape. */
export function Menu({ trigger, label, align = "right", className, children }) {
  const [open, setOpen] = useState(false);
  const holder = useRef(null);

  useEffect(() => {
    if (!open) return;
    const away = (event) => { if (!holder.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={holder} className="relative">
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}
              className={cn("grid size-9 place-items-center rounded-lg text-body transition hover:bg-black/[0.05] hover:text-ink",
                            open && "bg-black/[0.07] text-ink")}>
        {trigger}
      </button>
      {open && (
        <div className={cn("absolute top-11 z-40 w-72 rounded-xl bg-white p-1.5 shadow-float",
                           "animate-[toast-in_.16s_ease-out]",
                           align === "right" ? "right-0" : "left-0", className)}>
          {children}
        </div>
      )}
    </div>
  );
}
