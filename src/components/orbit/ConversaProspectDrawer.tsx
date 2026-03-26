import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, ExternalLink, Edit, UserX, Mail, Phone, MapPin, Building2, Briefcase, Calendar, Tag, Target, DollarSign, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { useState } from "react";
import { ProspectDialog } from "./ProspectDialog";

interface ConversaProspectDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect: any;
  empresaId?: string;
}

function InfoRow({ icon: Icon, label, value, copyable }: { icon: any; label: string; value?: string | null; copyable?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm truncate">{value}</p>
      </div>
      {copyable && (
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { navigator.clipboard.writeText(value); toast.success("Copiado!"); }}>
          <Copy className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

export function ConversaProspectDrawer({ open, onOpenChange, prospect, empresaId }: ConversaProspectDrawerProps) {
  const [editOpen, setEditOpen] = useState(false);

  const { data: deals } = useQuery({
    queryKey: ["prospect_deals_drawer", prospect?.id],
    queryFn: async () => {
      if (!prospect?.id) return [];
      const { data } = await supabase
        .from("orbit_deals")
        .select("*, etapa:orbit_pipeline_stages!orbit_deals_etapa_id_fkey(nome)")
        .eq("prospect_id", prospect.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!prospect?.id,
  });

  const { data: tasks } = useQuery({
    queryKey: ["prospect_tasks_drawer", prospect?.id],
    queryFn: async () => {
      if (!prospect?.id) return [];
      const { data } = await supabase
        .from("orbit_tasks" as any)
        .select("*")
        .eq("prospect_id", prospect.id)
        .eq("status", "pending")
        .order("due_date", { ascending: true })
        .limit(5);
      return (data || []) as any[];
    },
    enabled: !!prospect?.id,
  });

  const { data: responsavel } = useQuery({
    queryKey: ["prospect_responsavel", prospect?.responsavel_id],
    queryFn: async () => {
      if (!prospect?.responsavel_id) return null;
      const { data } = await supabase.from("profiles").select("nome, email").eq("id", prospect.responsavel_id).single();
      return data;
    },
    enabled: !!prospect?.responsavel_id,
  });

  if (!prospect) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[400px] sm:max-w-[400px]">
          <SheetHeader>
            <SheetTitle>Detalhes do Contato</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-3">
            <UserX className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhum contato vinculado a esta conversa.</p>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const statusColor: Record<string, string> = {
    novo: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    qualificado: "bg-green-500/10 text-green-700 dark:text-green-400",
    negociando: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    perdido: "bg-red-500/10 text-red-700 dark:text-red-400",
    convertido: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  };

  const displayName = prospect.nome_contato?.trim() || prospect.nome_razao || "Sem nome";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[400px] sm:max-w-[400px] p-0 flex flex-col">
          <SheetHeader className="p-6 pb-4">
            <SheetTitle className="text-lg">{displayName}</SheetTitle>
            {prospect.nome_fantasia && <p className="text-sm text-muted-foreground">{prospect.nome_fantasia}</p>}
            <div className="flex gap-2 flex-wrap pt-1">
              {prospect.status_qualificacao && (
                <Badge className={statusColor[prospect.status_qualificacao] || ""}>{prospect.status_qualificacao}</Badge>
              )}
              {prospect.origem_contato && <Badge variant="outline">{prospect.origem_contato}</Badge>}
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="px-6 pb-6 space-y-5">
              {/* Contact info */}
              <div className="space-y-1">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Contato</h4>
                <InfoRow icon={Mail} label="E-mail" value={prospect.email_principal} copyable />
                <InfoRow icon={Phone} label="Telefone" value={prospect.telefone} copyable />
                <InfoRow icon={Phone} label="WhatsApp" value={prospect.whatsapp} copyable />
              </div>

              <Separator />

              {/* Company info */}
              <div className="space-y-1">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Empresa</h4>
                <InfoRow icon={Building2} label="Razão Social" value={prospect.nome_razao} />
                <InfoRow icon={Briefcase} label="Cargo" value={prospect.cargo} />
                <InfoRow icon={Tag} label="Segmento" value={prospect.segmento} />
                <InfoRow icon={MapPin} label="Localização" value={[prospect.cidade, prospect.estado].filter(Boolean).join(", ") || null} />
              </div>

              <Separator />

              {/* Responsible & dates */}
              <div className="space-y-1">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Gestão</h4>
                {responsavel && <InfoRow icon={Target} label="Responsável" value={responsavel.nome || responsavel.email} />}
                <InfoRow icon={Calendar} label="Criado em" value={prospect.created_at ? format(new Date(prospect.created_at), "dd/MM/yyyy") : null} />
              </div>

              {prospect.observacoes && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-1">Observações</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{prospect.observacoes}</p>
                  </div>
                </>
              )}

              {/* Deals */}
              {deals && deals.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Negócios</h4>
                    <div className="space-y-2">
                      {deals.map((d: any) => (
                        <div key={d.id} className="rounded-lg border p-3 space-y-1">
                          <p className="text-sm font-medium">{d.titulo}</p>
                          <div className="flex gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">{(d.etapa as any)?.nome || "—"}</Badge>
                            <Badge variant="secondary" className="text-xs">{d.status}</Badge>
                          </div>
                          {d.valor_estimado != null && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              {Number(d.valor_estimado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Pending tasks */}
              {tasks && tasks.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Tarefas Pendentes</h4>
                    <div className="space-y-2">
                      {tasks.map((t: any) => (
                        <div key={t.id} className="rounded-lg border p-3 flex items-start gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm truncate">{t.titulo}</p>
                            {t.due_date && <p className="text-xs text-muted-foreground">{format(new Date(t.due_date), "dd/MM/yyyy")}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>

          {/* Quick actions */}
          <div className="p-4 border-t flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Edit className="h-3.5 w-3.5 mr-1" /> Editar
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/promotrip-corporate/prospects`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ver cadastro
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/promotrip-corporate/funil`} target="_blank" rel="noopener noreferrer">
                <Target className="h-3.5 w-3.5 mr-1" /> Funil
              </a>
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {editOpen && (
        <ProspectDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          prospect={prospect}
          empresaId={empresaId || prospect.empresa_id}
        />
      )}
    </>
  );
}
