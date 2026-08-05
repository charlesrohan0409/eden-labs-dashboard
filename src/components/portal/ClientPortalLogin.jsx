import { useState } from "react";
import { Lock, ArrowLeft } from "lucide-react";
import Card from "../ui/Card";
import PrimaryButton from "../ui/PrimaryButton";

export default function ClientPortalLogin({ data, onLogin, onExit }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    const client = data.clients.find((c) => c.pin === pin);
    if (client) onLogin(client.id);
    // Never hint at valid PINs here — this screen is public, and the old copy
    // listed three real clients' working PINs to anyone who guessed wrong.
    else setError("That PIN didn't match. Check the one Eden Labs sent you.");
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

          <PrimaryButton className="w-full mt-4" onClick={submit}>Enter</PrimaryButton>

          <div className="text-[11px] text-stone-400 mt-5">
            Placeholder auth — replaced with per-client Supabase sessions in step 4.
          </div>
        </Card>

        <button
          onClick={onExit}
          className="mt-4 mx-auto flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800"
        >
          <ArrowLeft size={13} /> Back to the ops dashboard
        </button>
      </div>
    </div>
  );
}
