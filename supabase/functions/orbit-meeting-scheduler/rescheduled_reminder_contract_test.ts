import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("meeting scheduler includes rescheduled meetings in every reminder window", () => {
  const regularWindow = source.slice(
    source.indexOf("async function emitForWindow"),
    source.indexOf("async function emitViverMorning"),
  );
  assertStringIncludes(regularWindow, '.in("status", ["scheduled", "rescheduled"])');
  assert(!regularWindow.includes('.eq("status", "scheduled")'));
});
