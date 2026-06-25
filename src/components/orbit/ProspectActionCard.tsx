import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  MessageCircle, Mail, StickyNote, CalendarPlus, GitBranch,
  Phone, PhoneOff, MailX, Flame, History, CheckSquare, CalendarClock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProspectRaioX } from "./ProspectRaioX";
import { LeadHighlightTags } from "./LeadHighlightTags";
import { ProspectQuickActions } from "./ProspectQuickActions";

interface ProspectActionCardProps {
  prospect: any;
  isConverted: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (prospect: any) => void;
  onWhatsApp: (prospect: any) => void;
  onEmail: (prospect: any) => void;
  onAddNote: (prospect: any) => void;
  onCreateTask: (prospect: any) => void;
  onAddToFunnel: (prospect: any) => void;
  onSchedule: (prospect: any) => void;
  onViewHistory: (prospect: any) => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  novo: { label: "Novo", className: "bg-[hsl(var(--channel-email))]/20 text-[hsl(var(--channel-email))]" },
  em_qualificacao: { label: "Em Qualificação", className: "bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))]" },
  qualificado: { label: "Qualificado", className: "bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]" },
  desqualificado: { label: "Desqualificado", className: "bg-destructive/20 text-destructive" },
};

const whatsappStatusConfig: Record<string, { label: string; className: string }> = {
  nao_verificado: { label: "?", className: "bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))]" },
  valido: { label: "✓", className: "bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]" },
  invalido: { label: "✗", className: "bg-destructive/20 text-destructive" },
};

export function ProspectActionCard({
  prospect, isConverted, isSelected, onToggleSelect, onEdit,
  onWhatsApp, onEmail, onAddNote, onCreateTask, onAddToFunnel, onSchedule, onViewHistory,
}: ProspectActionCardProps) {
  const status = statusConfig[prospect.status_qualificacao || ""] || statusConfig.novo;
  const isHot = (prospect.score || 0) > 70;
  const hasAnyPhone = !!(prospect.whatsapp || prospect.telefone);
  const isUnverified = prospect.whatsapp_status !== "valido";
  const wsStatus = whatsappStatusConfig[prospect.whatsapp_status || "nao_verificado"] || whatsappStatusConfig.nao_verificado;

  return (
    <div data-prospect-id={prospect.id} className="glass-card p-4 hover:border-primary/50 transition-all duration-200 animate-slide-in group relative">
      {/* Checkbox */}
      <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(prospect.id)} />
      </div>
      {isSelected && (
        <div className="absolute top-3 left-3" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(prospect.id)} />
        </div>
      )}

      {/* Header */}
      <div className="cursor-pointer" onClick={() => onEdit(prospect)}>
        <div className="flex items-start justify-between gap-2 mb-2 pl-6">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold truncate text-foreground">{prospect.nome_razao}</h3>
            {prospect.nome_fantasia && (
              <p className="text-xs text-muted-foreground truncate">{prospect.nome_fantasia}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isConverted && (
              <Badge variant="outline" className="text-xs border-[hsl(var(--success))]/50 text-[hsl(var(--success))]">
                <CheckSquare className="w-3 h-3 mr-1" />Convertido
              </Badge>
            )}
            <span className={`status-badge ${status.className}`}>{status.label}</span>
          </div>
        </div>

        {/* Info */}
        <div className="space-y-1 text-sm text-muted-foreground mb-3 pl-6">
          {/* Telefone */}
          <div className="flex items-center gap-2">
            {prospect.telefone ? (
              <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{prospect.telefone}</span>
            ) : (
              <span className="flex items-center gap-1 text-destructive/60"><PhoneOff className="w-3 h-3" />Sem telefone</span>
            )}
          </div>
          {/* WhatsApp */}
          <div className="flex items-center gap-2">
            {prospect.whatsapp ? (
              <span className="flex items-center gap-1">
                <MessageCircle className="w-3 h-3" />
                {prospect.whatsapp}
                <Badge className={`text-[9px] px-1 py-0 h-4 ${wsStatus.className}`}>{wsStatus.label}</Badge>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-muted-foreground/50"><MessageCircle className="w-3 h-3" />Sem WhatsApp</span>
            )}
          </div>
          {/* Email */}
          <div className="flex items-center gap-2">
            {prospect.email_principal ? (
              <span className="flex items-center gap-1 truncate"><Mail className="w-3 h-3" />{prospect.email_principal}</span>
            ) : (
              <span className="flex items-center gap-1 text-destructive/60"><MailX className="w-3 h-3" />Sem email</span>
            )}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span>Origem: {prospect.origem_contato || prospect.origem_lead || "—"}</span>
            <span>{prospect.created_at ? format(new Date(prospect.created_at), "dd/MM/yyyy", { locale: ptBR }) : "—"}</span>
          </div>
        </div>

        {/* Indicators + Highlight Tags */}
        <div className="flex items-center gap-2 mb-3 pl-6 flex-wrap">
          {isHot && (
            <Tooltip>
              <TooltipTrigger><Flame className="w-4 h-4 text-[hsl(var(--warning))]" /></TooltipTrigger>
              <TooltipContent>Lead quente (score {prospect.score})</TooltipContent>
            </Tooltip>
          )}
          <LeadHighlightTags
            empresaId={prospect.empresa_id}
            dadosAdicionais={prospect.dados_adicionais}
          />
        </div>
      </div>

      {/* Raio-X da Qualificação */}
      <div className="pl-6 mb-3">
        <ProspectRaioX dadosAdicionais={prospect.dados_adicionais} />
      </div>



      {/* Quick Actions */}
      <div className="flex items-center gap-1 pt-3 border-t border-border/50 flex-wrap">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={(e) => { e.stopPropagation(); onWhatsApp(prospect); }} disabled={!hasAnyPhone}>
              <MessageCircle className="w-3.5 h-3.5" />
              {hasAnyPhone && isUnverified && <span className="text-[hsl(var(--warning))] text-[9px] ml-0.5">⚠</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{hasAnyPhone ? (isUnverified ? "Iniciar conversa (não verificado)" : "Iniciar conversa") : "Sem número disponível"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={(e) => { e.stopPropagation(); onEmail(prospect); }} disabled={!prospect.email_principal}>
              <Mail className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Enviar email</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={(e) => { e.stopPropagation(); onAddNote(prospect); }}>
              <StickyNote className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Adicionar nota</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={(e) => { e.stopPropagation(); onCreateTask(prospect); }}>
              <CalendarPlus className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Criar tarefa</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={(e) => { e.stopPropagation(); onAddToFunnel(prospect); }}>
              <GitBranch className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Enviar para funil</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={(e) => { e.stopPropagation(); onSchedule(prospect); }}>
              <CalendarClock className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Agendar reunião</TooltipContent>
        </Tooltip>

        <div className="mx-1 h-5 w-px bg-border/60" />
        <ProspectQuickActions prospect={prospect} />

        <div className="ml-auto">
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground" onClick={(e) => { e.stopPropagation(); onViewHistory(prospect); }}>
            <History className="w-3.5 h-3.5 mr-1" />Histórico
          </Button>
        </div>
      </div>
    </div>
  );
}