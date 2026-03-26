
-- 1. Add UNIQUE constraint on orbit_campaign_recipients(campaign_id, prospect_id)
-- Using a partial unique index to handle nulls properly
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_campaign_prospect 
ON public.orbit_campaign_recipients(campaign_id, prospect_id) 
WHERE campaign_id IS NOT NULL AND prospect_id IS NOT NULL;

-- 2. Add canal column to orbit_email_events
ALTER TABLE public.orbit_email_events 
ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'email';
