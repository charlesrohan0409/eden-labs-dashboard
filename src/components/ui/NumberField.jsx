import { useEffect, useRef, useState } from "react";

/**
 * A number input that commits on blur/Enter instead of on every keystroke.
 *
 * The pattern it replaces looked reasonable and behaved badly:
 *
 *   value={client.contract.value}
 *   onChange={(e) => onUpdateContract(id, { ...c, value: Number(e.target.value) })}
 *
 * Three things went wrong with that. You couldn't clear the field, because
 * Number("") is 0, so backspacing wrote a 0 and the input snapped back to
 * "0" — typing 5000 from there gave you 05000. Every character fired a full
 * blob save, which is exactly the write amplification that blew the bandwidth
 * budget once already. And because those saves all carried the same version
 * token, all but the first got a 409 and were replayed onto older data, so the
 * number could visibly jump backwards while you typed and persist something
 * you never entered.
 *
 * Buffering locally fixes all three: one save per edit, an empty field stays
 * empty while you retype, and there's no in-flight pile-up to conflict.
 *
 * The value re-syncs from props only while unfocused, so a background refresh
 * can't yank the field out from under someone mid-edit.
 */
export default function NumberField({
  value, onCommit, className = "", allowEmpty = false, ...rest
}) {
  const [draft, setDraft] = useState(value ?? "");
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(value ?? "");
  }, [value]);

  const commit = () => {
    focused.current = false;
    const trimmed = String(draft).trim();
    if (trimmed === "") {
      if (allowEmpty) { onCommit(null); return; }
      setDraft(value ?? "");   // put back what was there rather than writing 0
      return;
    }
    const n = Number(trimmed);
    if (Number.isNaN(n)) { setDraft(value ?? ""); return; }
    if (n !== value) onCommit(n);
  };

  return (
    <input
      type="number"
      value={draft}
      onFocus={() => { focused.current = true; }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === "Escape") { setDraft(value ?? ""); e.currentTarget.blur(); }
      }}
      className={className}
      {...rest}
    />
  );
}
