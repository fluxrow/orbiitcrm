import { Inbox, MessageSquare, Mail, Phone, Instagram } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";

export default function OmnichannelInboxPage() {
  return (
    <OrbitLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center">
            <Inbox className="w-6 h-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">Inbox Omnichannel</h1>
              <Badge variant="secondary">Em breve</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Centralize atendimentos de WhatsApp, Email, Instagram e mais em uma única caixa.
            </p>
          </div>
        </div>

        <Card className="glass-card p-8 text-center space-y-4">
          <h2 className="text-lg font-medium">Estamos preparando essa feature</h2>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            A Inbox Omnichannel vai unificar todos os seus canais de conversa em um só lugar,
            com priorização por IA, roteamento por vendedor e histórico completo do prospect.
            Nenhuma ação é necessária no momento — avisaremos quando estiver disponível.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 max-w-2xl mx-auto">
            {[
              { icon: MessageSquare, label: "WhatsApp" },
              { icon: Mail, label: "Email" },
              { icon: Instagram, label: "Instagram" },
              { icon: Phone, label: "SMS / Voz" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-2 p-3 rounded-md border border-border/50 bg-muted/20"
              >
                <Icon className="w-5 h-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </OrbitLayout>
  );
}
