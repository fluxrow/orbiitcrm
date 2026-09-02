export interface MediaProcessorAuthInput {
  authorization: string;
  serviceRoleKey: string;
  schedulerToken: string;
  dryRun: boolean;
}

export function authorizeMediaProcessor(
  input: MediaProcessorAuthInput,
): boolean {
  const bearer = input.authorization.startsWith("Bearer ")
    ? input.authorization.slice("Bearer ".length)
    : "";

  if (input.serviceRoleKey && bearer === input.serviceRoleKey) return true;

  return input.dryRun && !!input.schedulerToken &&
    bearer === input.schedulerToken;
}
