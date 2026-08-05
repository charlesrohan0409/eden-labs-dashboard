import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useAppData } from "./hooks/useAppData";
import { CurrencyProvider } from "./hooks/useCurrency";
import Sidebar from "./components/layout/Sidebar";
import MobileTopBar from "./components/layout/MobileTopBar";
import MobileBottomNav from "./components/layout/MobileBottomNav";
import HomeDashboard from "./components/pages/HomeDashboard";
import GrowthDetail from "./components/pages/GrowthDetail";
import FinanceDetail from "./components/pages/FinanceDetail";
import ClientsList from "./components/pages/ClientsList";
import ClientDetail from "./components/pages/ClientDetail";
import CRM from "./components/pages/CRM";
import ContentPage from "./components/pages/ContentPage";
import PerformancePage from "./components/pages/PerformancePage";
import CalendarPage from "./components/pages/CalendarPage";
import IntegrationsPage from "./components/pages/IntegrationsPage";
import ClientPortalLogin from "./components/portal/ClientPortalLogin";
import ClientPortal from "./components/portal/ClientPortal";

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
  const { data, actions, saveError, dismissSaveError } = useAppData();
  const [view, setView] = useState("home");
  const [selectedClient, setSelectedClient] = useState(null);
  const [portalMode, setPortalMode] = useState(false);
  const [portalClient, setPortalClient] = useState(null);

  const exitPortal = () => { setPortalMode(false); setPortalClient(null); };

  if (!data) {
    return <div className="min-h-screen flex items-center justify-center text-stone-400 text-sm">Loading…</div>;
  }

  // ---- Client portal (its own full-screen shell) ----
  if (portalMode) {
    if (!portalClient) {
      return <ClientPortalLogin data={data} onLogin={setPortalClient} onExit={exitPortal} />;
    }
    return (
      <CurrencyProvider currency={data.settings?.currency}>
        <SaveErrorBanner message={saveError} onDismiss={dismissSaveError} />
        <ClientPortal
          data={data}
          clientId={portalClient}
          onExit={exitPortal}
          onAddPost={actions.addPost}
          onUpdatePost={actions.updatePost}
          onAddContact={actions.addContact}
          onUpdateStage={actions.updateStage}
          onAddComment={actions.addComment}
          onUpdatePostStatus={actions.updatePostStatus}
        />
      </CurrencyProvider>
    );
  }

  // ---- Owner dashboard ----
  return (
    <CurrencyProvider currency={data.settings?.currency}>
    <div className="flex flex-col md:flex-row min-h-screen bg-canvas">
      <SaveErrorBanner message={saveError} onDismiss={dismissSaveError} />
      <MobileTopBar onPreviewPortal={() => setPortalMode(true)} />
      <Sidebar view={view} setView={setView} onPreviewPortal={() => setPortalMode(true)} />

      <main className="flex-1 min-w-0 p-4 md:p-8 pb-24 md:pb-8 max-w-[1400px]">
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
            onAddTask={actions.addTask}
            onToggleTask={actions.toggleTask}
            onDeleteTask={actions.deleteTask}
          />
        )}

        {view === "crm" && (
          <CRM data={data} onAddContact={actions.addContact} onUpdateStage={actions.updateStage} />
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
      </main>

      <MobileBottomNav view={view} setView={setView} />
    </div>
    </CurrencyProvider>
  );
}
