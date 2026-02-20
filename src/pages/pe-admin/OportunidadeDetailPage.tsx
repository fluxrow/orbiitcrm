import { useParams, useNavigate } from "react-router-dom";
import { useOportunidade, useUpdateOportunidade } from "@/hooks/useOportunidades";
import { useFunilEtapas } from "@/hooks/useFunilEtapas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Pencil, Calendar, MapPin, Users, DollarSign } from "lucide-react";
import { useState } from "react";
import { OportunidadeDialog } from "@/components/pe-admin/OportunidadeDialog";
import { OportunidadeItensTab } from "@/components/pe-admin/OportunidadeItensTab";
import { InteracoesTab } from "@/components/pe-admin/InteracoesTab";
import { TarefasTab } from "@/components/pe-admin/TarefasTab";
import { MotivoPerda } from "@/components/pe-admin/MotivoPerda";

export default function OportunidadeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: oportunidade, isLoading } = useOportunidade(id);
  const [editOpen, setEditOpen] = useState(false);
  const [perdaOpen, setPerdaOpen] = useState(false);

  const formatCurrency = (v: number | null) =>
    v != null ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v) : "—";

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!oportunidade) {
    return <div className="text-center py-12 text-muted-foreground">Oportunidade não encontrada</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/pe-admin/oportunidades")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{oportunidade.titulo}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={oportunidade.status === "won" ? "secondary" : oportunidade.status === "lost" ? "destructive" : "default"}>
                {oportunidade.status}
              </Badge>
              <Badge variant="outline">{oportunidade.funil_etapas?.nome}</Badge>
              <span className="text-sm text-muted-foreground">{oportunidade.probabilidade}%</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {oportunidade.status === "open" && (
            <Button variant="destructive" size="sm" onClick={() => setPerdaOpen(true)}>Marcar Perda</Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="w-4 h-4 mr-2" />Editar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <DollarSign className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Valor Total</p>
              <p className="font-semibold">{formatCurrency(oportunidade.valor_total_estimado)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <MapPin className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Destino</p>
              <p className="font-semibold">{oportunidade.destino || "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Período</p>
              <p className="font-semibold text-sm">
                {oportunidade.data_ida || "—"} → {oportunidade.data_volta || "—"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <Users className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Viajantes</p>
              <p className="font-semibold">{oportunidade.viajantes_qtd || "—"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="itens">
        <TabsList>
          <TabsTrigger value="itens">Itens do Pacote</TabsTrigger>
          <TabsTrigger value="interacoes">Interações</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
        </TabsList>
        <TabsContent value="itens">
          <OportunidadeItensTab oportunidade={oportunidade} />
        </TabsContent>
        <TabsContent value="interacoes">
          <InteracoesTab oportunidade={oportunidade} />
        </TabsContent>
        <TabsContent value="tarefas">
          <TarefasTab oportunidade={oportunidade} />
        </TabsContent>
      </Tabs>

      <OportunidadeDialog open={editOpen} onOpenChange={setEditOpen} oportunidade={oportunidade} />
      <MotivoPerda open={perdaOpen} onOpenChange={setPerdaOpen} oportunidadeId={oportunidade.id} />
    </div>
  );
}
