ALTER TABLE orbit_deals
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS ultima_interacao_at timestamptz,
  ADD COLUMN IF NOT EXISTS documentos_checklist jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS data_conversao timestamptz,
  ADD COLUMN IF NOT EXISTS moved_at timestamptz DEFAULT now();