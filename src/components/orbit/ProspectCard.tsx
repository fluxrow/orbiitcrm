import { Building2, MapPin, Phone, Mail, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ProspectCardProps {
  prospect: {
    id: string;
    nome_razao: string;
    nome_fantasia?: string;
    email_principal?: string;
    telefone?: string;
    cidade?: string;
    segmento?: string;
    status: "novo" | "em_contato" | "qualificado" | "nao_qualificado";
    canal_origem?: "whatsapp" | "instagram" | "email" | "manual";
  };
  onClick?: () => void;
}

const statusLabels = {
  novo: { label: "Novo", className: "bg-primary/20 text-primary" },
  em_contato: { label: "Em Contato", className: "bg-warning/20 text-warning" },
  qualificado: { label: "Qualificado", className: "bg-success/20 text-success" },
  nao_qualificado: { label: "Não Qualificado", className: "bg-destructive/20 text-destructive" },
};

const canalIcons = {
  whatsapp: { icon: MessageCircle, className: "channel-whatsapp" },
  instagram: { icon: MessageCircle, className: "channel-instagram" },
  email: { icon: Mail, className: "channel-email" },
  manual: { icon: Building2, className: "bg-muted text-muted-foreground" },
};

export function ProspectCard({ prospect, onClick }: ProspectCardProps) {
  const status = statusLabels[prospect.status];
  const canal = prospect.canal_origem ? canalIcons[prospect.canal_origem] : null;

  return (
    <div
      className="glass-card p-4 hover:border-primary/50 transition-all duration-200 cursor-pointer animate-slide-in"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold truncate">{prospect.nome_razao}</h3>
            {canal && (
              <span className={`status-badge ${canal.className}`}>
                <canal.icon className="w-3 h-3" />
              </span>
            )}
          </div>
          {prospect.nome_fantasia && (
            <p className="text-sm text-muted-foreground truncate mb-2">
              {prospect.nome_fantasia}
            </p>
          )}
          
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {prospect.cidade && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {prospect.cidade}
              </span>
            )}
            {prospect.segmento && (
              <Badge variant="secondary" className="text-xs">
                {prospect.segmento}
              </Badge>
            )}
          </div>
        </div>

        <Badge className={status.className}>{status.label}</Badge>
      </div>

      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/50">
        {prospect.telefone && (
          <Button variant="ghost" size="sm" className="h-8 px-3">
            <Phone className="w-3.5 h-3.5 mr-1.5" />
            WhatsApp
          </Button>
        )}
        {prospect.email_principal && (
          <Button variant="ghost" size="sm" className="h-8 px-3">
            <Mail className="w-3.5 h-3.5 mr-1.5" />
            Email
          </Button>
        )}
      </div>
    </div>
  );
}
