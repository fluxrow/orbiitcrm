import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideAutomaticReplyOwnership } from "./conversation-ownership.ts";

const EMP = "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18";

Deno.test("posse IA permite resposta", () => {
  assertEquals(
    decideAutomaticReplyOwnership({ id: "c1", empresa_id: EMP, human_talk: false, human_user_id: null }, EMP),
    { allowed: true, reason: "ai_owned" },
  );
});

Deno.test("human_talk bloqueia todos os caminhos automáticos", () => {
  assertEquals(
    decideAutomaticReplyOwnership({ id: "c1", empresa_id: EMP, human_talk: true, human_user_id: null }, EMP),
    { allowed: false, reason: "human_handoff" },
  );
});

Deno.test("human_user_id bloqueia mesmo com human_talk falso", () => {
  assertEquals(
    decideAutomaticReplyOwnership({ id: "c1", empresa_id: EMP, human_talk: false, human_user_id: "u1" }, EMP),
    { allowed: false, reason: "human_handoff" },
  );
});

Deno.test("conversa ausente e cross-tenant falham fechados", () => {
  assertEquals(decideAutomaticReplyOwnership(null, EMP), { allowed: false, reason: "conversation_missing" });
  assertEquals(
    decideAutomaticReplyOwnership({ id: "c1", empresa_id: "outro", human_talk: false }, EMP),
    { allowed: false, reason: "cross_tenant" },
  );
});
