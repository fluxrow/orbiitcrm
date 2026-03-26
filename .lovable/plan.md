

# Remover conversas de email existentes

## Contexto
A campanha de email criou 137 registros em `orbit_conversas` (canal = 'email') e suas respectivas mensagens em `orbit_mensagens`. Isso já foi corrigido no código para não acontecer novamente, mas os dados antigos precisam ser limpos.

## Plano

### Migration SQL

Executar uma migration que:

1. **Deletar mensagens** vinculadas a conversas de email
2. **Deletar conversas** com canal = 'email'

```sql
-- Remover mensagens de conversas de email
DELETE FROM orbit_mensagens
WHERE conversa_id IN (
  SELECT id FROM orbit_conversas WHERE canal = 'email'
);

-- Remover conversas de email
DELETE FROM orbit_conversas WHERE canal = 'email';
```

| Ação | Detalhes |
|------|----------|
| Migration SQL | Deletar 137 conversas de email e suas mensagens |
| Registros afetados | ~137 conversas + ~137 mensagens |

Nenhuma alteração de código necessária - apenas limpeza de dados.

