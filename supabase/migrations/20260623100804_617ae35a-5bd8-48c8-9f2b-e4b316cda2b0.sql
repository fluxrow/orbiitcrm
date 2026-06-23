ALTER TABLE public.orbit_campaign_recipients REPLICA IDENTITY FULL;
ALTER TABLE public.orbit_campaigns REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orbit_campaign_recipients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orbit_campaigns;