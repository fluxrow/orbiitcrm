import { describe, expect, it } from "vitest";
import { isSafeInternalRedirect } from "./safe-navigation";

describe("isSafeInternalRedirect", () => {
  it.each([
    "/fluxrow/funil",
    "/oauth/consent?client_id=orbit#authorize",
    "/",
  ])("accepts an internal path: %s", (path) => {
    expect(isSafeInternalRedirect(path)).toBe(true);
  });

  it.each([
    null,
    "",
    "https://example.com",
    "//example.com",
    "/%2Fexample.com",
    "/\\example.com",
    "/%5Cexample.com",
    "/%255cexample.com",
    "/safe%0Aunsafe",
    "/%E0%A4%A",
  ])("rejects an unsafe redirect: %s", (path) => {
    expect(isSafeInternalRedirect(path)).toBe(false);
  });
});
