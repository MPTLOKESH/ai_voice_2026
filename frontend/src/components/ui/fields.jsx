import { ChevronDown } from "lucide-react";
import { cloneElement, isValidElement, useId } from "react";
import { cn } from "../../lib/cn.js";

const CONTROL = cn(
  "w-full rounded-lg border border-edge bg-white px-3 text-[14px] text-ink shadow-[0_1px_1px_rgb(0_0_0/0.03)]",
  "placeholder:text-muted/70 transition-colors hover:border-[#a1a1aa]",
  "focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15",
);

/** A label, the control it names, and an optional line of help underneath. */
export function Field({ label, hint, aside, className, children }) {
  const id = useId();
  // The control takes the label's id, so clicking the label focuses it and screen readers pair the two.
  const control = isValidElement(children) ? cloneElement(children, { id }) : children;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-ink">{label}</label>
        {aside}
      </div>
      {control}
      {hint && <p className="text-[12px] leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

export function TextInput({ className, ...props }) {
  return <input type="text" autoComplete="off" className={cn(CONTROL, "h-10", className)} {...props} />;
}

export function TextArea({ className, ...props }) {
  return <textarea className={cn(CONTROL, "min-h-28 resize-y py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ options, className, id, ...props }) {
  return (
    <div className="relative">
      <select id={id} className={cn(CONTROL, "h-10 cursor-pointer appearance-none pr-9", className)} {...props}>
        {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <ChevronDown aria-hidden="true" strokeWidth={1.75}
                   className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
    </div>
  );
}

/** A number with its unit written inside the box: "4 min", "3 times". */
export function UnitInput({ unit, className, id, ...props }) {
  return (
    <div className="relative">
      <input id={id} type="number" className={cn(CONTROL, "h-10 pr-20 tabular-nums", className)} {...props} />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-muted">
        {unit}
      </span>
    </div>
  );
}

/**
 * One of a few choices, as a segmented control: every option in view, the picked one raised. A narrow
 * screen can't fit the row, so there it becomes an ordinary dropdown.
 */
export function Choices({ label, options, value, onChange, hint, className }) {
  const id = useId();
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label id={id} htmlFor={`${id}-select`} className="text-[13px] font-medium text-ink">{label}</label>
      <div role="radiogroup" aria-labelledby={id}
           className="hidden self-start rounded-lg bg-black/[0.05] p-0.5 sm:inline-flex">
        {options.map(([option, text]) => {
          const picked = option === value;
          return (
            <button key={option} type="button" role="radio" aria-checked={picked} onClick={() => onChange(option)}
                    className={cn("h-8 rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-colors",
                                  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand/50",
                                  picked ? "bg-white text-brand-ink shadow-[0_1px_2px_rgb(0_0_0/0.1),0_0_0_0.5px_rgb(0_0_0/0.06)]"
                                    : "text-muted hover:text-ink")}>
              {text}
            </button>
          );
        })}
      </div>
      <div className="sm:hidden">
        <Select id={`${id}-select`} options={options} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
      {hint && <p className="text-[12px] leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

/** An on/off setting that reads as a sentence: what it does, and a line on what that means. */
export function Toggle({ checked, onChange, label, description, className }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-center justify-between gap-4", className)}>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-muted">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" checked={checked}
               onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
        <span className={cn("h-5 w-9 rounded-full bg-[#d4d4d8] transition-colors duration-150 peer-checked:bg-brand",
                            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
                            "peer-focus-visible:outline-brand/50")} />
        <span className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25)]
                         transition-transform duration-150 peer-checked:translate-x-4" />
      </span>
    </label>
  );
}
