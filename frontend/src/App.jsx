import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CallPage } from "./components/call/CallPage.jsx";
import { ContactsPage } from "./components/contacts/ContactsPage.jsx";
import { DraftsPage } from "./components/drafts/DraftsPage.jsx";
import { PublishDialog } from "./components/drafts/PublishDialog.jsx";
import { HistoryPage } from "./components/history/HistoryPage.jsx";
import { Page } from "./components/layout/Page.jsx";
import { PAGES, Rail } from "./components/layout/Rail.jsx";
import { ResultsPage } from "./components/results/ResultsPage.jsx";
import { StudioPage } from "./components/studio/StudioPage.jsx";
import { ErrorNote, Skeleton } from "./components/ui/States.jsx";
import { useToast } from "./components/ui/Toasts.jsx";
import { VoicesPage } from "./components/voices/VoicesPage.jsx";
import * as api from "./lib/api.js";
import { CallSession } from "./lib/callSession.js";
import { problems } from "./lib/setupForm.js";
import { useSetup } from "./lib/useSetup.js";
import { usePageTitle } from "./lib/usePageTitle.js";
import { useVoice } from "./lib/useVoice.js";

const HEADINGS = {
  call: ["Test call", "A live conversation with the saved flow."],
  history: ["Call history", "Every finished call, with its answers."],
};

const pageAt = (path) => PAGES.find((one) => one.path === path)?.id || "drafts";

// The flow last open comes back on the next visit. Storage can be off, so it is only ever a convenience.
const REMEMBERED = "voice-call-flow";
const remembered = () => { try { return localStorage.getItem(REMEMBERED); } catch { return null; } };
const remember = (id) => { try { localStorage.setItem(REMEMBERED, id); } catch { /* not worth a message */ } };

export default function App() {
  const [flows, setFlows] = useState(null);
  const [loadProblem, setLoadProblem] = useState("");

  useEffect(() => {
    api.flows().then(setFlows).catch((failure) => setLoadProblem(`Could not load your flows: ${failure.message}`));
  }, []);

  if (loadProblem) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <ErrorNote onRetry={() => window.location.reload()}>{loadProblem}</ErrorNote>
      </div>
    );
  }
  if (!flows) {
    // The shape of the page that is coming, so nothing jumps when it arrives.
    return (
      <div role="status" aria-label="Loading" className="mx-auto max-w-[1120px] p-8">
        <Skeleton className="h-40 rounded-3xl" />
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((one) => <Skeleton key={one} className="h-[88px] rounded-2xl" />)}
        </div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((one) => <Skeleton key={one} className="h-64 rounded-[18px]" />)}
        </div>
      </div>
    );
  }
  return <Workspace first={flows} />;
}

/** The rail and the page beside it, and the flows every page works on. */
function Workspace({ first }) {
  const toast = useToast();
  const [flows, setFlows] = useState(first);
  const [activeId, setActiveId] = useState(() => (first.some((flow) => flow.id === remembered()) ? remembered() : first[0].id));
  const [page, setPage] = useState(() => pageAt(window.location.pathname));
  const [publishing, setPublishing] = useState(null);   // id of the flow in the Publish dialog
  const [voices, setVoices] = useState({ list: [], loaded: false });
  const [model, setModel] = useState("");
  const voice = useVoice(toast);

  const active = flows.find((flow) => flow.id === activeId) || flows[0];

  // One session for the whole app, so leaving the call page mid-call doesn't end the call.
  const session = useMemo(() => new CallSession(), []);
  const call = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useEffect(() => { session.toast = toast; }, [session, toast]);
  useEffect(() => { session.setSetup(active.setup, active.id); }, [session, active.setup, active.id]);

  useEffect(() => {
    api.voices().then(({ voices: found }) => setVoices({ list: found || [], loaded: true }))
      .catch(() => setVoices({ list: [], loaded: true }));
    api.services().then((models) => setModel(models?.ai || "")).catch(() => {});
    const back = () => setPage(pageAt(window.location.pathname));
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

  const navigate = useCallback((next) => {
    const path = PAGES.find((one) => one.id === next)?.path || "/";
    if (window.location.pathname !== path) window.history.pushState(null, "", path);
    voice.stop();
    setPage(next);
  }, [voice]);

  // A flow that was just saved or published goes to the front, where the most recent always is.
  const stored = useCallback((flow) => setFlows((all) => [flow, ...all.filter((one) => one.id !== flow.id)]), []);

  function open(id, to = "studio") {
    setActiveId(id);
    remember(id);
    navigate(to);
  }

  // A second press while the first new flow is still on its way would make two of them.
  const creating = useRef(false);
  /** A new flow, blank or from a template (see lib/templates.js). */
  async function create(template) {
    if (creating.current) return;
    creating.current = true;
    try {
      // A new flow keeps who is calling and how it sounds, with the template's purpose and questions, if any.
      const flow = await api.createFlow(template?.questions ? template.name : "Untitled flow", {
        ...active.setup, purpose: template?.purpose || "", questions: template?.questions || [],
      });
      stored(flow);
      open(flow.id);
    } catch (failure) {
      toast(failure.message, "bad");
    } finally {
      creating.current = false;
    }
  }

  async function remove(id) {
    try {
      const gone = flows.find((flow) => flow.id === id);
      await api.deleteFlow(id);
      let rest = flows.filter((flow) => flow.id !== id);
      // There is always one flow to work on: deleting the last leaves a fresh one in its place.
      if (!rest.length) rest = [await api.createFlow("Untitled flow", { ...gone.setup, purpose: "", questions: [] })];
      setFlows(rest);
      if (id === activeId) { setActiveId(rest[0].id); remember(rest[0].id); }
      toast("Flow deleted.");
    } catch (failure) {
      toast(failure.message, "bad");
    }
  }

  const headings = HEADINGS[page];
  usePageTitle({
    drafts: "Flows", studio: active.name, voices: "Voices", contacts: "Contacts", call: "Test call",
    history: "History", results: `Results · ${active.name}`,
  }[page]);
  const publishFlow = flows.find((flow) => flow.id === publishing);

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-body">
      <Rail page={page === "results" ? "drafts" : page} onNavigate={navigate} assistant={active.setup.assistant_name}
            callLive={call.phase === "live"} onNewFlow={() => create()} model={model} speech={call.services} />

      {/* Room at the bottom on small screens, so the tab bar never covers the end of a page */}
      <main className="min-w-0 flex-1 overflow-auto max-lg:pb-14">
        {page === "drafts" && (
          <DraftsPage flows={flows} voices={voices.list} activeBusiness={active.setup.business_name}
                      onEdit={open} onNew={create} onPublish={setPublishing} onDelete={remove}
                      onResults={(id) => open(id, "results")} onStored={stored} />
        )}

        {page === "results" && (
          <ResultsPage key={`results-${active.id}`} flow={active} onBack={() => navigate("drafts")} onTest={() => navigate("call")} />
        )}

        {page === "contacts" && <ContactsPage flows={flows} />}

        {/* Kept for as long as a flow is open, so what is typed keeps saving whichever page is showing */}
        <Editor key={`editor-${active.id}`} flow={active} flows={flows} page={page} voices={voices} voice={voice} session={session}
                headings={headings} onSaved={stored} onNavigate={navigate} onPublish={setPublishing} />
      </main>

      {publishFlow && <PublishDialog key={publishFlow.id} flow={publishFlow} onClose={() => setPublishing(null)} onPublished={stored}
                                    onContacts={() => { setPublishing(null); navigate("contacts"); }} />}
    </div>
  );
}

/** The pages that work on the open flow: the studio, the voices, a test call, and what past calls said. */
function Editor({ flow, flows, page, voices, voice, session, headings, onSaved, onNavigate, onPublish }) {
  const toast = useToast();
  const setupState = useSetup(flow, onSaved);

  /** Everything on screen stored first, so the call or the dialog sees what the person sees. */
  async function stored() {
    if (!setupState.unsaved) return true;
    return Boolean(await setupState.save());
  }

  async function test() {
    const found = problems(setupState.setup);
    if (found.length) { toast(found[0], "bad"); return; }
    if (await stored()) onNavigate("call");
  }

  async function publish() {
    if (await stored()) onPublish(flow.id);
  }

  return (
    <>
      {page === "studio" && (
        <div className="h-full">
          <StudioPage flow={flow} setupState={setupState} voices={voices.list} voice={voice} onTest={test} onPublish={publish}
                      onBack={() => onNavigate("drafts")} />
        </div>
      )}
      {page === "voices" && <VoicesPage voices={voices.list} loaded={voices.loaded} voice={voice} setupState={setupState} />}
      {headings && (
        <Page title={headings[0]} subtitle={headings[1]}>
          {page === "call" && <CallPage session={session} setup={flow.setup} flowName={flow.name} />}
          {page === "history" && <HistoryPage flows={flows} onCall={() => onNavigate("call")} />}
        </Page>
      )}
    </>
  );
}
