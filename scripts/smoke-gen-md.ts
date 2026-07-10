import { buildImplementationPackageMarkdown, DEFAULT_CHECKLIST, calculateProgress } from "../src/lib/onboarding-sections";
import fs from "node:fs";
const meta = JSON.parse(fs.readFileSync("/tmp/browser/smoke-obs/out/row_meta.json","utf8"));
const row = meta.row, emp = meta.empresa;
const md = buildImplementationPackageMarkdown({
  onboarding: { id: row.id, cliente_nome: row.cliente_nome, cliente_email: row.cliente_email,
    cliente_empresa: row.cliente_empresa, status: row.status, responses: row.responses,
    empresa: { nome: emp.nome, slug: emp.slug } },
  checklist: DEFAULT_CHECKLIST,
  publicLink: `https://orbit.fluxrow.pro/onboarding-cliente/${row.public_token}`,
});
fs.writeFileSync("/tmp/browser/smoke-obs/out/pacote.md", md);
console.log("MD_BYTES:", md.length, "PROGRESS:", calculateProgress(row.responses));
