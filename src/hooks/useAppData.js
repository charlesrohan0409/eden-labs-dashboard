import { useCallback, useEffect, useState } from "react";
import { seedData } from "../data/seed";
import { migrateData } from "../data/migrate";
import { today, uid } from "../lib/utils";

const STORAGE_KEY = "eden-labs-v1-data";

// TEMPORARY persistence layer.
//
// The original artifact called `window.storage`, which only exists inside
// claude.ai. Outside it we fall back to localStorage so the app runs locally.
// Both are placeholders — this whole module gets swapped for Supabase reads
// and writes in the next pass, which is why every call site goes through
// loadData/saveData rather than touching storage directly.
const store = {
  async get(key) {
    if (typeof window !== "undefined" && window.storage?.get) {
      const res = await window.storage.get(key);
      return res?.value ?? null;
    }
    return localStorage.getItem(key);
  },
  async set(key, value) {
    if (typeof window !== "undefined" && window.storage?.set) return window.storage.set(key, value);
    localStorage.setItem(key, value);
  },
};

export async function loadData() {
  try {
    const raw = await store.get(STORAGE_KEY);
    return raw ? migrateData(JSON.parse(raw)) : seedData();
  } catch {
    return seedData();
  }
}

// Returns whether the save actually landed, instead of swallowing failures —
// a full localStorage quota (real risk now that posts carry base64 images)
// used to fail completely silently: the UI would show the change as saved
// when the next reload would lose it. Callers surface this to the user.
export async function saveData(data) {
  try {
    await store.set(STORAGE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch (e) {
    console.error("Save failed", e);
    const quotaExceeded = e.name === "QuotaExceededError" || e.code === 22;
    return {
      ok: false,
      error: quotaExceeded
        ? "Storage is full — this change wasn't saved. Remove some images/videos from posts to free up space."
        : `This change wasn't saved: ${e.message}`,
    };
  }
}

export function useAppData() {
  const [data, setData] = useState(null);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    loadData().then(setData);
  }, []);

  // Every mutation clones, mutates, persists, and returns the next state.
  const update = useCallback((mutator) => {
    setData((prev) => {
      const next = mutator(structuredClone(prev));
      saveData(next).then((result) => setSaveError(result.ok ? "" : result.error));
      return next;
    });
  }, []);

  const actions = {
    // ---- tasks ----
    addTask: (t) => update((d) => {
      d.tasks.push({ id: uid(), done: false, createdAt: today(), priority: "medium", clientId: null, dueDate: "", ...t });
      return d;
    }),
    toggleTask: (id) => update((d) => {
      const t = d.tasks.find((x) => x.id === id);
      if (t) t.done = !t.done;
      return d;
    }),
    updateTask: (id, patch) => update((d) => {
      const t = d.tasks.find((x) => x.id === id);
      if (t) Object.assign(t, patch);
      return d;
    }),
    deleteTask: (id) => update((d) => {
      d.tasks = d.tasks.filter((x) => x.id !== id);
      return d;
    }),

    // ---- clients ----
    addClient: (client) => update((d) => { d.clients.push(client); return d; }),
    updateContract: (id, contract) => update((d) => {
      const c = d.clients.find((x) => x.id === id);
      if (c) c.contract = contract;
      return d;
    }),
    updateDelivery: (id, idx, val) => update((d) => {
      const c = d.clients.find((x) => x.id === id);
      if (c && c.delivery[idx]) c.delivery[idx].current = val;
      return d;
    }),
    // Ending a contract keeps the client and their history — it flips them to
    // "ended" so they stop being billed and drop out of MRR.
    endContract: (id, reason) => update((d) => {
      const c = d.clients.find((x) => x.id === id);
      if (c) {
        c.status = "ended";
        c.contract = { ...c.contract, status: "ended", endedAt: today(), endReason: reason || "" };
      }
      return d;
    }),
    // ---- contacts / CRM ----
    addContact: (c) => update((d) => {
      d.contacts.push({ id: uid(), stage: "lead", ...c });
      return d;
    }),
    updateStage: (id, stage) => update((d) => {
      const c = d.contacts.find((x) => x.id === id);
      if (c) {
        c.stage = stage;
        c.closedDate = stage === "closed" ? today() : null;
      }
      return d;
    }),

    // ---- content ----
    addPost: (p) => update((d) => { d.posts.push({ id: uid(), ...p }); return d; }),
    updatePost: (id, patch) => update((d) => {
      const p = d.posts.find((x) => x.id === id);
      if (p) Object.assign(p, patch);
      return d;
    }),
    updatePostStatus: (id, status) => update((d) => {
      const p = d.posts.find((x) => x.id === id);
      if (p) p.status = status;
      return d;
    }),
    deletePost: (id) => update((d) => {
      d.posts = d.posts.filter((x) => x.id !== id);
      return d;
    }),
    addSwipe: (s) => update((d) => { d.swipeFile.push({ id: uid(), ...s }); return d; }),
    addDM: (dm) => update((d) => { d.dms.push({ id: uid(), ...dm }); return d; }),
    addComment: (c) => update((d) => { d.comments.push({ id: uid(), ...c }); return d; }),

    // ---- finance ----
    addExpense: (e) => update((d) => { d.expenses.push({ id: uid(), ...e }); return d; }),
    addInvoice: (i) => update((d) => { d.invoices.push({ id: uid(), status: "pending", ...i }); return d; }),
    updateInvoiceStatus: (id, status) => update((d) => {
      const i = d.invoices.find((x) => x.id === id);
      if (i) i.status = status;
      return d;
    }),
    // Bills every active client that has no invoice for `period` yet.
    generateInvoices: (period) => {
      if (!data) return { created: 0, skipped: 0 };
      const activeClients = data.clients.filter((c) => c.status === "active");
      const alreadyInvoiced = new Set(data.invoices.filter((i) => i.period === period).map((i) => i.clientId));
      const toCreate = activeClients.filter((c) => !alreadyInvoiced.has(c.id));
      update((d) => {
        toCreate.forEach((c) => {
          d.invoices.push({
            id: uid(), clientId: c.id, amount: c.contract.value,
            status: "pending", date: today(), period,
          });
        });
        return d;
      });
      return { created: toCreate.length, skipped: activeClients.length - toCreate.length };
    },

    // ---- profile & settings ----
    updateProfile: (patch) => update((d) => {
      d.profile = { ...d.profile, ...patch };
      return d;
    }),
    setCurrency: (currency) => update((d) => {
      d.settings = { ...d.settings, currency };
      return d;
    }),

    // ---- misc ----
    logGrowth: (entry) => update((d) => { d.growthLog.push(entry); return d; }),
    toggleIntegration: (id) => update((d) => {
      const i = d.integrations.find((x) => x.id === id);
      if (i) i.connected = !i.connected;
      return d;
    }),
    // Fathom's key lives server-side now (FATHOM_API_KEY) — this just
    // records whether the last /api/fathom test round trip succeeded.
    setFathomConnected: () => update((d) => {
      const i = d.integrations.find((x) => x.id === "fathom");
      if (i) { i.connected = true; i.lastCheckedAt = today(); }
      return d;
    }),
    setFathomDisconnected: () => update((d) => {
      const i = d.integrations.find((x) => x.id === "fathom");
      if (i) i.connected = false;
      return d;
    }),
    // Called after a successful /api/buffer round trip lists the account's
    // channels — this is what "connected" actually means for Buffer, rather
    // than a manually-flipped boolean like the other integrations use.
    setBufferChannels: (channels) => update((d) => {
      const i = d.integrations.find((x) => x.id === "buffer");
      if (i) {
        i.channels = channels;
        i.connected = channels.length > 0;
        i.lastCheckedAt = today();
      }
      return d;
    }),
    setBufferDisconnected: () => update((d) => {
      const i = d.integrations.find((x) => x.id === "buffer");
      if (i) { i.connected = false; i.channels = []; }
      return d;
    }),
    setAgencyBufferChannel: (channelId) => update((d) => {
      const i = d.integrations.find((x) => x.id === "buffer");
      if (i) i.agencyChannelId = channelId || null;
      return d;
    }),
  };

  return { data, update, actions, saveError, dismissSaveError: () => setSaveError("") };
}
