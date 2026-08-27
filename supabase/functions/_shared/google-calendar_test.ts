import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { addCalendarEventAttendee } from "./google-calendar-events.ts";

Deno.test("convite Google é idempotente quando participante já existe", async () => {
  let calls = 0;
  const fakeFetch: typeof fetch = ((_: RequestInfo | URL, __?: RequestInit) => {
    calls++;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          etag: '"v1"',
          attendees: [{ email: "lead@example.com" }],
        }),
        { status: 200 },
      ),
    );
  }) as typeof fetch;
  assertEquals(
    await addCalendarEventAttendee(
      "token",
      "calendar",
      "event",
      "LEAD@example.com",
      fakeFetch,
    ),
    { invited: false, alreadyPresent: true },
  );
  assertEquals(calls, 1);
});

Deno.test("convite Google preserva participantes e usa atualização com etag", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch =
    ((url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      if (!init?.method) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              etag: '"v7"',
              attendees: [{
                email: "existing@example.com",
                responseStatus: "accepted",
              }],
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as typeof fetch;

  assertEquals(
    await addCalendarEventAttendee(
      "token",
      "calendar",
      "event",
      "new@example.com",
      fakeFetch,
    ),
    { invited: true, alreadyPresent: false },
  );
  assertEquals(requests[1].init?.method, "PATCH");
  assertEquals(
    (requests[1].init?.headers as Record<string, string>)["If-Match"],
    '"v7"',
  );
  assertEquals(JSON.parse(String(requests[1].init?.body)), {
    attendees: [
      { email: "existing@example.com", responseStatus: "accepted" },
      { email: "new@example.com" },
    ],
  });
});
