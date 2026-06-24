import { useEffect } from "react";
import { FileText, CheckCircle, AlertTriangle, Clock, XCircle } from "lucide-react";

export default function TermsPage() {
  useEffect(() => {
    document.title = "Termos de Serviço — Orbit CRM";
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold mb-3">Termos de Serviço</h1>
          <p className="text-muted-foreground">Última atualização: 24 de junho de 2026</p>
        </div>

        <div className="space-y-8">
          <section className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">1. Aceitação dos Termos</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Ao criar uma conta e utilizar o Orbit CRM, você concorda com estes Termos de Serviço. Se não concordar, não utilize a plataforma. Os termos podem ser atualizados periodicamente; o uso continuado após alterações constitui aceitação.
            </p>
          </section>

          <section className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">2. Descrição do Serviço</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              O Orbit CRM é uma plataforma SaaS de gestão de relacionamento com clientes (CRM) com inteligência artificial para automação de atendimento via WhatsApp, email marketing, funil de vendas e integração com calendários. O serviço é oferecido nos planos e limites descritos no momento da assinatura.
            </p>
          </section>

          <section className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">3. Uso Adequado</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Você se compromete a:
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Fornecer informações verdadeiras e atualizadas no cadastro.</li>
              <li>Não utilizar a plataforma para envio de spam, conteúdo ilegal ou atividades fraudulentas.</li>
              <li>Respeitar as políticas de uso dos serviços integrados (WhatsApp, Google, Meta, etc.).</li>
              <li>Manter a confidencialidade de suas credenciais de acesso.</li>
            </ul>
          </section>

          <section className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">4. Assinatura e Pagamento</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              O Orbit CRM opera no modelo de assinatura mensal ou anual via Stripe. O não pagamento pode resultar em suspensão ou cancelamento da conta. Oferecemos um período de teste gratuito conforme descrito no plano escolhido. Reembolsos são avaliados caso a caso.
            </p>
          </section>

          <section className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <XCircle className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">5. Limitação de Responsabilidade</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              O Orbit CRM é fornecido "no estado em que se encontra". Não garantimos que o serviço estará livre de interrupções ou erros. Nossa responsabilidade limita-se ao valor pago pelo serviço no período de 12 meses anteriores ao evento.
            </p>
          </section>

          <section className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">6. Disposições Gerais</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Estes termos são regidos pelas leis da República Federativa do Brasil. Em caso de conflito, as partes concordam com a jurisdição dos tribunais de São Paulo/SP. Dúvidas podem ser enviadas para: <strong>orbit@fluxrow.pro</strong>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
