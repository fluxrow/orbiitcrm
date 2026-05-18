## Diagnóstico

A planilha **foi importada com sucesso**, mas em um lugar diferente do que a campanha enxerga:

- Em **Lead Finder → Fontes → CSV**, o importador grava na tabela `orbit_leads` (universo de prospecção fria do Lead Finder, com enrichment, score, etc).
- O **Wizard de Campanhas** (`CampaignWizardContent.tsx`, passo 1) só oferece três origens fixas: **"Apenas Prospects"**, **"Apenas Prometheus"** e **"Ambos"** — todas lendo da tabela `orbit_prospects`. Não há opção para selecionar uma lista/fonte de `orbit_leads`.
- O envio (`send-orbit-campaign`) também trabalha em cima de `orbit_campaign_recipients` ligados a `orbit_prospects` (`select("*, prospect:orbit_prospects(*)")`), então mesmo se trocássemos só a UI, o envio não funcionaria.

Por isso a lista importada **nunca aparece** no seletor da campanha — não é bug de UI, é uma ponte que ainda não existe entre Lead Finder e Campanhas.

## Plano de correção (2 frentes — recomendo a 1)

### Opção 1 — Mais rápida e segura: importar o CSV direto em Prospects

Adicionar, na tela de **Prospects**, um botão **"Importar CSV"** que insere as linhas em `orbit_prospects` (universo já consumido por campanhas, conversas, funil etc).

1. Criar `useImportProspectsCSV` em `src/hooks/useOrbitProspects.ts`, reaproveitando parser, normalização de telefone e dedupe já consolidados em `useImportLeadsCSV`:
   - Mapeamento das colunas do arquivo enviado:
     `nome da empresa → nome_razao/nome_fantasia`, `cnpj → cnpj`,
     `e-mail → email_principal`, `telefone/whatsapp → telefone/whatsapp` (normalizados),
     `cidade/estado/segmento/origem/observações/tags → campos equivalentes`.
   - Dedupe por email + telefone normalizado dentro do arquivo e contra `orbit_prospects` da mesma `empresa_id`.
   - Modo merge opcional (preencher só campos vazios), igual ao feito recentemente para leads.
   - Inserção em lotes de 500 com retorno: novos, atualizados, ignorados, sem alterações.
2. Botão **"Importar CSV"** no header de `src/pages/orbit/ProspectsPage.tsx`, abrindo um diálogo com upload, preview das primeiras linhas e checkbox "Atualizar duplicados".
3. Cada importação grava 1 linha em `orbit_import_history` (já existe) com nome do arquivo, totais e erros.

Resultado: Tarcísio sobe a planilha **uma vez em Prospects** e a base aparece imediatamente no Wizard de Campanhas como "Apenas Prospects", com os filtros que ele já usa (cidade, segmento, tag, origem).

### Opção 2 — Mais ampla: ligar Lead Finder ao Wizard de Campanhas

Manter o CSV em `orbit_leads` e ensinar a campanha a consumir leads:

1. **DB**: adicionar coluna `lead_id uuid` em `orbit_campaign_recipients`.
2. **Wizard**: nova opção "Lista do Lead Finder" + `<Select>` populado por `orbit_lead_sources`/`orbit_lead_searches` da empresa, com contagem e filtro por `enrichment_status`.
3. **Edge `send-orbit-campaign`**: se o recipient tiver `lead_id` em vez de `prospect_id`, ler de `orbit_leads`; senão, manter o caminho atual.
4. **Analytics**: garantir compatibilidade em `CampaignAnalyticsSection.tsx`.

Mais poderoso, mas mexe em DB, edge function de envio e analytics — risco e tempo maiores.

## Recomendação

Ir de **Opção 1** agora (resolve hoje o caso do Tarcísio, sem tocar em DB/edge functions). A Opção 2 fica como evolução quando quiserem unificar Lead Finder + Campanhas oficialmente.
