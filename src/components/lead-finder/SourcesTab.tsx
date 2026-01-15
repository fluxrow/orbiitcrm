import { useState } from "react";
import {
  useLeadSources,
  useCreateLeadSource,
  useDeleteLeadSource,
} from "@/hooks/useLeadFinder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, ExternalLink, FileSpreadsheet, User, Linkedin } from "lucide-react";

const SOURCE_TYPES = [
  {
    id: "apollo",
    name: "Apollo.io",
    description: "Plataforma B2B de prospecção",
    icon: ExternalLink,
    color: "bg-purple-500/10 text-purple-400",
  },
  {
    id: "manual",
    name: "Entrada Manual",
    description: "Cadastro manual de leads",
    icon: User,
    color: "bg-green-500/10 text-green-400",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Rede profissional de leads",
    icon: Linkedin,
    color: "bg-blue-500/10 text-blue-400",
  },
  {
    id: "csv",
    name: "CSV",
    description: "Importar arquivo",
    icon: FileSpreadsheet,
    color: "bg-orange-500/10 text-orange-400",
  },
];

export function SourcesTab() {
  const { data: sources, isLoading } = useLeadSources();
  const createSource = useCreateLeadSource();
  const deleteSource = useDeleteLeadSource();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [apiKey, setApiKey] = useState("");

  const handleAddSource = async () => {
    if (!selectedType || !sourceName.trim()) return;

    await createSource.mutateAsync({
      nome: sourceName,
      tipo: selectedType,
      config: apiKey ? { api_key: apiKey } : {},
      ativo: true,
    });

    setShowAddDialog(false);
    setSelectedType(null);
    setSourceName("");
    setApiKey("");
  };

  const handleDeleteSource = async (id: string) => {
    await deleteSource.mutateAsync(id);
  };

  const getSourceTypeInfo = (tipo: string) => {
    return SOURCE_TYPES.find((t) => t.id === tipo) || SOURCE_TYPES[0];
  };

  return (
    <div className="space-y-6">
      {/* Available Sources */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Fontes Disponíveis</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {SOURCE_TYPES.map((source) => (
            <div
              key={source.id}
              className="glass-card p-4 flex flex-col items-center text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => {
                setSelectedType(source.id);
                setShowAddDialog(true);
              }}
            >
              <div
                className={`w-12 h-12 rounded-xl ${source.color} flex items-center justify-center mb-3`}
              >
                <source.icon className="w-6 h-6" />
              </div>
              <h3 className="font-medium text-sm">{source.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {source.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Configured Sources */}
      <div className="glass-card">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-lg">Fontes Configuradas</h3>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Adicionar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Fonte</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {!selectedType ? (
                  <div className="grid grid-cols-2 gap-3">
                    {SOURCE_TYPES.map((source) => (
                      <div
                        key={source.id}
                        className={`p-4 border rounded-lg cursor-pointer hover:border-primary transition-colors ${
                          selectedType === source.id ? "border-primary" : ""
                        }`}
                        onClick={() => setSelectedType(source.id)}
                      >
                        <div
                          className={`w-10 h-10 rounded-lg ${source.color} flex items-center justify-center mb-2`}
                        >
                          <source.icon className="w-5 h-5" />
                        </div>
                        <h4 className="font-medium text-sm">{source.name}</h4>
                        <p className="text-xs text-muted-foreground">
                          {source.description}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div>
                      <Label>Tipo</Label>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant="secondary">
                          {getSourceTypeInfo(selectedType).name}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedType(null)}
                        >
                          Alterar
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="source-name">Nome da Fonte *</Label>
                      <Input
                        id="source-name"
                        placeholder="Ex: Apollo Principal"
                        value={sourceName}
                        onChange={(e) => setSourceName(e.target.value)}
                        className="mt-1.5"
                      />
                    </div>
                    {selectedType === "apollo" && (
                      <div>
                        <Label htmlFor="api-key">API Key</Label>
                        <Input
                          id="api-key"
                          type="password"
                          placeholder="Sua chave da API Apollo"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          className="mt-1.5"
                        />
                      </div>
                    )}
                    <Button
                      onClick={handleAddSource}
                      disabled={createSource.isPending || !sourceName.trim()}
                      className="w-full"
                    >
                      {createSource.isPending ? "Adicionando..." : "Adicionar Fonte"}
                    </Button>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="divide-y divide-border">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              Carregando...
            </div>
          ) : sources?.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Nenhuma fonte configurada
            </div>
          ) : (
            sources?.map((source) => {
              const typeInfo = getSourceTypeInfo(source.tipo);
              return (
                <div
                  key={source.id}
                  className="p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg ${typeInfo.color} flex items-center justify-center`}
                    >
                      <typeInfo.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{source.nome}</span>
                        <Badge
                          variant={source.ativo ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {source.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {typeInfo.name}
                      </span>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover Fonte</AlertDialogTitle>
                        <AlertDialogDescription>
                          Tem certeza que deseja remover a fonte "{source.nome}"?
                          Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeleteSource(source.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Remover
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
