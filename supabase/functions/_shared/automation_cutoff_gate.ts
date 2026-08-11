// Re-export estável do gate de corte de automação por tenant.
// Mantido como módulo separado para deploy das Edge Functions.
export {
  AUTOMATION_CUTOFF_REASON,
  evaluateAutomationCutoff,
  isCreatedAfterCutoff,
  loadAutomationCutoff,
} from "./automation-cutoff.ts";
export type { AutomationCutoffDecision, AutomationCutoffInput } from "./automation-cutoff.ts";
