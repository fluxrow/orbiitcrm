
# Etapa 3G -- Interacoes Timeline (UI)

Transformar a `InteracoesTab` de uma lista de cards simples para uma timeline cronologica visual, com linha vertical conectando os eventos e melhor destaque para follow-ups.

---

## Abordagem

O componente atual ja exibe cards com icone, tipo, data, usuario, resumo e follow-up. A evolucao e puramente visual:

1. Substituir o layout `space-y-3` por uma timeline vertical (linha + dots)
2. Melhorar a formatacao de data/hora (incluir horario)
3. Destacar follow-up com cor/borda quando presente
4. Adicionar toggle Timeline/Lista para alternar entre as visoes

Nenhuma alteracao de banco ou hook necessaria. Os dados ja vem ordenados por `data_interacao desc` no `useInteracoes`.

---

## Mudancas no Componente

### Arquivo: `src/components/pe-admin/InteracoesTab.tsx`

**Toggle de visao**
- Estado `viewMode`: `"timeline"` (default) | `"list"`
- Dois botoes icone no header (ao lado do botao "Nova Interacao")

**Layout Timeline**
- Container com `relative` para a linha vertical
- Linha vertical absoluta (`border-l-2 border-muted`) do lado esquerdo
- Cada interacao: dot colorido por tipo + conteudo ao lado

```text
  |
  o--- [call] 20/02 14:30 - por Joao
  |    Conversamos sobre o pacote para Europa...
  |    >> Follow-up: 25/02 - Enviar orcamento
  |
  o--- [email] 18/02 09:15 - por Maria
  |    Enviado orcamento v2...
  |
```

- Dot: `div` circular 10px com cor por tipo (Phone=blue, Email=green, WhatsApp=emerald, Meeting=purple, Note=gray)
- Follow-up: bloco com `bg-amber-50 border-l-2 border-amber-400 p-2` para destaque visual
- Data formatada: `dd/MM HH:mm` usando `toLocaleString("pt-BR")`

**Layout Lista (fallback)**
- Manter o layout atual de cards como alternativa

---

## Cores por tipo

| Tipo | Cor do dot | Label |
|---|---|---|
| call | `bg-blue-500` | Ligacao |
| email | `bg-green-500` | E-mail |
| whatsapp | `bg-emerald-500` | WhatsApp |
| meeting | `bg-purple-500` | Reuniao |
| note | `bg-gray-400` | Nota |

---

## Resumo

| Arquivo | Acao |
|---|---|
| `src/components/pe-admin/InteracoesTab.tsx` | **Editar** -- adicionar timeline layout + toggle de visao |

Nenhum arquivo novo, nenhuma alteracao de banco.
