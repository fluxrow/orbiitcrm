import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const agent = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/functions/orbit-ai-agent/index.ts"),
  "utf8",
);
const guard = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/functions/_shared/bullink-conversation-guard.ts",
  ),
  "utf8",
);
const architecture = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "docs/architecture/BULLINK_DETERMINISTIC_CHECKOUT_V2.md",
  ),
  "utf8",
);

describe("Bullink deterministic checkout wiring", () => {
  it("publishes a distinct observable runtime version", () => {
    expect(agent).toContain("2026-08-31-bullink-primary-offer-v3");
    expect(agent).toContain(
      "agent_runtime_version: ORBIT_AI_AGENT_RUNTIME_VERSION",
    );
  });

  it("keeps checkout with the AI while still notifying commercial intent", () => {
    expect(agent).toContain("bullinkVerifiedPurchaseIntent");
    expect(agent).toContain("deferBullinkCheckoutHandoff");
    expect(agent).toMatch(
      /isHandoff\s*=\s*isCommercialSignal\s*&&\s*!suppressHandoff\s*&&\s*!deferBullinkCheckoutHandoff/,
    );
    expect(agent).toContain('classification: notificationPolicy.classification');
    expect(agent).toContain("resolveCommercialNotificationPolicy");
  });

  it("passes only configured payment details into the final tenant guard", () => {
    expect(agent).toContain("readBullinkOfficialPixKey(aiConfig");
    expect(agent).toContain("readBullinkOfficialCardUrl(aiConfig");
    expect(agent).toContain("officialPixKey: bullinkOfficialPixKey");
    expect(agent).toContain("officialCardUrl: bullinkOfficialCardUrl");
    expect(guard).toContain("https:\\/\\/link\\.infinitepay\\.io");
    expect(guard).not.toContain("VC1D-JKIVWAm1tg-6500,00");
  });

  it("documents the fail-closed and receipt-handoff contract before code", () => {
    expect(architecture).toContain("on_acceptance: false");
    expect(architecture).toContain("on_payment_method: false");
    expect(architecture).toContain("on_receipt: true");
    expect(architecture).toMatch(/falha\s+fechado/);
  });
});
