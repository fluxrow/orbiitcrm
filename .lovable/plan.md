

# Fallback para "Comercial Alexandre" no handoff da IA

## Problema
Quando o cadastro é completado ou o lead pede para falar com humano, o sistema não encontra vendedor (fila de distribuição vazia e prospect sem `responsavel_id`), então o handoff nunca acontece.

## Solução
Reorganizar a lógica de atribuição (linhas 239-271 de `orbit-ai-agent/index.ts`) com 3 níveis de prioridade:

1. **Responsável já salvo no prospect** (`prospect.responsavel_id`) → usar diretamente
2. **Fila de distribuição** (round-robin, como hoje)
3. **Fallback fixo** → Alexandre Eifler Bock (`bf42e203-328e-445b-a72d-93529aaedd4d`)

```typescript
let vendedorAtribuido: string | null = null;
const FALLBACK_VENDEDOR_ID = "bf42e203-328e-445b-a72d-93529aaedd4d"; // Alexandre

if (parsed.cadastro_completo || parsed.intencao === "falar_humano") {
  if (prospect?.responsavel_id) {
    // 1) Usar responsável já cadastrado
    vendedorAtribuido = prospect.responsavel_id;
  } else {
    // 2) Round-robin
    const { data: proximoVendedor } = await supabase
      .from("orbit_distribuicao_config")...
    if (proximoVendedor) {
      vendedorAtribuido = proximoVendedor.vendedor_id;
      // update prospect + distribuicao (como hoje)
    } else {
      // 3) Fallback: Alexandre
      vendedorAtribuido = FALLBACK_VENDEDOR_ID;
    }
  }

  // Atualizar prospect com responsável e qualificar
  if (vendedorAtribuido) {
    await supabase.from("orbit_prospects")
      .update({ responsavel_id: vendedorAtribuido, status_qualificacao: "qualificado" })
      .eq("id", prospect_id);
  }
}
```

O bloco de handoff existente (linhas 273-285) continua funcionando sem alteração — já usa `vendedorAtribuido`.

## Arquivo alterado

| Arquivo | Alteração |
|---|---|
| `supabase/functions/orbit-ai-agent/index.ts` | Reorganizar lógica: priorizar responsável existente → fila → fallback Alexandre |

