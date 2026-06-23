ALTER TABLE orbit_ai_config
  ADD COLUMN IF NOT EXISTS tts_ativo       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tts_provider    TEXT    DEFAULT 'elevenlabs'
                                           CHECK (tts_provider IN ('elevenlabs')),
  ADD COLUMN IF NOT EXISTS tts_voice_id    TEXT    DEFAULT 'EXAVITQu4vr4xnSDxMaL',
  ADD COLUMN IF NOT EXISTS tts_modo        TEXT    DEFAULT 'texto'
                                           CHECK (tts_modo IN ('texto', 'audio', 'ambos')),
  ADD COLUMN IF NOT EXISTS tts_api_key     TEXT;