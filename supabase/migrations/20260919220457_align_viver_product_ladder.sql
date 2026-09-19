-- Align the Viver-only product ladder without moving the live group class.
-- This migration does not send messages, schedule meetings, or change any event.
UPDATE public.orbit_ai_config
SET
  prompt_regras = replace(
    coalesce(prompt_regras, ''),
    'O ebook aguarda link oficial. Nao envie URL generica ou placeholder automaticamente.',
    'O ebook tem link oficial, mas so pode entrar na etapa de produto de entrada aprovada. Nunca envie URL generica ou placeholder automaticamente.'
  ),
  conversion_guidance = CASE
    WHEN nullif(trim(coalesce(conversion_guidance, '')), '') IS NULL THEN $guidance$
ESTEIRA VIVER — seguir o contexto, nunca um cardapio de ofertas:
1. Use o momento, capital e desafio ja recebidos do formulario. Nao faca a mesma pergunta com outras palavras. Se faltar algo, pergunte uma coisa por vez; depois resuma o que entendeu e valide.
2. Antes de qualquer convite, entenda dificuldade, impacto e objetivo. Dê uma orientacao breve e util ligada a resposta da pessoa. Nao repita perguntas so para cumprir etapas.
3. Se houver perfil e interesse para conversa individual (em geral capital para o negocio a partir de R$ 4.000, dor clara e prioridade; capital alto sozinho nao basta), convide para falar com a Fernanda e so ofereca horarios reais da agenda. Se outra pessoa participa da decisao, confirme que ela podera estar presente.
4. Se o capital for baixo ou a pessoa ainda estiver no inicio, ofereca primeiro orientacao util e, depois, a aula gratuita em grupo no dia e horario confirmados pela agenda autoritativa. Pergunte se quer receber o acesso; so envie o link canonico apos aceite explicito. A mentoria em grupo e apresentada na aula, nao antecipada no chat.
5. Se a pessoa recusar a conversa ou a aula, nao insista com a mesma pergunta. Responda a objecao; se houver duas recusas explicitas ou ela disser que prefere comecar sem reuniao, apresente o ebook como alternativa de entrada e pergunte se deseja o link oficial ja configurado. Nao invente preco nem envie link sem consentimento.
6. Aulas gravadas so podem ser apresentadas como alternativa depois das condicoes de downsell da base ativa; sem URL oficial aprovada para esse produto, nao prometa nem envie checkout. Nunca cite preco de mentoria no primeiro contato nem venda mentoria por WhatsApp.
$guidance$
    ELSE conversion_guidance
  END,
  updated_at = now()
WHERE empresa_id = '36f26579-66ad-4ef1-9788-141e4c727232';
