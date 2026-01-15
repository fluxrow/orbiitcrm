import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LayoutDashboard,
  Search,
  Users,
  Sparkles,
  Activity,
  Database,
} from "lucide-react";

interface LeadFinderTabsProps {
  value: string;
  onValueChange: (value: string) => void;
}

export function LeadFinderTabs({ value, onValueChange }: LeadFinderTabsProps) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className="w-full">
      <TabsList className="grid w-full grid-cols-6 bg-secondary/50 p-1 h-12">
        <TabsTrigger
          value="dashboard"
          className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
        >
          <LayoutDashboard className="w-4 h-4" />
          <span className="hidden sm:inline">Dashboard</span>
        </TabsTrigger>
        <TabsTrigger
          value="nova-busca"
          className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
        >
          <Search className="w-4 h-4" />
          <span className="hidden sm:inline">Nova Busca</span>
        </TabsTrigger>
        <TabsTrigger
          value="leads"
          className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
        >
          <Users className="w-4 h-4" />
          <span className="hidden sm:inline">Leads</span>
        </TabsTrigger>
        <TabsTrigger
          value="enrichment"
          className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
        >
          <Sparkles className="w-4 h-4" />
          <span className="hidden sm:inline">Enrichment</span>
        </TabsTrigger>
        <TabsTrigger
          value="monitor"
          className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
        >
          <Activity className="w-4 h-4" />
          <span className="hidden sm:inline">Monitor</span>
        </TabsTrigger>
        <TabsTrigger
          value="fontes"
          className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
        >
          <Database className="w-4 h-4" />
          <span className="hidden sm:inline">Fontes</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
