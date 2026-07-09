import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, X, Mail, Phone, User, Briefcase, Image } from "lucide-react";
import { useSignedOrbitMediaUrl } from "@/lib/orbit-media";

interface UserProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ACCEPTED_FORMATS = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export function UserProfileDialog({ open, onOpenChange }: UserProfileDialogProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    whatsapp: "",
    cargo: "",
    email_signature: "",
    signature_image_url: "",
    use_personal_signature: false,
  });

  const userEmail = user?.email || "";

  useEffect(() => {
    if (open && user?.id) {
      supabase
        .from("pe_users" as any)
        .select("full_name, phone, whatsapp, cargo, email_signature, signature_image_url, use_personal_signature")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setForm({
              full_name: (data as any).full_name || "",
              phone: (data as any).phone || "",
              whatsapp: (data as any).whatsapp || "",
              cargo: (data as any).cargo || "",
              email_signature: (data as any).email_signature || "",
              signature_image_url: (data as any).signature_image_url || "",
              use_personal_signature: (data as any).use_personal_signature || false,
            });
          }
        });
    }
  }, [open, user?.id]);

  const handleUploadImage = async (file: File) => {
    if (!user?.id) return;
    if (!ACCEPTED_FORMATS.includes(file.type)) {
      toast.error("Formato não suportado. Use PNG, JPG ou WebP.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Arquivo muito grande. Máximo 2MB.");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      // empresa_id resolvido server-side (profile) — sem input do usuário no path.
      const { data: prof } = await supabase
        .from("profiles")
        .select("empresa_id")
        .eq("id", user.id)
        .maybeSingle();
      const empresaId = (prof as any)?.empresa_id;
      if (!empresaId) throw new Error("Empresa não identificada.");
      const filePath = `${empresaId}/signatures/${user.id}/signature.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("orbit-media")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("orbit-media")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl + "?t=" + Date.now();
      setForm(prev => ({ ...prev, signature_image_url: publicUrl }));
      toast.success("Imagem carregada com sucesso!");
    } catch (e: any) {
      toast.error("Erro ao fazer upload: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = () => {
    setForm(prev => ({ ...prev, signature_image_url: "" }));
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("pe_users" as any)
        .update({
          full_name: form.full_name,
          phone: form.phone,
          whatsapp: form.whatsapp,
          cargo: form.cargo,
          email_signature: form.email_signature,
          signature_image_url: form.signature_image_url || null,
          use_personal_signature: form.use_personal_signature,
        })
        .eq("id", user.id);
      if (error) throw error;

      await supabase
        .from("profiles")
        .update({
          nome: form.full_name,
          telefone: form.phone,
          cargo: form.cargo,
        })
        .eq("id", user.id);

      qc.invalidateQueries({ queryKey: ["pe-auth"] });
      toast.success("Perfil atualizado com sucesso");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Meu Perfil</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 3456-7890" />
            </div>
            <div>
              <Label>WhatsApp</Label>
              <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="5511999999999" />
            </div>
          </div>
          <div>
            <Label>Cargo</Label>
            <Input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} placeholder="Ex: Gerente Comercial" />
          </div>

          <Separator />

          {/* Email Signature Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Assinatura de E-mail
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Sua assinatura será anexada automaticamente aos e-mails enviados por campanhas.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="use-signature" className="text-xs">Ativar</Label>
                <Switch
                  id="use-signature"
                  checked={form.use_personal_signature}
                  onCheckedChange={(checked) => setForm({ ...form, use_personal_signature: checked })}
                />
              </div>
            </div>

            {form.use_personal_signature && (
              <div className="space-y-4 pl-1">
                {/* Image Upload */}
                <div>
                  <Label className="flex items-center gap-1 mb-2">
                    <Image className="h-3.5 w-3.5" />
                    Imagem da Assinatura
                  </Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Recomendado: largura entre 350-500px. Formatos: PNG, JPG, WebP. Máx: 2MB.
                  </p>

                  {form.signature_image_url ? (
                    <div className="relative inline-block">
                      <img
                        src={form.signature_image_url}
                        alt="Assinatura"
                        className="max-h-24 rounded border object-contain"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        className="absolute -top-2 -right-2 h-6 w-6"
                        onClick={handleRemoveImage}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {uploading ? "Enviando..." : "Carregar Imagem"}
                    </Button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadImage(file);
                      e.target.value = "";
                    }}
                  />
                </div>

                {/* Signature Preview */}
                <div>
                  <Label className="mb-2 block">Preview da Assinatura</Label>
                  <div className="border rounded-lg p-4 bg-muted/30">
                    <div style={{ borderTop: "1px solid hsl(var(--border))", paddingTop: "12px", fontFamily: "Arial, sans-serif" }}>
                      {form.signature_image_url ? (
                        <img
                          src={form.signature_image_url}
                          alt={form.full_name || "Assinatura"}
                          style={{ maxWidth: "400px", width: "100%" }}
                          className="rounded"
                        />
                      ) : (
                        <>
                          {form.full_name && (
                            <p style={{ fontWeight: "bold", fontSize: "14px", margin: "0 0 2px" }}>{form.full_name}</p>
                          )}
                          {form.cargo && (
                            <p style={{ color: "#666", fontSize: "13px", margin: "0 0 2px" }}>{form.cargo}</p>
                          )}
                          {form.phone && (
                            <p style={{ color: "#666", fontSize: "13px", margin: "0 0 2px" }}>
                              <Phone className="inline h-3 w-3 mr-1" />{form.phone}
                            </p>
                          )}
                          {userEmail && (
                            <p style={{ color: "#666", fontSize: "13px", margin: "0 0 2px" }}>
                              <Mail className="inline h-3 w-3 mr-1" />{userEmail}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!form.full_name || loading}>
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
