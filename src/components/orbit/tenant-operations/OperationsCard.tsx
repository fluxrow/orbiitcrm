import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface OperationsMetric {
  label: string;
  value: string | number;
}

interface OperationsCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  status?: "healthy" | "attention" | "critical" | "unknown";
  metrics: OperationsMetric[];
  loading?: boolean;
  error?: boolean;
}

const statusLabels = {
  healthy: "Normal",
  attention: "Atenção",
  critical: "Crítico",
  unknown: "Sem dados",
};

export function OperationsCard({
  title,
  description,
  icon: Icon,
  status = "unknown",
  metrics,
  loading,
  error,
}: OperationsCardProps) {
  const badgeVariant = status === "critical" ? "destructive" : status === "healthy" ? "secondary" : "outline";

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="mt-1">{description}</CardDescription>
            </div>
          </div>
          <Badge variant={badgeVariant}>{error ? "Indisponível" : statusLabels[status]}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-16 animate-pulse rounded-md bg-muted" />
        ) : error ? (
          <p className="text-sm text-destructive">Não foi possível consultar este módulo.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-md bg-muted/40 p-3">
                <dt className="text-xs text-muted-foreground">{metric.label}</dt>
                <dd className="mt-1 text-lg font-semibold">{metric.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
