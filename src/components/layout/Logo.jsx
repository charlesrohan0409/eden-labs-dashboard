import wordmark from "../../assets/eden-labs-wordmark.png";

// The real brand lockup — cropped from the source artwork (amber "Eden" +
// white "Labs" on its own dark card), rather than a generated placeholder.
// It carries its own dark background, so it reads cleanly whether it sits
// on the night sidebar or a white card (OwnerLogin) — no light/dark variant
// needed, unlike a transparent mark would.
export function LogoMark({ size = 32 }) {
  return (
    <img
      src={wordmark}
      alt="Eden Labs"
      className="rounded-lg shrink-0"
      style={{ height: size, width: "auto" }}
    />
  );
}

// `tone` and `showBadge` are kept as props for backward compatibility with
// existing call sites, but the real wordmark image is self-contained (own
// background + both colors baked in) so neither actually changes anything
// here anymore.
export default function Logo({ size = 32 }) {
  return (
    <img
      src={wordmark}
      alt="Eden Labs"
      className="rounded-lg shrink-0"
      style={{ height: size, width: "auto" }}
    />
  );
}
