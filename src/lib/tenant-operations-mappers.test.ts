import { describe, expect, it } from "vitest";
import { mapTenantOperationsPayload } from "./tenant-operations-mappers";

const aggregate = {
  ok: true,
  data: {
    overall_status: "healthy",
    generated_at: "2026-08-20T12:00:00Z",
    ai_handoff: { ai_active: 34, human_takeover: 7, awaiting_human: 2 },
    agenda: { connected: true, timezone: "America/Sao_Paulo", min_notice_hours: 1, max_future_days: 60 },
    queue: { pending_count: 3, processing_count: 2, failed_count: 1, pending_over_24h: 2, paused: true },
    whatsapp: { connected: true, envio_real_liberado: false, queue_enabled: true, credentials_valid: true },
    media: { total_storage_mb: 12.5, media_count: 9 },
  },
};

describe("mapTenantOperationsPayload", () => {
  it("normaliza os nós do contrato agregador para os DTOs dos cartões", () => {
    expect(mapTenantOperationsPayload("ai_handoff", aggregate).counts).toMatchObject({ ai_active: 34, human_owned: 7, awaiting_human: 2 });
    expect(mapTenantOperationsPayload("agenda", aggregate)).toMatchObject({ connected: true, booking_min_notice_minutes: 60, booking_max_horizon_days: 60 });
    expect(mapTenantOperationsPayload("queues", aggregate).counts).toMatchObject({ pending: 3, processing: 2, failed: 1 });
    expect(mapTenantOperationsPayload("queues", aggregate)).toMatchObject({ paused: true, age_buckets: { over_24h: 2 } });
    expect(mapTenantOperationsPayload("whatsapp", aggregate)).toMatchObject({ active: true, real_send_enabled: false, credentials: { valid: true }, sending_policy: { queue_enabled: true } });
    expect(mapTenantOperationsPayload("media", aggregate)).toMatchObject({ total_storage_mb: 12.5, counts: { active: 9 } });
  });

  it("mantém compatibilidade com respostas diretas por seção", () => {
    expect(mapTenantOperationsPayload("ai_handoff", { ok: true, data: { counts: { ai_active: 5, human_owned: 4 } } }).counts)
      .toMatchObject({ ai_active: 5, human_owned: 4 });
  });

  it("propaga o erro padronizado da RPC", () => {
    expect(() => mapTenantOperationsPayload("agenda", { ok: false, error: { code: "FORBIDDEN", message: "Acesso negado" } }))
      .toThrow("Acesso negado");
  });
});
