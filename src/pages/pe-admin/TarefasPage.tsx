import { useState } from "react";
import { useTarefas, useMarkTarefaDone } from "@/hooks/useTarefas";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckSquare } from "lucide-react";

const PRIORIDADE_COLORS: Record<string, "default" | "secondary" | "destructive"> = {
  low: "secondary", normal: "default", high: "destructive",
};

export default function TarefasPage() {
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [prioridadeFilter, setPrioridadeFilter] = useState<string>("");
  const { data: tarefas, isLoading } = useTarefas({
    status: statusFilter || undefined,
    prioridade: prioridadeFilter || undefined,
  });
  const markDone = useMarkTarefaDone();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tarefas</h1>
        <p className="text-muted-foreground">Gerencie tarefas de todas as oportunidades</p>
      </div>

      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="open">Abertas</SelectItem>
            <SelectItem value="done">Concluídas</SelectItem>
            <SelectItem value="canceled">Canceladas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={prioridadeFilter} onValueChange={(v) => setPrioridadeFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Prioridade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="low">Baixa</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Oportunidade</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tarefas || []).map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Checkbox
                      checked={t.status === "done"}
                      onCheckedChange={() => {
                        if (t.status !== "done") markDone.mutate({ id: t.id, organization_id: t.organization_id });
                      }}
                    />
                  </TableCell>
                  <TableCell className={`font-medium ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>{t.titulo}</TableCell>
                  <TableCell>{t.clientes?.razao_social || "—"}</TableCell>
                  <TableCell>{t.oportunidades?.titulo || "—"}</TableCell>
                  <TableCell><Badge variant={PRIORIDADE_COLORS[t.prioridade]}>{t.prioridade}</Badge></TableCell>
                  <TableCell>{t.due_date || "—"}</TableCell>
                  <TableCell>{(t.assigned as any)?.full_name || "—"}</TableCell>
                  <TableCell><Badge variant={t.status === "done" ? "secondary" : "default"}>{t.status}</Badge></TableCell>
                </TableRow>
              ))}
              {(!tarefas || tarefas.length === 0) && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhuma tarefa encontrada</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
