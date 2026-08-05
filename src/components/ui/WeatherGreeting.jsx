import { useEffect, useState } from "react";
import { useWeather } from "../../hooks/useWeather";

// Ticks once a minute so "Good morning" doesn't silently go stale into the
// afternoon if the tab's just left open — the old version computed this
// once per render and nothing ever forced a re-render on its own.
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function greetingFor(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const GRADIENTS = {
  clear: "linear-gradient(135deg, #38bdf8, #0ea5e9)",
  cloudy: "linear-gradient(135deg, #64748b, #94a3b8)",
  fog: "linear-gradient(135deg, #a8a29e, #d6d3d1)",
  rain: "linear-gradient(135deg, #475569, #64748b)",
  snow: "linear-gradient(135deg, #60a5fa, #93c5fd)",
  thunderstorm: "linear-gradient(135deg, #334155, #1e293b)",
};

// Fixed positions for decorative elements — randomizing on every render
// would make rain/snow/stars visibly jump around each time React re-renders
// for an unrelated reason (the clock tick, a data update, etc).
const RAINDROPS = Array.from({ length: 24 }, (_, i) => ({
  left: (i * 4.3) % 100,
  delay: (i * 0.15) % 2,
  duration: 0.6 + (i % 5) * 0.1,
}));
const SNOWFLAKES = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 5.7) % 100,
  delay: (i * 0.4) % 5,
  duration: 4 + (i % 4),
  size: 3 + (i % 3),
}));
const STARS = Array.from({ length: 20 }, (_, i) => ({
  left: (i * 4.9 + 2) % 100,
  top: (i * 7.3) % 70,
  delay: (i * 0.3) % 3,
  size: 1.5 + (i % 3) * 0.5,
}));
const CLOUDS = [
  { top: 15, scale: 1, duration: 40, delay: 0 },
  { top: 45, scale: 0.7, duration: 55, delay: -15 },
  { top: 65, scale: 0.85, duration: 48, delay: -30 },
];

export default function WeatherGreeting({ name = "Charles" }) {
  const now = useClock();
  const weather = useWeather();
  const greeting = greetingFor(now.getHours());
  const category = weather.available ? weather.category : null;
  const isDay = weather.isDay !== false;
  const gradient = GRADIENTS[category] || "linear-gradient(135deg, #44403c, #57534e)";

  return (
    <div
      className="relative overflow-hidden rounded-2xl px-6 py-7 sm:py-8 flex-1 min-w-[16rem]"
      style={{ background: weather.available ? gradient : "linear-gradient(135deg, #1c1917, #292524)" }}
    >
      <style>{`
        @keyframes edenSunPulse { 0%, 100% { opacity: .55; transform: scale(1); } 50% { opacity: .85; transform: scale(1.08); } }
        @keyframes edenSunSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes edenTwinkle { 0%, 100% { opacity: .15; } 50% { opacity: 1; } }
        @keyframes edenDrift { from { transform: translateX(-20%); } to { transform: translateX(120%); } }
        @keyframes edenFall { from { transform: translateY(-10%); opacity: 0; } 10% { opacity: 1; } to { transform: translateY(340%); opacity: .2; } }
        @keyframes edenSway { 0%, 100% { margin-left: 0; } 50% { margin-left: 10px; } }
        @keyframes edenFlash { 0%, 96%, 100% { opacity: 0; } 97%, 99% { opacity: .5; } }
      `}</style>

      {/* ---- night overlay + stars ---- */}
      {weather.available && !isDay && (
        <>
          <div className="absolute inset-0 bg-slate-900/35" />
          {STARS.map((s, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-white"
              style={{
                left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size,
                animation: `edenTwinkle ${2 + (i % 3)}s ease-in-out ${s.delay}s infinite`,
              }}
            />
          ))}
        </>
      )}

      {/* ---- clear: sun (day) or moon (night) ---- */}
      {category === "clear" && isDay && (
        <div className="absolute -top-4 right-6 w-20 h-20 sm:w-24 sm:h-24">
          <div
            className="absolute inset-0 rounded-full bg-white"
            style={{ animation: "edenSunPulse 3.5s ease-in-out infinite" }}
          />
          <div className="absolute inset-0" style={{ animation: "edenSunSpin 50s linear infinite" }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="absolute bg-white/70 rounded-full"
                style={{
                  width: 3, height: 14, left: "calc(50% - 1.5px)", top: -10,
                  transform: `rotate(${i * 45}deg)`, transformOrigin: "50% 55px",
                }}
              />
            ))}
          </div>
        </div>
      )}
      {category === "clear" && !isDay && (
        <div className="absolute -top-2 right-8 w-14 h-14 rounded-full bg-slate-100/90" style={{ boxShadow: "-10px 3px 0 0 rgba(15,23,42,0.55) inset" }} />
      )}

      {/* ---- cloudy / fog: drifting cloud blobs ---- */}
      {(category === "cloudy" || category === "fog") && (
        <div className="absolute inset-0 overflow-hidden">
          {CLOUDS.map((c, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-white/25 blur-md"
              style={{
                top: `${c.top}%`, width: 140 * c.scale, height: 46 * c.scale, left: "-20%",
                animation: `edenDrift ${c.duration}s linear ${c.delay}s infinite`,
              }}
            />
          ))}
        </div>
      )}

      {/* ---- rain / thunderstorm: falling drops ---- */}
      {(category === "rain" || category === "thunderstorm") && (
        <div className="absolute inset-0 overflow-hidden">
          {RAINDROPS.map((r, i) => (
            <div
              key={i}
              className="absolute w-px h-3 bg-sky-100/70 rounded-full"
              style={{
                left: `${r.left}%`, top: "-10%",
                animation: `edenFall ${r.duration}s linear ${r.delay}s infinite`,
              }}
            />
          ))}
        </div>
      )}

      {/* ---- thunderstorm: occasional flash ---- */}
      {category === "thunderstorm" && (
        <div className="absolute inset-0 bg-white" style={{ animation: "edenFlash 7s ease-in-out infinite" }} />
      )}

      {/* ---- snow: falling flakes ---- */}
      {category === "snow" && (
        <div className="absolute inset-0 overflow-hidden">
          {SNOWFLAKES.map((s, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-white/85"
              style={{
                left: `${s.left}%`, top: "-8%", width: s.size, height: s.size,
                animation: `edenFall ${s.duration}s linear ${s.delay}s infinite, edenSway ${s.duration / 2}s ease-in-out ${s.delay}s infinite`,
              }}
            />
          ))}
        </div>
      )}

      {/* ---- text ---- */}
      <div className="relative z-10" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.25)" }}>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          {greeting}, {name.split(" ")[0]}
        </h1>
        <p className="text-sm text-white/80 mt-1">
          {weather.available && weather.phrase
            ? `${weather.phrase}${weather.temp != null ? ` · ${weather.temp}°C` : ""}`
            : "Stay on top of your clients, delivery, and pipeline."}
        </p>
      </div>
    </div>
  );
}
