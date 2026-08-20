import { useEffect, useMemo, useState } from "react";
import { GitBranch, History, Plus, RotateCcw, Save, Upload } from "lucide-react";
import type { ContentVersionRead, PromptsFlowsOpsRead } from "@/lib/tenant-operations-types";
import { useTenantOpsActions } from "@/hooks/useTenantOpsActions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface Props { data?: PromptsFlowsOpsRead }
type Prompt = PromptsFlowsOpsRead["prompts"][number];
type Flow = PromptsFlowsOpsRead["flows"][number];
const defaultNodes = { trigger_type: "lead_recebido", trigger_config: {}, conditions: {}, nodes: [] };

function Status({ status, version }: { status: "published" | "draft"; version: number | null }) {
  return <div className="flex items-center gap-2"><Badge variant={status === "published" ? "default" : "secondary"}>{status === "published" ? "Publicado" : "Rascunho"}</Badge><span className="text-xs text-muted-foreground">{version ? `v${version}.0` : "sem versão"}</span></div>;
}

function VersionTimeline({ versions, pending, activeId, onRollback }: { versions: ContentVersionRead[]; pending: boolean; activeId: string | null; onRollback: (id: string) => void }) {
  return <div className="space-y-3">{versions.length ? versions.map((version) => <div key={version.id} className="relative rounded-md border p-3 pl-4">
    <div className="flex items-start justify-between gap-3"><div><p className="font-medium">v{version.version_number}.0 {version.id === activeId ? <Badge className="ml-2">Ativa</Badge> : null}</p><p className="mt-1 text-sm text-muted-foreground">{version.changelog}</p><p className="mt-1 text-xs text-muted-foreground">{version.author_name || "Sistema"} · {new Date(version.published_at).toLocaleString("pt-BR")}</p></div>
      {version.id !== activeId ? <AlertDialog><AlertDialogTrigger asChild><Button size="sm" variant="outline" disabled={pending}><RotateCcw className="mr-2 h-4 w-4" />Rollback</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Aplicar rollback imediato?</AlertDialogTitle><AlertDialogDescription>Esta versão será reativada imediatamente e passará a controlar a IA ou o fluxo em produção deste tenant.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction onClick={() => onRollback(version.id)}>Confirmar rollback</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : null}
    </div></div>) : <p className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">Nenhuma versão publicada.</p>}</div>;
}

export function PromptsFlowsManager({ data }: Props) {
  const action = useTenantOpsActions();
  const { toast } = useToast();
  const [promptId, setPromptId] = useState<string | null>(null);
  const [promptName, setPromptName] = useState("");
  const [promptDescription, setPromptDescription] = useState("");
  const [promptContent, setPromptContent] = useState("");
  const [runtimeSlot, setRuntimeSlot] = useState<Prompt["runtime_slot"]>("prompt_identidade");
  const [promptChangelog, setPromptChangelog] = useState("");
  const [flowId, setFlowId] = useState<string | null>(null);
  const [flowName, setFlowName] = useState("");
  const [nodesText, setNodesText] = useState(JSON.stringify(defaultNodes, null, 2));
  const [edgesText, setEdgesText] = useState("[]");
  const [flowChangelog, setFlowChangelog] = useState("");

  const selectedPrompt = useMemo(() => data?.prompts.find((item) => item.id === promptId), [data?.prompts, promptId]);
  const selectedFlow = useMemo(() => data?.flows.find((item) => item.id === flowId), [data?.flows, flowId]);

  useEffect(() => { if (!promptId && data?.prompts[0]) setPromptId(data.prompts[0].id); }, [data?.prompts, promptId]);
  useEffect(() => { if (!flowId && data?.flows[0]) setFlowId(data.flows[0].id); }, [data?.flows, flowId]);
  useEffect(() => { if (!selectedPrompt) return; setPromptName(selectedPrompt.name);setPromptDescription(selectedPrompt.draft_description || "");setPromptContent(selectedPrompt.draft_content);setRuntimeSlot(selectedPrompt.runtime_slot);setPromptChangelog(""); }, [selectedPrompt]);
  useEffect(() => { if (!selectedFlow) return;setFlowName(selectedFlow.name);setNodesText(JSON.stringify(selectedFlow.nodes_schema,null,2));setEdgesText(JSON.stringify(selectedFlow.edges_schema,null,2));setFlowChangelog(""); }, [selectedFlow]);

  const newPrompt = () => { setPromptId(null);setPromptName("");setPromptDescription("");setPromptContent("");setRuntimeSlot("prompt_identidade");setPromptChangelog(""); };
  const newFlow = () => { setFlowId(null);setFlowName("");setNodesText(JSON.stringify(defaultNodes,null,2));setEdgesText("[]");setFlowChangelog(""); };

  const savePrompt = async () => {
    const result = await action.mutateAsync({ action: "save_prompt_draft", payload: { prompt_id: promptId || undefined, name: promptName, description: promptDescription, content: promptContent, runtime_slot: runtimeSlot, source: "tenant_operations_ui" } });
    if (!promptId && result.entity_id) setPromptId(result.entity_id);
  };
  const publishPrompt = () => action.mutate({ action: "publish_prompt_version", payload: { prompt_id: promptId || undefined, changelog: promptChangelog, source: "tenant_operations_ui" } });
  const saveFlow = async () => {
    let nodes: Record<string, unknown>; let edges: unknown[];
    try { nodes=JSON.parse(nodesText) as Record<string,unknown>;edges=JSON.parse(edgesText) as unknown[]; } catch {
      toast({ title: "JSON inválido", description: "Revise nodes_schema e edges_schema antes de salvar.", variant: "destructive" });
      return;
    }
    const result=await action.mutateAsync({ action:"save_flow_draft",payload:{ flow_id:flowId||undefined,name:flowName,nodes_schema:nodes,edges_schema:edges,changelog:flowChangelog,source:"tenant_operations_ui" } });
    if (!flowId && result.entity_id) setFlowId(result.entity_id);
  };
  const publishFlow = () => action.mutate({ action:"publish_flow_version",payload:{ flow_id:flowId||undefined,changelog:flowChangelog,source:"tenant_operations_ui" } });

  return <Dialog><DialogTrigger asChild><Button size="sm" variant="outline"><GitBranch className="mr-2 h-4 w-4" />Gerenciar versões</Button></DialogTrigger>
    <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>Prompts & Fluxos</DialogTitle><DialogDescription>Rascunhos isolados, publicação imutável e rollback imediato com auditoria.</DialogDescription></DialogHeader>
      <Tabs defaultValue="prompts"><TabsList><TabsTrigger value="prompts">Prompts ({data?.prompts.length || 0})</TabsTrigger><TabsTrigger value="flows">Fluxos ({data?.flows.length || 0})</TabsTrigger></TabsList>
        <TabsContent value="prompts" className="mt-5"><div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-2"><Button className="w-full" variant="outline" onClick={newPrompt}><Plus className="mr-2 h-4 w-4" />Novo prompt</Button>{data?.prompts.map((prompt)=><button key={prompt.id} onClick={()=>setPromptId(prompt.id)} className={`w-full rounded-md border p-3 text-left ${prompt.id===promptId?"border-primary bg-primary/5":""}`}><p className="truncate font-medium">{prompt.name}</p><div className="mt-2"><Status status={prompt.status} version={prompt.active_version_number}/></div></button>)}</aside>
          <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Nome</Label><Input value={promptName} onChange={(e)=>setPromptName(e.target.value)} /></div><div className="space-y-2"><Label>Slot consumido pela IA</Label><Select value={runtimeSlot} onValueChange={(v)=>setRuntimeSlot(v as Prompt["runtime_slot"])}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="prompt_identidade">Identidade</SelectItem><SelectItem value="prompt_roteiro">Roteiro</SelectItem><SelectItem value="prompt_regras">Regras</SelectItem></SelectContent></Select></div><div className="space-y-2 sm:col-span-2"><Label>Descrição</Label><Input value={promptDescription} onChange={(e)=>setPromptDescription(e.target.value)} /></div><div className="space-y-2 sm:col-span-2"><Label>Conteúdo</Label><Textarea className="min-h-48 font-mono" value={promptContent} onChange={(e)=>setPromptContent(e.target.value)} /></div><div className="space-y-2 sm:col-span-2"><Label>Changelog / motivo da publicação</Label><Input value={promptChangelog} onChange={(e)=>setPromptChangelog(e.target.value)} placeholder="Obrigatório para publicar" /></div></div>
            <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={action.isPending||!promptName.trim()||!promptContent.trim()} onClick={savePrompt}><Save className="mr-2 h-4 w-4" />Salvar rascunho</Button><Button disabled={action.isPending||!promptId||!promptChangelog.trim()} onClick={publishPrompt}><Upload className="mr-2 h-4 w-4" />Publicar nova versão</Button></div>
            <div><h3 className="mb-3 flex items-center gap-2 font-medium"><History className="h-4 w-4" />Histórico</h3><VersionTimeline versions={selectedPrompt?.versions||[]} activeId={selectedPrompt?.active_version_id||null} pending={action.isPending} onRollback={(target)=>action.mutate({action:"rollback_prompt_version",payload:{prompt_id:promptId||undefined,target_version_id:target,source:"tenant_operations_ui"}})}/></div>
          </div></div></TabsContent>
        <TabsContent value="flows" className="mt-5"><div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-2"><Button className="w-full" variant="outline" onClick={newFlow}><Plus className="mr-2 h-4 w-4" />Novo fluxo</Button>{data?.flows.map((flow)=><button key={flow.id} onClick={()=>setFlowId(flow.id)} className={`w-full rounded-md border p-3 text-left ${flow.id===flowId?"border-primary bg-primary/5":""}`}><p className="truncate font-medium">{flow.name}</p><div className="mt-2"><Status status={flow.status} version={flow.active_version_number}/></div></button>)}</aside>
          <div className="space-y-5"><div className="space-y-2"><Label>Nome</Label><Input value={flowName} onChange={(e)=>setFlowName(e.target.value)} /></div><div className="grid gap-4 xl:grid-cols-2"><div className="space-y-2"><Label>nodes_schema</Label><Textarea className="min-h-72 font-mono text-xs" value={nodesText} onChange={(e)=>setNodesText(e.target.value)} /></div><div className="space-y-2"><Label>edges_schema</Label><Textarea className="min-h-72 font-mono text-xs" value={edgesText} onChange={(e)=>setEdgesText(e.target.value)} /></div></div><div className="space-y-2"><Label>Changelog / motivo da alteração</Label><Input value={flowChangelog} onChange={(e)=>setFlowChangelog(e.target.value)} placeholder="Obrigatório para publicar" /></div>
            <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={action.isPending||!flowName.trim()} onClick={()=>void saveFlow()}><Save className="mr-2 h-4 w-4" />Salvar rascunho</Button><Button disabled={action.isPending||!flowId||!flowChangelog.trim()} onClick={publishFlow}><Upload className="mr-2 h-4 w-4" />Publicar nova versão</Button></div>
            <div><h3 className="mb-3 flex items-center gap-2 font-medium"><History className="h-4 w-4" />Histórico</h3><VersionTimeline versions={selectedFlow?.versions||[]} activeId={selectedFlow?.active_version_id||null} pending={action.isPending} onRollback={(target)=>action.mutate({action:"rollback_flow_version",payload:{flow_id:flowId||undefined,target_version_id:target,source:"tenant_operations_ui"}})}/></div>
          </div></div></TabsContent>
      </Tabs></DialogContent></Dialog>;
}
