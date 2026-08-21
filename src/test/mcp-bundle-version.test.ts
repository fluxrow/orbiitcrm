import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const packageLock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
const bunLock = readFileSync(resolve(root, "bun.lock"), "utf8");
const bundle = readFileSync(resolve(root, "supabase/functions/mcp/index.ts"), "utf8");

describe("MCP bundle dependency", () => {
  it("pins the same reviewed mcp-js version in every runtime artifact", () => {
    const expected = "0.20.1";
    expect(packageJson.dependencies["@lovable.dev/mcp-js"]).toBe(expected);
    expect(packageLock.packages[""].dependencies["@lovable.dev/mcp-js"]).toBe(expected);
    expect(packageLock.packages["node_modules/@lovable.dev/mcp-js"].version).toBe(expected);
    expect(bunLock).toContain(`"@lovable.dev/mcp-js": "${expected}"`);
    expect(bunLock).toContain(`@lovable.dev/mcp-js@${expected}`);
    expect(bundle).toContain(`npm:@lovable.dev/mcp-js@${expected}`);
    expect(bundle).not.toContain("npm:@lovable.dev/mcp-js@0.20.0");
  });
});
