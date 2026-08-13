import { useState } from "react";
import { Check, Plug, Loader2, AlertCircle, RefreshCw, User, Coins } from "lucide-react";
import Card, { CardTitle } from "../ui/Card";
import Badge from "../ui/Badge";
import Avatar from "../ui/Avatar";
import ImagePicker from "../ui/ImagePicker";
import PillTabs from "../ui/PillTabs";
import { listBufferChannels } from "../../lib/buffer";
import { testFathomConnection } from "../../lib/fathom";
import { useCurrency } from "../../hooks/useCurrency";
import { CURRENCIES } from "../../lib/currency";

/**
 * Buffer is the odd one out here: its "key" lives server-side (see
 * api/buffer.js), so there's nothing to type into this card. Connecting means
 * actually calling /api/buffer and seeing whether Buffer hands back channels.
 */
function BufferCard({ integration, onChannels, onDisconnected }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const testConnection = async () => {
    setBusy(true);
    setError("");
    try {
      const channels = await listBufferChannels();
      onChannels(channels);
      if (channels.length === 0) {
        setError("Connected, but no channels came back — connect a LinkedIn profile in Buffer first.");
      }
    } catch (e) {
      onDisconnected();
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center shrink-0">
          <Plug size={17} className="text-stone-500" />
        </div>
        {integration.connected && <Badge tone="emerald" dot>Connected</Badge>}
      </div>

      <div className="font-semibold text-stone-800 mt-4">{integration.name}</div>
      <div className="text-xs text-stone-400 mt-1">{integration.desc}</div>

      {integration.connected && integration.channels?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {integration.channels.map((c) => (
            <Badge key={c.id} tone="stone">{c.service ? `${c.service} · ` : ""}{c.name}</Badge>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2 mt-3">
          <AlertCircle size={12} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <button
        onClick={testConnection}
        disabled={busy}
        className={`mt-4 w-full text-xs font-medium py-2.5 rounded-full transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60 ${
          integration.connected ? "bg-stone-100 text-stone-600 hover:bg-stone-200" : "bg-emerald-800 text-white hover:bg-emerald-900"
        }`}
      >
        {busy ? (
          <><Loader2 size={13} className="animate-spin" /> Checking…</>
        ) : integration.connected ? (
          <><RefreshCw size={13} /> Refresh channels</>
        ) : (
          <><Check size={13} /> Test connection</>
        )}
      </button>

      {integration.lastCheckedAt && !error && (
        <div className="text-[11px] text-stone-400 mt-2 text-center">Last checked {integration.lastCheckedAt}</div>
      )}
      {!integration.connected && !error && (
        <div className="text-[11px] text-stone-400 mt-2 text-center">
          Reads BUFFER_API_KEY from the server — see .env.local
        </div>
      )}
    </Card>
  );
}

/**
 * Fathom is the same shape as Buffer: the key lives server-side, so
 * "connected" means the last test against /api/fathom actually succeeded.
 */
function FathomCard({ integration, onConnected, onDisconnected }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [meetingCount, setMeetingCount] = useState(null);

  const testConnection = async () => {
    setBusy(true);
    setError("");
    try {
      const { count } = await testFathomConnection();
      setMeetingCount(count);
      onConnected();
    } catch (e) {
      onDisconnected();
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center shrink-0">
          <Plug size={17} className="text-stone-500" />
        </div>
        {integration.connected && <Badge tone="emerald" dot>Connected</Badge>}
      </div>

      <div className="font-semibold text-stone-800 mt-4">{integration.name}</div>
      <div className="text-xs text-stone-400 mt-1">{integration.desc}</div>

      {integration.connected && meetingCount != null && (
        <div className="text-[11px] text-stone-500 mt-3">{meetingCount} recording{meetingCount === 1 ? "" : "s"} on this page</div>
      )}

      {error && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2 mt-3">
          <AlertCircle size={12} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <button
        onClick={testConnection}
        disabled={busy}
        className={`mt-4 w-full text-xs font-medium py-2.5 rounded-full transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60 ${
          integration.connected ? "bg-stone-100 text-stone-600 hover:bg-stone-200" : "bg-emerald-800 text-white hover:bg-emerald-900"
        }`}
      >
        {busy ? (
          <><Loader2 size={13} className="animate-spin" /> Checking…</>
        ) : integration.connected ? (
          <><RefreshCw size={13} /> Re-test</>
        ) : (
          <><Check size={13} /> Test connection</>
        )}
      </button>

      {integration.lastCheckedAt && !error && (
        <div className="text-[11px] text-stone-400 mt-2 text-center">Last checked {integration.lastCheckedAt}</div>
      )}
      {!integration.connected && !error && (
        <div className="text-[11px] text-stone-400 mt-2 text-center">
          Reads FATHOM_API_KEY from the server — see .env.local
        </div>
      )}
    </Card>
  );
}

/**
 * The owner's own identity. This is what shows as the author in the post
 * composer and preview — it used to be a hardcoded "Eden Labs" string in
 * ContentPage.jsx, which meant the preview never looked like Charles's
 * actual LinkedIn presence.
 */
function ProfileCard({ profile, onUpdateProfile, token }) {
  const [form, setForm] = useState(profile);
  const [saved, setSaved] = useState(false);

  const save = () => {
    onUpdateProfile(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(profile);
  const inputCls = "border border-line rounded-lg px-3 py-2 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-emerald-700/20";

  return (
    <Card className="p-5">
      <CardTitle sub="Shown as the author on your posts and in the composer preview">
        <span className="flex items-center gap-2"><User size={15} className="text-violet-600" /> Your profile</span>
      </CardTitle>

      <div className="flex items-start gap-4 flex-wrap">
        <ImagePicker
          round
          label="Your photo"
          hint="Appears on every post preview"
          value={form.photoUrl}
          onChange={(photoUrl) => setForm({ ...form, photoUrl })}
          token={token}
        />
        <div className="flex-1 min-w-[14rem] space-y-2">
          <div>
            <label className="text-xs text-stone-500 font-medium">Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${inputCls} mt-1`} />
          </div>
          <div>
            <label className="text-xs text-stone-500 font-medium">Headline</label>
            <input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} className={`${inputCls} mt-1`} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4 pt-4 border-t border-stone-100">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <Avatar name={form.name} photoUrl={form.photoUrl} size={34} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-stone-800 truncate">{form.name || "Your name"}</div>
            <div className="text-[11px] text-stone-400 truncate">{form.headline}</div>
          </div>
        </div>
        <button
          onClick={save}
          disabled={!dirty}
          className="text-xs font-medium px-4 py-2 rounded-full bg-emerald-800 text-white hover:bg-emerald-900 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {saved ? "Saved" : "Save"}
        </button>
      </div>
    </Card>
  );
}

/**
 * Display currency. Amounts are stored in USD and converted at render time —
 * switching here never rewrites what an invoice is actually worth.
 */
function CurrencyCard({ currency, onSetCurrency }) {
  const { money, rate, fxStale, fxLoading } = useCurrency();

  return (
    <Card className="p-5">
      <CardTitle sub="Everything is stored in USD and converted for display">
        <span className="flex items-center gap-2"><Coins size={15} className="text-amber-600" /> Currency</span>
      </CardTitle>

      <PillTabs
        value={currency}
        onChange={onSetCurrency}
        options={Object.values(CURRENCIES).map((c) => ({ value: c.code, label: `${c.symbol} ${c.code}` }))}
      />

      <div className="mt-4 pt-4 border-t border-stone-100 space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-stone-500">$1,000 shows as</span>
          <span className="font-semibold text-stone-800 tnum">{money(1000)}</span>
        </div>
        {currency !== "USD" && (
          <div className="text-[11px] text-stone-400">
            {fxLoading
              ? "Fetching live rate…"
              : `1 USD = ${rate ? rate.toFixed(2) : "—"} ${currency}${fxStale ? " (approximate — couldn't reach the rate service)" : " · live rate, cached 12h"}`}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function IntegrationsPage({
  data, onToggle, onBufferChannels, onBufferDisconnected,
  onFathomConnected, onFathomDisconnected, onUpdateProfile, onSetCurrency, token,
}) {
  const connected = data.integrations.filter((i) => i.connected).length;
  const others = data.integrations.filter((i) => i.id !== "buffer" && i.id !== "fathom");
  const buffer = data.integrations.find((i) => i.id === "buffer");
  const fathom = data.integrations.find((i) => i.id === "fathom");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-stone-900">Settings &amp; integrations</h1>
        <p className="text-sm text-stone-500 mt-1">
          {connected} of {data.integrations.length} services connected.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ProfileCard profile={data.profile} onUpdateProfile={onUpdateProfile} token={token} />
        <CurrencyCard currency={data.settings?.currency || "USD"} onSetCurrency={onSetCurrency} />
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {buffer && (
          <BufferCard integration={buffer} onChannels={onBufferChannels} onDisconnected={onBufferDisconnected} />
        )}
        {fathom && (
          <FathomCard integration={fathom} onConnected={onFathomConnected} onDisconnected={onFathomDisconnected} />
        )}

        {others.map((i) => (
          <Card key={i.id} className="p-5 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center shrink-0">
                <Plug size={17} className="text-stone-500" />
              </div>
              {/* These are manual status toggles only — no live API is wired.
                  Show a "manual" badge instead of "Connected" to avoid the
                  impression that data is actually syncing. */}
              {i.connected
                ? <Badge tone="stone" dot>Marked active</Badge>
                : <Badge tone="stone">Placeholder</Badge>}
            </div>

            <div className="font-semibold text-stone-800 mt-4">{i.name}</div>
            <div className="text-xs text-stone-400 mt-1 flex-1">{i.desc}</div>

            <button
              onClick={() => onToggle(i.id)}
              className="mt-4 w-full text-xs font-medium py-2.5 rounded-full transition-colors flex items-center justify-center gap-1.5 bg-stone-100 text-stone-600 hover:bg-stone-200"
            >
              {i.connected ? "Unmark" : "Mark as active"}
            </button>

            <div className="text-[11px] text-stone-400 mt-2 text-center">
              Manual toggle — no live API connected yet
            </div>
          </Card>
        ))}
      </div>

      <div className="text-xs text-stone-400">
        Buffer and Fathom call the real APIs — the rest are placeholders until each provider's
        OAuth and a backend token store are wired up.
      </div>
    </div>
  );
}
