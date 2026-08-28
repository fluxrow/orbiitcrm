import { AiProviderHealthPanel } from "@/components/pe-admin/AiProviderHealthPanel";

export default function AiProviderHealthPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Provedores de IA</h1>
        <p className="text-sm text-muted-foreground">
          Saúde, custo e alertas dos provedores globais usados pelo Orbit.
        </p>
      </div>
      <AiProviderHealthPanel />
    </div>
  );
}
