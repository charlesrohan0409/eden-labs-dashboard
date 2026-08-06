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

// Multi-stop, photographic-feeling skies (modelled on Apple Weather's card
// backgrounds) rather than a flat two-colour gradient — clear/day and
// clear/night get their own treatment since that's the biggest visual swing;
// everything else stays one gradient with a night-darkening overlay layered
// on top instead of a whole second set of colours to keep this from
// exploding into a dozen near-duplicate gradients.
const GRADIENTS = {
  "clear-day": "linear-gradient(160deg, #fde9c8 0%, #7dc4f2 42%, #3b82f6 75%, #1d4ed8 100%)",
  "clear-night": "linear-gradient(165deg, #2a3a5c 0%, #16213e 45%, #0b1226 80%, #05070f 100%)",
  cloudy: "linear-gradient(150deg, #b6c2d1 0%, #8a97ab 45%, #5f6b80 80%, #48525f 100%)",
  fog: "linear-gradient(150deg, #b9b0a3 0%, #948b7d 45%, #6f665c 80%, #55504a 100%)",
  rain: "linear-gradient(150deg, #71809a 0%, #57647c 40%, #3e4a60 75%, #2b3546 100%)",
  snow: "linear-gradient(150deg, #d6ecfb 0%, #93c9ef 40%, #4f9bd6 75%, #2f74ad 100%)",
  thunderstorm: "linear-gradient(150deg, #4b5468 0%, #333c4d 40%, #1f2532 75%, #0f1219 100%)",
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
  { top: 10, scale: 1.1, duration: 42, delay: 0 },
  { top: 40, scale: 0.75, duration: 55, delay: -15 },
  { top: 62, scale: 0.9, duration: 48, delay: -30 },
];

export default function WeatherGreeting({ name = "Charles" }) {
  const now = useClock();
  const weather = useWeather();
  const greeting = greetingFor(now.getHours());
  const category = weather.available ? weather.category : null;
  const isDay = weather.isDay !== false;
  const gradientKey = category === "clear" ? (isDay ? "clear-day" : "clear-night") : category;
  const gradient = GRADIENTS[gradientKey] || "linear-gradient(150deg, #57534e, #2b2825)";

  return (
    <div
      className="relative overflow-hidden rounded-2xl px-6 py-4 sm:py-5 flex-1 min-w-[16rem]"
      style={{ background: weather.available ? gradient : "linear-gradient(150deg, #292524, #1c1917)" }}
    >
      <style>{`
        @keyframes edenSunPulse { 0%, 100% { opacity: .7; transform: scale(1); } 50% { opacity: 1; transform: scale(1.06); } }
        @keyframes edenGlowDrift { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-3%, 2%) scale(1.08); } }
        @keyframes edenTwinkle { 0%, 100% { opacity: .15; } 50% { opacity: 1; } }
        @keyframes edenDrift { from { transform: translateX(-20%); } to { transform: translateX(120%); } }
        @keyframes edenFall { from { transform: translateY(-10%); opacity: 0; } 10% { opacity: 1; } to { transform: translateY(340%); opacity: .2; } }
        @keyframes edenSway { 0%, 100% { margin-left: 0; } 50% { margin-left: 10px; } }
        @keyframes edenFlash { 0%, 96%, 100% { opacity: 0; } 97%, 99% { opacity: .5; } }
      `}</style>

      {/* ---- soft atmospheric glow — the photographic-haze layer every
          category gets, tuned warm for sun / cool for everything else,
          instead of a flat gradient reading as a solid colour block ---- */}
      {weather.available && (
        <div
          className="absolute inset-0"
          style={{
            background:
              category === "clear" && isDay
                ? "radial-gradient(ellipse 70% 90% at 78% 15%, rgba(255,244,214,0.75) 0%, rgba(255,244,214,0) 60%)"
                : category === "clear" && !isDay
                ? "radial-gradient(ellipse 55% 70% at 80% 10%, rgba(180,200,255,0.18) 0%, rgba(180,200,255,0) 65%)"
                : category === "snow"
                ? "radial-gradient(ellipse 80% 70% at 20% 0%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 60%)"
                : "radial-gradient(ellipse 80% 70% at 15% 0%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 65%)",
            animation: "edenGlowDrift 14s ease-in-out infinite",
          }}
        />
      )}

      {/* ---- night overlay + stars ---- */}
      {weather.available && !isDay && (
        <>
          <div className="absolute inset-0 bg-slate-950/25" />
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

      {/* ---- clear: soft sun glow (day) or moon (night) ---- */}
      {category === "clear" && isDay && (
        <div className="absolute -top-6 right-8 w-16 h-16 sm:w-20 sm:h-20">
          <div className="absolute inset-[-60%] rounded-full bg-amber-100/40 blur-2xl" />
          <div
            className="absolute inset-0 rounded-full bg-gradient-to-br from-white to-amber-100"
            style={{ animation: "edenSunPulse 3.5s ease-in-out infinite", boxShadow: "0 0 24px 6px rgba(255,244,214,0.55)" }}
          />
        </div>
      )}
      {category === "clear" && !isDay && (
        <div className="absolute -top-2 right-8 w-12 h-12 rounded-full bg-slate-100/90" style={{ boxShadow: "-9px 3px 0 0 rgba(11,18,38,0.6) inset, 0 0 18px 2px rgba(226,232,255,0.25)" }} />
      )}

      {/* ---- cloudy / fog: drifting cloud blobs ---- */}
      {(category === "cloudy" || category === "fog") && (
        <div className="absolute inset-0 overflow-hidden">
          {CLOUDS.map((c, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-white/20 blur-lg"
              style={{
                top: `${c.top}%`, width: 150 * c.scale, height: 42 * c.scale, left: "-20%",
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
      <div className="relative z-10" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          {greeting}, {name.split(" ")[0]}
        </h1>
        <p className="text-sm text-white/85 mt-0.5">
          {weather.available && weather.phrase
            ? `${weather.phrase}${weather.temp != null ? ` · ${weather.temp}°C` : ""}`
            : "Stay on top of your clients, delivery, and pipeline."}
        </p>
      </div>
    </div>
  );
}
