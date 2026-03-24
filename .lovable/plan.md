

# Assinatura de Email Personalizada + Reply-To Dinâmico

## Resumo
Implementar assinatura de email personalizada por usuario, upload de imagem de assinatura, reply-to dinamico com email do usuario, e integracao automatica no envio de campanhas.

---

## Etapa 1 — Migration: novos campos em pe_users

Adicionar colunas na tabela `pe_users`:

```sql
ALTER TABLE pe_users
  ADD COLUMN IF NOT EXISTS signature_image_url text,
  ADD COLUMN IF NOT EXISTS use_personal_signature boolean DEFAULT false;
```

Nota: `full_name`, `phone`, `cargo` (job_title), `email`, `email_signature` ja existem. O campo `cargo` serve como job_title. O campo `email_signature` existente sera mantido como signature_html.

---

## Etapa 2 — Storage: bucket para imagens de assinatura

Ja existe o bucket `orbit-media` (publico). Usaremos o path `signatures/{user_id}/` dentro dele para armazenar as imagens de assinatura. Nao precisa criar bucket novo.

---

## Etapa 3 — UserProfileDialog: reformular UI

Arquivo: `src/components/orbit/UserProfileDialog.tsx`

Reformular o dialog para incluir secao "Assinatura de Email":
- Campos existentes: nome, telefone, whatsapp, cargo
- **Nova secao** com separador visual:
  - Toggle "Usar assinatura personalizada"
  - Upload de imagem (aceitar png/jpg/jpeg/webp, max 2MB)
  - Hint: "Recomendado: largura entre 350-500px"
  - Preview da imagem carregada
  - Preview completa da assinatura (nome, cargo, telefone, email, imagem)
- Upload faz `supabase.storage.from('orbit-media').upload(...)` e salva URL publica em `signature_image_url`
- Carregar e salvar os novos campos `signature_image_url` e `use_personal_signature`

---

## Etapa 4 — send-orbit-campaign: assinatura + reply-to

Arquivo: `supabase/functions/send-orbit-campaign/index.ts`

No bloco de envio de email (linhas ~303-337):

1. **Carregar dados do usuario** que criou a campanha (`campaign.created_by`):
   ```
   SELECT full_name, cargo, phone, email, signature_image_url, email_signature, use_personal_signature
   FROM pe_users WHERE id = campaign.created_by
   ```

2. **Montar bloco de assinatura HTML** se `use_personal_signature = true`:
   - Nome em negrito
   - Cargo (se existir)
   - Telefone (se existir)
   - Email
   - Imagem (se `signature_image_url` existir): `<img src="URL" width="400" alt="nome">`
   - HTML simples, compativel com clientes de email (tabelas, inline styles)

3. **Anexar assinatura ao emailHtml** antes do envio

4. **Reply-To dinamico**: usar email do usuario (`senderUser.email`) como reply-to, com fallback para `resendConfig.reply_to_email`

5. **Substituir variaveis no assunto** usando o mesmo mapa `variaveis`

6. **Validacao**: se `use_personal_signature` ativo mas sem email valido, logar warning e usar fallback

---

## Etapa 5 — orbit-send-email (envio avulso): mesma logica

Arquivo: `supabase/functions/orbit-send-email/index.ts`

Aceitar campo opcional `sender_user_id` no body. Se fornecido:
- Carregar dados do usuario
- Anexar assinatura ao HTML
- Usar email do usuario como reply-to

---

## Etapa 6 — Log de envio enriquecido

No `orbit_mensagens` insert (linha ~518-526 do send-orbit-campaign), adicionar metadata no campo existente ou nos campos disponiveis:
- `sender_user_id` via campo ja existente ou metadata JSON
- Nao requer migration adicional pois o registro ja tem `campaign_id` e `empresa_id`

---

## Etapa 7 — CampaignReviewDialog: info de assinatura

Arquivo: `src/components/orbit/CampaignReviewDialog.tsx`

Para campanhas de email, exibir:
- Nome e email do usuario responsavel
- Aviso: "As respostas serao enviadas para [email do usuario]"
- Preview resumida da assinatura

---

## Etapa 8 — Validacao pre-envio no frontend

Arquivo: `src/pages/orbit/CampanhasPage.tsx`

No `handleSend`, antes de invocar a function:
- Carregar dados do usuario logado de `pe_users`
- Se campanha de email e `use_personal_signature` ativo sem email: bloquear envio com toast de erro
- Mensagem: "Configure um email valido no perfil para utilizar reply-to personalizado."

---

## Arquivos modificados

| Arquivo | Alteracao |
|---------|-----------|
| Migration SQL | Adicionar `signature_image_url`, `use_personal_signature` em pe_users |
| `src/components/orbit/UserProfileDialog.tsx` | Reformular com secao assinatura, upload, preview |
| `supabase/functions/send-orbit-campaign/index.ts` | Carregar usuario, montar assinatura HTML, reply-to dinamico |
| `supabase/functions/orbit-send-email/index.ts` | Aceitar sender_user_id, assinatura, reply-to |
| `src/components/orbit/CampaignReviewDialog.tsx` | Info de assinatura e reply-to |
| `src/pages/orbit/CampanhasPage.tsx` | Validacao pre-envio |

---

## Detalhes tecnicos

### HTML da assinatura (compativel com email clients)
```html
<table style="border-top:1px solid #e5e5e5;margin-top:24px;padding-top:16px;font-family:Arial,sans-serif">
  <tr><td style="font-weight:bold;font-size:14px">Nome</td></tr>
  <tr><td style="color:#666;font-size:13px">Cargo</td></tr>
  <tr><td style="color:#666;font-size:13px">Telefone</td></tr>
  <tr><td style="color:#666;font-size:13px">email</td></tr>
  <tr><td style="padding-top:8px"><img src="URL" width="400" alt="Nome" style="max-width:100%"/></td></tr>
</table>
```

### Fallbacks
- Sem assinatura ativa: nenhum bloco anexado
- Sem imagem: bloco textual apenas
- Sem cargo/telefone: linha omitida
- Sem email do usuario: usar reply-to do resendConfig

