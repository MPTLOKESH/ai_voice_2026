import { Bot, GitBranch, WandSparkles } from "lucide-react";
import { cn } from "../../lib/cn.js";
import { QUESTION_PRESETS, STEP_BLOCKS, stepFields } from "../../lib/presets.js";

// One colour to a group, each a pale wash with the icon in its full strength.
const TINT = {
  ai: { wash: "bg-brand-wash", tile: "bg-brand-soft text-brand", label: "text-brand-ink", ring: "hover:border-brand/40" },
  customer: { wash: "bg-human-soft/60", tile: "bg-human-soft text-human", label: "text-human", ring: "hover:border-human/40" },
  smart: { wash: "bg-loop-soft/70", tile: "bg-loop-soft text-loop", label: "text-loop-ink", ring: "hover:border-loop/40" },
};

// Short names on the bar so all of it fits; the full one is in each block's hint.
const SHORT = { yes_no: "Yes / No", rating: "1–5", nps: "0–10", choice: "Choice", number: "Number", date: "Date", text: "Text" };
const AI_SHORT = { say: "Say" };

const AI_BLOCKS = [
  { id: "ask", label: "Ask", hint: "The AI asks a question", icon: Bot, payload: { kind: "new", fields: {} } },
  ...STEP_BLOCKS.map((block) => ({
    ...block, label: AI_SHORT[block.id] || block.label, payload: { kind: "new", fields: stepFields(block.id) },
  })),
];
const CUSTOMER_BLOCKS = QUESTION_PRESETS.map((preset) => ({
  id: `answer-${preset.id}`, label: SHORT[preset.id] || preset.label, icon: preset.icon, payload: { kind: "answer", fields: preset.question },
  hint: `Customer answers: ${preset.label}. Drop it on a question to set how it is answered, or on empty space to add one.`,
}));
const SMART_BLOCKS = [
  { id: "suggest", label: "Suggest", icon: WandSparkles, payload: { kind: "suggest" },
    hint: "Press for questions the AI suggests, or drop on a step for other ways to word it" },
  { id: "branch", label: "Branch", icon: GitBranch, payload: { kind: "branch" },
    hint: "Drop on a step to make it wait on an earlier answer" },
];

/** One block: pressed to add, or picked up and dropped where it should go. */
function Chip({ block, tint, onGrab, busy }) {
  const Icon = block.icon;
  return (
    <button type="button" title={block.hint || block.label} disabled={busy}
            onPointerDown={(event) => onGrab(event, block, tint)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onGrab(null, block, tint); } }}
            className={cn("group/chip flex shrink-0 cursor-grab touch-none items-center gap-1.5 rounded-2xl border border-transparent bg-white py-1 pr-2.5 pl-1 text-[13px] font-semibold whitespace-nowrap text-ink",
                          "shadow-[0_1px_2px_rgb(17_17_20/0.06)] transition-all duration-150 select-none",
                          "hover:-translate-y-0.5 hover:rotate-[-1.5deg] hover:shadow-[0_8px_18px_rgb(17_17_20/0.12)] active:scale-95 active:cursor-grabbing",
                          "disabled:cursor-wait disabled:opacity-60", tint.ring)}>
      <span className={cn("grid size-[28px] shrink-0 place-items-center rounded-[10px] transition-transform duration-200 group-hover/chip:scale-110", tint.tile,
                          busy && "motion-safe:animate-pulse")}>
        <Icon aria-hidden="true" className="size-[17px]" strokeWidth={2.1} />
      </span>
      {block.label}
    </button>
  );
}

function Group({ label, tint, children }) {
  return (
    <section aria-label={label} className={cn("flex shrink-0 flex-col gap-0.5 rounded-[16px] px-1.5 pt-1 pb-1.5", tint.wash)}>
      <span className={cn("px-1 text-[10px] font-bold tracking-[0.08em] uppercase", tint.label)}>{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </section>
  );
}

/**
 * The bar of blocks across the top: what the AI does, what the customer answers, and the smart helpers.
 * Everything on it is picked up with the pointer (a finger works too) and put down on the canvas, on a
 * line, or on a step.
 *
 *   onGrab(event, block, tint)  a block was pressed; `event` is null when it was activated from the keyboard
 */
export function Toolbar({ onGrab, suggesting }) {
  return (
    // Blocks wrap onto a second line when the window is narrow, rather than hide off the edge; on a phone,
    // where the height is dear, they scroll along one line instead.
    <div className="flex shrink-0 items-stretch gap-2 border-b border-line bg-white px-3 py-2 no-scrollbar max-sm:overflow-x-auto sm:flex-wrap sm:px-4">
      <Group label="AI" tint={TINT.ai}>
        {AI_BLOCKS.map((block) => <Chip key={block.id} block={block} tint={TINT.ai} onGrab={onGrab} />)}
      </Group>
      <Group label="Customer answers" tint={TINT.customer}>
        {CUSTOMER_BLOCKS.map((block) => <Chip key={block.id} block={block} tint={TINT.customer} onGrab={onGrab} />)}
      </Group>
      <Group label="Smart" tint={TINT.smart}>
        {SMART_BLOCKS.map((block) => (
          <Chip key={block.id} block={block} tint={TINT.smart} onGrab={onGrab} busy={block.id === "suggest" && suggesting} />
        ))}
      </Group>

    </div>
  );
}
