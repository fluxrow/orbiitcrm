import { useState } from "react";
import { ArchiveRestore, Images, Link2, Trash2 } from "lucide-react";
import type { MediaOpsRead } from "@/lib/tenant-operations-types";
import { useTenantOpsActions } from "@/hooks/useTenantOpsActions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Props { media?: MediaOpsRead }
type Item = MediaOpsRead["items"][number];
const formatSize = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

function MediaRow({ item, pending, onRestore, onDelete }: { item: Item; pending: boolean; onRestore: () => void; onDelete: () => void }) {
  const linked = item.active_flow_references > 0;
  return <div className="rounded-md border p-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="truncate font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.kind} · {item.purpose} · {formatSize(item.size_bytes)}</p></div>
      {item.deleted_at ? <Button size="sm" variant="outline" disabled={pending} onClick={onRestore}><ArchiveRestore className="mr-2 h-4 w-4" />Restaurar</Button> :
        <AlertDialog><AlertDialogTrigger asChild><Button size="sm" variant="destructive" disabled={pending || linked}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button></AlertDialogTrigger>
          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Enviar mídia para a lixeira?</AlertDialogTitle><AlertDialogDescription>A mídia será desativada e marcada com soft delete. O arquivo físico não será removido.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onDelete}>Confirmar exclusão</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>}
    </div>
    {linked ? <p className="mt-2 flex items-center gap-2 text-xs text-amber-600"><Link2 className="h-3.5 w-3.5" />Exclusão bloqueada: vinculada a {item.active_flow_references} fluxo(s) ativo(s).</p> : null}
  </div>;
}

export function MediaOperationsManager({ media }: Props) {
  const action = useTenantOpsActions();
  const active = media?.items.filter((item) => !item.deleted_at) || [];
  const deleted = media?.items.filter((item) => !!item.deleted_at) || [];
  const mutate = (actionType: "soft_delete_media" | "restore_soft_deleted_media", mediaId: string) => action.mutate({ action: actionType, payload: { media_id: mediaId, source: "tenant_operations_ui" } });
  const list = (items: Item[], empty: string) => items.length ? <div className="space-y-2">{items.map((item) => <MediaRow key={item.id} item={item} pending={action.isPending} onDelete={() => mutate("soft_delete_media", item.id)} onRestore={() => mutate("restore_soft_deleted_media", item.id)} />)}</div> : <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{empty}</p>;

  return <Dialog><DialogTrigger asChild><Button size="sm" variant="outline"><Images className="mr-2 h-4 w-4" />Gerenciar mídias</Button></DialogTrigger>
    <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Governança de Mídias</DialogTitle><DialogDescription>Soft delete seguro, restauração e verificação de vínculos com fluxos ativos.</DialogDescription></DialogHeader>
      <Tabs defaultValue="active"><TabsList><TabsTrigger value="active">Ativas ({active.length})</TabsTrigger><TabsTrigger value="deleted">Lixeira ({deleted.length})</TabsTrigger></TabsList><TabsContent value="active" className="mt-4">{list(active,"Nenhuma mídia ativa neste tenant.")}</TabsContent><TabsContent value="deleted" className="mt-4">{list(deleted,"A lixeira está vazia.")}</TabsContent></Tabs>
    </DialogContent>
  </Dialog>;
}
