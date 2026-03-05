

# Botão Mensagem abre Conversas do Orbit (não WhatsApp Web)

## Resumo

Substituir `window.open(wa.me/...)` por lógica que busca/cria conversa no `orbit_conversas` e navega para `/conversas` com a conversa selecionada.

## Abordagem

Não criar Edge Function. A lógica pode ser feita client-side com o SDK Supabase: buscar conversa existente por `prospect_id`, se não existir inserir nova, e navegar. Isso evita complexidade extra e funciona com as RLS existentes.

## Mudanças

### 1. `src/pages/orbit/ProspectsPage.tsx`

Substituir o handler `onWhatsApp` (linhas 289-301):

```typescript
onWhatsApp={async (pr) => {
  const raw = pr.whatsapp || pr.telefone;
  if (!raw) return;
  let num = raw.replace(/\D/g, "");
  if (num.length >= 10 && num.length <= 11 && !num.startsWith("55")) {
    num = "55" + num;
  }

  // Buscar conversa existente por prospect_id
  let { data: conversa } = await supabase
    .from("orbit_conversas")
    .select("id")
    .eq("prospect_id", pr.id)
    .eq("status", "aberta")
    .maybeSingle();

  // Se não existir, criar nova
  if (!conversa) {
    const { data: nova, error } = await supabase
      .from("orbit_conversas")
      .insert({
        empresa_id: pr.empresa_id,
        prospect_id: pr.id,
        canal: "whatsapp",
        telefone_whatsapp: num,
        status: "aberta",
      })
      .select("id")
      .single();
    if (error) { toast.error("Erro ao criar conversa"); return; }
    conversa = nova;
  }

  // Navegar para Conversas com a conversa selecionada
  navigate(`../conversas?id=${conversa.id}`);
}}
```

Adicionar import de `supabase` e `useNavigate`.

### 2. `src/pages/orbit/ConversasPage.tsx`

Ler `?id=` dos query params e setar `activeId` automaticamente:

```typescript
const [searchParams] = useSearchParams();

useEffect(() => {
  const idParam = searchParams.get("id");
  if (idParam) setActiveId(idParam);
}, [searchParams]);
```

Adicionar import de `useSearchParams` do react-router-dom.

### 3. `src/components/orbit/ProspectActionCard.tsx`

Sem mudanças necessarias. O `hasAnyPhone` e tooltip já estão corretos desde a última edição.

## Arquivos alterados

| Arquivo | Ação |
|---|---|
| `ProspectsPage.tsx` | Substituir `window.open(wa.me)` por busca/criação de conversa + navegação |
| `ConversasPage.tsx` | Ler query param `?id=` para selecionar conversa automaticamente |

