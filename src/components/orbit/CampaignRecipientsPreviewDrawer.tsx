import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Mail, MessageSquare, Phone, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";

interface CampaignRecipientsPreviewDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresaId?: string | null;
  canal: "email" | "whatsapp";
  filtros: Record<string, unknown>;
  recipientCount: number;
}

const PAGE_SIZE = 20;

export function CampaignRecipientsPreviewDrawer({
  open,
  onOpenChange,
  empresaId,
  canal,
  filtros,
  recipientCount,
}: CampaignRecipientsPreviewDrawerProps) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (open) {
      setPage(1);
    }
  }, [open, empresaId, canal, filtros]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [
      "orbit_campaign_preview",
      empresaId,
      canal,
      JSON.stringify(filtros ?? {}),
      page,
    ],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("preview_campaign_recipients" as any, {
        p_empresa_id: empresaId,
        p_canal: canal,
        p_filtros: filtros,
        p_page: page,
        p_page_size: PAGE_SIZE,
      });

      if (error) throw error;
      const rows = (data as any[]) || [];
      return {
        total: Number(rows[0]?.total_count) || 0,
        rows,
      };
    },
    enabled: open && !!empresaId,
  });

  const total = data?.total ?? recipientCount;
  const totalPages = Math.max(Math.ceil(Math.max(total, 1) / PAGE_SIZE), 1);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Ver destinatários ({data?.total ?? recipientCount})</SheetTitle>
          <SheetDescription>
            Preview server-side dos prospects elegíveis para esta campanha.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {canal === "email" ? (
                <>
                  <Mail className="mr-1 h-3 w-3" /> Email
                </>
              ) : (
                <>
                  <MessageSquare className="mr-1 h-3 w-3" /> WhatsApp
                </>
              )}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Página {page} de {totalPages}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
              disabled={page === 1 || isFetching}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
              disabled={page >= totalPages || isFetching}
            >
              Próxima
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Atualizar
            </Button>
          </div>
        </div>

        <ScrollArea className="mt-4 h-[calc(100vh-12rem)] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Carregando preview...
            </div>
          ) : !data?.rows.length ? (
            <div className="py-12 text-center text-muted-foreground">
              Nenhum destinatário elegível encontrado.
            </div>
          ) : (
            <div className="space-y-3">
              {data.rows.map((recipient) => (
                <div key={recipient.prospect_id} className="rounded-lg border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{recipient.nome_razao}</p>
                      {recipient.nome_fantasia ? (
                        <p className="text-sm text-muted-foreground">{recipient.nome_fantasia}</p>
                      ) : null}
                    </div>
                    {recipient.status_qualificacao ? (
                      <Badge variant="secondary">{recipient.status_qualificacao}</Badge>
                    ) : null}
                  </div>

                  <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {recipient.segmento || recipient.cidade ? (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <span>
                          {[recipient.segmento, recipient.cidade].filter(Boolean).join(" • ")}
                        </span>
                      </div>
                    ) : null}
                    {recipient.email_principal ? (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        <span>{recipient.email_principal}</span>
                      </div>
                    ) : null}
                    {recipient.whatsapp || recipient.telefone ? (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <span>{recipient.whatsapp || recipient.telefone}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
