import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePeAuth } from "@/hooks/usePeAuth";
import { Building2, Users, FileText, LogOut, Menu, X, Shield, Briefcase, Contact, Tag, MapPin, Upload, Package, GitBranch, Target, CheckSquare, Link2, BookOpen, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navigate } from "react-router-dom";

const navItems = [
  { to: "/pe-admin/organizations", label: "Organizações", icon: Building2 },
  { to: "/pe-admin/users", label: "Usuários Globais", icon: Users },
  { to: "/pe-admin/clientes", label: "Assinantes", icon: Briefcase },
  { to: "/pe-admin/contatos", label: "Contatos", icon: Contact },
  { to: "/pe-admin/segmentos", label: "Segmentos", icon: Tag },
  { to: "/pe-admin/origens", label: "Origens", icon: MapPin },
  { to: "/pe-admin/produtos", label: "Produtos", icon: Package },
  { to: "/pe-admin/funil", label: "Funil de Assinaturas", icon: GitBranch },
  { to: "/pe-admin/oportunidades", label: "Assinaturas", icon: Target },
  { to: "/pe-admin/tarefas", label: "Tarefas", icon: CheckSquare },
  { to: "/pe-admin/importacao", label: "Importação", icon: Upload },
  { to: "/pe-admin/cadastros", label: "Cadastros", icon: ClipboardList },
  { to: "/pe-admin/tenants", label: "Tenant Map", icon: Link2 },
  { to: "/pe-admin/audit", label: "Auditoria", icon: FileText },
  { to: "/pe-admin/documentacao", label: "Documentação", icon: BookOpen },
];

export default function PeAdminLayout() {
  const { user, signOut } = useAuth();
  const { peUser, isSuperAdmin, isLoading } = usePeAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/orbit" replace />;

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform lg:translate-x-0 lg:static ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Shield className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-foreground">PE Admin</h1>
                <p className="text-xs text-muted-foreground">Super Admin</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`
                }
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="p-3 border-t border-border">
            <div className="px-3 py-2 text-xs text-muted-foreground truncate">
              {peUser?.full_name || user.email}
            </div>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
              Sair
            </Button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
