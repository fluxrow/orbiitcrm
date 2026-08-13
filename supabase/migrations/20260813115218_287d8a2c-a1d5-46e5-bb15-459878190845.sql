REVOKE ALL ON FUNCTION public.orbit_zapi_connection_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_zapi_connection_status(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.orbit_prospect_tags_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orbit_prospect_tags_guard() TO service_role;