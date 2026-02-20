import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { formatCnpj, normalizeCnpj, validateCnpjDv } from "@/lib/cnpj";
import { Loader2, CheckCircle2, XCircle, Building2, User, KeyRound } from "lucide-react";

interface InviteData {
  empresa_nome: string;
  responsible_name: string;
  responsible_email: string;
  plan_code: string;
  plan_name: string;
  expires_at: string;
}

interface CnpjData {
  razao_social: string;
  nome_fantasia: string;
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  uf: string;
  cnae_fiscal_descricao: string;
}

export default function AcceptInviteSaasPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = params.get("token") || "";

  // State
  const [step, setStep] = useState(0); // 0=loading, 1=welcome, 2=account, 3=cnpj, 4=finalizing, 5=done
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Account form
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // CNPJ form
  const [cnpj, setCnpj] = useState("");
  const [cnpjValid, setCnpjValid] = useState<boolean | null>(null);
  const [cnpjData, setCnpjData] = useState<CnpjData | null>(null);
  const [cnpjLoading, setCnpjLoading] = useState(false);

  const isDemo = invite?.plan_code === "demo";
  const totalSteps = isDemo ? 2 : 3;

  // Step 0: Validate token
  useEffect(() => {
    if (!token) {
      setError("Token não fornecido. Verifique o link do convite.");
      return;
    }
    validateToken();
  }, [token]);

  async function validateToken() {
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("validate-invite", {
        body: { token },
      });
      if (fnErr) throw fnErr;
      if (data?.error) {
        setError(data.error);
        return;
      }
      if (!data?.valid) {
        setError("Convite inválido.");
        return;
      }
      setInvite(data);
      setFullName(data.responsible_name || "");
      setStep(1);
    } catch (e: any) {
      setError(e.message || "Erro ao validar convite.");
    }
  }

  // CNPJ auto-fill
  useEffect(() => {
    const digits = normalizeCnpj(cnpj);
    if (digits.length === 14) {
      const valid = validateCnpjDv(digits);
      setCnpjValid(valid);
      if (valid) fetchCnpjData(digits);
    } else {
      setCnpjValid(null);
      setCnpjData(null);
    }
  }, [cnpj]);

  async function fetchCnpjData(digits: string) {
    setCnpjLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("fetch-cnpj", {
        body: { cnpj: digits },
      });
      if (fnErr) throw fnErr;
      if (data?.error) {
        // API failed, allow manual entry
        return;
      }
      setCnpjData({
        razao_social: data.razao_social || "",
        nome_fantasia: data.nome_fantasia || "",
        logradouro: data.logradouro || "",
        numero: data.numero || "",
        bairro: data.bairro || "",
        municipio: data.municipio || "",
        uf: data.uf || "",
        cnae_fiscal_descricao: data.cnae_fiscal_descricao || "",
      });
    } catch {
      // fetch-cnpj may fail - not blocking
    } finally {
      setCnpjLoading(false);
    }
  }

  function handleCnpjChange(value: string) {
    setCnpj(formatCnpj(value));
  }

  async function handleFinalize() {
    setStep(4);
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        token,
        password,
        full_name: fullName.trim(),
      };
      if (!isDemo) {
        payload.cnpj = cnpj;
        if (cnpjData) {
          payload.dados_receita = cnpjData;
        }
      }

      const { data, error: fnErr } = await supabase.functions.invoke("accept-empresa-invite", {
        body: payload,
      });

      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);

      setStep(5);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message || "Erro ao finalizar.", variant: "destructive" });
      setStep(isDemo ? 2 : 3);
    } finally {
      setLoading(false);
    }
  }

  function canProceedAccount() {
    return fullName.trim().length >= 2 && password.length >= 6 && password === confirmPassword;
  }

  function canProceedCnpj() {
    return cnpjValid === true;
  }

  // Progress
  const currentVisualStep = step <= 1 ? 1 : step >= 4 ? totalSteps : step;
  const progressValue = (currentVisualStep / totalSteps) * 100;

  // Error screen
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="text-xl font-semibold">Convite Inválido</h2>
            <p className="text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => navigate("/auth")}>Ir para Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading
  if (step === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Orbit</CardTitle>
          <CardDescription>
            {step < 4 && `Passo ${currentVisualStep} de ${totalSteps}`}
            {step === 4 && "Finalizando..."}
            {step === 5 && "Concluído!"}
          </CardDescription>
          {step < 5 && <Progress value={progressValue} className="h-2" />}
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Step 1: Welcome */}
          {step === 1 && invite && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="text-sm text-muted-foreground">Empresa</p>
                <p className="font-medium">{invite.empresa_nome}</p>
                <p className="text-sm text-muted-foreground">Plano</p>
                <p className="font-medium">{invite.plan_name}</p>
                <p className="text-sm text-muted-foreground">Responsável</p>
                <p className="font-medium">{invite.responsible_email}</p>
              </div>
              <Button className="w-full" onClick={() => setStep(2)}>
                <User className="mr-2 h-4 w-4" />
                Criar Minha Conta
              </Button>
            </div>
          )}

          {/* Step 2: Account Creation */}
          {step === 2 && invite && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input value={invite.responsible_email} readOnly className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>Nome completo</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Seu nome" />
              </div>
              <div className="space-y-2">
                <Label>Senha</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </div>
              <div className="space-y-2">
                <Label>Confirmar senha</Label>
                <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repita a senha" />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-sm text-destructive">As senhas não coincidem</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
                <Button
                  className="flex-1"
                  disabled={!canProceedAccount()}
                  onClick={() => isDemo ? handleFinalize() : setStep(3)}
                >
                  {isDemo ? (
                    <>Entrar na Demo</>
                  ) : (
                    <>
                      <KeyRound className="mr-2 h-4 w-4" />
                      Próximo
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: CNPJ (non-demo) */}
          {step === 3 && !isDemo && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>CNPJ</Label>
                <div className="relative">
                  <Input
                    value={cnpj}
                    onChange={e => handleCnpjChange(e.target.value)}
                    placeholder="XX.XXX.XXX/XXXX-XX"
                    maxLength={18}
                  />
                  {cnpjLoading && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                  {cnpjValid === true && !cnpjLoading && <CheckCircle2 className="absolute right-3 top-2.5 h-4 w-4 text-primary" />}
                  {cnpjValid === false && <XCircle className="absolute right-3 top-2.5 h-4 w-4 text-destructive" />}
                </div>
                {cnpjValid === false && <p className="text-sm text-destructive">CNPJ inválido</p>}
              </div>

              {cnpjData && (
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Razão Social: </span>
                    <span className="font-medium">{cnpjData.razao_social}</span>
                  </div>
                  {cnpjData.nome_fantasia && (
                    <div>
                      <span className="text-muted-foreground">Nome Fantasia: </span>
                      <span className="font-medium">{cnpjData.nome_fantasia}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Endereço: </span>
                    <span className="font-medium">
                      {[cnpjData.logradouro, cnpjData.numero, cnpjData.bairro, cnpjData.municipio, cnpjData.uf].filter(Boolean).join(", ")}
                    </span>
                  </div>
                  {cnpjData.cnae_fiscal_descricao && (
                    <div>
                      <span className="text-muted-foreground">CNAE: </span>
                      <span className="font-medium">{cnpjData.cnae_fiscal_descricao}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>Voltar</Button>
                <Button className="flex-1" disabled={!canProceedCnpj()} onClick={handleFinalize}>
                  Finalizar Ativação
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Finalizing */}
          {step === 4 && (
            <div className="text-center space-y-4 py-8">
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
              <p className="text-muted-foreground">Ativando sua empresa...</p>
            </div>
          )}

          {/* Step 5: Done */}
          {step === 5 && (
            <div className="text-center space-y-4 py-4">
              <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
              <h3 className="text-lg font-semibold">Conta ativada com sucesso!</h3>
              <p className="text-muted-foreground">
                Sua empresa está pronta. Faça login para começar.
              </p>
              <Button className="w-full" onClick={() => navigate("/auth")}>
                Ir para Login
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
