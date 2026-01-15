import { LucideIcon, ExternalLink, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface IntegrationCardProps {
  name: string;
  description: string;
  icon: LucideIcon;
  iconBg: string;
  status: "connected" | "disconnected" | "error";
  onConnect?: () => void;
  onConfigure?: () => void;
}

export function IntegrationCard({
  name,
  description,
  icon: Icon,
  iconBg,
  status,
  onConnect,
  onConfigure,
}: IntegrationCardProps) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-start gap-4">
        <div className={cn("p-3 rounded-xl", iconBg)}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold">{name}</h3>
            {status === "connected" && (
              <span className="flex items-center gap-1 text-xs text-success">
                <Check className="w-3 h-3" />
                Conectado
              </span>
            )}
            {status === "error" && (
              <span className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="w-3 h-3" />
                Erro
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-4">{description}</p>
          
          <div className="flex items-center gap-2">
            {status === "disconnected" ? (
              <Button size="sm" onClick={onConnect}>
                Conectar
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={onConfigure}>
                Configurar
              </Button>
            )}
            <Button variant="ghost" size="sm">
              <ExternalLink className="w-4 h-4 mr-1.5" />
              Docs
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
