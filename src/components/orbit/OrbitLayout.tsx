import { ReactNode } from "react";
import { OrbitSidebar } from "./OrbitSidebar";
import { useIsDemo } from "@/hooks/useIsDemo";
import { AlertCircle } from "lucide-react";

interface OrbitLayoutProps {
  children: ReactNode;
}

export function OrbitLayout({ children }: OrbitLayoutProps) {
  const { isDemo } = useIsDemo();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <OrbitSidebar />
      <main className="flex-1 overflow-auto flex flex-col">
        {isDemo && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-center gap-2 text-sm text-amber-700 dark:text-amber-400 shrink-0">
            <AlertCircle className="h-4 w-4" />
            <span>Modo Demo — Envio real indisponível. Mensagens serão simuladas.</span>
          </div>
        )}
        <div className="p-6 flex-1">{children}</div>
      </main>
    </div>
  );
}
