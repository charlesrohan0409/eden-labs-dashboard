import { Component } from "react";
import { AlertTriangle } from "lucide-react";

// Without this, one bad render — a malformed client, a chart handed a null —
// unmounts the entire app and leaves a blank white page with no way back.
// Data is safe in localStorage, so a reload always recovers; this just says so.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled render error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
        <div className="max-w-md w-full bg-white border border-line rounded-2xl p-8 text-center">
          <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={18} />
          </div>
          <div className="text-lg font-bold tracking-tight text-stone-900">Something broke on this screen</div>
          <p className="text-sm text-stone-500 mt-2">
            Your data is saved — nothing was lost. Reloading usually clears it.
          </p>
          <pre className="text-[11px] text-stone-400 bg-stone-50 rounded-lg p-3 mt-4 text-left overflow-x-auto">
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 w-full bg-emerald-800 text-white text-sm font-medium rounded-xl py-2.5 hover:bg-emerald-900 transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
