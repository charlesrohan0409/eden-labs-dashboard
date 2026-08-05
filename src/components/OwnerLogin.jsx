import { useState } from "react";
import { Lock } from "lucide-react";
import Card from "./ui/Card";
import PrimaryButton from "./ui/PrimaryButton";

// Gates the entire owner dashboard. The PIN is checked server-side against a
// hashed value in Supabase (/api/auth-owner) — nothing about "what the right
// PIN is" ships to the browser. A successful login mints a signed session
// token good for 30 days, stored in localStorage, which is what makes
// "log in once, open the dashboard from any device" actually work.
export default function OwnerLogin({ onLogin, loading, error }) {
  const [pin, setPin] = useState("");

  const submit = () => {
    if (!pin.trim() || loading) return;
    onLogin(pin.trim());
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <Card className="p-8 text-center">
          <div className="w-11 h-11 rounded-2xl bg-emerald-800 text-white flex items-center justify-center mx-auto mb-4">
            <Lock size={17} />
          </div>
          <div className="text-xl font-bold tracking-tight text-stone-900">Eden Labs</div>
          <div className="text-xs text-stone-400 mt-1 mb-6">Enter your PIN to open the dashboard</div>

          <input
            autoFocus
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="••••••"
            inputMode="numeric"
            className="w-full text-center tracking-[0.4em] text-xl border border-line rounded-xl py-3 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
          />
          {error && <div className="text-xs text-rose-600 mt-2">{error}</div>}

          <PrimaryButton className="w-full mt-4" onClick={submit} disabled={loading}>
            {loading ? "Checking…" : "Enter"}
          </PrimaryButton>

          <div className="text-[11px] text-stone-400 mt-5">
            Your session stays signed in on this device for 30 days.
          </div>
        </Card>
      </div>
    </div>
  );
}
