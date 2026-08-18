import { describe, it, expect } from "vitest";
import {
  extractPublicMessage,
  looksLikeInternalPayload,
} from "../../supabase/functions/_shared/ai-output-guard.ts";

const INCIDENT = '```json\n{ "intencao": "agradecimento", "mensagem": "", "iniciar_coleta_orcamento": false, "dados_extraidos": {}, "dados_adicionais": {}, "campo_solicitado": null, "cadastro_completo": false, "agendamento": null }\n```';

describe("ai-output-guard", () => {
  it("JSON puro com mensagem: envia apenas a mensagem pública", () => {
    const r = extractPublicMessage('{"intencao":"duvida","mensagem":"Claro, posso explicar!"}');
    expect(r.text).toBe("Claro, posso explicar!");
    expect(r.blocked).toBe(false);
    expect(r.skip).toBe(false);
  });

  it("```json fence com mensagem: extrai a mensagem", () => {
    const r = extractPublicMessage('```json\n{"intencao":"saudacao","mensagem":"Bom dia! Como posso ajudar?"}\n```');
    expect(r.text).toBe("Bom dia! Como posso ajudar?");
  });

  it('prefixo "json" sem cerca: extrai a mensagem', () => {
    const r = extractPublicMessage('json {"intencao":"duvida","mensagem":"Sim, atendemos todo o Brasil."}');
    expect(r.text).toBe("Sim, atendemos todo o Brasil.");
  });

  it("incidente real (mensagem vazia + agradecimento): nada é enviado", () => {
    const r = extractPublicMessage(INCIDENT);
    expect(r.text).toBe("");
    expect(r.skip).toBe(true);
    expect(r.reason).toBe("empty_message_no_reply_intent");
    expect(looksLikeInternalPayload(INCIDENT)).toBe(true);
  });

  it("mensagem vazia com intenção que exige resposta: não envia raw output", () => {
    const r = extractPublicMessage('{"intencao":"orcamento","mensagem":""}');
    expect(r.text).toBe("");
    expect(r.skip).toBe(true);
    expect(r.reason).toBe("empty_message");
  });

  it("JSON inválido com chaves internas: bloqueia sem enviar", () => {
    const r = extractPublicMessage('```json\n{ "intencao": "duvida", "mensagem": "oi"\n');
    expect(r.blocked).toBe(true);
    expect(r.text).toBe("");
  });

  it("texto normal é preservado", () => {
    const r = extractPublicMessage("Oi! Tudo bem? Posso te explicar como funciona.");
    expect(r.text).toBe("Oi! Tudo bem? Posso te explicar como funciona.");
    expect(r.blocked).toBe(false);
    expect(looksLikeInternalPayload(r.text)).toBe(false);
  });

  it("texto com link é preservado", () => {
    const t = "Segue o link da nossa agenda: https://cal.com/orbit/30min";
    expect(extractPublicMessage(t).text).toBe(t);
    expect(looksLikeInternalPayload(t)).toBe(false);
  });

  it("payload legítimo não relacionado não é bloqueado", () => {
    const t = "Fechamos às 18h e o valor da mentoria é R$ 6.500 (PIX ou 12x R$ 650).";
    expect(looksLikeInternalPayload(t)).toBe(false);
    expect(extractPublicMessage(t).text).toBe(t);
  });

  it("texto com chaves/emoji sem metadado interno não é bloqueado", () => {
    const t = "Perfeito 🙌 amanhã de manhã funciona pra você?";
    expect(looksLikeInternalPayload(t)).toBe(false);
  });
});
