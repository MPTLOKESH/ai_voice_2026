import { Building2, CircleHelp, ShieldCheck, SlidersVertical, Sparkles, Mic } from "lucide-react";

/** The setup's sections, in order. The list beside the form shows one at a time. Each has its own
 *  colour, so it's recognisable at a glance in the list and at the top of its pane. */
export const SECTIONS = [
  { id: "business", label: "Business", title: "Your business", description: "Who is calling, and why", icon: Building2, tone: "blue" },
  { id: "personality", label: "Personality", title: "Personality", description: "How it comes across on the phone", icon: Sparkles, tone: "violet" },
  { id: "voice", label: "Voice", title: "Voice and speech", description: "What it sounds like", icon: Mic, tone: "rose" },
  { id: "knowledge", label: "Knowledge & rules", title: "What it may say", description: "Facts it can share, and rules it never breaks", icon: ShieldCheck, tone: "green" },
  { id: "flow", label: "Call flow", title: "How the call runs", description: "Patience, retries and the ending", icon: SlidersVertical, tone: "amber" },
  { id: "questions", label: "Questions", title: "Questions", description: "What it asks, and what counts as an answer", icon: CircleHelp, tone: "cyan" },
];

export const section = (id) => SECTIONS.find((one) => one.id === id);
