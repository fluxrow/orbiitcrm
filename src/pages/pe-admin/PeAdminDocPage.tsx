import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FileDown, BookOpen, Database, Layers, Shield, Route, Users, Link2, ClipboardList, Code2 } from "lucide-react";

const sections = [
  { id: "visao-geral", label: "1. Visão Geral", icon: BookOpen },
  { id: "controle-acesso", label: "2. Controle de Acesso", icon: Shield },
  { id: "banco-de-dados", label: "3. Banco de Dados", icon: Database },
  { id: "modulos", label: "4. Módulos", icon: Layers },
  { id: "hooks", label: "5. Hooks e Integração", icon: Code2 },
  { id: "rls-seguranca", label: "6. RLS e Segurança", icon: Shield },
  { id: "rotas", label: "7. Rotas", icon: Route },
  { id: "ponte-orbit", label: "8. Ponte Orbit↔PE", icon: Link2 },
];

export default function PeAdminDocPage() {
  const [activeSection, setActiveSection] = useState("visao-geral");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 }
    );
    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .doc-header-pe, .doc-toc-pe, .no-print, nav, aside, header { display: none !important; }
          .doc-main-pe { margin-left: 0 !important; padding: 0 !important; max-width: 100% !important; }
          .doc-section { page-break-inside: avoid; break-inside: avoid; margin-bottom: 1rem; }
          body, html { background: white !important; color: black !important; font-size: 11pt; }
          * { color: black !important; border-color: #ccc !important; background: white !important; }
          h1,h2,h3 { page-break-after: avoid; }
          table { font-size: 10pt; }
          .print-title { display: block !important; text-align: center; font-size: 18pt; font-weight: bold; margin-bottom: 8pt; }
          .print-subtitle { display: block !important; text-align: center; font-size: 11pt; color: #666 !important; margin-bottom: 24pt; }
        }
      `}</style>

      {/* Print-only title */}
      <div className="print-title hidden">Documentação PE Admin — Prospecting Engine</div>
      <div className="print-subtitle hidden">Gerado em {new Date().toLocaleDateString("pt-BR")} • v1.0</div>

      {/* Fixed Header */}
      <div className="doc-header-pe sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Documentação PE Admin</h1>
          <Badge variant="secondary">v1.0</Badge>
        </div>
        <Button onClick={() => window.print()} className="no-print gap-2">
          <FileDown className="h-4 w-4" /> Exportar PDF
        </Button>
      </div>

      <div className="flex min-h-[calc(100vh-120px)]">
        {/* TOC Sidebar */}
        <aside className="doc-toc-pe hidden lg:block w-64 shrink-0 border-r border-border sticky top-[65px] h-[calc(100vh-130px)]">
          <ScrollArea className="h-full py-6 px-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-4 tracking-wider">Índice</p>
            <nav className="flex flex-col gap-1">
              {sections.map(({ id, label, icon: Icon }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    activeSection === id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </a>
              ))}
            </nav>
          </ScrollArea>
        </aside>

        {/* Main Content */}
        <main className="doc-main-pe flex-1 max-w-4xl mx-auto px-6 py-10 space-y-12">

          {/* 1. Visão Geral */}
          <section id="visao-geral" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" /> 1. Visão Geral do PE</h2>
            <Separator />
            <Card><CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-foreground mb-2">O que é o Prospecting Engine?</h3>
                <p className="text-muted-foreground leading-relaxed">O PE (Prospecting Engine) é o módulo de administração multi-tenant da plataforma ORBIT. Ele gerencia organizações (tenants), usuários, clientes, contatos, oportunidades de venda, tarefas e todo o pipeline comercial. O acesso é restrito a Super Admins — usuários com <code className="text-xs bg-muted px-1 py-0.5 rounded">is_super_admin = true</code> na tabela <code className="text-xs bg-muted px-1 py-0.5 rounded">pe_users</code>.</p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Arquitetura Multi-Tenant</h3>
                <p className="text-muted-foreground leading-relaxed">Cada organização é um tenant isolado. Todas as tabelas PE possuem coluna <code className="text-xs bg-muted px-1 py-0.5 rounded">organization_id</code> como chave de isolamento. Políticas RLS garantem que usuários comuns só acessem dados de sua organização, enquanto Super Admins têm visão global.</p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Stack Tecnológico</h3>
                <div className="flex flex-wrap gap-2">
                  {["React 18", "TypeScript", "Vite", "Tailwind CSS", "shadcn/ui", "Lovable Cloud", "TanStack Query", "Edge Functions (Deno)"].map(t => (
                    <Badge key={t} variant="outline">{t}</Badge>
                  ))}
                </div>
              </div>
            </CardContent></Card>
          </section>

          {/* 2. Controle de Acesso */}
          <section id="controle-acesso" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /> 2. Controle de Acesso</h2>
            <Separator />
            <Card><CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Super Admin vs Usuário Comum</h3>
                <Table><TableHeader><TableRow><TableHead>Aspecto</TableHead><TableHead>Super Admin</TableHead><TableHead>Usuário Comum</TableHead></TableRow></TableHeader><TableBody>
                  {[
                    ["Acesso PE Admin", "✅ Total", "❌ Bloqueado"],
                    ["organization_id", "NULL (global)", "Obrigatório"],
                    ["role_id", "NULL", "Obrigatório (pe_roles)"],
                    ["is_super_admin", "true", "false"],
                    ["Visibilidade", "Todas as organizações", "Apenas sua organização"],
                  ].map(([a, s, u]) => <TableRow key={a}><TableCell className="font-medium">{a}</TableCell><TableCell>{s}</TableCell><TableCell>{u}</TableCell></TableRow>)}
                </TableBody></Table>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Tabela pe_users</h3>
                <p className="text-muted-foreground leading-relaxed">Armazena todos os usuários do PE. O <code className="text-xs bg-muted px-1 py-0.5 rounded">id</code> corresponde ao <code className="text-xs bg-muted px-1 py-0.5 rounded">auth.uid()</code>. Campos principais: <code className="text-xs bg-muted px-1 py-0.5 rounded">full_name</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">email</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">organization_id</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">role_id</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">is_super_admin</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">is_active</code>.</p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Tabela pe_roles</h3>
                <p className="text-muted-foreground leading-relaxed">Roles dinâmicos por organização. Cada role possui <code className="text-xs bg-muted px-1 py-0.5 rounded">code</code> (slug), <code className="text-xs bg-muted px-1 py-0.5 rounded">name</code> e <code className="text-xs bg-muted px-1 py-0.5 rounded">permissions</code> (JSONB). Exemplos: <Badge variant="outline">admin</Badge> <Badge variant="outline">vendedor</Badge> <Badge variant="outline">visualizador</Badge></p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Fluxo de Convite</h3>
                <p className="text-muted-foreground leading-relaxed">1. Super Admin cria convite via <code className="text-xs bg-muted px-1 py-0.5 rounded">pe_invitations</code> com email, organization_id e role_id → 2. Token gerado e enviado por email → 3. Usuário acessa link <code className="text-xs bg-muted px-1 py-0.5 rounded">/invite/:token</code> → 4. Edge Function <code className="text-xs bg-muted px-1 py-0.5 rounded">accept-invitation</code> valida token, cria conta e vincula à organização → 5. Convite marcado como aceito.</p>
              </div>
            </CardContent></Card>
          </section>

          {/* 3. Banco de Dados */}
          <section id="banco-de-dados" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Database className="h-5 w-5 text-primary" /> 3. Banco de Dados</h2>
            <Separator />
            <Card><CardHeader><CardTitle className="text-lg">Tabelas PE (multi-tenant por organization_id)</CardTitle></CardHeader><CardContent>
              <Table><TableHeader><TableRow><TableHead>Tabela</TableHead><TableHead>Descrição</TableHead><TableHead>Tenant Key</TableHead><TableHead>RLS</TableHead></TableRow></TableHeader><TableBody>
                {[
                  ["organizations", "Organizações/tenants do PE", "id (self)", "✅"],
                  ["pe_users", "Usuários vinculados a organizações", "organization_id", "✅"],
                  ["pe_roles", "Roles dinâmicos por organização", "organization_id", "✅"],
                  ["pe_invitations", "Convites pendentes para usuários", "organization_id", "✅"],
                  ["pe_audit_log", "Log de auditoria do PE", "organization_id", "✅"],
                  ["pe_tenant_map", "Mapeamento Orbit↔PE", "organization_id", "✅"],
                  ["clientes", "Empresas prospectadas", "organization_id", "✅"],
                  ["contatos", "Contatos vinculados a clientes", "organization_id", "✅"],
                  ["origens", "Fontes de origem de clientes", "organization_id", "✅"],
                  ["cliente_origem", "Relação N:N cliente↔origem", "organization_id", "✅"],
                  ["segmentos", "Segmentos de mercado", "organization_id", "✅"],
                  ["funil_etapas", "Etapas do funil de vendas", "organization_id", "✅"],
                  ["oportunidades", "Negócios/oportunidades", "organization_id", "✅"],
                  ["oportunidade_itens", "Itens/produtos de oportunidade", "organization_id", "✅"],
                  ["interacoes", "Registro de interações com clientes", "organization_id", "✅"],
                  ["tarefas", "Tarefas e follow-ups", "organization_id", "✅"],
                  ["produtos", "Catálogo de produtos/serviços", "organization_id", "✅"],
                ].map(([t, d, k, r]) => <TableRow key={t}><TableCell className="font-mono text-xs">{t}</TableCell><TableCell className="text-muted-foreground">{d}</TableCell><TableCell><Badge variant="outline">{k}</Badge></TableCell><TableCell>{r}</TableCell></TableRow>)}
              </TableBody></Table>
            </CardContent></Card>

            <Card><CardHeader><CardTitle className="text-lg">Detalhes das Colunas Principais</CardTitle></CardHeader><CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold text-foreground mb-1">oportunidades</h4>
                <p className="text-muted-foreground text-sm leading-relaxed"><code className="text-xs bg-muted px-1 py-0.5 rounded">titulo</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">cliente_id</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">etapa_id</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">owner_user_id</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">status</code> (aberta/ganha/perdida), <code className="text-xs bg-muted px-1 py-0.5 rounded">probabilidade</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">valor_total_estimado</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">destino</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">data_ida</code>/<code className="text-xs bg-muted px-1 py-0.5 rounded">data_volta</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">viajantes_qtd</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">motivo_perda</code>.</p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">clientes</h4>
                <p className="text-muted-foreground text-sm leading-relaxed"><code className="text-xs bg-muted px-1 py-0.5 rounded">razao_social</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">nome_fantasia</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">cnpj</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">segmento_id</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">porte</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">cidade</code>/<code className="text-xs bg-muted px-1 py-0.5 rounded">uf</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">site</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">dominio_principal</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">status_geral</code>.</p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">contatos</h4>
                <p className="text-muted-foreground text-sm leading-relaxed"><code className="text-xs bg-muted px-1 py-0.5 rounded">nome</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">cargo</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">email</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">telefone</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">whatsapp</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">decisor</code> (boolean), <code className="text-xs bg-muted px-1 py-0.5 rounded">nivel_influencia</code> (1-5), <code className="text-xs bg-muted px-1 py-0.5 rounded">area</code>.</p>
              </div>
            </CardContent></Card>
          </section>

          {/* 4. Módulos */}
          <section id="modulos" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Layers className="h-5 w-5 text-primary" /> 4. Módulos do PE Admin</h2>
            <Separator />
            <Card><CardContent className="pt-6">
              <Table><TableHeader><TableRow><TableHead>Módulo</TableHead><TableHead>Rota</TableHead><TableHead>Descrição</TableHead></TableRow></TableHeader><TableBody>
                {[
                  ["Organizações", "/pe-admin/organizations", "CRUD de organizações/tenants. Criação, ativação/desativação, visualização de usuários por org"],
                  ["Usuários Globais", "/pe-admin/users", "Listagem cross-tenant de todos os pe_users. Filtros por org, status e role"],
                  ["Clientes", "/pe-admin/clientes", "Gestão de empresas prospectadas com CNPJ, segmento, porte, cidade/UF. Detalhe com contatos e oportunidades"],
                  ["Contatos", "/pe-admin/contatos", "Pessoas vinculadas a clientes. Cargo, decisor, nível de influência, email e WhatsApp"],
                  ["Segmentos", "/pe-admin/segmentos", "Classificação de clientes por setor de atuação"],
                  ["Origens", "/pe-admin/origens", "Fontes de origem dos clientes (lista, campanha, indicação, etc.)"],
                  ["Produtos", "/pe-admin/produtos", "Catálogo de produtos/serviços para cotações em oportunidades"],
                  ["Funil", "/pe-admin/funil", "Etapas configuráveis do pipeline de vendas com ordem e tipo (aberta/ganha/perdida)"],
                  ["Oportunidades", "/pe-admin/oportunidades", "Negócios vinculados a clientes. Suporte a tabela e Kanban. Detalhe com itens, interações e tarefas"],
                  ["Tarefas", "/pe-admin/tarefas", "Follow-ups e atividades com prazo, prioridade e status"],
                  ["Importação", "/pe-admin/importacao", "Upload CSV para importação em lote de clientes e contatos"],
                  ["Tenant Map", "/pe-admin/tenants", "Mapeamento entre orbit_empresas (empresa_id) e organizations (organization_id). Auto-provisionamento via RPC"],
                  ["Auditoria", "/pe-admin/audit", "Log completo de ações no PE: criação, edição, exclusão com detalhes JSON"],
                ].map(([m, r, d]) => <TableRow key={m}><TableCell className="font-medium">{m}</TableCell><TableCell className="font-mono text-xs">{r}</TableCell><TableCell className="text-muted-foreground">{d}</TableCell></TableRow>)}
              </TableBody></Table>
            </CardContent></Card>
          </section>

          {/* 5. Hooks e Integração */}
          <section id="hooks" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Code2 className="h-5 w-5 text-primary" /> 5. Hooks e Integração</h2>
            <Separator />
            <Card><CardContent className="pt-6">
              <Table><TableHeader><TableRow><TableHead>Hook</TableHead><TableHead>Arquivo</TableHead><TableHead>Função</TableHead></TableRow></TableHeader><TableBody>
                {[
                  ["usePeAuth", "src/hooks/usePeAuth.ts", "Autenticação PE: retorna peUser, isSuperAdmin, orgId, roleCode"],
                  ["useOrganizations", "src/hooks/useOrganizations.ts", "CRUD de organizações com listagem paginada"],
                  ["useOrgUsers", "src/hooks/useOrgUsers.ts", "Usuários de uma organização específica"],
                  ["usePeRoles", "src/hooks/usePeRoles.ts", "CRUD de roles dinâmicos por organização"],
                  ["usePeInvitations", "src/hooks/usePeInvitations.ts", "Gestão de convites pendentes"],
                  ["usePeAuditLog", "src/hooks/usePeAuditLog.ts", "Leitura do log de auditoria PE"],
                  ["useClientes", "src/hooks/useClientes.ts", "CRUD de clientes com busca e paginação"],
                  ["useContatos", "src/hooks/useContatos.ts", "CRUD de contatos vinculados a clientes"],
                  ["useSegmentos", "src/hooks/useSegmentos.ts", "CRUD de segmentos de mercado"],
                  ["useOrigens", "src/hooks/useOrigens.ts", "CRUD de origens de clientes"],
                  ["useClienteOrigem", "src/hooks/useClienteOrigem.ts", "Relação N:N entre cliente e origem"],
                  ["useProdutos", "src/hooks/useProdutos.ts", "CRUD de produtos/serviços"],
                  ["useFunilEtapas", "src/hooks/useFunilEtapas.ts", "CRUD de etapas do funil com reordenação"],
                  ["useOportunidades", "src/hooks/useOportunidades.ts", "CRUD de oportunidades com filtros e Kanban"],
                  ["useOportunidadeItens", "src/hooks/useOportunidadeItens.ts", "Itens/produtos de uma oportunidade"],
                  ["useInteracoes", "src/hooks/useInteracoes.ts", "Registro de interações com clientes"],
                  ["useTarefas", "src/hooks/useTarefas.ts", "CRUD de tarefas e follow-ups"],
                  ["useImportClientes", "src/hooks/useImportClientes.ts", "Importação CSV de clientes"],
                  ["useTenantMap", "src/hooks/useTenantMap.ts", "Mapeamento Orbit↔PE e auto-provisionamento"],
                  ["useSuperAdmin", "src/hooks/useSuperAdmin.ts", "Operações exclusivas de super admin"],
                ].map(([h, f, d]) => <TableRow key={h}><TableCell className="font-mono text-xs font-medium">{h}</TableCell><TableCell className="font-mono text-xs text-muted-foreground">{f}</TableCell><TableCell className="text-muted-foreground">{d}</TableCell></TableRow>)}
              </TableBody></Table>
            </CardContent></Card>
          </section>

          {/* 6. RLS e Segurança */}
          <section id="rls-seguranca" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /> 6. RLS e Segurança</h2>
            <Separator />
            <Card><CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Funções de Segurança</h3>
                <Table><TableHeader><TableRow><TableHead>Função</TableHead><TableHead>Retorno</TableHead><TableHead>Uso</TableHead></TableRow></TableHeader><TableBody>
                  {[
                    ["pe_is_super_admin(uid)", "boolean", "Verifica se o usuário é super admin global"],
                    ["pe_get_user_org_id(uid)", "uuid", "Retorna o organization_id do usuário (NULL para super admin)"],
                  ].map(([f, r, u]) => <TableRow key={f}><TableCell className="font-mono text-xs">{f}</TableCell><TableCell><Badge variant="outline">{r}</Badge></TableCell><TableCell className="text-muted-foreground">{u}</TableCell></TableRow>)}
                </TableBody></Table>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Padrão de Policies RLS</h3>
                <p className="text-muted-foreground leading-relaxed mb-3">Todas as tabelas PE seguem o mesmo padrão de policy:</p>
                <div className="bg-muted rounded-lg p-4 font-mono text-xs leading-relaxed">
                  <p className="text-muted-foreground">-- SELECT: super admin vê tudo, usuário comum vê apenas sua org</p>
                  <p className="text-foreground">CREATE POLICY "select" ON tabela FOR SELECT USING (</p>
                  <p className="text-foreground pl-4">pe_is_super_admin(auth.uid())</p>
                  <p className="text-foreground pl-4">OR organization_id = pe_get_user_org_id(auth.uid())</p>
                  <p className="text-foreground">);</p>
                  <br />
                  <p className="text-muted-foreground">-- INSERT/UPDATE/DELETE: mesmo padrão</p>
                  <p className="text-muted-foreground">-- Super admin pode operar em qualquer org</p>
                  <p className="text-muted-foreground">-- Usuário comum só na sua própria org</p>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Proteção de Rota (Frontend)</h3>
                <p className="text-muted-foreground leading-relaxed">O <code className="text-xs bg-muted px-1 py-0.5 rounded">PeAdminLayout</code> usa o hook <code className="text-xs bg-muted px-1 py-0.5 rounded">usePeAuth()</code> para verificar <code className="text-xs bg-muted px-1 py-0.5 rounded">isSuperAdmin</code>. Se o usuário não for super admin, é redirecionado para <code className="text-xs bg-muted px-1 py-0.5 rounded">/orbit</code>. Se não estiver autenticado, é redirecionado para <code className="text-xs bg-muted px-1 py-0.5 rounded">/auth</code>.</p>
              </div>
            </CardContent></Card>
          </section>

          {/* 7. Rotas */}
          <section id="rotas" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Route className="h-5 w-5 text-primary" /> 7. Rotas do PE Admin</h2>
            <Separator />
            <Card><CardContent className="pt-6">
              <Table><TableHeader><TableRow><TableHead>Rota</TableHead><TableHead>Componente</TableHead><TableHead>Descrição</TableHead></TableRow></TableHeader><TableBody>
                {[
                  ["/pe-admin", "PeAdminLayout", "Layout wrapper com sidebar e proteção de acesso"],
                  ["/pe-admin/organizations", "OrganizationsPage", "Listagem e CRUD de organizações"],
                  ["/pe-admin/organizations/:id/users", "PeOrgUsersPage", "Usuários de uma organização"],
                  ["/pe-admin/users", "GlobalUsersPage", "Todos os usuários do sistema"],
                  ["/pe-admin/clientes", "ClientesPage", "Listagem de clientes"],
                  ["/pe-admin/clientes/:id", "ClienteDetailPage", "Detalhe do cliente"],
                  ["/pe-admin/contatos", "ContatosPage", "Listagem de contatos"],
                  ["/pe-admin/segmentos", "SegmentosPage", "Gestão de segmentos"],
                  ["/pe-admin/origens", "OrigensPage", "Gestão de origens"],
                  ["/pe-admin/produtos", "ProdutosPage", "Catálogo de produtos"],
                  ["/pe-admin/funil", "FunilEtapasPage", "Etapas do funil de vendas"],
                  ["/pe-admin/oportunidades", "OportunidadesPage", "Listagem de oportunidades"],
                  ["/pe-admin/oportunidades/kanban", "OportunidadesKanbanPage", "Kanban de oportunidades"],
                  ["/pe-admin/oportunidades/:id", "OportunidadeDetailPage", "Detalhe da oportunidade"],
                  ["/pe-admin/tarefas", "TarefasPage", "Gestão de tarefas"],
                  ["/pe-admin/importacao", "ImportacaoPage", "Importação CSV"],
                  ["/pe-admin/tenants", "TenantMapPage", "Mapeamento de tenants"],
                  ["/pe-admin/audit", "AuditLogPage", "Log de auditoria"],
                  ["/pe-admin/documentacao", "PeAdminDocPage", "Esta documentação"],
                ].map(([r, c, d]) => <TableRow key={r}><TableCell className="font-mono text-xs">{r}</TableCell><TableCell className="font-mono text-xs">{c}</TableCell><TableCell className="text-muted-foreground">{d}</TableCell></TableRow>)}
              </TableBody></Table>
            </CardContent></Card>
          </section>

          {/* 8. Ponte Orbit↔PE */}
          <section id="ponte-orbit" className="doc-section space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Link2 className="h-5 w-5 text-primary" /> 8. Ponte Orbit↔PE</h2>
            <Separator />
            <Card><CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Tabela pe_tenant_map</h3>
                <p className="text-muted-foreground leading-relaxed">Mapeia a relação entre o Orbit CRM e o PE. Cada registro liga um <code className="text-xs bg-muted px-1 py-0.5 rounded">empresa_id</code> (orbit_empresas) a um <code className="text-xs bg-muted px-1 py-0.5 rounded">organization_id</code> (organizations). Isso permite que uma empresa Orbit tenha um tenant PE correspondente e vice-versa.</p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Colunas</h3>
                <Table><TableHeader><TableRow><TableHead>Coluna</TableHead><TableHead>Tipo</TableHead><TableHead>Descrição</TableHead></TableRow></TableHeader><TableBody>
                  {[
                    ["id", "uuid", "PK gerado automaticamente"],
                    ["empresa_id", "uuid", "FK → orbit_empresas.id"],
                    ["organization_id", "uuid", "FK → organizations.id"],
                    ["synced_at", "timestamptz", "Data da última sincronização"],
                    ["created_at", "timestamptz", "Data de criação do mapeamento"],
                  ].map(([c, t, d]) => <TableRow key={c}><TableCell className="font-mono text-xs">{c}</TableCell><TableCell><Badge variant="outline">{t}</Badge></TableCell><TableCell className="text-muted-foreground">{d}</TableCell></TableRow>)}
                </TableBody></Table>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">RPC pe_provision_tenant</h3>
                <p className="text-muted-foreground leading-relaxed">Função RPC que automatiza o provisionamento: recebe um <code className="text-xs bg-muted px-1 py-0.5 rounded">empresa_id</code>, cria uma nova organização no PE, insere o mapeamento em <code className="text-xs bg-muted px-1 py-0.5 rounded">pe_tenant_map</code> e configura roles padrão. Utilizada pelo módulo Tenant Map no PE Admin.</p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Fluxo de Provisionamento</h3>
                <div className="bg-muted rounded-lg p-4 text-sm text-muted-foreground leading-relaxed space-y-1">
                  <p>1. Super Admin acessa <strong>Tenant Map</strong> no PE Admin</p>
                  <p>2. Seleciona uma empresa Orbit ainda não mapeada</p>
                  <p>3. Clica em "Provisionar" → chama RPC <code className="text-xs bg-muted px-1 py-0.5 rounded">pe_provision_tenant</code></p>
                  <p>4. RPC cria organização + roles padrão + registro em pe_tenant_map</p>
                  <p>5. Empresa Orbit agora tem acesso ao módulo PE</p>
                </div>
              </div>
            </CardContent></Card>
          </section>

          {/* Footer */}
          <div className="text-center text-xs text-muted-foreground pt-8 pb-4 border-t border-border">
            <p>Documentação PE Admin — Prospecting Engine • ORBIT Platform</p>
            <p>Gerado em {new Date().toLocaleDateString("pt-BR")} • v1.0</p>
          </div>

        </main>
      </div>
    </>
  );
}
