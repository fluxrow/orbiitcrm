

# Corrigir página em branco - erro de resolução do `date-fns`

## Diagnóstico
A página está em branco porque o Vite não consegue resolver o pacote `date-fns`. O erro nos logs é:
> "Failed to resolve entry for package `date-fns`. The package may have incorrect main/module/exports specified in its package.json."

Isso está quebrando **todos** os módulos que importam `date-fns`, causando erros 500 em cascata em múltiplas páginas.

## Causa provável
A edição anterior no `package.json` (ao corrigir a importação de prospects) pode ter corrompido o `package-lock.json` ou a instalação do pacote.

## Correção
1. **Reinstalar o pacote `date-fns`** - Remover e re-adicionar a dependência no `package.json` para forçar uma reinstalação limpa, mantendo a versão `^4.1.0` que já existia antes.

