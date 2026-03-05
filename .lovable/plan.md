

# Ajustar botão de Mensagem nos cards de Prospect

## Problema
O botão fica `disabled` quando `whatsapp` é nulo ou `whatsapp_status === "invalido"`, mesmo que exista `telefone` como fallback.

## Mudanças

### 1. `src/components/orbit/ProspectActionCard.tsx`

**Alterar lógica de habilitação (linha 45):**
```typescript
// De:
const hasWhatsapp = !!prospect.whatsapp && prospect.whatsapp_status !== "invalido";

// Para:
const hasAnyPhone = !!(prospect.whatsapp || prospect.telefone);
```

**Atualizar disabled e tooltip (linhas 130-135):**
- `disabled={!hasAnyPhone}`
- Tooltip: se `hasAnyPhone` → "Iniciar conversa" (com aviso se não verificado), senão → "Sem número disponível"
- Se `whatsapp_status !== "valido"` e tem número, mostrar ícone de aviso sutil no botão

### 2. `src/pages/orbit/ProspectsPage.tsx`

**Alterar handler `onWhatsApp` (linhas 289-293):**
```typescript
onWhatsApp={(pr) => {
  const raw = pr.whatsapp || pr.telefone;
  if (!raw) return;
  let num = raw.replace(/\D/g, "");
  if (num.length >= 10 && num.length <= 11 && !num.startsWith("55")) {
    num = "55" + num;
  }
  if (pr.whatsapp_status !== "valido") {
    toast.info("⚠ WhatsApp não verificado. Tentando iniciar conversa...");
  }
  window.open(`https://wa.me/${num}`, "_blank");
}}
```

## Arquivos alterados

| Arquivo | Ação |
|---|---|
| `ProspectActionCard.tsx` | Mudar `hasWhatsapp` para considerar `telefone` como fallback |
| `ProspectsPage.tsx` | Normalizar número com fallback `telefone` + aviso se não verificado |

