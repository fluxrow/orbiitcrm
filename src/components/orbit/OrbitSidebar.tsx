import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Users,
  MessageSquare,
  Kanban,
  Mail,
  FileText,
  Settings,
  Search,
  BarChart3,
  LogOut,
  CreditCard,
  CheckSquare,
  Building2,
  ClipboardList,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import orbitLogo from "@/assets/orbit-logo.png";
import orbitIcon from "@/assets/orbit-icon.png";
import { useIsAdmin, useIsSuperAdmin } from "@/hooks/useUserRole";
import { useOrbitTasks } from "@/hooks/useOrbitTasks";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { UserProfileDialog } from "@/components/orbit/UserProfileDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePlanGuard } from "@/hooks/usePlanGuard";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { EmpresaSwitcher } from "@/components/orbit/EmpresaSwitcher";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function OrbitSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useIsAdmin();
  const { hasRole: isSuperAdmin } = useIsSuperAdmin();

  const { basePath, slug } = useTenant();
  // Ferramentas internas do SaaS (Onboarding, Admin Fluxrow, Lead Finder) só aparecem
  // quando o super admin está dentro do master tenant. Em outros tenants (suporte),
  // a UI fica idêntica à do cliente comum.
  const isMasterTenant = isSuperAdmin && slug === "fluxrow";
  const { user, signOut } = useAuth();
  const { data: pendingTasks } = useOrbitTasks({ status: "pending" });
  const pendingCount = pendingTasks?.length || 0;
  const [profileOpen, setProfileOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();

  // Listen for mobile toggle event from OrbitLayout
  useEffect(() => {
    const handler = () => setMobileOpen((prev) => !prev);
    window.addEventListener("orbit-sidebar-toggle", handler);
    return () => window.removeEventListener("orbit-sidebar-toggle", handler);
  }, []);

  const isExpanded = isMobile ? mobileOpen : hovered;

  const displayName = user?.user_metadata?.nome || user?.email || "Usuário";
  const displayEmail = user?.email || "";
  const initials = displayName.charAt(0).toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const { canUseFeature } = usePlanGuard();

  const navigation: Array<{ name: string; href: string; icon: LucideIcon; badge?: number; featured?: boolean }> = [
    { name: "Funil", href: `${basePath}/funil`, icon: Kanban, featured: true },
    { name: "Prospects", href: `${basePath}/prospects`, icon: Users },
    { name: "Conversas", href: `${basePath}/conversas`, icon: MessageSquare },
    { name: "Tarefas", href: `${basePath}/tarefas`, icon: CheckSquare, badge: pendingCount > 0 ? pendingCount : undefined },
    ...(isMasterTenant ? [{ name: "Onboarding", href: `${basePath}/onboarding`, icon: ClipboardList }] : []),
    ...(isMasterTenant ? [{ name: "Admin Fluxrow", href: `/pe-admin`, icon: Shield }] : []),
    ...(canUseFeature("whatsapp") || canUseFeature("email") ? [{ name: "Campanhas", href: `${basePath}/campanhas`, icon: Mail }] : []),
    { name: "Templates", href: `${basePath}/templates`, icon: FileText },
    { name: "Analytics", href: `${basePath}/analytics`, icon: BarChart3 },
    ...(isAdmin ? [{ name: "Meu Plano", href: `${basePath}/meu-plano`, icon: CreditCard }] : []),
    { name: "Configurações", href: `${basePath}/config`, icon: Settings },
  ];

  const sidebarContent = (
    <aside
      className={cn(
        "h-full bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 ease-in-out overflow-hidden",
        isExpanded ? "w-64" : "w-[68px]"
      )}
    >
      {/* Logo */}
      <div className="p-4 border-b border-sidebar-border shrink-0">
        <Link to={`${basePath}/funil`} className="flex items-center gap-3 justify-center">
          {isExpanded ? (
            <img src={orbitLogo} alt="Orbit" className="h-9 shrink-0" />
          ) : (
            <img src={orbitIcon} alt="Orbit" className="h-8 w-8 shrink-0" />
          )}
          <div
            className={cn(
              "transition-all duration-300 overflow-hidden whitespace-nowrap",
              isExpanded ? "opacity-100 w-auto" : "opacity-0 w-0"
            )}
          >
            <p className="text-xs text-muted-foreground">CRM Prospecção</p>

          </div>
        </Link>
      </div>

      {/* Navigation */}
      <TooltipProvider delayDuration={0}>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto overflow-x-hidden">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            const linkContent = (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => isMobile && setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  isActive
                    ? item.featured
                      ? "bg-primary/15 text-primary border border-primary/30 shadow-sm shadow-primary/10"
                      : "bg-sidebar-accent text-sidebar-accent-foreground"
                    : item.featured
                      ? "text-sidebar-foreground font-semibold border border-transparent"
                      : "text-sidebar-foreground",
                  !isExpanded && "justify-center px-0"
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span
                  className={cn(
                    "flex-1 transition-all duration-300 overflow-hidden whitespace-nowrap",
                    isExpanded ? "opacity-100 w-auto" : "opacity-0 w-0"
                  )}
                >
                  {item.name}
                </span>
                {item.badge && isExpanded && (
                  <span className="ml-auto min-w-[20px] h-5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[11px] font-semibold px-1.5">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
                {item.badge && !isExpanded && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive" />
                )}
              </Link>
            );

            if (!isExpanded) {
              return (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>
                    <div className="relative">{linkContent}</div>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    <p>{item.name}</p>
                    {item.badge && (
                      <span className="ml-1 text-destructive font-semibold">({item.badge})</span>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return <div key={item.name}>{linkContent}</div>;
          })}
        </nav>
      </TooltipProvider>

      {/* User info */}
      <div className="p-3 border-t border-sidebar-border shrink-0">
        {isExpanded ? (
          <>
            <button
              onClick={() => setProfileOpen(true)}
              className="flex items-center gap-3 px-3 py-2 w-full rounded-md hover:bg-sidebar-accent transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <span className="text-sm font-medium text-primary">{initials}</span>
              </div>
              <div className="flex-1 min-w-0 text-left overflow-hidden">
                <p className="text-sm font-medium truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{displayEmail}</p>
              </div>
            </button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 mt-1 text-muted-foreground hover:text-foreground"
              onClick={() => setProfileOpen(true)}
            >
              Meu perfil
            </Button>
            <EmpresaSwitcher />

            <ThemeToggle className="mt-1" />
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 mt-1 text-muted-foreground hover:text-foreground"
              onClick={handleSignOut}
            >
              <LogOut className="w-4 h-4" />
              Sair
            </Button>
          </>
        ) : (
          <TooltipProvider delayDuration={0}>
            <div className="space-y-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setProfileOpen(true)}
                    className="w-full flex justify-center py-2 rounded-md hover:bg-sidebar-accent transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-sm font-medium text-primary">{initials}</span>
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  <p>{displayName}</p>
                </TooltipContent>
              </Tooltip>
              <ThemeToggle compact className="mx-auto" />
            </div>
          </TooltipProvider>
        )}
      </div>

      <UserProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </aside>
  );

  // Mobile: overlay drawer
  if (isMobile) {
    return (
      <>
        {/* Mobile toggle button rendered in OrbitLayout header */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 transition-transform duration-300",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {sidebarContent}
        </div>
      </>
    );
  }

  // Desktop: fixed sidebar with hover expand overlay
  return (
    <div
      className="fixed inset-y-0 left-0 z-40"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {sidebarContent}
    </div>
  );
}

export function MobileMenuButton() {
  // This is a placeholder; the actual toggle is handled via context or prop.
  // We export a simple button that can be used externally.
  return null;
}
