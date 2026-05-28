## Objetivo

No dialog de Analytics da campanha (`CampaignAnalyticsDialog`), adicionar dois caminhos para reaproveitar quem engajou — sem precisar baixar / re-importar lista:

1. **"Criar campanha de follow-up"** (workflow otimizado, recomendado).
2. **"Baixar CSV"** (saída de dados, caso queira usar fora do sistema).

A boa notícia: o `RecipientSelector` do wizard **já suporta** os filtros `apenas_abriu_campanha_id`, `nao_abriu_campanha_id`, e `engaj_comportamento` (abriu / clicou / engajou / não abriu). Então o follow-up vira só "abrir o wizard com o filtro certo pré-selecionado".

## Mudanças

### 1. `CampaignAnalyticsDialog.tsx`

No header do dialog, adicionar barra de ações com:

- **Select** "Público alvo do follow-up":
  - Abriu (`apenas_abriu_campanha_id`)
  - Clicou (`engaj_comportamento = clicou`, escopo nesta campanha)
  - Engajou — abriu E clicou (`engaj_comportamento = engajou`)
  - Não abriu (`nao_abriu_campanha_id`)
- **Botão primário** "Criar campanha de follow-up" → fecha o dialog e chama um callback `onCreateFollowUp(campaignId, audienceType)`.
- **Botão secundário** "Baixar CSV" → exporta a lista filtrada atual da tabela (respeita o filtro `engagementFilter` já existente). Colunas: nome, email, telefone, status engajamento, entregue_em, aberto_em, clicado_em. Gera CSV no client, faz download via `Blob` + `<a download>`.

### 2. `CampanhasPage.tsx`

- Adicionar handler `handleCreateFollowUp(sourceCampaignId, audience)` que navega para `/{slug}/orbit/campanhas/nova` (ou abre o `CampaignWizard`) passando via state:
  ```ts
  { 
    followUpFrom: sourceCampaignId, 
    followUpAudience: audience,  // "abriu" | "clicou" | "engajou" | "nao_abriu"
    sugestaoNome: `Follow-up: <nome da campanha original>`
  }
  ```
- Passar `onCreateFollowUp` para `CampaignAnalyticsDialog`.

### 3. `CampaignWizardContent.tsx` (ou onde o wizard inicializa filtros)

- Ler `location.state.followUpFrom` / `followUpAudience` no mount.
- Pré-preencher:
  - `nome` com a sugestão;
  - `filtros.apenas_abriu_campanha_id` quando `abriu`/`engajou`/`clicou`;
  - `filtros.engaj_comportamento = "clicou" | "engajou"` quando aplicável;
  - `filtros.nao_abriu_campanha_id` quando `nao_abriu`.
- Avançar visualmente para o step de destinatários, mostrando contagem pré-filtrada (lógica já existente).

### 4. CSV export — helper

Pequeno utilitário `src/lib/csv.ts` com `downloadCsv(filename, rows, columns)` (escape de aspas, separador `,`, BOM UTF-8 para Excel). Usado pelo botão "Baixar CSV".

## Não muda

- Sem migrations: tudo se apoia nas colunas `opened_at` / `clicked_at` / `engagement_status` em `orbit_campaign_recipients` e nos filtros já existentes.
- Sem mudança no `send-orbit-campaign`; só no fluxo de criação.
- Sem alteração no Supabase / RLS.

## Resultado

Em 2 cliques a partir do Analytics da campanha "Inicial Clientes PR" o usuário cria outra campanha já direcionada a quem abriu/clicou, sem export + re-import. Quem ainda preferir CSV tem o botão de download.
