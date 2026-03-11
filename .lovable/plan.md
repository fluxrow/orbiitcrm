

# Suporte a Áudios e Imagens no módulo Conversas

## Situação atual

- A tabela `orbit_mensagens` **já possui** as colunas `tipo_midia` e `url_midia`
- O webhook do Meta **já salva** mídia recebida com esses campos
- O webhook Z-API (`orbit-webhook`) **ignora** mídia — salva apenas texto
- A edge function `orbit-send-message` **só envia texto** via Z-API
- O frontend **não exibe** imagens/áudios nem permite envio de mídia

## Plano

### 1. Banco de dados — Storage bucket

Criar bucket `orbit-media` para armazenar arquivos enviados pelo operador (imagens e áudios gravados no navegador).

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('orbit-media', 'orbit-media', true);
-- RLS para authenticated users fazerem upload
CREATE POLICY "Authenticated can upload orbit media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'orbit-media');
CREATE POLICY "Public can read orbit media"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'orbit-media');
```

### 2. Webhook Z-API — Capturar mídia recebida

No `orbit-webhook/index.ts`, ao processar mensagem recebida, extrair campos de mídia do payload Z-API:

- `payload.image?.imageUrl` → `tipo_midia = "image"`, `url_midia = imageUrl`
- `payload.audio?.audioUrl` → `tipo_midia = "audio"`, `url_midia = audioUrl`
- `payload.video?.videoUrl` → `tipo_midia = "video"`, `url_midia = videoUrl`
- `payload.document?.documentUrl` → `tipo_midia = "document"`, `url_midia = documentUrl`

Salvar `tipo_midia` e `url_midia` no INSERT de `orbit_mensagens`. Usar `caption` como texto quando disponível.

### 3. Edge function `orbit-send-message` — Enviar mídia

Aceitar novos campos opcionais: `tipo_midia`, `url_midia`.

Quando `tipo_midia` estiver presente, usar endpoints Z-API específicos:
- `image` → `send-image` com `{ phone, image: url_midia, caption: mensagem }`
- `audio` → `send-audio` com `{ phone, audio: url_midia }`
- `document` → `send-document` com `{ phone, document: url_midia, fileName: ... }`

Salvar `tipo_midia` e `url_midia` no registro de `orbit_mensagens`.

### 4. Frontend — Exibir mídia nas mensagens

No `ConversasPage.tsx`, no render de cada mensagem, verificar `tipo_midia`:

- `"image"` → renderizar `<img>` com `url_midia`, clicável para ampliar
- `"audio"` → renderizar `<audio controls>` nativo do navegador
- `"video"` → renderizar `<video controls>`
- `"document"` → link de download
- `null`/`"text"` → texto como hoje

### 5. Frontend — Upload e gravação de mídia

Adicionar ao input da conversa:
- **Botão de anexar** (ícone clip): abre file picker para imagem/documento. Faz upload para bucket `orbit-media`, obtém URL pública, chama `sendMessage` com `tipo_midia` e `url_midia`.
- **Botão de gravar áudio** (ícone microfone): usa `MediaRecorder` API do navegador. Ao parar, faz upload do blob para `orbit-media`, envia com `tipo_midia = "audio"`.

### 6. Hook `useSendMensagem` — Aceitar mídia

Atualizar a mutation para aceitar `tipo_midia` e `url_midia` opcionais e passá-los ao `orbit-send-message`.

## Arquivos alterados

| Arquivo | Ação |
|---|---|
| Nova migration SQL | Criar bucket `orbit-media` + policies |
| `supabase/functions/orbit-webhook/index.ts` | Capturar tipo_midia/url_midia de payloads Z-API |
| `supabase/functions/orbit-send-message/index.ts` | Aceitar e enviar mídia via Z-API endpoints específicos |
| `src/hooks/useOrbitMensagens.ts` | Aceitar tipo_midia/url_midia no mutation |
| `src/pages/orbit/ConversasPage.tsx` | Exibir mídia + botões de upload/gravação áudio |

