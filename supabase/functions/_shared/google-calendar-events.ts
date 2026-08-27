const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export async function addCalendarEventAttendee(
  accessToken: string,
  calendarId: string,
  eventId: string,
  attendeeEmail: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ invited: boolean; alreadyPresent: boolean }> {
  const eventUrl = `${GOOGLE_CALENDAR_API}/calendars/${
    encodeURIComponent(calendarId)
  }/events/${encodeURIComponent(eventId)}`;
  const normalizedEmail = attendeeEmail.trim().toLowerCase();

  for (let attempt = 0; attempt < 2; attempt++) {
    const currentResponse = await fetchImpl(eventUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!currentResponse.ok) {
      throw new Error(
        `getEvent failed: ${currentResponse.status} ${await currentResponse
          .text()}`,
      );
    }
    const current = await currentResponse.json() as {
      etag?: string;
      attendees?: Array<{ email?: string; [key: string]: unknown }>;
    };
    const attendees = current.attendees || [];
    if (
      attendees.some((attendee) =>
        attendee.email?.trim().toLowerCase() === normalizedEmail
      )
    ) {
      return { invited: false, alreadyPresent: true };
    }

    const patchResponse = await fetchImpl(`${eventUrl}?sendUpdates=all`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(current.etag ? { "If-Match": current.etag } : {}),
      },
      body: JSON.stringify({
        attendees: [...attendees, { email: normalizedEmail }],
      }),
    });
    if (patchResponse.ok) return { invited: true, alreadyPresent: false };
    if (patchResponse.status === 412 && attempt === 0) continue;
    throw new Error(
      `patchEvent failed: ${patchResponse.status} ${await patchResponse
        .text()}`,
    );
  }
  throw new Error("patchEvent failed: concurrent_update");
}
