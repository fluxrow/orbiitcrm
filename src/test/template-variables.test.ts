import { describe, expect, it } from "vitest";
import { extractTemplateVariables, renderTemplateVariables } from "@/lib/templateVariables";

describe("template variables", () => {
  it("extracts canonical and legacy variables without corrupting double braces", () => {
    expect(extractTemplateVariables(
      "Jornada na {{empresa}}",
      "Olá {{nome}}, fale com {responsavel}.",
    )).toEqual(["empresa", "nome", "responsavel"]);
  });

  it("renders canonical and legacy variables", () => {
    expect(renderTemplateVariables(
      "Olá {{nome}} da {{empresa}}. Fale com {responsavel}.",
      { nome: "Teste Fabrica", empresa: "Fábrica", responsavel: "Patrícia" },
    )).toBe("Olá Teste Fabrica da Fábrica. Fale com Patrícia.");
  });

  it("keeps unresolved variables intact", () => {
    expect(renderTemplateVariables("Olá {{nome}} da {{empresa}}", { nome: "João" }))
      .toBe("Olá João da {{empresa}}");
  });
});
