
# Assinatura de Email Personalizada + Reply-To Dinâmico

## Status: ✅ Implementado

### O que foi feito

1. **Migration**: adicionados `signature_image_url` (text) e `use_personal_signature` (boolean) em `pe_users`
2. **UserProfileDialog**: seção "Assinatura de E-mail" com upload de imagem, preview, toggle
3. **send-orbit-campaign**: carrega dados do usuário criador, monta assinatura HTML, reply-to dinâmico, variáveis no assunto
4. **orbit-send-email**: aceita `sender_user_id`, anexa assinatura, reply-to dinâmico
5. **CampaignReviewDialog**: exibe responsável, reply-to e aviso sobre assinatura
6. **CampanhasPage**: validação pré-envio (nome e email obrigatórios para campanhas de email)
