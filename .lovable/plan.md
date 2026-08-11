# Auditoria — Onboarding de materiais (Bullink) e envio de mídia WhatsApp

Somente leitura: nada foi alterado no código nem no banco.

## 1. Como o pipeline funciona hoje

| Camada | Arquivo/função | O que faz |
|---|---|---|
| Upload público (wizard) | `src/pages/public/ClientOnboardingPage.tsx` → `AssetListInput.handleUpload` (l.414-453) | preview local, `upload_status: "uploading"`, chama helper |
| Helper cliente | `src/lib/orbit-onboarding-upload.ts` | lê o arquivo inteiro em base64 e envia JSON para a edge function |
| Edge function | `supabase/functions/orbit-onboarding-asset-upload/index.ts` | valida token público, limite 20MB, MIME por prefixo, sobe em `orbit-media` (privado), insere `orbit_onboarding_assets`, devolve signed URL de 1h (preview) |
| Processamento | `supabase/functions/orbit-onboarding-process-assets/index.ts` | JWT + membership; baixa só arquivos **texto-like**, chama Lovable AI (`google/gemini-2.5-flash`), grava `orbit_onboarding_asset_insights` (upsert por `asset_id`) e `orbit_onboarding_implementation_drafts` |
| Mídia privada | `src/lib/orbit-media.ts`, `supabase/functions/_shared/orbit-media.ts` | assina URLs sob demanda (nunca persiste signed URL) |
| Conhecimento/RAG | `supabase/functions/orbit-knowledge-ingest/index.ts` | chunk 1200/150, embeddings `google/gemini-embedding-001`, grava `orbit_ai_knowledge` (status pending → processado); busca no `orbit-ai-agent` (l.587-620) |

## 2. Estado real da Bullink (`4f6b4a18…`), onboarding `4fa8ffc5…`

- Onboarding `status = concluido`, `archived = false`, atualizado 2026-07-30 22:19.
- 10 linhas em `orbit_onboarding_assets` (8 PNG, `audio1.MP3`, `GARANTIA.ogg`) — todas com `storage_path` e `size_bytes` válidos: **o upload em si não falhou**.
- 10 linhas em `orbit_onboarding_asset_insights`, todas com `error = NULL`, mas `model = manual_review_2026-08-10` / `faster-whisper-base` → foram **curadas manualmente**, não geradas pela função. Draft consolidado também é `manual_curated_review_2026-08-10`.
- `review_status`: 8 `approved`, 1 `ignored` (`GARANTIA.ogg`), **1 `pending`** → asset `a8fbb253…` (`Captura_de_tela_2026-07-30_191029.png`). O próprio summary registra: *"a referência do formulário permaneceu com status uploading e não foi exibida para revisão"*.
- Em `responses.midias.materiais_operacao` há dois itens quebrados:
  - `035be582…` — `upload_status: "uploading"`, **sem** `asset_id` nem `storage_path`, filename `Captura de tela 2026-07-30 191029.png` (é justamente o asset `a8fbb253…`, órfão do formulário);
  - `3101c0e0…` — item vazio (sem arquivo, sem título);
  - além disso `GARANTIA.ogg` está classificado como `tipo: "Imagem"` (rótulo errado do cliente).
- `orbit_ai_knowledge` da Bullink: **0 linhas** (nenhum material virou conhecimento/embedding).
- Z-API Bullink: `ativo = false`, `envio_real_liberado = false`, sem linha em `orbit_whatsapp_sending_config` (adapter desligado) e `orbit_audio_library` vazia.

## 3. Causa raiz

**Causa raiz principal (o asset pending):** stale closure no `AssetListInput`. `update()` (l.402-405) recalcula a lista a partir do `items` capturado no render, e `handleUpload` chama `update()` **depois do `await`**. Com uploads em sequência rápida (assets gravados 22:16:23 → 22:16:27 → 22:16:30), o patch de um upload posterior é aplicado sobre um snapshot antigo do array e **sobrescreve o resultado do upload anterior**, deixando o item em `uploading` sem `asset_id`/`storage_path`. O arquivo está no Storage e na tabela — só a referência no `responses` foi perdida. Não houve erro de payload, MIME, tamanho, timeout ou signed URL.

**Causas secundárias / riscos reais de falha de upload:**
- base64 no cliente + JSON na função: um arquivo de 20MB vira ~27MB de corpo → risco de estouro de memória/limite antes de qualquer validação (`orbit-onboarding-upload.ts` + `base64ToBytes`).
- `upsert: false` no Storage: retry do mesmo arquivo gera novo `asset_id`, sem idempotência por (onboarding, item_id, filename).
- Sem reconciliação: nada compara `orbit_onboarding_assets` com `responses` para achar assets órfãos.
- `orbit-onboarding-process-assets` é **síncrono** e sequencial (até 12 assets, 1 chamada de IA cada + draft) — risco de timeout; e por design **não processa imagem/áudio/vídeo** (l.238-245: "sem transcrição"), o que explica insights vazios até a curadoria manual.
- Não existe coluna de status/tentativas em `orbit_onboarding_asset_insights` (só `error`), então "pending" na UI é `review_status`, não estado de processamento.

## 4. Envio de mídia via Z-API (já existente)

`send-image`, `send-audio`, `send-document`, `send-video`, `send-text` estão implementados em:
- `orbit-whatsapp-outbox-tick` → `sendViaZapi` (l.127-161), corpo `{phone, image|audio|document|video, caption/fileName}`, mídia assinada por `signOrbitMediaUrl(…, 3600)`;
- `orbit-send-message` (l.251-292), mesmo mapeamento;
- `orbit-flow-executor` (l.429) mapeia tipo → endpoint.

Ponto de atenção: TTL da signed URL é 1h — se a Z-API buscar a mídia depois disso (retry/fila longa), o download falha.

## 5. Onde `envio_real_liberado` / `dry_run` é aplicado

`_shared/orbit-zapi.ts` → `getOrbitZapiRealSendBlockReason()` (fail-closed: só libera com `envio_real_liberado === true`), consumido por `orbit-whatsapp-outbox-tick`, `orbit-send-message`, `orbit-flow-executor`, `orbit-ai-agent`, `send-orbit-campaign`, `send-vendedor-notification`, `request-campaign-approval`, `orbit-zapi-go-live-smoke`. `dry_run` é aplicado no executor de fluxos e exige adapter habilitado. **Bullink está bloqueada em todos os caminhos.**

## 6. Plano mínimo, isolado na Bullink (a executar só após aprovação)

1. **Reconciliação de dados (só onboarding `4fa8ffc5…`)**: religar o item `035be582…` ao asset `a8fbb253…` (preencher `asset_id`, `storage_path`, `mime`, `size_bytes`, `upload_status: "uploaded"`), remover o item vazio `3101c0e0…` e corrigir `tipo` de `GARANTIA.ogg` para "Áudio". Backup do `responses` antes, um único UPDATE com `WHERE id = 4fa8ffc5…`.
2. **Fechar o pending**: reprocessar/revisar o asset `a8fbb253…` e definir `review_status` explícito (approved/ignored) conforme conteúdo.
3. **Correção de código (global, sem toque em dados de outros tenants)**: usar updater funcional/ref em `AssetListInput` para eliminar o stale closure, e bloquear "Salvar/Enviar" enquanto houver item em `uploading`.
4. **Reconciliador de assets órfãos** (leitura + patch sob demanda): view/consulta que lista assets sem referência no `responses` do mesmo onboarding, exposta na tela de revisão de materiais.
5. **Não mexer em Z-API**: manter `ativo=false` e `envio_real_liberado=false`; nada de knowledge/embeddings automáticos nesta etapa — ingestão de material aprovado em `orbit_ai_knowledge` fica como passo separado, com aprovação explícita.

Itens 1 e 2 alteram apenas linhas da Bullink; item 3 é frontend puro; item 4 é aditivo.
