-- Add whatsapp and whatsapp_status columns
ALTER TABLE orbit_prospects
  ADD COLUMN whatsapp text,
  ADD COLUMN whatsapp_status text NOT NULL DEFAULT 'nao_verificado';

-- Migrate existing data: if telefone_whatsapp has 11 digits, copy to whatsapp
UPDATE orbit_prospects
SET whatsapp = telefone_whatsapp,
    whatsapp_status = 'nao_verificado'
WHERE whatsapp IS NULL
  AND telefone_whatsapp IS NOT NULL
  AND length(regexp_replace(telefone_whatsapp, '[^0-9]', '', 'g')) = 11;

-- Rename telefone_whatsapp to telefone for semantic clarity
ALTER TABLE orbit_prospects RENAME COLUMN telefone_whatsapp TO telefone;