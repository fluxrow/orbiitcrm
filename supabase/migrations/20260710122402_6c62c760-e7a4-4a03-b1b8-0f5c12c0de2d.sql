REVOKE ALL ON FUNCTION public.advisor_apply_gate(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advisor_apply_gate(uuid, text, uuid) TO authenticated, service_role;