import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";
import { getSystemEmailConfig } from "../_shared/system-email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return fail(ErrorCodes.UNAUTHORIZED, "Missing authorization", 401);

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) return fail(ErrorCodes.UNAUTHORIZED, "Unauthorized", 401);

    const { data: peUser } = await supabaseAdmin.from("pe_users").select("*, pe_roles(code)").eq("id", user.id).single();
    if (!peUser) return fail(ErrorCodes.FORBIDDEN, "User not found in pe_users", 403);

    const { organization_id, email, role_code, full_name, phone } = await req.json();

    const isSuperAdmin = peUser.is_super_admin;
    const isOrgAdmin = !isSuperAdmin && peUser.pe_roles?.code === "ORG_ADMIN" && peUser.organization_id === organization_id;
    if (!isSuperAdmin && !isOrgAdmin) return fail(ErrorCodes.FORBIDDEN, "Insufficient permissions", 403);

    const { data: role } = await supabaseAdmin.from("pe_roles").select("id, name").eq("code", role_code).single();
    if (!role) return fail(ErrorCodes.VALIDATION_ERROR, "Invalid role_code");

    const token = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invitation, error: invError } = await supabaseAdmin.from("pe_invitations").insert({
      organization_id, email: email.toLowerCase().trim(), role_id: role.id,
      token, status: "pending", expires_at, invited_by_user_id: user.id,
    }).select().single();

    if (invError) return fail(ErrorCodes.INTERNAL_ERROR, invError.message, 500);

    // ── Fetch org name ──
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("name")
      .eq("id", organization_id)
      .single();
    const orgName = org?.name || "Organização";

    // ── Send invitation email via Resend ──
    let emailSent = false;
    let emailError: string | null = null;

    try {
      const { apiKey: resendApiKey, fromEmail } = await getSystemEmailConfig(supabaseAdmin);

      if (resendApiKey) {
        const appUrl = Deno.env.get("APP_URL") || "https://orbit.fluxrow.pro";
        const inviteLink = `${appUrl}/accept-invite-pe/${token}`;

        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [email.toLowerCase().trim()],
            subject: `Convite para ${orgName}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 40px 20px;">
                <h1 style="color: #333; font-size: 24px; margin-bottom: 16px;">Você foi convidado!</h1>
                <p style="color: #555; font-size: 16px; line-height: 1.6;">
                  Você foi convidado para participar da organização <strong>${orgName}</strong> como <strong>${role.name || role_code}</strong>.
                </p>
                <p style="color: #555; font-size: 16px; line-height: 1.6;">
                  Clique no botão abaixo para aceitar o convite e configurar sua conta:
                </p>
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${inviteLink}" 
                     style="background-color: #2563eb; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">
                    Aceitar Convite
                  </a>
                </div>
                <p style="color: #888; font-size: 13px; line-height: 1.5;">
                  Ou copie e cole este link no navegador:<br/>
                  <a href="${inviteLink}" style="color: #2563eb; word-break: break-all;">${inviteLink}</a>
                </p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                <p style="color: #999; font-size: 12px;">
                  Este convite expira em 7 dias. Se você não reconhece este convite, ignore este email.
                </p>
              </div>
            `,
          }),
        });

        if (emailResponse.ok) {
          emailSent = true;
          console.log("[invite-org-user] Email sent to", email);
        } else {
          const errBody = await emailResponse.json();
          emailError = errBody.message || "Resend error";
          console.error("[invite-org-user] Resend error:", errBody);
        }
      } else {
        emailError = "Resend API key not configured";
        console.warn("[invite-org-user] No Resend API key, skipping email");
      }
    } catch (err) {
      emailError = err.message;
      console.error("[invite-org-user] Email send error:", err);
    }

    // ── Audit log ──
    await supabaseAdmin.from("pe_audit_log").insert({
      organization_id, actor_user_id: user.id, action: "INVITE_SENT",
      entity_type: "invitation", entity_id: invitation.id,
      metadata: { email, role_code, full_name, phone, email_sent: emailSent, email_error: emailError },
    });

    return ok({ invitation, token, email_sent: emailSent });
  } catch (err) {
    return fail(ErrorCodes.INTERNAL_ERROR, err.message, 500);
  }
});
