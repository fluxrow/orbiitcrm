import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Users,
  MessageSquare,
  Kanban,
  Mail,
  FileText,
  Settings,
  Search,
  Rocket,
  BarChart3,
  UserCog,
  LogOut,
  CreditCard,
  CheckSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import orbitLogo from "@/assets/orbit-logo.png";
import { useIsAdmin } from "@/hooks/useUserRole";
import { useOrbitTasks } from "@/hooks/useOrbitTasks";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { UserProfileDialog } from "@/components/orbit/UserProfileDialog";

export function OrbitSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useIsAdmin();
  const { basePath, isDemo } = useTenant();
  const { user, signOut } = useAuth();
  const { data: pendingTasks } = useOrbitTasks({ status: "pending" });
  const pendingCount = pendingTasks?.length || 0;

  const displayName = user?.user_metadata?.nome || user?.email || "Usuário";
  const displayEmail = user?.email || "";
  const initials = displayName.charAt(0).toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const navigation = [
    { name: "Prospects", href: `${basePath}/prospects`, icon: Users },
    { name: "Conversas", href: `${basePath}/conversas`, icon: MessageSquare },
    { name: "Funil", href: `${basePath}/funil`, icon: Kanban },
    { name: "Tarefas", href: `${basePath}/tarefas`, icon: CheckSquare, badge: pendingCount > 0 ? pendingCount : undefined },
    { name: "Campanhas", href: `${basePath}/campanhas`, icon: Mail },
    { name: "Templates", href: `${basePath}/templates`, icon: FileText },
    { name: "Lead Finder", href: `${basePath}/lead-finder`, icon: Search },
    { name: "Analytics", href: `${basePath}/analytics`, icon: BarChart3 },
    ...(isAdmin ? [{ name: "Meu Plano", href: `${basePath}/meu-plano`, icon: CreditCard }] : []),
    { name: "Configurações", href: `${basePath}/config`, icon: Settings },
  ];

  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <Link to={`${basePath}/dashboard`} className="flex items-center gap-3">
          <img src={orbitLogo} alt="Orbit" className="h-9" />
          <div>
            {isDemo && (
              <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-semibold tracking-wide">DEMO</span>
            )}
            <p className="text-xs text-muted-foreground">CRM Prospecção</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "nav-link",
                isActive && "nav-link-active"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="flex-1">{item.name}</span>
              {item.badge && (
                <span className="ml-auto min-w-[20px] h-5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[11px] font-semibold px-1.5">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      <div className="p-4 border-t border-sidebar-border">
        <button
          onClick={() => setProfileOpen(true)}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-md hover:bg-sidebar-accent transition-colors"
        >
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-sm font-medium text-primary">{initials}</span>
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{displayEmail}</p>
          </div>
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 mt-1 text-muted-foreground hover:text-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="w-4 h-4" />
          Sair
        </Button>
      </div>

      <UserProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </aside>
  );
}
