import { useEffect, useRef, useCallback } from "react";

interface Star {
  x: number;
  y: number;
  z: number;
  prevZ: number;
  hue: number;
  lightness: number;
}

const STAR_COUNT = 300;
const MAX_Z = 1000;
const BASE_SPEED = 2;
const MOUSE_INFLUENCE = 0.15;

function createStar(): Star {
  return {
    x: (Math.random() - 0.5) * 2000,
    y: (Math.random() - 0.5) * 2000,
    z: Math.random() * MAX_Z,
    prevZ: MAX_Z,
    hue: 190 + Math.random() * 30,
    lightness: 85 + Math.random() * 15,
  };
}

export default function StarfieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const scrollSpeedRef = useRef(1);
  const starsRef = useRef<Star[]>([]);
  const rafRef = useRef<number>(0);

  const initStars = useCallback(() => {
    starsRef.current = Array.from({ length: STAR_COUNT }, createStar);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    initStars();

    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    // Mouse handler
    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.targetX = ((e.clientX - rect.left) / w - 0.5) * 2;
      mouseRef.current.targetY = ((e.clientY - rect.top) / h - 0.5) * 2;
    };

    const onMouseLeave = () => {
      mouseRef.current.targetX = 0;
      mouseRef.current.targetY = 0;
    };

    // Scroll speed
    let lastScroll = window.scrollY;
    let scrollTimeout: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      const delta = Math.abs(window.scrollY - lastScroll);
      lastScroll = window.scrollY;
      scrollSpeedRef.current = Math.min(1 + delta * 0.05, 4);
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        scrollSpeedRef.current = 1;
      }, 150);
    };

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("scroll", onScroll, { passive: true });

    // Animation loop
    const animate = () => {
      const m = mouseRef.current;
      // Lerp mouse
      m.x += (m.targetX - m.x) * 0.05;
      m.y += (m.targetY - m.y) * 0.05;

      ctx.clearRect(0, 0, w, h);

      const cx = w / 2 + m.x * w * MOUSE_INFLUENCE;
      const cy = h / 2 + m.y * h * MOUSE_INFLUENCE;
      const speed = BASE_SPEED * scrollSpeedRef.current;

      const stars = starsRef.current;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        s.prevZ = s.z;
        s.z -= speed * (1 + (MAX_Z - s.z) / MAX_Z * 2);

        if (s.z <= 0) {
          s.x = (Math.random() - 0.5) * 2000;
          s.y = (Math.random() - 0.5) * 2000;
          s.z = MAX_Z;
          s.prevZ = MAX_Z;
          continue;
        }

        // Current projected position
        const sx = (s.x / s.z) * 300 + cx;
        const sy = (s.y / s.z) * 300 + cy;

        // Previous projected position (for trail)
        const prevSx = (s.x / s.prevZ) * 300 + cx;
        const prevSy = (s.y / s.prevZ) * 300 + cy;

        // Skip if off screen
        if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue;

        const depth = 1 - s.z / MAX_Z; // 0 = far, 1 = near
        const radius = 0.5 + depth * 3;
        const alpha = 0.1 + depth * 0.7;

        // Draw trail for fast/close stars
        if (depth > 0.3) {
          const trailAlpha = (depth - 0.3) * 0.8;
          ctx.beginPath();
          ctx.moveTo(prevSx, prevSy);
          ctx.lineTo(sx, sy);
          ctx.strokeStyle = `hsla(${s.hue}, 80%, ${s.lightness}%, ${trailAlpha})`;
          ctx.lineWidth = radius * 0.6;
          ctx.stroke();
        }

        // Draw star point
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${s.hue}, 80%, ${s.lightness}%, ${alpha})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("scroll", onScroll);
      clearTimeout(scrollTimeout);
    };
  }, [initStars]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: "auto" }}
      />
      {/* Readability overlays */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 20%, hsl(var(--background)) 85%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, hsl(var(--background)), transparent 50%)",
        }}
      />
    </>
  );
}
