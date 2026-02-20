

# Etapa 3D -- Hotfix de Banco (Validacoes + Automacoes)

Mover regras criticas do frontend para o Postgres. Nenhuma tabela nova, apenas triggers/functions e ajustes minimos nos hooks.

---

## Fase 1 -- Migration SQL

Uma unica migration com 3 blocos:

### 1.1 Validar funil_etapas.tipo

```text
CREATE FUNCTION validate_funil_etapa() RETURNS trigger
  IF NEW.tipo NOT IN ('open','won','lost') => RAISE EXCEPTION
CREATE TRIGGER trg_validate_funil_etapa
  BEFORE INSERT OR UPDATE ON funil_etapas
  FOR EACH ROW EXECUTE FUNCTION validate_funil_etapa()
```

### 1.2 Status automatico ao mudar etapa_id em oportunidades

```text
CREATE FUNCTION auto_oportunidade_status() RETURNS trigger
  -- So executa quando etapa_id muda (INSERT ou UPDATE com etapa_id diferente)
  -- Busca funil_etapas.tipo da nova etapa_id
  -- Valida que organization_id da etapa = organization_id da oportunidade
  -- tipo='won'  => status='won',  closed_at=now()
  -- tipo='lost' => status='lost', closed_at=now()
  -- tipo='open' => status='open', closed_at=null
CREATE TRIGGER trg_auto_oportunidade_status
  BEFORE INSERT OR UPDATE ON oportunidades
  FOR EACH ROW EXECUTE FUNCTION auto_oportunidade_status()
```

Nota: este trigger executa ANTES do `validate_oportunidade` existente, garantindo que o status ja esteja correto quando a validacao rodar.

### 1.3 Recalculo automatico de valor_total_estimado

```text
CREATE FUNCTION recalc_oportunidade_total() RETURNS trigger
  -- Determina o oportunidade_id afetado (NEW ou OLD conforme operacao)
  -- SELECT COALESCE(SUM(COALESCE(valor_total, quantidade * valor_unitario, 0)), 0)
  --   FROM oportunidade_itens WHERE oportunidade_id = ...
  -- UPDATE oportunidades SET valor_total_estimado = resultado

CREATE TRIGGER trg_recalc_total_insert
  AFTER INSERT ON oportunidade_itens
  FOR EACH ROW EXECUTE FUNCTION recalc_oportunidade_total()

CREATE TRIGGER trg_recalc_total_update
  AFTER UPDATE ON oportunidade_itens
  FOR EACH ROW EXECUTE FUNCTION recalc_oportunidade_total()

CREATE TRIGGER trg_recalc_total_delete
  AFTER DELETE ON oportunidade_itens
  FOR EACH ROW EXECUTE FUNCTION recalc_oportunidade_total()
```

---

## Fase 2 -- Ajustes nos Hooks (2 arquivos)

### 2.1 useOportunidades.ts -- `useMoveOportunidade`

**Antes (linhas 123-131):**
```typescript
const newStatus = etapa_tipo === "won" ? ... ;
const closedAt = ...;
.update({ etapa_id, status: newStatus, closed_at: closedAt })
```

**Depois:**
```typescript
// Apenas atualiza etapa_id; banco define status e closed_at via trigger
.update({ etapa_id })
```

- Remover parametro `etapa_tipo` da interface (nao mais necessario)
- O audit log continua registrando a acao, mas o `metadata.status` vira do `data` retornado (que ja reflete o trigger)

### 2.2 useOportunidadeItens.ts -- remover `recalcOportunidadeTotal`

- Deletar a funcao `recalcOportunidadeTotal` (linhas 23-31)
- Em `useCreateOportunidadeItem`: remover chamada `await recalcOportunidadeTotal(...)` (linha 56)
- Em `useUpdateOportunidadeItem`: remover chamada (linha 104)
- Em `useDeleteOportunidadeItem`: remover chamada (linha 124)
- Manter `valor_total` calculado no INSERT/UPDATE do item (quantidade * valor_unitario) pois e campo do proprio item
- As queries de invalidacao ja existentes garantem que o frontend recarrega o valor atualizado pelo trigger

---

## Fase 3 -- Verificacao de chamadas ao useMoveOportunidade

Verificar todos os locais que chamam `moveOportunidade.mutate(...)` e remover o parametro `etapa_tipo`:

- `OportunidadesKanbanPage.tsx` -- drag-and-drop handler
- `OportunidadeDetailPage.tsx` -- botoes de mover etapa (se existir)
- `MotivoPerda.tsx` -- ao marcar como perdido

Esses arquivos passarao a enviar apenas `{ id, etapa_id }`.

---

## Resumo de alteracoes

| Tipo | Arquivo/Objeto | Acao |
|---|---|---|
| Migration | Nova migration SQL | Criar 3 functions + 5 triggers |
| Hook | useOportunidades.ts | Simplificar useMoveOportunidade (remover logica status/closed_at) |
| Hook | useOportunidadeItens.ts | Remover funcao recalcOportunidadeTotal e suas chamadas |
| UI | OportunidadesKanbanPage.tsx | Remover parametro etapa_tipo do mutate |
| UI | MotivoPerda.tsx | Remover parametro etapa_tipo do mutate |
| UI | OportunidadeDetailPage.tsx | Remover parametro etapa_tipo do mutate (se aplicavel) |

### Resultado

- Banco valida `funil_etapas.tipo` e rejeita valores invalidos
- Banco automaticamente define `status` e `closed_at` ao mudar `etapa_id`
- Banco automaticamente recalcula `valor_total_estimado` ao alterar itens
- Frontend simplificado, sem regras duplicadas
- Audit log mantido sem duplicacao

