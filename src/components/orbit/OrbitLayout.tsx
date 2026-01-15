import { ReactNode } from "react";
import { OrbitSidebar } from "./OrbitSidebar";

interface OrbitLayoutProps {
  children: ReactNode;
}

export function OrbitLayout({ children }: OrbitLayoutProps) {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <OrbitSidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
