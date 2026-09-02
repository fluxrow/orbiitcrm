import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authorizeMediaProcessor } from "./internal-auth.ts";

Deno.test("accepts the service role for live processing", () => {
  assertEquals(
    authorizeMediaProcessor({
      authorization: "Bearer service-key",
      serviceRoleKey: "service-key",
      schedulerToken: "scheduler-key",
      dryRun: false,
    }),
    true,
  );
});

Deno.test("accepts the scheduler token only for dry runs", () => {
  assertEquals(
    authorizeMediaProcessor({
      authorization: "Bearer scheduler-key",
      serviceRoleKey: "service-key",
      schedulerToken: "scheduler-key",
      dryRun: true,
    }),
    true,
  );
  assertEquals(
    authorizeMediaProcessor({
      authorization: "Bearer scheduler-key",
      serviceRoleKey: "service-key",
      schedulerToken: "scheduler-key",
      dryRun: false,
    }),
    false,
  );
});

Deno.test("rejects missing or unknown credentials", () => {
  for (const authorization of ["", "Bearer unknown"]) {
    assertEquals(
      authorizeMediaProcessor({
        authorization,
        serviceRoleKey: "service-key",
        schedulerToken: "scheduler-key",
        dryRun: true,
      }),
      false,
    );
  }
});
