import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Play, X } from "lucide-react";
import {
  useLeadSources,
  useICPs,
  useCreateLeadSearch,
  useCreateICP,
  useExecuteLeadSearch,
} from "@/hooks/useLeadFinder";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const CARGOS = [
  "CEO",
  "CTO",
  "CFO",
  "COO",
  "CMO",
  "Diretor",
  "Gerente",
  "Coordenador",
  "Supervisor",
  "Analista",
  "Desenvolvedor",
  "Designer",
  "Product Manager",
  "Sales Manager",
  "HR Manager",
];

const SEGMENTOS = [
  "Tecnologia",
  "Saúde",
  "Educação",
  "Finanças",
  "Varejo",
  "Manufatura",
  "Serviços",
  "Consultoria",
  "Marketing",
  "E-commerce",
];

const TAMANHOS = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1001-5000",
  "5001+",
];

const PAISES = ["Brasil", "Portugal", "Estados Unidos", "Argentina", "México"];

const ESTADOS_BR = [
  "São Paulo",
  "Rio de Janeiro",
  "Minas Gerais",
  "Paraná",
  "Santa Catarina",
  "Rio Grande do Sul",
  "Bahia",
  "Distrito Federal",
];

interface NewSearchTabProps {
  onSearchCreated: (searchId: string) => void;
}

export function NewSearchTab({ onSearchCreated }: NewSearchTabProps) {
  const { data: sources } = useLeadSources();
  const { data: icps } = useICPs();
  const createSearch = useCreateLeadSearch();
  const createICP = useCreateICP();
  const executeSearch = useExecuteLeadSearch();
  const [isExecuting, setIsExecuting] = useState(false);

  const [formData, setFormData] = useState({
    nome: "",
    source_id: "",
    icp_id: "",
    pais: "Brasil",
    estado: "",
    cidade: "",
    cargos: [] as string[],
    segmentos: [] as string[],
    tamanhos: [] as string[],
    observacoes: "",
  });

  const [newICPName, setNewICPName] = useState("");
  const [showICPDialog, setShowICPDialog] = useState(false);

  const addItem = (field: "cargos" | "segmentos" | "tamanhos", value: string) => {
    if (!formData[field].includes(value)) {
      setFormData((prev) => ({
        ...prev,
        [field]: [...prev[field], value],
      }));
    }
  };

  const removeItem = (field: "cargos" | "segmentos" | "tamanhos", value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].filter((v) => v !== value),
    }));
  };

  const handleCreateICP = async () => {
    if (!newICPName.trim()) return;

    await createICP.mutateAsync({
      nome: newICPName,
      filtros: {
        cargos: formData.cargos,
        segmentos: formData.segmentos,
        tamanhos: formData.tamanhos,
        pais: formData.pais,
        estado: formData.estado,
      },
    });

    setNewICPName("");
    setShowICPDialog(false);
  };

  const handleSubmit = async () => {
    if (!formData.nome.trim()) {
      toast.error("Digite um nome para a busca");
      return;
    }

    if (!formData.source_id) {
      toast.error("Selecione uma fonte de leads");
      return;
    }

    setIsExecuting(true);
    
    try {
      // 1. Create search in database
      const result = await createSearch.mutateAsync({
        nome: formData.nome,
        source_id: formData.source_id,
        icp_id: formData.icp_id || null,
        filtros: {
          pais: formData.pais,
          estado: formData.estado,
          cidade: formData.cidade,
          cargos: formData.cargos,
          segmentos: formData.segmentos,
          tamanhos: formData.tamanhos,
        },
        observacoes: formData.observacoes || null,
        status: "pendente",
      });

      if (result) {
        // 2. Execute search immediately - call Apollo API
        toast.info("Buscando leads no Apollo...");
        await executeSearch.mutateAsync(result.id);
        onSearchCreated(result.id);
      }
    } catch (error) {
      console.error("Error executing search:", error);
    } finally {
      setIsExecuting(false);
    }
  };

  const loadICP = (icpId: string) => {
    const icp = icps?.find((i) => i.id === icpId);
    if (icp?.filtros) {
      setFormData((prev) => ({
        ...prev,
        icp_id: icpId,
        cargos: icp.filtros.cargos || [],
        segmentos: icp.filtros.segmentos || [],
        tamanhos: icp.filtros.tamanhos || [],
        pais: icp.filtros.pais || "Brasil",
        estado: icp.filtros.estado || "",
      }));
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="glass-card p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold">Nova Busca de Leads</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure os filtros para encontrar leads qualificados
          </p>
        </div>

        <div className="space-y-6">
          {/* Nome da Busca */}
          <div>
            <Label htmlFor="nome">Nome da Busca *</Label>
            <Input
              id="nome"
              placeholder="Ex: Diretores de TI em SP"
              value={formData.nome}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, nome: e.target.value }))
              }
              className="mt-1.5"
            />
          </div>

          {/* Fonte e ICP */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Fonte de Leads *</Label>
              <Select
                value={formData.source_id}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, source_id: v }))
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione fonte" />
                </SelectTrigger>
                <SelectContent>
                  {sources?.filter((s) => s.ativo).map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.nome}
                    </SelectItem>
                  ))}
                  {(!sources || sources.filter((s) => s.ativo).length === 0) && (
                    <SelectItem value="none" disabled>
                      Nenhuma fonte configurada
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>ICP</Label>
                <Dialog open={showICPDialog} onOpenChange={setShowICPDialog}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 px-2">
                      <Plus className="w-3 h-3 mr-1" />
                      Novo
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Criar ICP</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Nome do ICP</Label>
                        <Input
                          value={newICPName}
                          onChange={(e) => setNewICPName(e.target.value)}
                          placeholder="Ex: Decisores Tech"
                          className="mt-1.5"
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Os filtros atuais serão salvos neste ICP
                      </p>
                      <Button onClick={handleCreateICP} className="w-full">
                        Criar ICP
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <Select value={formData.icp_id} onValueChange={loadICP}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione ICP" />
                </SelectTrigger>
                <SelectContent>
                  {icps?.map((icp) => (
                    <SelectItem key={icp.id} value={icp.id}>
                      {icp.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Região */}
          <div>
            <Label>Região</Label>
            <div className="grid grid-cols-3 gap-4 mt-1.5">
              <Select
                value={formData.pais}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, pais: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="País" />
                </SelectTrigger>
                <SelectContent>
                  {PAISES.map((pais) => (
                    <SelectItem key={pais} value={pais}>
                      {pais}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={formData.estado}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, estado: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS_BR.map((estado) => (
                    <SelectItem key={estado} value={estado}>
                      {estado}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Cidade"
                value={formData.cidade}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, cidade: e.target.value }))
                }
              />
            </div>
          </div>

          {/* Cargos */}
          <div>
            <Label>Cargo</Label>
            <Select onValueChange={(v) => addItem("cargos", v)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Adicionar cargo..." />
              </SelectTrigger>
              <SelectContent>
                {CARGOS.filter((c) => !formData.cargos.includes(c)).map(
                  (cargo) => (
                    <SelectItem key={cargo} value={cargo}>
                      {cargo}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
            {formData.cargos.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.cargos.map((cargo) => (
                  <Badge
                    key={cargo}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => removeItem("cargos", cargo)}
                  >
                    {cargo}
                    <X className="w-3 h-3 ml-1" />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Segmentos */}
          <div>
            <Label>Segmento da Empresa</Label>
            <Select onValueChange={(v) => addItem("segmentos", v)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Adicionar segmento..." />
              </SelectTrigger>
              <SelectContent>
                {SEGMENTOS.filter((s) => !formData.segmentos.includes(s)).map(
                  (segmento) => (
                    <SelectItem key={segmento} value={segmento}>
                      {segmento}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
            {formData.segmentos.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.segmentos.map((segmento) => (
                  <Badge
                    key={segmento}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => removeItem("segmentos", segmento)}
                  >
                    {segmento}
                    <X className="w-3 h-3 ml-1" />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Tamanhos */}
          <div>
            <Label>Tamanho da Empresa</Label>
            <Select onValueChange={(v) => addItem("tamanhos", v)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Adicionar tamanho..." />
              </SelectTrigger>
              <SelectContent>
                {TAMANHOS.filter((t) => !formData.tamanhos.includes(t)).map(
                  (tamanho) => (
                    <SelectItem key={tamanho} value={tamanho}>
                      {tamanho} funcionários
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
            {formData.tamanhos.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.tamanhos.map((tamanho) => (
                  <Badge
                    key={tamanho}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => removeItem("tamanhos", tamanho)}
                  >
                    {tamanho}
                    <X className="w-3 h-3 ml-1" />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Observações */}
          <div>
            <Label htmlFor="observacoes">Observações Internas</Label>
            <Textarea
              id="observacoes"
              placeholder="Notas sobre esta busca..."
              value={formData.observacoes}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, observacoes: e.target.value }))
              }
              className="mt-1.5"
              rows={3}
            />
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={createSearch.isPending || isExecuting}
            className="w-full"
            size="lg"
          >
            <Play className={`w-4 h-4 mr-2 ${isExecuting ? 'animate-pulse' : ''}`} />
            {isExecuting ? "Buscando leads..." : createSearch.isPending ? "Criando..." : "Iniciar Busca"}
          </Button>
        </div>
      </div>
    </div>
  );
}
