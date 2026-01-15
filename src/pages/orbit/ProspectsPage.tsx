import { useState } from "react";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { ProspectCard } from "@/components/orbit/ProspectCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Filter, Upload } from "lucide-react";

// Mock data
const mockProspects = [
  {
    id: "1",
    nome_razao: "Tech Solutions Ltda",
    nome_fantasia: "TechSol",
    email_principal: "contato@techsol.com.br",
    telefone: "+5511999999999",
    cidade: "São Paulo",
    segmento: "Tecnologia",
    status: "novo" as const,
    canal_origem: "whatsapp" as const,
  },
  {
    id: "2",
    nome_razao: "Indústria ABC S.A.",
    nome_fantasia: "ABC Industries",
    email_principal: "vendas@abc.com.br",
    telefone: "+5511888888888",
    cidade: "Campinas",
    segmento: "Manufatura",
    status: "em_contato" as const,
    canal_origem: "email" as const,
  },
  {
    id: "3",
    nome_razao: "Consultoria XYZ",
    email_principal: "info@xyz.com.br",
    cidade: "Rio de Janeiro",
    segmento: "Consultoria",
    status: "qualificado" as const,
    canal_origem: "instagram" as const,
  },
  {
    id: "4",
    nome_razao: "Logística Express",
    nome_fantasia: "LogExpress",
    email_principal: "contato@logexpress.com.br",
    telefone: "+5521777777777",
    cidade: "Curitiba",
    segmento: "Logística",
    status: "em_contato" as const,
    canal_origem: "manual" as const,
  },
];

export default function ProspectsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredProspects = mockProspects.filter((prospect) => {
    const matchesSearch =
      prospect.nome_razao.toLowerCase().includes(search.toLowerCase()) ||
      prospect.nome_fantasia?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || prospect.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <OrbitLayout>
      <PageHeader
        title="Prospects"
        description="Gerencie seus prospects e leads"
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary">
              <Upload className="w-4 h-4 mr-2" />
              Importar
            </Button>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Novo Prospect
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="novo">Novos</SelectItem>
            <SelectItem value="em_contato">Em Contato</SelectItem>
            <SelectItem value="qualificado">Qualificados</SelectItem>
            <SelectItem value="nao_qualificado">Não Qualificados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Prospects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredProspects.map((prospect) => (
          <ProspectCard key={prospect.id} prospect={prospect} />
        ))}
      </div>

      {filteredProspects.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Nenhum prospect encontrado</p>
        </div>
      )}
    </OrbitLayout>
  );
}
