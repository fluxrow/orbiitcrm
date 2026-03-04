

# Fix: "Erro ao salvar prospect" -- empresa_id ausente no INSERT

## Problema

O `ProspectDialog` ao criar um prospect não envia o campo `empresa_id`. A política RLS de INSERT exige que `empresa_id = get_user_empresa_id(auth.uid())`, então o banco rejeita a inserção.

## Correção

No `ProspectDialog.tsx`, buscar o `empresa_id` do perfil do usuário logado e incluí-lo no `createProspect.mutateAsync()`.

### Alteração em `src/components/orbit/ProspectDialog.tsx`

1. Importar `supabase` e usar `useQuery` (ou um efeito) para buscar o `empresa_id` do perfil do usuário autenticado
2. Na chamada `createProspect.mutateAsync(...)`, adicionar `empresa_id` ao objeto

Abordagem mais simples: buscar o perfil inline com uma query:

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Dentro do componente:
const { data: profile } = useQuery({
  queryKey: ["my-profile-empresa"],
  queryFn: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("profiles").select("empresa_id").eq("id", user.id).single();
    return data;
  },
});

// No onSubmit, linha 133:
await createProspect.mutateAsync({
  ...data,
  nome_razao: data.nome_razao,
  empresa_id: profile?.empresa_id,
});
```

Isso garante que o `empresa_id` correto seja enviado, satisfazendo a política RLS.

