import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/pages/public/ClientOnboardingPage.tsx"), "utf8");

describe("public onboarding autosave contract", () => {
  it("debounces writes and tracks the confirmed snapshot", () => {
    expect(source).toContain("window.setTimeout(async () =>");
    expect(source).toContain("}, 1500)");
    expect(source).toContain("lastSavedSnapshotRef.current = snapshotToSave");
  });

  it("protects navigation while data or uploads are pending", () => {
    expect(source).toContain('window.addEventListener("beforeunload"');
    expect(source).toContain("!hasUnsavedChanges && !hasUploading");
  });

  it("does not advance to the next section after a failed save", () => {
    expect(source).toContain("const saved = await persist()");
    expect(source).toContain("if (saved && stepIdx < total - 1)");
  });
});
