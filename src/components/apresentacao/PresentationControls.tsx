import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

interface Props {
  sectionIds: string[];
}

export default function PresentationControls({ sectionIds }: Props) {
  const [active, setActive] = useState(0);
  const [isFs, setIsFs] = useState(false);

  // Track active section via IntersectionObserver
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const idx = sectionIds.indexOf((e.target as HTMLElement).id);
            if (idx >= 0) setActive(idx);
          }
        });
      },
      { threshold: 0.55 }
    );
    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [sectionIds]);

  const goTo = (idx: number) => {
    const id = sectionIds[Math.max(0, Math.min(sectionIds.length - 1, idx))];
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        goTo(active + 1);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goTo(active - 1);
      } else if (e.key === "p" || e.key === "P") {
        toggleFs();
      } else if (e.key === "Home") {
        goTo(0);
      } else if (e.key === "End") {
        goTo(sectionIds.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, sectionIds]);

  // Fullscreen state sync
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFs = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* noop */
    }
  };

  return (
    <>
      {/* Dots progress */}
      <nav
        aria-label="Navegação da apresentação"
        className="fixed right-6 top-1/2 -translate-y-1/2 z-50 hidden md:flex flex-col gap-3"
      >
        {sectionIds.map((id, i) => (
          <button
            key={id}
            onClick={() => goTo(i)}
            aria-label={`Ir para seção ${i + 1}`}
            className={`group relative h-2.5 w-2.5 rounded-full transition-all ${
              i === active
                ? "bg-emerald-400 scale-125 shadow-[0_0_12px_rgba(74,222,128,0.8)]"
                : "bg-white/20 hover:bg-white/40"
            }`}
          />
        ))}
      </nav>

      {/* Present mode toggle */}
      <button
        onClick={toggleFs}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 px-4 py-2.5 text-sm text-white hover:bg-white/20 transition-all shadow-lg"
      >
        {isFs ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        <span className="hidden sm:inline">{isFs ? "Sair" : "Modo Apresentação"}</span>
        <kbd className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded bg-white/10 border border-white/20">
          P
        </kbd>
      </button>

      {/* Section counter */}
      <div className="fixed bottom-6 left-6 z-50 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 px-4 py-2.5 text-sm text-white/80">
        <span className="text-emerald-400 font-semibold">{String(active + 1).padStart(2, "0")}</span>
        <span className="mx-1.5 text-white/30">/</span>
        <span>{String(sectionIds.length).padStart(2, "0")}</span>
      </div>
    </>
  );
}
