import { useState } from "react";
import { Lock, ArrowLeft } from "lucide-react";
import Card from "../ui/Card";
import PrimaryButton from "../ui/PrimaryButton";

// PIN is verified server-side (/api/auth-client) against a hashed value in
// Supabase — replaced the old `data.clients.find(c => c.pin === pin)` check,
// which compared against every client's plaintext PIN sitting in the
// browser's own copy of the full dashboard blob. A successful login mints a
// signed, client-scoped session token; onLogin hands that up so the parent
// can fetch only this client's data through /api/portal-data.
export default function ClientPortalLogin({ onLogin, onExit }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!pin.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.token) {
        setError(json.error || "That PIN didn't match.");
        return;
      }
      onLogin({ token: json.token, clientId: json.clientId });
    } catch (e) {
      setError(e.message || "Couldn't reach the server — check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <Card className="p-8 text-center">
          <div className="w-11 h-11 rounded-2xl bg-emerald-800 text-white flex items-center justify-center mx-auto mb-4">
            <Lock size={17} />
          </div>
          <div className="text-xl font-bold tracking-tight text-stone-900">Client Portal</div>
          <div className="text-xs text-stone-400 mt-1 mb-6">Enter your PIN to view your dashboard</div>

          <input
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="••••"
            inputMode="numeric"
            className="w-full text-center tracking-[0.4em] text-xl border border-line rounded-xl py-3 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
          />
          {error && <div className="text-xs text-rose-600 mt-2">{error}</div>}

          <PrimaryButton className="w-full mt-4" onClick={submit} disabled={loading}>
            {loading ? "Checking…" : "Enter"}
          </PrimaryButton>
        </Card>

        {/* Only present when the owner opened this via "Preview client
            portal" from their own session — a real client arriving through
            their shared link has no ops dashboard to go back to. */}
        {onExit && (
          <button
            onClick={onExit}
            className="mt-4 mx-auto flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800"
          >
            <ArrowLeft size={13} /> Back to the ops dashboard
          </button>
        )}
      </div>
    </div>
  );
}
