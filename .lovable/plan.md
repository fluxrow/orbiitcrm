

# Fix: Assinatura não aparece no email de teste

## Problema
Na linha 327 de `CampaignWizard.tsx`, a chamada ao `orbit-send-email` não envia `sender_user_id`. Sem esse campo, a edge function não carrega os dados do usuário e não anexa a assinatura.

## Solução
Adicionar `sender_user_id: user.id` ao body da chamada na linha 327:

```typescript
body: { to: testEmail, subject, html, empresa_id: profile?.empresa_id, sender_user_id: user.id },
```

## Arquivo modificado
- `src/components/orbit/CampaignWizard.tsx` — 1 linha (adicionar `sender_user_id`)

