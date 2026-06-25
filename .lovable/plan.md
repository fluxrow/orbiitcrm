# Plano Revisado — Refatoração do Agente IA (High-Ticket + RAG) antes da Etapa 3

**Status E2.7:** A (schema) ✅ · B (UI divididas + Base de Conhecimento) ✅ · C1 (edge `orbit-knowledge-ingest` com background job) ✅ · C2 (refator `orbit-ai-agent` 3-block + RAG + merge `dados_adicionais`) ⏳ · D (E2E ai-config-refactor) ⏳.



---

## E2.7.A — Schema: campos dinâmicos, prompt em 3 blocos, RAG (pgvector)

Migration única, aprovada antes do front:

1. `**orbit_ai_config` — novas colunas (sem remover as antigas, para compat):**
  - `prompt_identidade text` — quem é a IA, tom de voz, persona.
  - `prompt_roteiro text` — passo a passo de qualificação (mover lead no funil).
  - `prompt_regras text` — afirmações absolutas / regras invioláveis (bullets).
  - `campos_qualificacao jsonb default '[]'` — array de `{ key, label, pergunta, tipo: 'text'|'number'|'select'|'boolean', required, opcoes?: string[] }`. Substitui o checkbox fixo.
  - `knowledge_base_enabled boolean default false`.
  - Deprecar (manter por compat, sem ler no backend novo): `prompt_treinamento`, `campos_cadastro`, `prompt_orcamentos`. Migração de dados: copiar `prompt_treinamento` para `prompt_identidade` quando os novos campos vierem nulos.
2. `**orbit_prospects.dados_adicionais jsonb**` já existe (validado na 2.5) — destino das respostas dinâmicas. Sem mudança de schema.
3. **Extensão `vector` (pgvector):** `create extension if not exists vector` em schema próprio (`extensions`) — padrão Supabase.
4. **Nova tabela `orbit_ai_knowledge`:**
  ```text
   id uuid PK, empresa_id uuid FK orbit_empresas ON DELETE CASCADE,
   tipo text CHECK ('documento','url','texto'),
   titulo text,
   source_url text,            -- para 'url'
   storage_path text,          -- para 'documento' (bucket orbit-knowledge-base)
   conteudo_texto text,        -- texto extraído (chunk)
   chunk_index int default 0,  -- múltiplos chunks por fonte
   source_id uuid,             -- agrupa chunks da mesma origem
   embedding vector(3072),     -- google/gemini-embedding-001 default (ver nota)
   model_version text default 'google/gemini-embedding-001',
   ativo boolean default true,
   status text default 'pending'  -- pending|processing|ready|error
   erro text,
   created_at/updated_at timestamptz
  ```
  - **GRANTs obrigatórios** (regra do projeto): `select,insert,update,delete` para `authenticated`, `all` para `service_role`. Sem `anon`.
  - **RLS:** policies por `empresa_id` usando `user_has_empresa_access(empresa_id)` (padrão do projeto) + bypass `super_admin`.
  - Índice HNSW: `using hnsw (embedding vector_cosine_ops)`.
  - Trigger `update_updated_at_column`.
  - **Nota dimensão:** o gateway Lovable AI suporta `google/gemini-embedding-001` (3072 dims, default do projeto). A pedido original cita `vector(1536)` — usamos **3072** para alinhar com o default do gateway. Se o usuário preferir 1536 para economia, trocamos por `openai/text-embedding-3-small` + `vector(1536)`.
5. **Função RPC `match_orbit_knowledge(p_empresa_id, query_embedding, match_count)**` (SECURITY DEFINER, isola por empresa) retornando os top-N chunks por cosine distance — para o agente consumir via RAG.
6. **Storage bucket `orbit-knowledge-base**` (privado) via `storage_create_bucket`, com policies em `storage.objects` restritas a `empresa_id` (path prefix `${empresa_id}/...`).

---

## E2.7.B — UI: Configuração do Agente IA (refatorada)

Em `src/pages/orbit/ConfigPage.tsx`, substituir os blocos "Configuração de IA" e "Automação de Conversas" por **3 cards focados**, sem mudar paleta/tema (amarelo + glass mantidos):

1. **Card "Identidade & Tom"** — `prompt_identidade` (textarea), Tom, Idioma, Max Tokens, Tempo de Espera, IA Ativa.
2. **Card "Roteiro de Qualificação"** — `prompt_roteiro` (textarea grande) + sub-bloco **"Perguntas de Qualificação"** (novo componente `<QualificationFieldsBuilder>`):
  - Lista editável de `{ label, pergunta, tipo, required }`.
  - Add/remove/reorder (dnd-kit já é leve; ou setas up/down se evitarmos nova dep).
  - Preview da chave (`key` slugificada) que vai pro `dados_adicionais` do prospect.
3. **Card "Regras Invioláveis"** — `prompt_regras` (textarea), com helper "uma regra por linha; serão injetadas ao final do prompt para maior peso".
4. **Card "Base de Conhecimento (RAG)"** — novo componente `<KnowledgeBaseManager>`:
  - Toggle `knowledge_base_enabled`.
  - Upload de `.pdf/.txt/.docx` (drag&drop) → bucket + linha `pending` em `orbit_ai_knowledge`.
  - Campo URL → adiciona linha `tipo='url' status='pending'`.
  - Lista de fontes com status (pending/processing/ready/error), toggle `ativo`, excluir.
5. Manter o card "Horário de Atendimento" como está.

Hook novo: `useOrbitAIKnowledge(empresaId)` (list/insert/delete/toggle).

---

## E2.7.C — Backend: ingestão + RAG no agente

1. **Edge function `orbit-knowledge-ingest**` (nova):
  - Trigger: chamada após upload/URL submit (e botão "Reprocessar").
  - Para `documento`: baixa do Storage → extrai texto (`pdf-parse` via `npm:` em Deno para PDF; texto puro para `.txt`; `mammoth` para `.docx`).
  - Para `url`: fetch + extração leve (cheerio/regex de `<p>`, sem JS render).
  - Chunking 500–1500 chars com overlap ~150.
  - Embeddings via **Lovable AI Gateway** (`google/gemini-embedding-001`) — sem chave nova.
  - Upsert nos chunks com `source_id` para permitir reprocessar.
  - Atualiza `status` final na linha "mãe".
2. `**orbit-ai-agent` / `orbit-ai-suggest` (refator):**
  - Builder de System Prompt concatenando: `prompt_identidade` → `prompt_roteiro` → contexto do prospect → bloco RAG (top-3 chunks de `match_orbit_knowledge`) → `**prompt_regras` por último** (engenharia: maior peso nas instruções finais).
  - Instrução explícita para perguntar `campos_qualificacao` ainda não preenchidos e devolver JSON com `{ resposta, dados_coletados: { key: value, ... } }`.
  - Persistir `dados_coletados` em `orbit_prospects.dados_adicionais` (merge JSONB), sem sobrescrever chaves existentes.
3. **Compat:** se `prompt_identidade` for nulo, cair para `prompt_treinamento` (rollback safety).

---

## E2.7.D — Testes E2E (Playwright, opt-in)

Novo spec `tests/e2e/ai-config-refactor.spec.ts`:

1. Salvar 3 prompts + 2 perguntas de qualificação → reload → valores persistem em `orbit_ai_config`.
2. Upload de `.txt` pequeno → ver linha `ready` em `orbit_ai_knowledge` com `embedding` não nulo.
3. Simular mensagem inbound → agent responde citando trecho do .txt (assert no histórico) e grava chave esperada em `dados_adicionais`.

Cleanup completo (knowledge + storage + prospect mock).

---

## Ordem de execução

```text
1. E2.7.A  Migration: colunas ai_config + pgvector + orbit_ai_knowledge + RPC + bucket   [aprovação]
2. E2.7.C1 Edge function orbit-knowledge-ingest (ingestão + embeddings)
3. E2.7.B  Refator ConfigPage em 4 cards + QualificationFieldsBuilder + KnowledgeBaseManager
4. E2.7.C2 Refator orbit-ai-agent (3-block prompt + RAG + merge dados_adicionais)
5. E2.7.D  Spec Playwright ai-config-refactor + run
6. .lovable/plan.md atualizado, fechando E2.7
7. →       Liberar Etapa 3 F1 (Webhook Receiver)
```

## Detalhes técnicos

- **Embeddings:** `google/gemini-embedding-001` (3072 dims) via Lovable AI Gateway — sem custo de chave extra. Se preferir 1536, troco por `openai/text-embedding-3-small` + `vector(1536)`.
- **Bucket privado** `orbit-knowledge-base` com path `{empresa_id}/{source_id}/{filename}`.
- **RAG no agente:** top-3 chunks com `similarity > 0.7`; se nenhum bate, omite o bloco "Contexto extra".
- **Ordem do prompt (peso da última instrução):** Identidade → Roteiro → Contexto Prospect → Contexto RAG → **Regras Invioláveis (final)**.
- **JSONB merge:** `dados_adicionais = dados_adicionais || jsonb_build_object(...)` para não perder chaves.

## Fora deste plano

- Reindexação automática agendada (cron) — fica pra depois; por ora reprocessamento é manual via botão.
- UI de "testar resposta da IA" com chat sandbox — entra na Etapa 3+.
- Etapa 3 (Webhook, CSV, Anti No-Show, Observabilidade) — começa só depois que E2.7 estiver verde.

## Perguntas rápidas antes de codar

1. Confirma **embedding 3072** (Gemini, default do projeto) ou prefere **1536** (OpenAI small, mais barato)? confirmo mas quero poder usar outras apis se necessario. como claude e open ai. é possivel ? 
2. PDF parsing em Deno: posso usar `npm:pdf-parse` no edge function, ou prefere fila em job externo?  
  
lano E2.7 aprovado! Bem pensado. Vamos fazer um ajuste de rota rápido sobre as suas duas dúvidas finais para não quebrar o padrão do projeto "em cima do laço":  
1. Sobre Embeddings e Multi-LLMs (Claude/OpenAI):  
Vamos manter o padrão atual do projeto! Pode seguir com vector(3072) e google/gemini-embedding-001 via Lovable AI Gateway para a vetorização. O importante é que a arquitetura do *Agente de Conversação* (o LLM que efetivamente gera a resposta para o lead) seja modular. No futuro próximo, o usuário vai poder plugar sua própria API Key da Anthropic (Claude) ou OpenAI para ditar as respostas, consumindo os textos resgatados pelos embeddings do Gemini.  
2. Sobre o PDF Parsing (Deno vs. Fila Externa):  
Não faça o parsing de PDF diretamente na Edge Function síncrona. Nosso foco é otimizar o tempo de execução e garantir a estabilidade em processos simultâneos. Edge Functions têm limites curtos de memória e timeout; se um cliente subir um e-book longo, a função vai quebrar (OOM ou Timeout). Utilize uma abordagem de fila/background job (pode ser inserindo o status `processing` e usando um worker externo ou um trigger desacoplado que não prenda a requisição HTTP do usuário) para extrair o texto e gerar os embeddings com segurança.  
Com essas definições, o plano está 100% validado. Pode iniciar a E2.7.A e seguir a ordem de execução!