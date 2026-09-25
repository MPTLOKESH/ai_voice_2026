import { AudioLines, Cpu, History, MoreHorizontal, Phone, SlidersHorizontal, Volume2 } from "lucide-react";
import { cn } from "../../lib/cn.js";
import { Menu } from "../ui/Menu.jsx";

export const PAGES = [
  { id: "setup", path: "/", label: "Setup", icon: SlidersHorizontal },
  { id: "call", path: "/call", label: "Test call", icon: Phone },
  { id: "history", path: "/history", label: "History", icon: History },
];

function PageLink({ page, active, callLive, onNavigate, className, children }) {
  return (
    <a href={page.path} onClick={(event) => { event.preventDefault(); onNavigate(page.id); }}
       aria-current={active ? "page" : undefined} className={className}>
      {children}
      {page.id === "call" && callLive && <span className="sr-only">(call in progress)</span>}
    </a>
  );
}

const LiveDot = ({ className }) => (
  <span className={cn("relative flex size-1.5", className)}>
    <span className="absolute inset-0 rounded-full bg-live motion-safe:animate-pulse-ring" />
    <span className="relative size-1.5 rounded-full bg-live" />
  </span>
);

/**
 * The bar across the top: whose assistant this is, the pages (on wide screens), then the actions of the
 * page on screen, then the services in use tucked into a menu.
 */
export function TopBar({ page, onNavigate, businessName, callLive, slotRef, model, speech }) {
  return (
    <header className="glass sticky top-0 z-30 border-b border-line">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand text-white">
            <AudioLines aria-hidden="true" className="size-4" strokeWidth={2} />
          </span>
          <p className="hidden truncate text-[14px] font-semibold text-ink sm:block">{businessName || "Voice Call"}</p>
        </div>

        {/* The pages, as tabs. Below this width they move to the tab bar at the bottom. */}
        <nav aria-label="Pages" className="ml-4 hidden border-l border-line pl-4 lg:block">
          <ul className="flex items-center gap-1">
            {PAGES.map((one) => {
              const active = page === one.id;
              return (
                <li key={one.id}>
                  <PageLink page={one} active={active} callLive={callLive} onNavigate={onNavigate}
                            className={cn("flex h-8 items-center gap-2 rounded-md px-3 text-[14px] font-medium transition-colors",
                                          active ? "bg-brand-soft text-brand-ink" : "text-muted hover:text-ink")}>
                    {one.label}
                    {one.id === "call" && callLive && <LiveDot />}
                  </PageLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* The page on screen puts its own actions here (see TopBarActions) */}
        <div ref={slotRef} className="ml-auto flex items-center gap-2" />

        <Menu label="Services in use" trigger={<MoreHorizontal aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />}>
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">Services in use</p>
          <dl>
            {[[Cpu, "Thinking", model || "—"], [Volume2, "Hearing · speaking", speech || "Shown once a call starts"]]
              .map(([Icon, label, value]) => (
                <div key={label} className="flex items-start gap-2.5 px-2.5 py-2">
                  <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.75} />
                  <div className="min-w-0">
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="truncate font-mono text-[13px] text-ink">{value}</dd>
                  </div>
                </div>
              ))}
          </dl>
        </Menu>
      </div>
    </header>
  );
}

/** The pages on phones and tablets: a tab bar along the bottom, where a thumb can reach it. */
export function TabBar({ page, onNavigate, callLive }) {
  return (
    <nav aria-label="Pages" className="glass fixed inset-x-0 bottom-0 z-30 border-t border-line pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="mx-auto grid h-14 max-w-md grid-cols-3">
        {PAGES.map((one) => {
          const active = page === one.id;
          const Icon = one.icon;
          return (
            <li key={one.id}>
              <PageLink page={one} active={active} callLive={callLive} onNavigate={onNavigate}
                        className={cn("flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                                      active ? "text-brand" : "text-muted hover:text-ink")}>
                <span className="relative">
                  <Icon aria-hidden="true" className="size-5" strokeWidth={active ? 2 : 1.5} />
                  {one.id === "call" && callLive && <LiveDot className="absolute -top-0.5 -right-1" />}
                </span>
                {one.label}
              </PageLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
