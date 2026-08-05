import { useEffect, useRef, useState } from "react";

// Open-Meteo — no API key, no signup, free for this volume of traffic, and
// its CORS headers are explicitly meant for calling straight from browser
// JS. That's why this is the one third-party call in the app that does NOT
// go through a /api/* proxy: the server-side-secret rule exists to keep
// keys out of the client bundle, and there's no key here to protect.
//
// WMO weather codes (what Open-Meteo's `weathercode` returns) collapsed
// into the handful of visual categories the header actually animates.
function categorize(code) {
  if (code === 0) return "clear";
  if ([1, 2, 3].includes(code)) return "cloudy";
  if ([45, 48].includes(code)) return "fog";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "thunderstorm";
  return "cloudy";
}

const PHRASES = {
  clear: {
    day: ["Not a cloud in sight", "Clear skies out there", "Sun's out today", "Bright one out there"],
    night: ["Clear night out there", "Stars are out tonight", "Quiet, clear night"],
  },
  cloudy: {
    day: ["A bit overcast out there", "Cloudy skies today", "Grey skies outside"],
    night: ["Cloudy night out there", "Overcast tonight"],
  },
  fog: {
    day: ["Foggy out there today", "Bit hazy outside", "Low visibility out there"],
    night: ["Foggy night out there", "Misty out there tonight"],
  },
  rain: {
    day: ["Guess it's raining", "Looks rainy out there", "Bring an umbrella today", "Rain's coming down"],
    night: ["Raining out there tonight", "Wet one out there"],
  },
  snow: {
    day: ["It's snowing out there", "Snow's falling today", "White out there today"],
    night: ["Snowing out there tonight", "Quiet, snowy night"],
  },
  thunderstorm: {
    day: ["Thunderstorms rolling in", "Stormy out there", "Loud skies today"],
    night: ["Storm rolling in tonight", "Thunder out there"],
  },
};

export function weatherPhrase(category, isDay) {
  const bank = PHRASES[category] || PHRASES.cloudy;
  const list = isDay ? bank.day : bank.night;
  return list[Math.floor(Math.random() * list.length)];
}

const REFRESH_MS = 20 * 60 * 1000; // weather itself only changes hour-to-hour

/**
 * Geolocates once (browser permission prompt — the user grants or denies
 * this themselves, same as any site asking for location), then polls
 * Open-Meteo for current conditions. Fails silently and returns
 * `{ available: false }` on any denial/error so the header just falls back
 * to a plain greeting — this is decoration, never something that should
 * block the dashboard from rendering.
 */
export function useWeather() {
  const [state, setState] = useState({ available: false, loading: true, category: null, isDay: true, temp: null });
  const phraseRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let timer;

    const fetchWeather = (lat, lon) => {
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`)
        .then((r) => r.json())
        .then((json) => {
          if (cancelled) return;
          const cw = json?.current_weather;
          if (!cw) throw new Error("No current_weather in response");
          const category = categorize(cw.weathercode);
          const isDay = cw.is_day === 1;
          // Re-roll the phrase only when the category/day-night actually
          // changes — not on every 20-minute poll — so it doesn't visibly
          // change wording under the user mid-session for no reason.
          const key = `${category}:${isDay}`;
          if (phraseRef.current?.key !== key) {
            phraseRef.current = { key, phrase: weatherPhrase(category, isDay) };
          }
          setState({ available: true, loading: false, category, isDay, temp: Math.round(cw.temperature), phrase: phraseRef.current.phrase });
        })
        .catch(() => {
          if (!cancelled) setState((s) => ({ ...s, available: false, loading: false }));
        });
    };

    if (!navigator.geolocation) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetchWeather(pos.coords.latitude, pos.coords.longitude);
        timer = setInterval(() => fetchWeather(pos.coords.latitude, pos.coords.longitude), REFRESH_MS);
      },
      () => { if (!cancelled) setState((s) => ({ ...s, available: false, loading: false })); },
      { timeout: 8000, maximumAge: 10 * 60 * 1000 }
    );

    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, []);

  return state;
}
