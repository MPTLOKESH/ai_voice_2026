import { cn } from "../../lib/cn.js";

const VARIANTS = {
  // The brand colour, for the one action that matters on a screen.
  primary: "bg-brand text-white shadow-[0_1px_2px_rgb(67_56_202/0.3)] hover:bg-brand-hover active:bg-brand-ink disabled:opacity-50",
  tinted: "bg-brand-soft text-brand-ink hover:bg-[#e4e2ff] active:bg-[#d9d6ff]",
  secondary: "border border-edge bg-white text-ink hover:bg-hover active:bg-active",
  subtle: "bg-black/[0.05] text-ink hover:bg-black/[0.08] active:bg-black/[0.1]",
  ghost: "text-body hover:bg-black/[0.05] hover:text-ink active:bg-black/[0.08]",
  danger: "border border-edge bg-white text-bad hover:bg-bad-soft",
  "danger-solid": "bg-bad text-white hover:brightness-110",
};

const SIZES = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-3.5 text-[14px] gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
  icon: "size-9 justify-center",
};

/** A button. `icon` sits before the label; with size "icon" it is the whole button. */
export function Button({ variant = "secondary", size = "md", icon: Icon, className, children, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex shrink-0 items-center rounded-lg font-medium whitespace-nowrap transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/50",
        "disabled:cursor-not-allowed",
        VARIANTS[variant], SIZES[size], className,
      )}
      {...props}
    >
      {Icon && <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />}
      {children}
    </button>
  );
}
