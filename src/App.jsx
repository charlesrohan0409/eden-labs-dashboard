import { lazy, Suspense, useCallback, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useAppData } from "./hooks/useAppData";
import { useOwnerAuth } from "./hooks/useOwnerAuth";
import { usePortalData } from "./hooks/usePortalData";
import { CurrencyProvider } from "./hooks/useCurrency";
import OwnerLogin from "./components/OwnerLogin";
import Sidebar from "./components/layout/Sidebar";
import MobileTopBar from "./components/layout/MobileTopBar";
import MobileBottomNav from "./components/layout/MobileBottomNav";
// Always-on pages — load eagerly so the first paint is instant.
import HomeDashboard from "./components/pages/HomeDashboard";
import ClientsList from "./components/pages/ClientsList";
import ClientDetail from "./components/pages/ClientDetail";
import ClientPortalLogin from "./components/portal/ClientPortalLogin";
import ClientPortal from "./components/portal/ClientPortal";
import QuickAddTask from "./components/ui/QuickAddTask";
// Chart-heavy pages — lazy-load so recharts isn't in the initial bundle.
// Each loads in under 1s on a fast connection; the spinner shows on slow ones.
const GrowthDetail   = lazy(() => import("./components/pages/GrowthDetail"));
const FinanceDetail  = lazy(() => import("./components/pages/FinanceDetail"));
const CRM            = lazy(() => import("./components/pages/CRM"));
const ContentPage    = lazy(() => import("./components/pages/ContentPage"));
const PerformancePage = lazy(() => import("./components/pages/PerformancePage"));
const CalendarPage   = lazy(() => import("./components/pages/CalendarPage"));
const IntegrationsPage = lazy(() => import("./components/pages/IntegrationsPage"));

function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center text-stone-400 text-sm">
      <svg className="animate-spin h-5 w-5 mr-2 text-emerald-700" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      Loading…
    </div>
  );
}

function FullScreenLoader() {
  return <div className="min-h-screen flex items-center justify-center text-stone-400 text-sm">Loading…</div>;
}

// Fixed so it's visible no matter which page/portal is showing — a save
// failure (most likely a full localStorage quota, now that posts can carry
// base64 images) used to be silent; this is the one thing standing between
// "my change looks saved" and "my change was actually lost on reload."
function SaveErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-rose-700 text-white px-4 py-2.5 flex items-center gap-2.5 text-sm shadow-lg">
      <AlertTriangle size={15} className="shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0 hover:opacity-75">
        <X size={16} />
      </button>
    </div>
  );
}

export default function App() {
  const ownerAuth = useOwnerAuth();
  const handleOwnerUnauthorized = useCallback(() => ownerAuth.logout(), [ownerAuth]);
  const { data, actions, saveError, dismissSaveError } = useAppData(ownerAuth.token, handleOwnerUnauthorized);

  const [view, setView] = useState("home");
  const [selectedClient, setSelectedClient] = useState(null);

  // A client's shared portal link looks like /portal/:clientId (see
  // lib/utils.js's portalLinkFor — the id itself isn't actually needed here,
  // since the PIN they enter is what identifies them server-side; matching
  // the path just means "go straight to the portal login, skip the owner
  // gate entirely" instead of leaving them stuck on the owner's PIN screen).
  // Computed once, synchronously, so there's no flash of the wrong screen
  // before an effect gets a chance to run.
  const [arrivedViaLink] = useState(() => /^\/portal\//.test(window.location.pathname));
  const [portalMode, setPortalMode] = useState(arrivedViaLink);
  const [portalSession, setPortalSession] = useState(null); // { token, clientId }

  const handlePortalUnauthorized = useCallback(() => setPortalSession(null), []);
  const portal = usePortalData(portalSession?.token, handlePortalUnauthorized);

  const exitPortal = () => { setPortalMode(false); setPortalSession(null); };
  // A real client has no "ops dashboard" to go back to and isn't "previewing"
  // anything — only show the exit/back button when the owner opened this via
  // the "Preview client portal" button on their own session.
  const onExitPortal = arrivedViaLink ? undefined : exitPortal;

  // ---- Client portal (its own full-screen shell, its own auth entirely
  // separate from the owner's session below) ----
  if (portalMode) {
    if (!portalSession) {
      return <ClientPortalLogin onLogin={setPortalSession} onExit={onExitPortal} />;
    }
    if (!portal.data) {
      return (
        <>
          <SaveErrorBanner message={portal.error} onDismiss={portal.dismissError} />
          <FullScreenLoader />
        </>
      );
    }
    return (
      <CurrencyProvider currency={portal.data.settings?.currency}>
        <SaveErrorBanner message={portal.error} onDismiss={portal.dismissError} />
        <ClientPortal
          data={portal.data}
          clientId={portalSession.clientId}
          onExit={onExitPortal}
          onAddPost={portal.actions.addPost}
          onUpdatePost={portal.actions.updatePost}
          onAddContact={portal.actions.addContact}
          onUpdateStage={portal.actions.updateStage}
          onAddComment={portal.actions.addComment}
          onUpdatePostStatus={portal.actions.updatePostStatus}
        />
      </CurrencyProvider>
    );
  }

  // ---- Owner dashboard — PIN-gated, session works from any device ----
  if (!ownerAuth.token) {
    return <OwnerLogin onLogin={ownerAuth.login} loading={ownerAuth.loading} error={ownerAuth.error} />;
  }

  if (!data) {
    return (
      <>
        <SaveErrorBanner message={saveError} onDismiss={dismissSaveError} />
        <FullScreenLoader />
      </>
    );
  }

  return (
    <CurrencyProvider currency={data.settings?.currency}>
    <div className="flex flex-col lg:flex-row min-h-screen bg-canvas">
      <SaveErrorBanner message={saveError} onDismiss={dismissSaveError} />
      <MobileTopBar onPreviewPortal={() => setPortalMode(true)} onLogout={ownerAuth.logout} />
      <Sidebar view={view} setView={setView} onPreviewPortal={() => setPortalMode(true)} onLogout={ownerAuth.logout} />

      <main className="flex-1 min-w-0 overflow-x-hidden p-4 lg:p-8 pb-24 lg:pb-8 max-w-[1400px]">
      <Suspense fallback={<PageLoader />}>
        {view === "home" && (
          <HomeDashboard
            data={data}
            setView={setView}
            setSelectedClient={setSelectedClient}
            onAddTask={actions.addTask}
            onToggleTask={actions.toggleTask}
            onDeleteTask={actions.deleteTask}
          />
        )}

        {view === "growth-detail" && (
          <GrowthDetail data={data} setView={setView} onLogGrowth={actions.logGrowth} />
        )}

        {view === "finance-detail" && (
          <FinanceDetail
            data={data}
            setView={setView}
            onAddExpense={actions.addExpense}
            onAddInvoice={actions.addInvoice}
            onGenerateInvoices={actions.generateInvoices}
            onUpdateInvoiceStatus={actions.updateInvoiceStatus}
          />
        )}

        {view === "clients" && (
          <ClientsList
            data={data}
            setView={setView}
            setSelectedClient={setSelectedClient}
            onAddClient={actions.addClient}
          />
        )}

        {view === "client-detail" && (
          <ClientDetail
            data={data}
            clientId={selectedClient}
            setView={setView}
            onAddPost={actions.addPost}
            onUpdatePost={actions.updatePost}
            onAddDM={actions.addDM}
            onUpdateContract={actions.updateContract}
            onUpdateDelivery={actions.updateDelivery}
            onUpdatePostStatus={actions.updatePostStatus}
            onEndContract={actions.endContract}
            onDeleteClient={actions.deleteClient}
            onAddTask={actions.addTask}
            onToggleTask={actions.toggleTask}
            onDeleteTask={actions.deleteTask}
            onUpdateClientNotes={actions.updateClientNotes}
            onLogActivity={actions.logActivity}
          />
        )}

        {view === "crm" && (
          <CRM
            data={data}
            onAddContact={actions.addContact}
            onUpdateStage={actions.updateStage}
            onUpdateContact={actions.updateContact}
            onDeleteContact={actions.deleteContact}
          />
        )}

        {view === "content" && (
          <ContentPage
            data={data}
            onAddPost={actions.addPost}
            onUpdatePost={actions.updatePost}
            onAddSwipe={actions.addSwipe}
            onSetAgencyBufferChannel={actions.setAgencyBufferChannel}
          />
        )}

        {view === "performance" && <PerformancePage data={data} />}

        {view === "calendar" && <CalendarPage />}

        {view === "integrations" && (
          <IntegrationsPage
            data={data}
            onToggle={actions.toggleIntegration}
            onBufferChannels={actions.setBufferChannels}
            onBufferDisconnected={actions.setBufferDisconnected}
            onFathomConnected={actions.setFathomConnected}
            onFathomDisconnected={actions.setFathomDisconnected}
            onUpdateProfile={actions.updateProfile}
            onSetCurrency={actions.setCurrency}
          />
        )}
      </Suspense>
      </main>

      <MobileBottomNav view={view} setView={setView} />

      {/* Floating quick-add task — visible on every owner page, ⌘K shortcut */}
      <QuickAddTask clients={data.clients} onAdd={actions.addTask} />
    </div>
    </CurrencyProvider>
  );
}
