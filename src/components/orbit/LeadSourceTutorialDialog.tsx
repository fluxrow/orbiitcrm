import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

export type TutorialKind = "typebot" | "google-sheets" | "webhook";

interface Props {
  kind: TutorialKind | null;
  onClose: () => void;
}

function CodeBlock({ children, language = "bash" }: { children: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    toast.success("Copiado!");
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative group">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-7 w-7 opacity-70 group-hover:opacity-100"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
      <pre className="text-[11px] bg-muted/40 border border-border rounded-md p-3 pr-10 overflow-x-auto whitespace-pre-wrap font-mono">
        <code data-language={language}>{children}</code>
      </pre>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 h-7 w-7 rounded-full bg-primary/15 border border-primary/30 text-primary flex items-center justify-center text-xs font-semibold">
        {n}
      </div>
      <div className="flex-1 space-y-2 pt-0.5">
        <h4 className="text-sm font-semibold">{title}</h4>
        <div className="text-sm text-muted-foreground space-y-2">{children}</div>
      </div>
    </div>
  );
}

const TYPEBOT_BLOCK = `// Bloco "HTTP Request" no final do fluxo Typebot
URL: <SEU_ENDPOINT_DA_FONTE>
Method: POST
Headers:
  Content-Type: application/json
  x-source-token: <SEU_TOKEN>
Body (JSON):
{
  "full_name": "{{Nome}}",
  "phone": "{{Telefone}}",
  "email_addr": "{{Email}}",
  "cpf": "{{CPF}}",
  "utm_source": "{{utm_source}}"
}`;

const APPS_SCRIPT = `// Cole em Extensões → Apps Script da sua Planilha
const ENDPOINT = "<SEU_ENDPOINT_DA_FONTE>";
const TOKEN    = "<SEU_TOKEN>";

function onFormSubmit(e) {
  const row = e.namedValues; // chaves = nomes das colunas
  const payload = {
    nome:      (row["Nome"]      || [""])[0],
    telefone:  (row["Telefone"]  || [""])[0],
    email:     (row["Email"]     || [""])[0],
    documento: (row["CPF/CNPJ"]  || [""])[0],
    utm_source:(row["Origem"]    || [""])[0],
    raw_row:   row,
  };

  UrlFetchApp.fetch(ENDPOINT, {
    method: "post",
    contentType: "application/json",
    headers: { "x-source-token": TOKEN },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}

// Depois: Gatilhos (relógio) → Adicionar gatilho
//   Função: onFormSubmit  |  Evento: Da planilha → No envio do formulário`;

const CURL_GENERIC = `curl -X POST "<SEU_ENDPOINT_DA_FONTE>" \\
  -H "Content-Type: application/json" \\
  -H "x-source-token: <SEU_TOKEN>" \\
  -d '{
    "nome": "Maria Teste",
    "telefone": "5551988887777",
    "email": "maria@example.com",
    "documento": "111.444.777-35",
    "utm_source": "site"
  }'`;

export function LeadSourceTutorialDialog({ kind, onClose }: Props) {
  const open = kind !== null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {kind === "typebot" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Tutorial — Typebot
                <Badge variant="outline" className="text-[10px]">Cloud ou Self-hosted</Badge>
              </DialogTitle>
              <DialogDescription>
                Envie os leads que terminarem o seu bot direto pro Orbit em tempo real.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-2">
              <Step n={1} title="Crie a Fonte no Orbit">
                Vá em <strong>Configurações → Fontes de Lead → Nova Fonte</strong>, escolha o tipo <code>Typebot</code> e copie o <strong>Endpoint</strong> e o <strong>Secret Token</strong>.
              </Step>
              <Step n={2} title="Adicione um bloco HTTP Request no fim do fluxo">
                No editor do Typebot, no final da conversa (após capturar os dados), adicione um bloco <strong>Integrações → HTTP Request</strong>:
                <CodeBlock>{TYPEBOT_BLOCK}</CodeBlock>
              </Step>
              <Step n={3} title="Ajuste o mapeamento de campos">
                No editor da Fonte, configure o mapeamento. As chaves padrão para Typebot já vêm preenchidas:
                <ul className="list-disc pl-5 space-y-0.5">
                  <li><code>nome</code> ← <code>full_name</code></li>
                  <li><code>telefone</code> ← <code>phone</code></li>
                  <li><code>email</code> ← <code>email_addr</code></li>
                  <li><code>documento</code> ← <code>cpf</code></li>
                </ul>
              </Step>
              <Step n={4} title="Publique o bot e teste">
                Rode um teste do bot. O lead aparece em <strong>Prospects</strong> em segundos e dispara o evento <code>lead_recebido</code> no Motor de Fluxos.
              </Step>
            </div>
          </>
        )}

        {kind === "google-sheets" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Tutorial — Google Sheets (Apps Script)
                <Badge variant="outline" className="text-[10px]">Modo Push — tempo real</Badge>
              </DialogTitle>
              <DialogDescription>
                Dispara um webhook pro Orbit toda vez que alguém responde o Google Forms ligado à planilha.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-2">
              <Step n={1} title="Crie a Fonte no Orbit">
                Em <strong>Fontes de Lead → Nova Fonte</strong>, escolha <code>Google Sheets</code>. Copie o <strong>Endpoint</strong> e o <strong>Token</strong>.
              </Step>
              <Step n={2} title="Abra o Apps Script">
                Na sua planilha: <strong>Extensões → Apps Script</strong>. Apague o conteúdo padrão e cole:
                <CodeBlock>{APPS_SCRIPT}</CodeBlock>
                Substitua <code>&lt;SEU_ENDPOINT&gt;</code> e <code>&lt;SEU_TOKEN&gt;</code> pelos valores reais da Fonte.
              </Step>
              <Step n={3} title="Configure o gatilho automático">
                No Apps Script: ícone do relógio (<strong>Gatilhos</strong>) → <strong>+ Adicionar gatilho</strong>.
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>Função: <code>onFormSubmit</code></li>
                  <li>Origem do evento: <strong>Da planilha</strong></li>
                  <li>Tipo: <strong>No envio do formulário</strong></li>
                </ul>
                Autorize com sua conta Google.
              </Step>
              <Step n={4} title="Ajuste o mapeamento de campos">
                No editor da Fonte, mapeie os nomes das colunas da sua planilha (ex.: <code>nome</code> ← <code>Nome</code>, <code>telefone</code> ← <code>Telefone</code>).
              </Step>
              <Step n={5} title="Teste enviando uma resposta">
                Preencha o Google Forms. O lead aparece em Prospects em segundos. Se precisar, veja o histórico do envio em <strong>Apps Script → Execuções</strong>.
              </Step>
            </div>
          </>
        )}

        {kind === "webhook" && (
          <>
            <DialogHeader>
              <DialogTitle>Tutorial — Webhook genérico</DialogTitle>
              <DialogDescription>
                Conecte qualquer sistema que consiga fazer um HTTP POST (Zapier, Make, n8n, formulário próprio etc).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-2">
              <Step n={1} title="Crie a Fonte">
                Em <strong>Fontes de Lead → Nova Fonte</strong>, escolha <code>Webhook</code>. Copie o <strong>Endpoint</strong> e o <strong>Token</strong>.
              </Step>
              <Step n={2} title="Configure a requisição no sistema externo">
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>Método: <strong>POST</strong></li>
                  <li>Header: <code>Content-Type: application/json</code></li>
                  <li>Header: <code>x-source-token: &lt;seu_token&gt;</code></li>
                  <li>Body: JSON com os campos do lead</li>
                </ul>
                <CodeBlock>{CURL_GENERIC}</CodeBlock>
              </Step>
              <Step n={3} title="Mapeie os campos">
                No editor da Fonte, ligue cada campo do CRM (<code>nome</code>, <code>telefone</code>, <code>email</code>, <code>documento</code>) à chave correspondente do seu payload. Tudo que não estiver no mapeamento é guardado em <code>dados_adicionais.raw</code> e pode ser usado em condições de fluxo via <code>raw.&lt;chave&gt;</code>.
              </Step>
              <Step n={4} title="Resposta esperada">
                Sucesso: <code>200 OK</code> com <code>{`{ ok: true, prospect_id, created }`}</code>. Erros comuns: <code>401</code> (token inválido), <code>429</code> (rate limit 60 req/min), <code>400</code> (payload sem identificador).
              </Step>
            </div>
          </>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
