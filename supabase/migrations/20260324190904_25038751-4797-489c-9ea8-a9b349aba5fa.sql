ALTER TABLE pe_users
  ADD COLUMN IF NOT EXISTS signature_image_url text,
  ADD COLUMN IF NOT EXISTS use_personal_signature boolean DEFAULT false;