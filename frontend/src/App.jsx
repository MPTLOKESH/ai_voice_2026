import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CallPage } from "./components/call/CallPage.jsx";
import { HistoryPage } from "./components/history/HistoryPage.jsx";
import { PAGES, TabBar, TopBar } from "./components/layout/Navigation.jsx";
import { TopBarSlotContext } from "./components/layout/TopBarSlot.jsx";
import { SetupPage } from "./components/setup/SetupPage.jsx";
import { useToast } from "./components/ui/Toasts.jsx";
import * as api from "./lib/api.js";
import { CallSession } from "./lib/callSession.js";

const HEADINGS = {
  setup: ["Assistant setup", "What the assistant knows before it dials."],
  call: ["Test call", "A live conversation with the saved setup."],
  history: ["Call history", "Every finished call, with its answers."],
};

const pageAt = (path) => (path === "/call" ? "call" : path === "/history" ? "history" : "setup");

export default function App() {
  const toast = useToast();
  const [page, setPage] = useState(() => pageAt(window.location.pathname));
  const [saved, setSaved] = useState(null);
  const [loadProblem, setLoadProblem] = useState("");
  const [model, setModel] = useState("");
  const [slot, setSlot] = useState(null);

  // One session for the whole app, so leaving the call page mid-call doesn't end the call.
  const session = useMemo(() => new CallSession(), []);
  const call = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useEffect(() => { session.toast = toast; }, [session, toast]);
  useEffect(() => { if (saved) session.setSetup(saved); }, [session, saved]);

  useEffect(() => {
    api.loadSetup().then(setSaved).catch((failure) => setLoadProblem(`Could not load your setup: ${failure.message}`));
    api.services().then((models) => setModel(models?.ai || "")).catch(() => {});
    const back = () => setPage(pageAt(window.location.pathname));
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

  const navigate = useCallback((next) => {
    const path = PAGES.find((one) => one.id === next)?.path || "/";
    if (window.location.pathname !== path) window.history.pushState(null, "", path);
    setPage(next);
    window.scrollTo({ top: 0 });
  }, []);

  const [title, subtitle] = HEADINGS[page];

  return (
    <TopBarSlotContext.Provider value={slot}>
      <div className="flex min-h-dvh flex-col">
        <TopBar page={page} onNavigate={navigate} businessName={saved?.business_name} callLive={call.phase === "live"}
                slotRef={setSlot} model={model} speech={call.services} />

        {/* Room at the bottom on small screens, so the tab bar never covers the end of the page */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-8 pb-24 sm:px-6 sm:pt-10 lg:px-8 lg:pb-16">
          <header className="mb-8 border-b border-line pb-6">
            <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.02em] text-ink sm:text-[28px]">{title}</h1>
            <p className="mt-1 text-[14px] text-muted sm:text-[15px]">{subtitle}</p>
          </header>

          {loadProblem ? (
            <p role="alert" className="text-sm font-medium text-bad">{loadProblem}</p>
          ) : !saved ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <>
              {/* Kept mounted while hidden, so unsaved edits survive a look at another page */}
              <div hidden={page !== "setup"}>
                <SetupPage active={page === "setup"} saved={saved} onSaved={setSaved} onCall={() => navigate("call")} />
              </div>
              {page === "call" && <CallPage session={session} setup={saved} />}
              {page === "history" && <HistoryPage onCall={() => navigate("call")} />}
            </>
          )}
        </main>

        <TabBar page={page} onNavigate={navigate} callLive={call.phase === "live"} />
      </div>
    </TopBarSlotContext.Provider>
  );
}
