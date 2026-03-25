

# Fix: Texto cortando nos cards de plano

## Problema

O `GlowCard` usa `overflow-hidden` para conter o overlay de gradiente. Porém, o badge "Mais popular" do plano Professional usa `-mt-9` (margem negativa) para flutuar acima do card — e é cortado pelo `overflow-hidden`.

## Solução

Mover o `overflow-hidden` do container principal do `GlowCard` para apenas o overlay interno (que realmente precisa dele), liberando o conteúdo para extrapolar os limites quando necessário.

### Arquivo: `src/components/landing/GlowCard.tsx`

- Remover `overflow-hidden` da `motion.div` externa
- Adicionar `overflow-hidden` na div do overlay interno (linha 26)

Isso permite que o badge `-mt-9` apareça fora dos limites do card sem ser cortado.

