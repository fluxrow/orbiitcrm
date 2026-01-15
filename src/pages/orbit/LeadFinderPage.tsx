import { useState } from "react";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search,
  Download,
  Plus,
  Building2,
  MapPin,
  Users,
  Globe,
  Linkedin,
  AlertCircle,
} from "lucide-react";

const mockResults = [
  {
    id: "1",
    empresa: "TechCorp Brasil",
    segmento: "Tecnologia",
    funcionarios: "50-200",
    cidade: "São Paulo",
    site: "techcorp.com.br",
    linkedin: "/company/techcorp",
    contatos: 3,
    emails_encontrados: 2,
  },
  {
    id: "2",
    empresa: "Indústria Nacional S.A.",
    segmento: "Manufatura",
    funcionarios: "200-500",
    cidade: "Campinas",
    site: "industrianacional.com.br",
    linkedin: "/company/industrianacional",
    contatos: 5,
    emails_encontrados: 4,
  },
  {
    id: "3",
    empresa: "Consultoria Premium",
    segmento: "Consultoria",
    funcionarios: "10-50",
    cidade: "Rio de Janeiro",
    site: "consultoriapremium.com.br",
    linkedin: "/company/consultoriapremium",
    contatos: 2,
    emails_encontrados: 2,
  },
];

export default function LeadFinderPage() {
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);

  const toggleLead = (id: string) => {
    setSelectedLeads((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedLeads.length === mockResults.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(mockResults.map((r) => r.id));
    }
  };

  return (
    <OrbitLayout>
      <PageHeader
        title="Lead Finder"
        description="Encontre novos prospects com IA"
        action={
          selectedLeads.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedLeads.length} selecionados
              </span>
              <Button variant="secondary">
                <Download className="w-4 h-4 mr-2" />
                Exportar
              </Button>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Adicionar ao CRM
              </Button>
            </div>
          )
        }
      />

      {/* API Warning */}
      <div className="glass-card p-4 mb-6 border-warning/50">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-warning mt-0.5" />
          <div>
            <h4 className="font-medium text-warning">API não configurada</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Configure sua chave do Apollo.io nas configurações para buscar leads reais.
              Os dados abaixo são apenas demonstração.
            </p>
            <Button variant="link" className="px-0 h-auto text-primary">
              Ir para Configurações →
            </Button>
          </div>
        </div>
      </div>

      {/* Search Filters */}
      <div className="glass-card p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Segmento</label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tech">Tecnologia</SelectItem>
                <SelectItem value="industry">Manufatura</SelectItem>
                <SelectItem value="consulting">Consultoria</SelectItem>
                <SelectItem value="retail">Varejo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Tamanho</label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1-10">1-10 funcionários</SelectItem>
                <SelectItem value="10-50">10-50 funcionários</SelectItem>
                <SelectItem value="50-200">50-200 funcionários</SelectItem>
                <SelectItem value="200+">200+ funcionários</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Localização</label>
            <Input placeholder="Cidade ou estado..." />
          </div>
          <div className="flex items-end">
            <Button className="w-full">
              <Search className="w-4 h-4 mr-2" />
              Buscar Leads
            </Button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="glass-card overflow-hidden">
        <table className="w-full">
          <thead className="bg-secondary/50">
            <tr>
              <th className="px-4 py-3 text-left">
                <Checkbox
                  checked={selectedLeads.length === mockResults.length}
                  onCheckedChange={toggleAll}
                />
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium">
                Empresa
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium">
                Segmento
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium">
                Tamanho
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium">
                Localização
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium">
                Contatos
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium">Links</th>
            </tr>
          </thead>
          <tbody>
            {mockResults.map((result) => (
              <tr
                key={result.id}
                className="border-t border-border hover:bg-secondary/30 transition-colors"
              >
                <td className="px-4 py-4">
                  <Checkbox
                    checked={selectedLeads.includes(result.id)}
                    onCheckedChange={() => toggleLead(result.id)}
                  />
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">{result.empresa}</span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <Badge variant="secondary">{result.segmento}</Badge>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Users className="w-3.5 h-3.5" />
                    {result.funcionarios}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5" />
                    {result.cidade}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className="text-sm">
                    {result.contatos} contatos ({result.emails_encontrados}{" "}
                    emails)
                  </span>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Globe className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Linkedin className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OrbitLayout>
  );
}
