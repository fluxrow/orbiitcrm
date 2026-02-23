

# Etapa SAAS-6 -- Demo Sandbox ✅ COMPLETED

All items implemented:

1. **sandbox:true** added to demo plan features ✅
2. **AI agent demo mode** — skips Z-API, saves as `status='simulated'` ✅
3. **Webhook empresa_id isolation** — resolves empresa from `orbit_zapi_config`, sets on prospects/conversas ✅
4. **Webhook prospect limit** — checks `max_prospects` before creating new prospects ✅
5. **AI config filtered by empresa_id** — both webhook and AI agent now filter by empresa_id ✅
6. **Demo rate limit** — 30 OUT messages/hour enforced in `orbit-send-message` ✅
7. **UI config blocking** — all Z-API + Email fields disabled for demo ✅
8. **DEMO_RATE_LIMIT** added to PlanLimitDialog + plan-errors ✅
9. **Edge functions deployed** — orbit-ai-agent, orbit-webhook, orbit-send-message ✅
