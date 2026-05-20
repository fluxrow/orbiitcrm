import { describe, expect, it } from "vitest";
import { getNextOrbitTheme, normalizeOrbitTheme } from "@/lib/theme";

describe("orbit theme smoke", () => {
  it("keeps dark as the safe default when theme is missing or unknown", () => {
    expect(normalizeOrbitTheme(undefined)).toBe("dark");
    expect(normalizeOrbitTheme(null)).toBe("dark");
    expect(normalizeOrbitTheme("system")).toBe("dark");
  });

  it("toggles cleanly between dark and light", () => {
    expect(getNextOrbitTheme("dark")).toBe("light");
    expect(getNextOrbitTheme("light")).toBe("dark");
  });
});
