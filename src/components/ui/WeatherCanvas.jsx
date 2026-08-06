import { useEffect, useRef } from "react";

// Canvas-driven rain/snow — a fixed set of ~20 identical CSS-animated divs
// reads as a repeating pattern the moment you look for it. A canvas can
// cheaply animate a couple hundred independently-sized, independently-timed
// particles with real depth (far ones small/slow/faint, near ones bigger/
// faster/opaque, exactly how real rain/snow actually reads against a
// background), which is what this component trades up to. Owns its own
// requestAnimationFrame loop and resize handling; renders nothing for any
// other weather category.
export default function WeatherCanvas({ category }) {
  const canvasRef = useRef(null);
  const isRain = category === "rain" || category === "thunderstorm";
  const isSnow = category === "snow";

  useEffect(() => {
    if (!isRain && !isSnow) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf;
    let particles = [];
    let width = 0, height = 0, dpr = 1;

    function makeRainDrop() {
      // depth 0 = far (small, slow, faint, thin) — 1 = near (long, fast,
      // opaque, thicker). Real rain reads as depth because every drop is
      // NOT the same size/speed; a uniform set of lines is what makes CSS
      // rain look fake.
      const depth = Math.random();
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        depth,
        len: 10 + depth * 22,
        speed: 340 + depth * 620,
        wind: 55 + depth * 55, // angled fall, like real wind-blown rain
        width: 0.5 + depth * 1.3,
        opacity: 0.12 + depth * 0.5,
      };
    }

    function makeSnowflake() {
      const depth = Math.random();
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        depth,
        r: 1 + depth * 2.8,
        speed: 16 + depth * 60,
        phase: Math.random() * Math.PI * 2,
        swaySpeed: 0.4 + Math.random() * 0.7,
        swayAmount: 5 + depth * 16,
        opacity: 0.3 + depth * 0.6,
        blur: depth < 0.35, // the farthest flakes get a soft out-of-focus look
      };
    }

    function seed() {
      const count = isRain
        ? Math.max(60, Math.round(width / 4))
        : Math.max(35, Math.round(width / 9));
      particles = Array.from({ length: count }, isRain ? makeRainDrop : makeSnowflake);
    }

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    let last = performance.now();
    function tick(now) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, width, height);

      if (isRain) {
        ctx.lineCap = "round";
        for (const p of particles) {
          p.y += p.speed * dt;
          p.x += p.wind * dt;
          if (p.y > height + p.len || p.x > width + 20) {
            p.y = -p.len;
            p.x = Math.random() * width - 20;
          }
          ctx.strokeStyle = `rgba(214,232,255,${p.opacity})`;
          ctx.lineWidth = p.width;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          // Slight forward lean matching the wind drift, not a straight
          // vertical drop — this alone is most of what sells "real rain."
          ctx.lineTo(p.x - p.wind * 0.018, p.y - p.len);
          ctx.stroke();
        }
      } else {
        for (const p of particles) {
          p.y += p.speed * dt;
          p.phase += p.swaySpeed * dt;
          if (p.y > height + p.r * 2) {
            p.y = -p.r * 2;
            p.x = Math.random() * width;
          }
          const x = p.x + Math.sin(p.phase) * p.swayAmount;
          ctx.beginPath();
          if (p.blur) {
            ctx.filter = "blur(1px)";
          }
          ctx.fillStyle = `rgba(255,255,255,${p.opacity})`;
          ctx.arc(x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          if (p.blur) ctx.filter = "none";
        }
      }

      raf = requestAnimationFrame(tick);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [isRain, isSnow]);

  if (!isRain && !isSnow) return null;
  return <canvas ref={canvasRef} className="absolute inset-0" />;
}
