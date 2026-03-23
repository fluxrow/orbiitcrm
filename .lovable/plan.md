

# Resetar Campanha e Apagar Mensagens

## Dados identificados
- **Campanha**: `df2e3e16-2b93-4863-bdb1-83ea54fe3955` — "Novo teste Campanha AUGUSTO e VAGNER 20.03.2026" (status: concluida)
- **2 destinatários**: Promotrip Corporate (5541987276129) e Promoclick (554196204249)
- **3 conversas** associadas aos telefones (26 mensagens total)

## Ações via migration

### 1. Resetar campanha
- Status → `aprovada_para_envio`
- Zerar contadores: `enviados`, `aberturas`, `cliques`, `respostas`

### 2. Resetar destinatários
- Status dos 2 recipients → `pendente`
- Limpar `enviado_em` e `erro`

### 3. Apagar mensagens
- Deletar as 26 mensagens das 3 conversas

### 4. Apagar conversas
- Deletar as 3 conversas dos 2 telefones

## Arquivo
- Migration SQL com os 4 comandos (UPDATE campaign, UPDATE recipients, DELETE mensagens, DELETE conversas)

