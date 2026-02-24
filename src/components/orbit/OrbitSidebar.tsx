import { Link, useLocation } from "react-router-dom";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/hooks/useUserRole";
import { useTenant } from "@/contexts/TenantContext";

export function OrbitSidebar() {
  const location = useLocation();
  const { isAdmin } = useIsAdmin();
  const { basePath, isDemo } = useTenant();

  const navigation = [
    { name: "Prospects", href: `${basePath}/prospects`, icon: Users },
    { name: "Conversas", href: `${basePath}/conversas`, icon: MessageSquare },
    { name: "Funil", href: `${basePath}/funil`, icon: Kanban },
    { name: "Campanhas", href: `${basePath}/campanhas`, icon: Mail },
    { name: "Templates", href: `${basePath}/templates`, icon: FileText },
    { name: "Lead Finder", href: `${basePath}/lead-finder`, icon: Search },
    { name: "Analytics", href: `${basePath}/analytics`, icon: BarChart3 },
    { name: "Configurações", href: `${basePath}/config`, icon: Settings },
  ];

  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <Link to={`${basePath}/dashboard`} className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
            <Rocket className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold gradient-text">ORBIT</h1>
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
              <span>{item.name}</span>
            </Link>
          );
        })}
        {isAdmin && (
          <Link
            to={`${basePath}/usuarios`}
            className={cn(
              "nav-link",
              location.pathname === `${basePath}/usuarios` && "nav-link-active"
            )}
          >
            <UserCog className="w-5 h-5" />
            <span>Usuários</span>
          </Link>
        )}
      </nav>

      {/* User info */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-sm font-medium text-primary">U</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">Usuário</p>
            <p className="text-xs text-muted-foreground truncate">Admin</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
