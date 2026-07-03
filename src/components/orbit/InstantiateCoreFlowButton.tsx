import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  useOrbitFlowTemplates,
  useOrbitFlows,
  type OrbitFlowTemplate,
} from "@/hooks/useOrbitFlows";
import { useInstantiateCoreFlow } from "@/hooks/useInstantiateCoreFlow";

function pickCoreTemplate(list: OrbitFlowTemplate[] | undefined) {
  return (list ?? []).find(
    (t) => t.is_official === true && /^\[CORE\]/i.test(t.nome),
  );
}

export function InstantiateCoreFlowButton({ empresaId }: { empresaId: string }) {
  const { data: templates } = useOrbitFlowTemplates();
  const { data: flows } = useOrbitFlows(empresaId);
  const instantiate = useInstantiateCoreFlow();

  const core = useMemo(() => pickCoreTemplate(templates), [templates]);
  const already = useMemo(
    () => (core && flows ? flows.find((f) => f.template_id === core.id) : null),
    [core, flows],
  );

  const [open, setOpen] = useState(false);
  const [empresaNome, setEmpresaNome] = useState("");
  const [vendedorTelefone, setVendedorTelefone] = useState("");
  const [linkAgendamento, setLinkAgendamento] = useState("");

  if (!core) return null;

  const openDialog = () => {
    setEmpresaNome("");
    setVendedorTelefone("");
    setLinkAgendamento("");
    setOpen(true);
  };

  const onConfirm = () => {
    instantiate.mutate(
      {
        empresaId,
        template: core,
        values: {
          "empresa.nome": empresaNome.trim(),
          "vendedor.telefone": vendedorTelefone.trim(),
          link_agendamento: linkAgendamento.trim(),
        },
      },
      {
        onSuccess: () => {
          toast.success("Core Flow instanciado! Revise e ative na lista abaixo.");
          setOpen(false);
        },
        onError: (e: any) => toast.error(`Falha ao instanciar: ${e.message}`),
      },
    );
  };

  return (
    <>
      {already ? (
        <Badge className="bg-brand/15 text-brand gap-1">
          <ShieldCheck className="h-3 w-3" /> Core Flow instalado
        </Badge>
      ) : (
        <Button
          variant="outline"
          onClick={openDialog}
          className="border-brand/40 text-brand hover:bg-brand/10"
          title="Cria o Orbit Core Flow neste tenant com 1 clique"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          Instanciar Core Flow
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand" />
              Instanciar {core.nome}
            </DialogTitle>
            <DialogDescription>
              As variáveis abaixo serão injetadas nos passos do fluxo antes de salvar.
              Pode deixar em branco — o placeholder original é mantido para você
              preencher depois no editor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div>
              <Label>{"{{empresa.nome}}"}</Label>
              <Input
                placeholder="Ex.: Acme Ltda"
                value={empresaNome}
                onChange={(e) => setEmpresaNome(e.target.value)}
              />
            </div>
            <div>
              <Label>{"{{vendedor.telefone}}"}</Label>
              <Input
                placeholder="Ex.: +5511999998888"
                value={vendedorTelefone}
                onChange={(e) => setVendedorTelefone(e.target.value)}
              />
            </div>
            <div>
              <Label>{"{{link_agendamento}}"}</Label>
              <Input
                placeholder="https://cal.com/sua-empresa"
                value={linkAgendamento}
                onChange={(e) => setLinkAgendamento(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              O fluxo é criado <strong>inativo</strong>. Confira as ações e ative
              quando estiver pronto.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={onConfirm}
              disabled={instantiate.isPending}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {instantiate.isPending ? "Instanciando..." : "Instanciar Core Flow"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
