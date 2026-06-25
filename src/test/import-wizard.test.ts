import { describe, it, expect } from "vitest";
import { parseCsvFile, buildRecordsFromMapping } from "@/hooks/useImportWizard";

const sample = `Nome da Empresa;Email;WhatsApp;CNPJ;Cidade;UF;Faturamento Mensal;Desafio Atual
Mentoria Alpha;contato.alpha@example.com;5511988880001;11.222.333/0001-81;São Paulo;SP;R$ 50k;Captação
Coach Beta;beta@example.com;5511988880002;52998224725;Rio de Janeiro;RJ;R$ 100k;Engajamento
Lead Sem Email;;5511988880003;;Curitiba;PR;R$ 20k;Diferenciação`;

describe("F2 wizard parser", () => {
  it("auto-maps standard columns and routes extras to JSONB", () => {
    const p = parseCsvFile(sample);
    expect(p.headers.length).toBe(8);
    expect(p.rows.length).toBe(3);
    expect(p.autoMapping[0]).toBe("nome_razao");
    expect(p.autoMapping[6]).toBe("__extra__"); // "Faturamento Mensal"
  });

  it("builds records with PF/PJ doc detection and dados_adicionais", () => {
    const p = parseCsvFile(sample);
    const { records, rowErrors } = buildRecordsFromMapping(p.headers, p.rows, p.autoMapping);
    expect(records.length).toBe(3);
    const alpha = records.find(r => r.nome_razao === "Mentoria Alpha")!;
    expect(alpha.cnpj_cpf).toBe("11222333000181");
    expect(alpha.tipo_documento).toBe("PJ");
    expect(alpha.dados_adicionais["Faturamento Mensal"]).toBe("R$ 50k");
    expect(alpha.dados_adicionais["Desafio Atual"]).toBe("Captação");

    const beta = records.find(r => r.nome_razao === "Coach Beta")!;
    expect(beta.cnpj_cpf?.length).toBe(11);
    expect(beta.tipo_documento).toBe("PF");

    const lead3 = records.find(r => r.whatsapp === "5511988880003")!;
    expect(lead3).toBeTruthy();
    expect(rowErrors.length).toBe(0);
  });
});
