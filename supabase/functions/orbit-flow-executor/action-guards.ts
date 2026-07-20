// Guards genéricos para actions do orbit-flow-executor.
// Extraído do index.ts para permitir testes unitários sem inicializar
// clientes Supabase nem o servidor Deno.serve().

export type Json = any;

/**
 * Retorna true quando a action deve ser pulada pelo executor.
 * Convenção: `action_config.enabled === false` desativa a action de forma
 * genérica e auditável. Ausência do campo ou `true` mantém comportamento normal.
 *
 * Regras aplicadas pelo executor quando esta função retorna true:
 *  - NÃO chama runAction (nenhum efeito colateral: Z-API, outbox, mensagens, RPC).
 *  - NÃO enfileira scheduled action (mesmo com delay_seconds > 30).
 *  - Marca o step como `success` com output
 *    `{ skipped: true, reason: "action_disabled", action_type }` para auditoria.
 */
export function isActionDisabled(cfg: Json): boolean {
  return !!cfg && cfg.enabled === false;
}
