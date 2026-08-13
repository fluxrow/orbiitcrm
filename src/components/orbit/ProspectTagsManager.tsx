import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, Plus, Tag as TagIcon, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  TAG_COLORS,
  useCreateTag,
  useDeleteTag,
  useOrbitTags,
  useProspectTags,
  useToggleProspectTag,
  validateTagName,
} from "@/hooks/useOrbitTags";

interface Props {
  prospectId: string | null | undefined;
  /** Somente leitura (ex.: prospect ainda não salvo). */
  readOnly?: boolean;
}

/**
 * Tags manuais do prospect. Criação, atribuição e remoção — tudo escopado ao
 * tenant atual (empresa_id) tanto na query quanto nas políticas do banco.
 */
export function ProspectTagsManager({ prospectId, readOnly = false }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [novaCor, setNovaCor] = useState<string>(TAG_COLORS[0]);

  const { data: tags = [], isLoading } = useOrbitTags();
  const { data: assigned = [] } = useProspectTags(prospectId);
  const toggle = useToggleProspectTag(prospectId);
  const createTag = useCreateTag();
  const deleteTag = useDeleteTag();

  const assignedIds = useMemo(() => new Set(assigned.map((a) => a.tag_id)), [assigned]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? tags.filter((t) => t.nome.toLowerCase().includes(q)) : tags;
  }, [tags, search]);

  const exactExists = tags.some((t) => t.nome.trim().toLowerCase() === search.trim().toLowerCase());

  const handleToggle = async (tagId: string, attach: boolean) => {
    try {
      await toggle.mutateAsync({ tagId, attach });
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível atualizar as tags");
    }
  };

  const handleCreate = async () => {
    const error = validateTagName(search);
    if (error) {
      toast.error(error);
      return;
    }
    try {
      const tag = await createTag.mutateAsync({ nome: search, cor: novaCor });
      setSearch("");
      if (prospectId) await handleToggle(tag.id, true);
      toast.success("Tag criada");
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível criar a tag");
    }
  };

  const handleDeleteTag = async (id: string) => {
    try {
      await deleteTag.mutateAsync(id);
      toast.success("Tag removida do tenant");
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível remover a tag");
    }
  };

  return (
    <div className="space-y-2" data-testid="prospect-tags">
      <Label className="flex items-center gap-2">
        <TagIcon className="h-4 w-4" /> Tags
      </Label>

      <div className="flex flex-wrap items-center gap-2">
        {assigned.map((a) => (
          <Badge
            key={a.id}
            variant="outline"
            className="gap-1"
            style={{ borderColor: a.tag?.cor ?? undefined, color: a.tag?.cor ?? undefined }}
          >
            {a.tag?.nome ?? "tag"}
            {!readOnly && (
              <button
                type="button"
                aria-label={`Remover tag ${a.tag?.nome ?? ""}`}
                onClick={() => handleToggle(a.tag_id, false)}
                className="opacity-70 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
        {assigned.length === 0 && (
          <span className="text-xs text-muted-foreground">Nenhuma tag atribuída</span>
        )}

        {!readOnly && prospectId && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1">
                <Plus className="h-3 w-3" /> Tag
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3 space-y-3" align="start">
              <Input
                placeholder="Buscar ou criar tag..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                maxLength={40}
              />

              <div className="max-h-48 space-y-1 overflow-y-auto">
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {filtered.map((t) => {
                  const isOn = assignedIds.has(t.id);
                  return (
                    <div key={t.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggle(t.id, !isOn)}
                        className={cn(
                          "flex flex-1 items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted",
                          isOn && "bg-muted/60",
                        )}
                      >
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.cor }} />
                        <span className="flex-1 truncate text-left">{t.nome}</span>
                        {isOn && <Check className="h-3 w-3" />}
                      </button>
                      <button
                        type="button"
                        aria-label={`Excluir tag ${t.nome}`}
                        onClick={() => handleDeleteTag(t.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
                {!isLoading && filtered.length === 0 && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">Nenhuma tag encontrada</p>
                )}
              </div>

              {search.trim() && !exactExists && (
                <div className="space-y-2 border-t pt-2">
                  <div className="flex items-center gap-1">
                    {TAG_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Cor ${c}`}
                        onClick={() => setNovaCor(c)}
                        className={cn(
                          "h-5 w-5 rounded-full border-2",
                          novaCor === c ? "border-foreground" : "border-transparent",
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full"
                    onClick={handleCreate}
                    disabled={createTag.isPending}
                  >
                    {createTag.isPending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Plus className="mr-2 h-3 w-3" />}
                    Criar "{search.trim()}"
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>

      {!prospectId && (
        <p className="text-xs text-muted-foreground">Salve o prospect para atribuir tags.</p>
      )}
    </div>
  );
}
