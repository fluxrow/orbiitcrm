import { ReactNode } from "react";
import { OrbitSidebar } from "./OrbitSidebar";
import { Menu } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { PaymentWarningBanner } from "./PaymentWarningBanner";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

interface OrbitLayoutProps {
  children: ReactNode;
}

export function OrbitLayout({ children }: OrbitLayoutProps) {
  const isMobile = useIsMobile();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <OrbitSidebar />
      {/* Spacer for collapsed sidebar on desktop */}
      {!isMobile && <div className="w-[68px] shrink-0" />}
      <main className="flex-1 overflow-auto flex flex-col">
        {isMobile && (
          <div className="h-12 border-b flex items-center justify-between px-4 shrink-0">
            <MobileToggle />
            <ThemeToggle compact />
          </div>
        )}
        <PaymentWarningBanner />
        <div className="p-6 flex-1">{children}</div>
      </main>
    </div>
  );
}


function MobileToggle() {
  // We need a way to communicate with OrbitSidebar for mobile toggle.
  // Since OrbitSidebar manages its own mobileOpen state, we'll dispatch a custom event.
  const handleClick = () => {
    window.dispatchEvent(new CustomEvent("orbit-sidebar-toggle"));
  };

  return (
    <Button variant="ghost" size="icon" onClick={handleClick}>
      <Menu className="h-5 w-5" />
    </Button>
  );
}
