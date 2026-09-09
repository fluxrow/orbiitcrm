import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveTemplateIdFromPayload } from "./template-selector.ts";

Deno.test("selects a tenant-scoped template id from a nested lead payload", () => {
  assertEquals(resolveTemplateIdFromPayload({
    template_id: "text-default",
    template_by_payload: {
      path: "raw.momento_negocio",
      values: { "Já tenho estoque": "audio-estoque" },
      fallback_template_id: "text-fallback",
    },
  }, { raw: { momento_negocio: "Já tenho estoque" } }), "audio-estoque");
});

Deno.test("uses the explicit fallback and then the legacy template id", () => {
  assertEquals(resolveTemplateIdFromPayload({
    template_id: "legacy",
    template_by_payload: { path: "raw.momento", values: {}, fallback_template_id: "fallback" },
  }, { raw: {} }), "fallback");
  assertEquals(resolveTemplateIdFromPayload({ template_id: "legacy" }, {}), "legacy");
});
