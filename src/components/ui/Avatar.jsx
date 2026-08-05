import { colorForName, initials } from "../../lib/utils";

export default function Avatar({ name, photoUrl, logoUrl, size = 40, ring = false }) {
  const dim = { width: size, height: size };
  return (
    <div className={`relative shrink-0 ${ring ? "ring-2 ring-white rounded-full" : ""}`} style={dim}>
      {photoUrl ? (
        <img src={photoUrl} alt={name} className="w-full h-full rounded-full object-cover" />
      ) : (
        <div
          className={`w-full h-full rounded-full flex items-center justify-center text-white font-semibold ${colorForName(name)}`}
          style={{ fontSize: size * 0.36 }}
        >
          {initials(name) || "?"}
        </div>
      )}
      {logoUrl && (
        <img
          src={logoUrl}
          alt=""
          className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white object-cover bg-white"
        />
      )}
    </div>
  );
}
