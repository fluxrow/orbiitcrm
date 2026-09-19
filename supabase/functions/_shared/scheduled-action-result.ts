export type ScheduledActionResult = "success" | "skipped" | "error";

export function classifyScheduledActionResult(
  httpOk: boolean,
  response: Record<string, unknown> | null | undefined,
): ScheduledActionResult {
  const data = response?.data as Record<string, unknown> | null | undefined;
  const ok = httpOk && (response?.ok === true || data?.ok === true);
  if (!ok) return "error";
  const output = data?.output as Record<string, unknown> | null | undefined;
  if (data?.skipped === true ||
    output?.skipped === true ||
    (output?.adapter === true && output?.queued === false && !output?.outbox_id)) {
    return "skipped";
  }
  return "success";
}
