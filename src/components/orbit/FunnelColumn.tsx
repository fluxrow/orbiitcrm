import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FunnelColumnProps {
  title: string;
  count: number;
  value?: string;
  color: string;
  children: ReactNode;
}

export function FunnelColumn({ title, count, value, color, children }: FunnelColumnProps) {
  return (
    <div className="kanban-column min-w-[300px]">
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2">
          <div className={cn("w-3 h-3 rounded-full", color)} />
          <h3 className="font-medium">{title}</h3>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {count}
          </span>
        </div>
        {value && (
          <span className="text-sm font-medium text-primary">{value}</span>
        )}
      </div>
      <div className="flex-1 space-y-3 overflow-auto">
        {children}
      </div>
    </div>
  );
}
