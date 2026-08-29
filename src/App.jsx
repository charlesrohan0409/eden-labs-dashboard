import { lazy, Suspense, useCallback, useEffect, useState } from "react";
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

import QuickAddTask from "./components/ui/QuickAddTask";
import CommandPalette from "./components/ui/CommandPalette";

const PORTAL_SESSION_KEY = "eden-labs-portal-session";
// Chart-heavy pages — lazy-load so recharts isn't in the initial bundle.
// Each loads in under 1s on a fast connection; the spinner shows on slow ones.
const GrowthDetail   = lazy(() => import("./components/pages/GrowthDetail"));
const FinanceDetail  = lazy(() => import("./components/pages/FinanceDetail"));
const CRM            = lazy(() => import("./components/pages/CRM"));
const ContentPage    = lazy(() => import("./components/pages/ContentPage"));
const ClientPortal = lazy(() => import("./components/portal/ClientPortal"));
const OwnerPortalPreview = lazy(() => import("./components/portal/OwnerPortalPreview"));
const PerformancePage = lazy(() => import("./components/pages/PerformancePage"));
const CalendarPage   = lazy(() => import("./components/pages/CalendarPage"));
const IntegrationsPage = lazy(() => import("./components/pages/IntegrationsPage"));

// Not lazy — this is what renders WHILE the lazy chunks load, so it has to
// already be in the initial bundle.
import { PageLoader, FullScreenLoader } from "./components/ui/Loader";



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
  // Depend on the specific stable function, not the whole ownerAuth object —
  // useOwnerAuth returns a fresh object literal every render, so depending
  // on `ownerAuth` itself gave this callback a new identity every render,
  // which fed straight into useAppData's effect deps below and caused it to
  // refetch on every single render, forever (setData → re-render → new
  // ownerAuth object → new callback → effect deps changed → refetch → setData
  // → ...). Confirmed live: 4,415 GET /rest/v1/app_data in 24h with the tab
  // open and nobody touching it — this loop, not payload size, was the real
  // driver of the Vercel/Supabase bandwidth blowout.
  const handleOwnerUnauthorized = useCallback(() => ownerAuth.logout(), [ownerAuth.logout]);
  const { data, actions, saveError, dismissSaveError } = useAppData(ownerAuth.token, handleOwnerUnauthorized);

  const [view, setView] = useState("home");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
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
  // Persisted, same as the owner's token. /api/auth-client mints a 30-DAY
  // token, but this was held in memory only — so every refresh, every
  // restored tab, every follow-a-link-and-come-back made the client type
  // their PIN again, and the 30-day TTL was dead code. The token is the
  // credential (the PIN itself is never stored), exactly as useOwnerAuth
  // has always done it.
  const [portalSession, setPortalSession] = useState(() => {
    try {
      const raw = localStorage.getItem(PORTAL_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }); // { token, clientId }

  useEffect(() => {
    try {
      if (portalSession?.token) {
        localStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify(portalSession));
      } else {
        localStorage.removeItem(PORTAL_SESSION_KEY);
      }
    } catch { /* private mode / storage disabled — session just won't persist */ }
  }, [portalSession]);

  // ⌘K / Ctrl-K anywhere. Registered at the root rather than inside the
  // palette so the shortcut works when the palette is closed — which is the
  // only time it needs to.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handlePortalUnauthorized = useCallback(() => setPortalSession(null), []);
  const portal = usePortalData(portalSession?.token, handlePortalUnauthorized);

  const exitPortal = () => { setPortalMode(false); setPortalSession(null); };
  // A real client has no "ops dashboard" to go back to, so their button ends
  // the SESSION rather than leaving the portal. They still need one: now that
  // the token is persisted (above), "close the tab" no longer signs anyone
  // out, and a client on a shared or borrowed machine had no way to end their
  // session at all.
  const signOutPortal = () => setPortalSession(null);
  const onExitPortal = arrivedViaLink ? signOutPortal : exitPortal;
  const portalExitLabel = arrivedViaLink ? "Sign out" : "Exit preview";

  // ---- Client portal (its own full-screen shell, its own auth entirely
  // separate from the owner's session below) ----
  if (portalMode) {
    // OWNER PREVIEW. Charles is already authenticated as owner and can see
    // every one of these records on the client detail page anyway, so making
    // him type a client's PIN to look at their portal was pure friction with
    // no security benefit — and it meant he could not check what a client
    // sees without asking them for their PIN. Built from the data already in
    // memory, in the same shape the server sends a real client, so the
    // preview is honest about what is and isn't visible to them.
    if (!arrivedViaLink && ownerAuth.token && data) {
      return (
        <OwnerPortalPreview data={data} actions={actions} onExit={exitPortal} />
      );
    }
    if (!portalSession) {
      return <ClientPortalLogin onLogin={setPortalSession} onExit={arrivedViaLink ? undefined : exitPortal} />;
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
        <Suspense fallback={<FullScreenLoader />}>
        <ClientPortal
          data={portal.data}
          clientId={portalSession.clientId}
          onExit={onExitPortal}
          exitLabel={portalExitLabel}
          onAddPost={portal.actions.addPost}
          onUpdatePost={portal.actions.updatePost}
          onAddContact={portal.actions.addContact}
          onUpdateStage={portal.actions.updateStage}
          onUpdateContact={portal.actions.updateContact}
          onDeleteContact={portal.actions.deleteContact}
          onAddComment={portal.actions.addComment}
          onUpdatePostStatus={portal.actions.updatePostStatus}
          onRefresh={portal.refresh}
          refreshing={portal.refreshing}
          token={portalSession.token}
        />
        </Suspense>
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
            onUpdateTask={actions.updateTask}
            onReorderTasks={actions.reorderTasks}
          />
        )}

        {view === "growth-detail" && (
          <GrowthDetail
            data={data}
            setView={setView}
            onAddOutreachEntry={actions.addOutreachEntry}
            onUpdateOutreachEntry={actions.updateOutreachEntry}
            onDeleteOutreachEntry={actions.deleteOutreachEntry}
            onAddLeadList={actions.addLeadList}
            onUpdateLeadList={actions.updateLeadList}
            onDeleteLeadList={actions.deleteLeadList}
            onToggleRestDate={actions.toggleRestDate}
            onLogComments={actions.logComments}
            onBumpComments={actions.bumpComments}
            onAddScript={actions.addScript}
            onUpdateScript={actions.updateScript}
            onDeleteScript={actions.deleteScript}
          />
        )}

        {view === "finance-detail" && (
          <FinanceDetail
            data={data}
            setView={setView}
            onAddExpense={actions.addExpense}
            onUpdateExpense={actions.updateExpense}
            onDeleteExpense={actions.deleteExpense}
            onAddInvoice={actions.addInvoice}
            onGenerateInvoices={actions.generateInvoices}
            onUpdateInvoiceStatus={actions.updateInvoiceStatus}
            onDeleteInvoice={actions.deleteInvoice}
            onAddAccount={actions.addAccount}
            onUpdateAccount={actions.updateAccount}
            onDeleteAccount={actions.deleteAccount}
            onAddOutgoing={actions.addOutgoing}
            onUpdateOutgoing={actions.updateOutgoing}
            onDeleteOutgoing={actions.deleteOutgoing}
            onCancelOutgoing={actions.cancelOutgoing}
            onPayOutgoing={actions.payOutgoing}
            onAddBudget={actions.addBudget}
            onUpdateBudget={actions.updateBudget}
            onDeleteBudget={actions.deleteBudget}
            onAddExpenseCategory={actions.addExpenseCategory}
            onRenameExpenseCategory={actions.renameExpenseCategory}
            onDeleteExpenseCategory={actions.deleteExpenseCategory}
            token={ownerAuth.token}
          />
        )}

        {view === "clients" && (
          <ClientsList
            data={data}
            setView={setView}
            setSelectedClient={setSelectedClient}
            onAddClient={actions.addClient}
            onAddTask={actions.addTask}
            onToggleClientHidden={actions.toggleClientHidden}
            token={ownerAuth.token}
          />
        )}

        {view === "client-detail" && (
          <ClientDetail
            data={data}
            clientId={selectedClient}
            setView={setView}
            token={ownerAuth.token}
            onAddPost={actions.addPost}
            onUpdatePost={actions.updatePost}
            onDeletePost={actions.deletePost}
            onAddDM={actions.addDM}
            onDeleteDM={actions.deleteDM}
            onUpdateClient={actions.updateClient}
            onUpdateContract={actions.updateContract}
            onUpdateDelivery={actions.updateDelivery}
            onAddDeliveryMetric={actions.addDeliveryMetric}
            onUpdateDeliveryMetric={actions.updateDeliveryMetric}
            onDeleteDeliveryMetric={actions.deleteDeliveryMetric}
            onUpdatePostStatus={actions.updatePostStatus}
            onEndContract={actions.endContract}
            onDeleteClient={actions.deleteClient}
            onAddTask={actions.addTask}
            onToggleTask={actions.toggleTask}
            onDeleteTask={actions.deleteTask}
            onUpdateTask={actions.updateTask}
            onReorderTasks={actions.reorderTasks}
            onUpdateClientNotes={actions.updateClientNotes}
            onLogActivity={actions.logActivity}
            onAddOutreachEntry={actions.addOutreachEntry}
            onAddLeadList={actions.addLeadList}
            onUpdateLeadList={actions.updateLeadList}
            onDeleteLeadList={actions.deleteLeadList}
            onAddScript={actions.addScript}
            onUpdateScript={actions.updateScript}
            onDeleteScript={actions.deleteScript}
            onLogComments={actions.logComments}
            onBumpComments={actions.bumpComments}
            onToggleRestDate={actions.toggleRestDate}
          />
        )}

        {view === "crm" && (
          <CRM
            data={data}
            onAddContact={actions.addContact}
            onUpdateStage={actions.updateStage}
            onUpdateContact={actions.updateContact}
            onDeleteContact={actions.deleteContact}
            onAddInbound={actions.addInbound}
            onUpdateInboundStage={actions.updateInboundStage}
            onToggleInboundReplied={actions.toggleInboundReplied}
            onDeleteInbound={actions.deleteInbound}
            onConvertInbound={actions.convertInboundToLead}
          />
        )}

        {view === "content" && (
          <ContentPage
            data={data}
            onAddPost={actions.addPost}
            onUpdatePost={actions.updatePost}
            onDeletePost={actions.deletePost}
            onUpdatePostStatus={actions.updatePostStatus}
            onSyncPublished={actions.syncPublishedFromBuffer}
            onAddSwipe={actions.addSwipe}
            onDeleteSwipe={actions.deleteSwipe}
            onAddSwipeFolder={actions.addSwipeFolder}
            onUpdateSwipeFolder={actions.updateSwipeFolder}
            onDeleteSwipeFolder={actions.deleteSwipeFolder}
            onMoveSwipeToFolder={actions.moveSwipeToFolder}
            onSetAgencyBufferChannel={actions.setAgencyBufferChannel}
            token={ownerAuth.token}
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
            token={ownerAuth.token}
          />
        )}
      </Suspense>
      </main>

      <MobileBottomNav view={view} setView={setView} />

      {/* Floating quick-add task — visible on every owner page, ⌘K shortcut */}
      <QuickAddTask clients={data.clients} onAdd={actions.addTask} open={quickAddOpen} onOpenChange={setQuickAddOpen} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        data={data}
        setView={setView}
        setSelectedClient={setSelectedClient}
        onQuickAdd={() => setQuickAddOpen(true)}
      />
    </div>
    </CurrencyProvider>
  );
}
