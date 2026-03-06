import { useState } from "react";
import { GripVertical, Phone, MessageCircle, User, Calendar, FileText, CheckSquare, ExternalLink, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUpdateDealChecklist, useConvertDealToClient } from "@/hooks/useOrbitDeals";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const DEFAULT_DOCS_CHECKLIST = [
  { key: "contrato", label: "Contrato assinado", checked: false },
  { key: "cnpj", label: "CNPJ", checked: false },
  { key: "faturamento", label: "Dados de faturamento", checked: false },
  { key: "documento_resp", label: "Documento do responsável", checked: false },
];

interface DealCardProps {
  deal: any;
  stageName: string;
  isWonStage: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onEdit: () => void;
  onCreateTask: () => void;
  onOpenProspect: () => void;
  onStartConversation: () => void;
}

export function DealCard({
  deal,
  stageName,
  isWonStage,
  isDragging,
  onDragStart,
  onEdit,
  onCreateTask,
  onOpenProspect,
  onStartConversation,
}: DealCardProps) {
  const updateChecklist = useUpdateDealChecklist();
  const prospect = deal.prospect;
  const responsavel = deal.responsavel;

  const isDocStage = stageName === "Recebimento de Documentos";
  const isAgendarStage = stageName === "Agendar Reunião";

  const checklist: typeof DEFAULT_DOCS_CHECKLIST =
    deal.documentos_checklist && Array.isArray(deal.documentos_checklist) && deal.documentos_checklist.length > 0
      ? deal.documentos_checklist
      : DEFAULT_DOCS_CHECKLIST;

  const handleChecklistToggle = async (key: string) => {
    const updated = checklist.map((item) =>
      item.key === key ? { ...item, checked: !item.checked } : item
    );
    try {
      await updateChecklist.mutateAsync({ deal_id: deal.id, checklist: updated });
    } catch {
      toast.error("Erro ao atualizar checklist");
    }
  };

  const formatCurrency = (v: number | null) =>
    v
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v)
      : null;

  const whatsappNumber = prospect?.whatsapp || prospect?.telefone;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onEdit}
      className={`bg-card border rounded-lg p-3 cursor-grab hover:border-primary/50 transition-colors ${isDragging ? "opacity-50" : ""}`}
    >
      {/* Header */}
      <div className="flex gap-2 items-start">
        <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate">{deal.titulo}</h4>
          {prospect && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {prospect.nome_fantasia || prospect.nome_razao}
            </p>
          )}
        </div>
      </div>

      {/* Value & Probability */}
      <div className="flex items-center justify-between mt-2">
        {formatCurrency(Number(deal.valor_estimado)) && (
          <span className="text-sm font-semibold text-primary">
            {formatCurrency(Number(deal.valor_estimado))}
          </span>
        )}
        {deal.probabilidade != null && (
          <Badge variant="secondary" className="text-xs">
            {deal.probabilidade}%
          </Badge>
        )}
      </div>

      {/* Contact info */}
      {prospect && (whatsappNumber || prospect.email_principal) && (
        <div className="mt-2 space-y-1">
          {whatsappNumber && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              <span className="truncate">{whatsappNumber}</span>
            </div>
          )}
        </div>
      )}

      {/* Responsavel */}
      {responsavel && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
          <User className="h-3 w-3" />
          <span className="truncate">{responsavel.nome}</span>
        </div>
      )}

      {/* Last interaction */}
      {deal.ultima_interacao_at && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
          <Calendar className="h-3 w-3" />
          <span>
            {formatDistanceToNow(new Date(deal.ultima_interacao_at), { addSuffix: true, locale: ptBR })}
          </span>
        </div>
      )}

      {/* Stage-specific: Agendar Reunião */}
      {isAgendarStage && (
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-2 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onCreateTask();
          }}
        >
          <Calendar className="h-3 w-3 mr-1" />
          Criar evento de reunião
        </Button>
      )}

      {/* Stage-specific: Recebimento de Documentos */}
      {isDocStage && (
        <div className="mt-2 space-y-1.5 border-t pt-2">
          <p className="text-xs font-medium flex items-center gap-1">
            <FileText className="h-3 w-3" /> Documentos
          </p>
          {checklist.map((item) => (
            <label
              key={item.key}
              className="flex items-center gap-2 text-xs cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={item.checked}
                onCheckedChange={() => handleChecklistToggle(item.key)}
              />
              <span className={item.checked ? "line-through text-muted-foreground" : ""}>
                {item.label}
              </span>
            </label>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="flex items-center gap-1 mt-2 pt-2 border-t">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onStartConversation(); }}
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Iniciar conversa</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onCreateTask(); }}
            >
              <ListTodo className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Criar tarefa</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onOpenProspect(); }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Abrir prospect</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
