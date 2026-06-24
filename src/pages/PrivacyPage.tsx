import { useEffect } from "react";
import { Shield, Lock, Eye, Database, Trash2, Mail } from "lucide-react";

export default function PrivacyPage() {
  useEffect(() => {
    document.title = "Política de Privacidade — Orbit CRM";
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold mb-3">Política de Privacidade</h1>
          <p className="text-muted-foreground">Última atualização: 24 de junho de 2026</p>
        </div>

        <div className="space-y-8">
          <section className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">1. Introdução</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A Fluxrow Tecnologia ("Orbit CRM", "nós", "nosso") respeita sua privacidade e está comprometida em proteger os dados pessoais dos usuários de nossa plataforma. Esta política descreve como coletamos, usamos, armazenamos e protegemos suas informações ao utilizar o Orbit CRM.
            </p>
          </section>

          <section className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Database className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">2. Dados que Coletamos</h2>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><strong>Dados de cadastro:</strong> nome, e-mail, telefone e nome da empresa.</li>
              <li><strong>Dados de uso:</strong> logs de acesso, interações com leads, campanhas enviadas e funil de vendas.</li>
              <li><strong>Dados de integração:</strong> tokens de acesso para Google Calendar, WhatsApp (Z-API), Meta e outros serviços conectados por você.</li>
              <li><strong>Dados de pagamento:</strong> processados exclusivamente pelo Stripe; não armazenamos dados de cartão.</li>
            </ul>
          </section>

          <section className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Eye className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">3. Como Usamos seus Dados</h2>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Fornecer e melhorar os serviços do Orbit CRM.</li>
              <li>Processar transações e gerenciar assinaturas.</li>
              <li>Enviar comunicações operacionais (notificações, alertas de fatura).</li>
              <li>Garantir a segurança e prevenir fraudes.</li>
              <li>Cumprir obrigações legais e regulatórias.</li>
            </ul>
          </section>

          <section className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">4. Segurança e Isolamento</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Cada empresa no Orbit CRM opera em um ambiente isolado (multi-tenant) com Row Level Security (RLS) no banco de dados. Dados são criptografados em trânsito (TLS 1.2+) e em repouso. Acesso a dados sensíveis é restrito por função (admin, gerente, vendedor, visualizador).
            </p>
          </section>

          <section className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Trash2 className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">5. Retenção e Exclusão</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Mantemos seus dados enquanto sua conta estiver ativa. Após cancelamento, dados são mantidos por até 90 dias para fins de recuperação e auditoria, e então excluídos permanentemente. Você pode solicitar exclusão antecipada entrando em contato.
            </p>
          </section>

          <section className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Mail className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">6. Contato</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Para questões sobre privacidade, entre em contato pelo e-mail: <strong>orbit@fluxrow.pro</strong>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
