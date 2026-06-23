import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Edit2, GitBranch, Zap, ChevronDown, ChevronUp, Save, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  useOrbitChatbotFlows,
  useCreateChatbotFlow,
  useUpdateChatbotFlow,
  useDeleteChatbotFlow,
  useToggleChatbotFlow,
  ChatbotFlow,
} from "@/hooks/useOrbitChatbotFlows";
import { useOrbitAudioLibrary } from "@/hooks/useOrbitAudioLibrary";

type BranchForm = {
  nome: string;
  keywords: string[] | null;
  resposta_texto: string;
  resposta_audio_id: string | null;
  encerrar_fluxo: boolean;
  ordem: number;
};

const EMPTY_BRANCH = (): BranchForm => ({
  nome: "",
  keywords: [],
  resposta_texto: "",
  resposta_audio_id: null,
  encerrar_fluxo: true,
  ordem: 0,
});

const EMPTY_FLOW = () => ({
  nome: "",
  descricao: "",
  trigger_keywords: [] as string[],
  trigger_modo: "contains" as "contains" | "exact",
  passo1_texto: "",
  passo1_audio_id: null as string | null,
  passo1_aguardar_resposta: true,
  prioridade: 0,
  branches: [
    { ...EMPTY_BRANCH(), nome: "Resposta SIM", keywords: ["sim", "s", "yes", "quero"], encerrar_fluxo: true, ordem: 0 },
    { ...EMPTY_BRANCH(), nome: "Resposta NÃO", keywords: ["nao", "não", "n", "no"], encerrar_fluxo: true, ordem: 1 },
    { ...EMPTY_BRANCH(), nome: "Fallback", keywords: null, encerrar_fluxo: false, ordem: 2 },
  ] as BranchForm[],
});

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState("");
  const add = () => {
    const trimmed = input.trim().toLowerCase();
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setInput("");
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={input}
          placeholder={placeholder ?? "Adicionar palavra..."}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
          className="flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={add}>+</Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {value.map((kw) => (
          <Badge key={kw} variant="secondary" className="gap-1 text-xs">
            {kw}
            <button onClick={() => onChange(value.filter((k) => k !== kw))} className="hover:text-destructive"><X className="h-3 w-3" /></button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

type FlowFormData = ReturnType<typeof EMPTY_FLOW>;

export function ChatbotFlowManager() {
  const { data: flows = [], isLoading } = useOrbitChatbotFlows();
  const { data: audioClips = [] } = useOrbitAudioLibrary();
  const createFlow = useCreateChatbotFlow();
  const updateFlow = useUpdateChatbotFlow();
  const deleteFlow = useDeleteChatbotFlow();
  const toggleFlow = useToggleChatbotFlow();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFlow, setEditingFlow] = useState<ChatbotFlow | null>(null);
  const [form, setForm] = useState<FlowFormData>(EMPTY_FLOW);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const openCreate = () => { setEditingFlow(null); setForm(EMPTY_FLOW()); setDialogOpen(true); };
  const openEdit = (flow: ChatbotFlow) => {
    setEditingFlow(flow);
    setForm({
      nome: flow.nome,
      descricao: flow.descricao ?? "",
      trigger_keywords: flow.trigger_keywords,
      trigger_modo: flow.trigger_modo,
      passo1_texto: flow.passo1_texto ?? "",
      passo1_audio_id: flow.passo1_audio_id ?? null,
      passo1_aguardar_resposta: flow.passo1_aguardar_resposta,
      prioridade: flow.prioridade,
      branches: (flow.branches ?? []).map((b) => ({
        nome: b.nome ?? "",
        keywords: b.keywords,
        resposta_texto: b.resposta_texto ?? "",
        resposta_audio_id: b.resposta_audio_id ?? null,
        encerrar_fluxo: b.encerrar_fluxo,
        ordem: b.ordem,
      })),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) return toast.error("Nome obrigatório");
    if (!form.trigger_keywords.length) return toast.error("Adicione pelo menos uma palavra-chave de disparo");
    try {
      if (editingFlow) {
        await updateFlow.mutateAsync({ id: editingFlow.id, ...form });
      } else {
        await createFlow.mutateAsync(form);
      }
      toast.success(editingFlow ? "Fluxo atualizado!" : "Fluxo criado!");
      setDialogOpen(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const updateBranch = (i: number, patch: Partial<BranchForm>) => {
    setForm((f) => ({ ...f, branches: f.branches.map((b, idx) => idx === i ? { ...b, ...patch } : b) }));
  };
  const addBranch = () => setForm((f) => ({ ...f, branches: [...f.branches, { ...EMPTY_BRANCH(), ordem: f.branches.length }] }));
  const removeBranch = (i: number) => setForm((f) => ({ ...f, branches: f.branches.filter((_, idx) => idx !== i) }));

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Defina palavras-chave que disparam respostas automáticas pré-programadas (texto ou áudio). O fluxo tem prioridade sobre a IA.
          </p>
        </div>
        <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4 mr-2" />Novo Fluxo</Button>
      </div>

      {flows.length === 0 && (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
          <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhum fluxo criado ainda.</p>
          <p className="text-xs mt-1">Crie um fluxo para responder automaticamente quando o lead enviar palavras como "sim", "preço", "quero".</p>
        </div>
      )}

      {flows.map((flow) => (
        <Card key={flow.id} className={!flow.ativo ? "opacity-60" : undefined}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Zap className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <CardTitle className="text-base">{flow.nome}</CardTitle>
                  {flow.descricao && <CardDescription className="text-xs truncate">{flow.descricao}</CardDescription>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="text-xs">{flow.uso_count} usos</Badge>
                <Switch
                  checked={flow.ativo}
                  onCheckedChange={(v) => toggleFlow.mutate({ id: flow.id, ativo: v })}
                />
                <Button variant="ghost" size="icon" onClick={() => openEdit(flow)}><Edit2 className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => { if (confirm("Excluir fluxo?")) deleteFlow.mutate(flow.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                <Button variant="ghost" size="icon" onClick={() => setExpandedId(expandedId === flow.id ? null : flow.id)}>
                  {expandedId === flow.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {flow.trigger_keywords.map((kw) => (
                <Badge key={kw} className="text-xs">{kw}</Badge>
              ))}
            </div>
          </CardHeader>
          {expandedId === flow.id && (
            <CardContent className="pt-0 space-y-3 text-sm">
              <div className="p-3 bg-muted rounded-lg space-y-1">
                <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Passo 1 — Enviar ao disparar</p>
                {flow.passo1_texto && <p className="text-sm">💬 {flow.passo1_texto.substring(0, 80)}{flow.passo1_texto.length > 80 ? "..." : ""}</p>}
                {flow.passo1_audio_id && <p className="text-sm">🎵 {audioClips.find(a => a.id === flow.passo1_audio_id)?.nome ?? "Áudio"}</p>}
                {flow.passo1_aguardar_resposta && <p className="text-xs text-muted-foreground">⏳ Aguarda resposta do lead</p>}
              </div>
              {(flow.branches ?? []).length > 0 && (
                <div className="space-y-2">
                  <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Branches de resposta</p>
                  {(flow.branches ?? []).slice().sort((a, b) => a.ordem - b.ordem).map((b) => (
                    <div key={b.id} className="p-2 border rounded-lg space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{b.nome ?? "Branch"}</span>
                        {b.keywords ? (
                          <div className="flex flex-wrap gap-1">{b.keywords.map(k => <Badge key={k} variant="outline" className="text-xs px-1">{k}</Badge>)}</div>
                        ) : (
                          <Badge variant="secondary" className="text-xs">padrão / fallback</Badge>
                        )}
                      </div>
                      {b.resposta_texto && <p className="text-muted-foreground">💬 {b.resposta_texto.substring(0, 60)}{b.resposta_texto.length > 60 ? "..." : ""}</p>}
                      {b.resposta_audio_id && <p className="text-muted-foreground">🎵 {audioClips.find(a => a.id === b.resposta_audio_id)?.nome ?? "Áudio"}</p>}
                      {b.encerrar_fluxo && <span className="text-muted-foreground">→ encerra fluxo</span>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFlow ? "Editar Fluxo" : "Novo Fluxo Condicional"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do fluxo *</Label>
                <Input placeholder="Ex: Interesse em Preço" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Prioridade (maior = primeiro)</Label>
                <Input type="number" value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Input placeholder="Para que serve este fluxo?" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>Palavras-chave de disparo * <span className="text-xs text-muted-foreground">(Enter ou vírgula para adicionar)</span></Label>
              <TagInput
                value={form.trigger_keywords}
                onChange={(v) => setForm({ ...form, trigger_keywords: v })}
                placeholder="Ex: preço, valor, custa, quanto..."
              />
              <div className="flex items-center gap-4 mt-2">
                <Label className="text-sm">Modo:</Label>
                <Select value={form.trigger_modo} onValueChange={(v) => setForm({ ...form, trigger_modo: v as "contains" | "exact" })}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contains">Contém a palavra</SelectItem>
                    <SelectItem value="exact">Mensagem exata</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3 p-4 bg-muted rounded-lg">
              <Label className="text-sm font-semibold">Passo 1 — Resposta ao disparar o fluxo</Label>
              <div className="space-y-2">
                <Label className="text-xs">Mensagem de texto</Label>
                <Textarea placeholder="Texto que será enviado quando o fluxo for disparado..." value={form.passo1_texto} onChange={(e) => setForm({ ...form, passo1_texto: e.target.value })} className="min-h-[80px]" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Áudio da biblioteca (opcional)</Label>
                <Select value={form.passo1_audio_id ?? "none"} onValueChange={(v) => setForm({ ...form, passo1_audio_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar clip..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {audioClips.filter(a => a.ativo).map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.nome} ({a.contexto})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.passo1_aguardar_resposta} onCheckedChange={(v) => setForm({ ...form, passo1_aguardar_resposta: v })} />
                <Label className="text-sm">Aguardar resposta do lead para continuar o fluxo</Label>
              </div>
            </div>

            {form.passo1_aguardar_resposta && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Branches — Respostas Condicionais</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addBranch}><Plus className="h-3 w-3 mr-1" />Branch</Button>
                </div>
                <p className="text-xs text-muted-foreground">Defina o que o agente responde conforme a resposta do lead. Branch sem palavras = fallback padrão.</p>
                {form.branches.map((branch, i) => (
                  <div key={i} className="p-3 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <Input placeholder="Nome da branch" value={branch.nome ?? ""} onChange={(e) => updateBranch(i, { nome: e.target.value })} className="flex-1" />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeBranch(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Palavras-chave desta branch (vazio = fallback)</Label>
                      <TagInput
                        value={branch.keywords ?? []}
                        onChange={(v) => updateBranch(i, { keywords: v.length ? v : null })}
                        placeholder="sim, s, yes, quero..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Resposta texto</Label>
                      <Textarea placeholder="Mensagem de resposta..." value={branch.resposta_texto ?? ""} onChange={(e) => updateBranch(i, { resposta_texto: e.target.value })} className="min-h-[60px]" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Áudio da biblioteca (opcional)</Label>
                      <Select value={branch.resposta_audio_id ?? "none"} onValueChange={(v) => updateBranch(i, { resposta_audio_id: v === "none" ? null : v })}>
                        <SelectTrigger><SelectValue placeholder="Selecionar clip..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {audioClips.filter(a => a.ativo).map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={branch.encerrar_fluxo} onCheckedChange={(v) => updateBranch(i, { encerrar_fluxo: v })} />
                      <Label className="text-xs">Encerrar fluxo após esta resposta</Label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createFlow.isPending || updateFlow.isPending}>
              {(createFlow.isPending || updateFlow.isPending) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {editingFlow ? "Salvar Alterações" : "Criar Fluxo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
