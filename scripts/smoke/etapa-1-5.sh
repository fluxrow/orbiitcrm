#!/usr/bin/env bash
# Smoke test automatizado — Etapa 1.5 (Pipeline + agente cria deal).
# Requer PG* env vars (psql managed access). Roda apenas SELECT/INSERT/DELETE em dados de teste.
#
# Uso: bash scripts/smoke/etapa-1-5.sh
set -euo pipefail

if [ -z "${PGHOST:-}" ]; then
  echo "✗ PGHOST não setado — execute em ambiente com acesso Supabase gerenciado."
  exit 2
fi

PASS=0
FAIL=0
FAILED_CHECKS=()

check() {
  local name="$1"; shift
  local expected="$1"; shift
  local got
  got="$(psql -tAX -c "$*" | tr -d '[:space:]')"
  if [ "$got" = "$expected" ]; then
    echo "  ✓ $name"
    PASS=$((PASS+1))
  else
    echo "  ✗ $name  (esperado=$expected, obtido=$got)"
    FAIL=$((FAIL+1))
    FAILED_CHECKS+=("$name")
  fi
}

EMPRESA_ID="36f26579-66ad-4ef1-9788-141e4c727232" # Viver Semijoias
TEST_PHONE="55119$(date +%s | tail -c 8)"
TEST_NAME="SMOKE TEST $(date +%s)"

echo "── T1: seed de pipelines ───────────────────────────────────"
check "Toda empresa tem >=6 etapas" "0" \
  "SELECT count(*) FROM orbit_empresas e WHERE (SELECT count(*) FROM orbit_pipeline_stages s WHERE s.empresa_id=e.id) < 6;"
check "Toda empresa tem etapa won" "0" \
  "SELECT count(*) FROM orbit_empresas e WHERE NOT EXISTS (SELECT 1 FROM orbit_pipeline_stages s WHERE s.empresa_id=e.id AND s.is_won);"
check "Toda empresa tem etapa lost" "0" \
  "SELECT count(*) FROM orbit_empresas e WHERE NOT EXISTS (SELECT 1 FROM orbit_pipeline_stages s WHERE s.empresa_id=e.id AND s.is_lost);"

echo "── T2 + T3: ensure_deal_for_prospect + evento IA ───────────"
PROSPECT_ID=$(psql -tAX -c "INSERT INTO orbit_prospects(empresa_id, nome_razao, telefone, whatsapp, status_qualificacao, origem_contato)
  VALUES ('$EMPRESA_ID', '$TEST_NAME', '$TEST_PHONE', '$TEST_PHONE', 'novo', 'PROSPECTS') RETURNING id;" | tr -d '[:space:]')
echo "  · prospect de teste: $PROSPECT_ID"

DEAL_ID_1=$(psql -tAX -c "SELECT ensure_deal_for_prospect('$PROSPECT_ID'::uuid);" | tr -d '[:space:]')
DEAL_ID_2=$(psql -tAX -c "SELECT ensure_deal_for_prospect('$PROSPECT_ID'::uuid);" | tr -d '[:space:]')

check "ensure_deal_for_prospect retorna deal_id" "1" \
  "SELECT (length('$DEAL_ID_1') > 30)::int;"
check "Idempotente (mesma chamada → mesmo deal)" "1" \
  "SELECT ('$DEAL_ID_1' = '$DEAL_ID_2')::int;"
check "Deal criado com origem=auto_agent" "1" \
  "SELECT count(*) FROM orbit_deals WHERE id='$DEAL_ID_1' AND origem='auto_agent' AND status='open';"
check "Deal na etapa default" "1" \
  "SELECT count(*) FROM orbit_deals d JOIN orbit_pipeline_stages s ON s.id=d.etapa_id
   WHERE d.id='$DEAL_ID_1' AND s.is_default;"

psql -q -c "UPDATE orbit_prospects SET status_qualificacao='qualificado' WHERE id='$PROSPECT_ID';"
psql -q -c "INSERT INTO prospect_events(empresa_id, prospect_id, event_type, titulo, descricao)
  VALUES ('$EMPRESA_ID', '$PROSPECT_ID', 'deal_created_by_ai', 'Lead movido para o funil pela IA', 'smoke');"
check "Evento deal_created_by_ai registrado" "1" \
  "SELECT count(*) FROM prospect_events WHERE prospect_id='$PROSPECT_ID' AND event_type='deal_created_by_ai';"

echo "── T4: saúde do webhook (proxy) ────────────────────────────"
check "Existem prospects com whatsapp populado" "1" \
  "SELECT (count(*) > 0)::int FROM orbit_prospects WHERE whatsapp IS NOT NULL;"

echo "── cleanup ─────────────────────────────────────────────────"
psql -q -c "DELETE FROM prospect_events WHERE prospect_id='$PROSPECT_ID';"
psql -q -c "DELETE FROM orbit_deals WHERE prospect_id='$PROSPECT_ID';"
psql -q -c "DELETE FROM orbit_prospects WHERE id='$PROSPECT_ID';"
echo "  · prospect e deal de teste removidos"

echo
echo "Resultado: $PASS passaram, $FAIL falharam."
if [ $FAIL -gt 0 ]; then
  printf '  - %s\n' "${FAILED_CHECKS[@]}"
  exit 1
fi
