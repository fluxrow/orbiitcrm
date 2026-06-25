import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Building2, Check, Loader2, Search, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type EmpresaRow = {
  empresa_id: string;
  nome: string;
  slug: string | null;
  role: string;
  is_active: boolean;
};

interface EmpresaSwitcherProps {
  collapsed?: boolean;
}

export function EmpresaSwitcher({ collapsed }: EmpresaSwitcherProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { empresaId: currentEmpresaId, slug: currentSlug } = useTenant();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { data: empresas, isLoading } = useQuery({
    queryKey: ["my-empresas", user?.id],
    enabled: !!user && open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_empresas" as any);
      if (error) throw error;
      return (data || []) as EmpresaRow[];
    },
  });

  const selectMutation = useMutation({
    mutationFn: async (empresaId: string) => {
      const { error } = await supabase.rpc("set_active_empresa" as any, { p_empresa_id: empresaId });
      if (error) throw error;
    },
  });

  const handleSelect = async (e: EmpresaRow) => {
    const isCurrent = e.empresa_id === currentEmpresaId || e.slug === currentSlug;
    if (isCurrent) {
      setOpen(false);
      return;
    }
    try {
      await selectMutation.mutateAsync(e.empresa_id);
      setOpen(false);
      const target = e.slug ? `/${e.slug}/funil` : "/select-empresa";
      // Force full reload so TenantContext re-initializes cleanly
      window.location.assign(target);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao trocar de empresa");
    }
  };

  const current = empresas?.find(
    (e) => e.empresa_id === currentEmpresaId || (e.slug && e.slug === currentSlug)
  );

  const filtered = (empresas || []).filter((e) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      e.nome.toLowerCase().includes(q) ||
      (e.slug || "").toLowerCase().includes(q)
    );
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full mt-1 text-muted-foreground hover:text-foreground",
            collapsed ? "justify-center px-0" : "justify-start gap-2"
          )}
        >
          <Building2 className="w-4 h-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="truncate flex-1 text-left">Trocar empresa</span>
              <ChevronsUpDown className="w-3.5 h-3.5 opacity-60" />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="right"
        className="w-72 p-0 z-[60]"
      >
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar empresa..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Nenhuma empresa encontrada
            </div>
          ) : (
            filtered.map((e) => {
              const isCurrent =
                e.empresa_id === currentEmpresaId ||
                (e.slug && e.slug === currentSlug);
              return (
                <button
                  key={e.empresa_id}
                  onClick={() => handleSelect(e)}
                  disabled={selectMutation.isPending}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-2 rounded-md text-left text-sm transition-colors",
                    isCurrent
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <div
                    className={cn(
                      "h-7 w-7 rounded-md flex items-center justify-center shrink-0",
                      isCurrent ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}
                  >
                    <Building2 className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={cn("truncate font-medium", isCurrent && "text-primary")}>
                        {e.nome}
                      </p>
                      {isCurrent && (
                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {e.slug ? `/${e.slug}` : "—"} · {e.role}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs text-muted-foreground"
            onClick={() => {
              setOpen(false);
              navigate("/select-empresa");
            }}
          >
            Ver todas as empresas
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
