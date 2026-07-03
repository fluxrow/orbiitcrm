import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronsUpDown, Plus, Pencil, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useOrbitTemplates,
  useCreateTemplate,
  useUpdateTemplate,
} from "@/hooks/useOrbitTemplates";
import { MessageTemplateFormSchema, validatePlaceholders } from "@/lib/flowTemplateSchema";

type TemplateLike = {
  id: string;
  nome: string;
  canal: string;
  categoria: string | null;
  corpo_texto: string | null;
  corpo_html: string | null;
  imagem_url?: string | null;
};

export function TemplateSelectField({
  value,
  onChange,
  canal = "whatsapp",
  label = "Template",
}: {
  value: string; // guarda `nome` (compat com backend que faz ilike em nome)
  onChange: (patch: { template_slug: string; template_id: string | null }) => void;
  canal?: string;
  label?: string;
}) {
  const { data: templates = [], isLoading } = useOrbitTemplates({ canal, ativo: true });
  const [open, setOpen] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState<{ mode: "create" | "edit"; template?: TemplateLike } | null>(null);

  const selected = useMemo(
    () =>
      (templates as TemplateLike[]).find(
        (t) => t.nome === value || t.id === value,
      ) ?? null,
    [templates, value],
  );

  const bodyPreview = (t: TemplateLike | null) =>
    (t?.corpo_texto || (t?.corpo_html ? t.corpo_html.replace(/<[^>]+>/g, " ") : "") || "").slice(0, 60);

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className="truncate">
              {isLoading
                ? "Carregando..."
                : selected
                  ? selected.nome
                  : "Selecione um template..."}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar template..." />
            <CommandList>
              <CommandEmpty>Nenhum template encontrado.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    setCreatorOpen({ mode: "create" });
                  }}
                  className="text-primary"
                >
                  <Plus className="h-4 w-4 mr-2" /> Criar novo template
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                {(templates as TemplateLike[]).map((t) => (
                  <CommandItem
                    key={t.id}
                    value={t.nome}
                    onSelect={() => {
                      onChange({ template_slug: t.nome, template_id: t.id });
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4 mr-2",
                        selected?.id === t.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{t.nome}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {bodyPreview(t) || "(sem corpo)"}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected && (
        <div className="rounded-md border border-border p-2 bg-card/40 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 flex-wrap">
              <Badge variant="outline" className="text-[10px]">{selected.canal}</Badge>
              {selected.categoria && (
                <Badge variant="outline" className="text-[10px]">{selected.categoria}</Badge>
              )}
              {selected.imagem_url && (
                <Badge variant="outline" className="text-[10px]">com mídia</Badge>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setCreatorOpen({ mode: "edit", template: selected })}
              className="h-7 text-xs"
            >
              <Pencil className="h-3 w-3 mr-1" /> Editar
            </Button>
          </div>
          <div className="text-xs text-muted-foreground whitespace-pre-wrap max-h-20 overflow-hidden">
            {highlightVars(selected.corpo_texto || "(sem corpo de texto)")}
          </div>
        </div>
      )}

      <TemplateQuickCreateDialog
        state={creatorOpen}
        defaultCanal={canal}
        onClose={() => setCreatorOpen(null)}
        onSaved={(t) => {
          onChange({ template_slug: t.nome, template_id: t.id });
          setCreatorOpen(null);
        }}
      />
    </div>
  );
}

function highlightVars(text: string) {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return parts.map((p, i) =>
    p.startsWith("{{") ? (
      <span key={i} className="bg-primary/15 text-primary rounded px-1">{p}</span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function TemplateQuickCreateDialog({
  state,
  defaultCanal,
  onClose,
  onSaved,
}: {
  state: { mode: "create" | "edit"; template?: TemplateLike } | null;
  defaultCanal: string;
  onClose: () => void;
  onSaved: (t: TemplateLike) => void;
}) {
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const [nome, setNome] = useState("");
  const [canal, setCanal] = useState(defaultCanal);
  const [categoria, setCategoria] = useState("");
  const [corpo, setCorpo] = useState("");
  const [assunto, setAssunto] = useState("");

  useEffect(() => {
    if (!state) return;
    if (state.mode === "edit" && state.template) {
      setNome(state.template.nome);
      setCanal(state.template.canal);
      setCategoria(state.template.categoria ?? "");
      setCorpo(state.template.corpo_texto ?? "");
    } else {
      setNome("");
      setCanal(defaultCanal);
      setCategoria("");
      setCorpo("");
      setAssunto("");
    }
  }, [state?.mode, state?.template?.id, defaultCanal]);

  if (!state) return null;
  const editing = state.mode === "edit" && state.template;

  const placeholderCheck = validatePlaceholders(corpo);

  const handleSave = async () => {
    const parsed = MessageTemplateFormSchema.safeParse({
      nome: nome.trim(),
      canal,
      categoria: categoria.trim() || null,
      corpo_texto: corpo,
      assunto_email: assunto.trim() || null,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first?.message || "Dados inválidos");
      return;
    }
    if (placeholderCheck.unknown.length > 0) {
      const proceed = confirm(
        `Placeholders desconhecidos: ${placeholderCheck.unknown.map((p) => `{{${p}}}`).join(", ")}\n\nEles não serão substituídos em runtime. Salvar mesmo assim?`,
      );
      if (!proceed) return;
    }
    try {
      const payload: any = {
        nome: parsed.data.nome,
        canal: parsed.data.canal,
        categoria: parsed.data.categoria,
        corpo_texto: parsed.data.corpo_texto,
        ativo: true,
      };
      if (canal === "email" && assunto.trim()) payload.assunto_email = assunto.trim();

      const saved = editing
        ? await update.mutateAsync({ id: state.template!.id, ...payload })
        : await create.mutateAsync(payload);
      toast.success(editing ? "Template atualizado" : "Template criado");
      onSaved(saved as any);
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    }
  };

  return (
    <Dialog open={!!state} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar template" : "Criar template"}</DialogTitle>
          <DialogDescription>
            Use variáveis como <code>{"{{prospect.nome}}"}</code> ou <code>{"{{deal.valor}}"}</code> no corpo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Boas-vindas lead" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Canal</Label>
              <Select value={canal} onValueChange={setCanal}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Categoria (opcional)</Label>
            <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="follow_up, qualificacao..." />
          </div>
          {canal === "email" && (
            <div className="space-y-1">
              <Label className="text-xs">Assunto do e-mail</Label>
              <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Corpo · {corpo.length} caracteres</Label>
            <Textarea
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              rows={6}
              placeholder="Olá {{prospect.nome}}, tudo bem?"
            />
            <div className="text-[11px] text-muted-foreground">
              Variáveis suportadas: <code>{"{{prospect.nome}}"}</code>, <code>{"{{prospect.email}}"}</code>, <code>{"{{deal.valor}}"}</code>, <code>{"{{empresa.nome}}"}</code>, <code>{"{{link_agendamento}}"}</code>.
            </div>
            {placeholderCheck.unknown.length > 0 && (
              <div className="flex items-start gap-2 text-[11px] text-amber-400 rounded border border-amber-500/30 bg-amber-500/5 p-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div>
                  Placeholders desconhecidos: {placeholderCheck.unknown.map((p) => (
                    <code key={p} className="mx-0.5 bg-amber-500/10 px-1 rounded">{`{{${p}}}`}</code>
                  ))}
                  <div className="text-muted-foreground mt-1">Não serão substituídos em runtime.</div>
                </div>
              </div>
            )}
            {placeholderCheck.known.length > 0 && (
              <div className="text-[11px] text-emerald-400/90">
                {placeholderCheck.known.length} placeholder(s) reconhecido(s).
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            onClick={handleSave}
            disabled={create.isPending || update.isPending}
          >
            {editing ? "Salvar alterações" : "Criar template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
