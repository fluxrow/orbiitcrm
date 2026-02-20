import { useState } from "react";
import { useInteracoes } from "@/hooks/useInteracoes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Phone, Mail, MessageSquare, Calendar, FileText } from "lucide-react";
import { InteracaoDialog } from "@/components/pe-admin/InteracaoDialog";

const TIPO_ICONS: Record<string, any> = {
  call: Phone, email: Mail, whatsapp: MessageSquare, meeting: Calendar, note: FileText,
};

interface Props {
  oportunidade: any;
}

export function InteracoesTab({ oportunidade }: Props) {
  const { data: interacoes, isLoading } = useInteracoes({ oportunidade_id: oportunidade.id });
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />Nova Interação
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-3">
          {(interacoes || []).map((i: any) => {
            const Icon = TIPO_ICONS[i.tipo] || FileText;
            return (
              <Card key={i.id}>
                <CardContent className="p-4 flex gap-3">
                  <div className="mt-1"><Icon className="w-4 h-4 text-muted-foreground" /></div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{i.tipo}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(i.data_interacao).toLocaleDateString("pt-BR")}
                      </span>
                      <span className="text-xs text-muted-foreground">por {(i.pe_users as any)?.full_name || "—"}</span>
                    </div>
                    <p className="text-sm">{i.resumo}</p>
                    {i.proxima_acao && <p className="text-xs text-muted-foreground">Próxima ação: {i.proxima_acao}</p>}
                    {i.data_followup && <p className="text-xs text-muted-foreground">Follow-up: {i.data_followup}</p>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {(!interacoes || interacoes.length === 0) && (
            <p className="text-center py-6 text-muted-foreground">Nenhuma interação registrada</p>
          )}
        </div>
      )}

      <InteracaoDialog open={dialogOpen} onOpenChange={setDialogOpen} oportunidade={oportunidade} />
    </div>
  );
}
