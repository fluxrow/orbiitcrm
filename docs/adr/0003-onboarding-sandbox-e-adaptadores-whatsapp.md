# ADR 0003 — Onboarding operacional, sandbox e adaptadores de WhatsApp

- **Data:** 2026-08-24
- **Status:** Aceito para sandbox; Meta permanece proposto e desligado
- **Escopo inicial:** Comunica (`comunica`), sem envio real

## Contexto

O onboarding de um cliente pode estar preenchido e marcado como `concluido` sem que a implantação operacional esteja pronta. A Comunica exemplifica esse estado: o treinamento inicial e o funil existem, enquanto canal de WhatsApp, agenda, fontes de lead, fluxos publicados e testes externos ainda dependem de etapas posteriores.

O runtime atual do Orbit usa Z-API nos caminhos reais de WhatsApp. O formulário, porém, aceita também “Oficial Meta”. A escolha informada no onboarding não pode selecionar silenciosamente um adaptador incompatível nem bloquear o teste interno do agente.

## Decisão

Adotamos duas decisões independentes:

1. **Onboarding preenchido não equivale a operação ativa.** A interface passa a distinguir formulário, implantação, sandbox e go-live.
2. **Canal é um adaptador do runtime.** Z-API permanece preservada. Meta será um adaptador opcional, desligado por padrão e sem qualquer fallback automático entre provedores.

O sandbox do agente é o primeiro gate da Comunica. Ele continua stateless, não persiste conversa, não enfileira mensagens, não chama WhatsApp e não agenda reuniões. Google Calendar, número de teste e conexão do provedor são gates posteriores.

## Opções consideradas

### A. Exigir Z-API para todo tenant

Menor esforço imediato, mas contradiz o onboarding, cria acoplamento comercial e impede provedores oficiais. Rejeitada.

### B. Adaptador de canal com sandbox independente — escolhida

Preserva Z-API, permite Meta futuramente e deixa o agente ser homologado antes das credenciais externas. Exige contrato comum e gates explícitos.

### C. Implementar Meta diretamente nos fluxos existentes

Entrega rápida, porém duplica regras de auditoria, idempotência, mídia, outbox e kill switch. Rejeitada por acoplamento e risco de regressão.

## Estados de implantação

```text
formulario_em_preenchimento
  -> formulario_concluido
  -> configuracao_em_preparo
  -> pronto_para_sandbox
  -> sandbox_homologado
  -> integracoes_pendentes
  -> pronto_para_go_live
  -> operacao_ativa
```

O status persistido do onboarding continua compatível. A prontidão operacional é derivada de evidências e não altera automaticamente IA, fluxos, filas ou canais.

## Fluxo seguro da Comunica

```text
onboarding existente
  -> revisar prompt e regras
  -> Agent Sandbox stateless
  -> aprovar cenários de qualificação e handoff
  -> publicar fluxo somente em dry_run
  -> cliente conecta Calendar, se aplicável
  -> conectar provedor WhatsApp escolhido
  -> cadastrar número controlado
  -> teste externo allowlisted
  -> observação e promoção gradual
```

## Contrato futuro do adaptador

```yaml
whatsapp_channel:
  provider: zapi | meta_cloud
  enabled: false
  live_send_enabled: false
  inbound_enabled: false
  test_allowlist: []
  capabilities:
    text: boolean
    image: boolean
    audio: boolean
    document: boolean
    templates: boolean
  secrets:
    storage: server_only
    exposed_to_client: false
```

Interface conceitual:

```text
send(message, tenant, idempotency_key)
validate_destination(destination)
connection_status()
normalize_inbound(raw_event)
```

Cada implementação deve reutilizar outbox, idempotência, auditoria, rate limit, kill switch e sanitização existentes. Nenhum chamador de negócio pode acessar credenciais ou URLs específicas do provedor.

## Segurança e isolamento

- Seleção do tenant sempre derivada do slug/registro autorizado, nunca de um `empresa_id` arbitrário sem validação.
- Segredos acessíveis apenas no servidor; `PUBLIC`, `anon` e client-side permanecem sem leitura.
- Meta nasce com `enabled=false`, `live_send_enabled=false` e sem credenciais.
- Inbound deve validar assinatura e resolver tenant por identificador único do número, falhando fechado em ambiguidades.
- Outbound exige idempotency key, tenant correspondente, allowlist no piloto e auditoria sanitizada.
- Sandbox não usa adaptador real, não grava mensagens e não agenda.
- Nenhum estado de outro tenant é alterado durante a preparação da Comunica.

## Gates de promoção

### Sandbox

- formulário concluído;
- identidade/persona e objetivo informados;
- regras de qualificação e handoff revisadas;
- cenários críticos aprovados no simulador.

### Teste externo

- provedor conectado e saudável;
- número controlado em allowlist;
- envio real global ainda bloqueado fora da allowlist;
- templates e webhook validados;
- rollback e auditoria disponíveis.

### Go-live

- aprovação explícita;
- fluxos publicados com versão recuperável;
- observabilidade sem achados críticos;
- liberação gradual por tenant e por capacidade.

## Testes obrigatórios

- Unitário: derivação dos estados de prontidão e incompatibilidade entre “formulário concluído” e “go-live”.
- Contrato: adaptadores produzem envelope normalizado sem expor segredos.
- Segurança: tenant cruzado, assinatura inválida e envio sem allowlist falham fechados.
- Integração: sandbox não escreve em mensagens/outbox e não chama provedores.
- Regressão: Z-API mantém o comportamento atual quando Meta está ausente/desligada.

## Rollback

A mudança inicial de interface é aditiva e pode ser revertida sem tocar dados. O futuro adaptador Meta será removível por feature flag e kill switch próprios. Z-API e os fluxos atuais não dependerão da existência do adaptador Meta.

## Consequências

- A equipe pode homologar a estrutura da Comunica antes de receber Calendar e número de teste.
- O cliente continua responsável por autorizar OAuth e fornecer credenciais externas.
- Meta fica preparada no desenho, mas não será simulada como “conectada” nem usada pela Comunica até uma decisão posterior.
- O produto deixa claro que “concluído” no formulário é um marco documental, não autorização de operação.
