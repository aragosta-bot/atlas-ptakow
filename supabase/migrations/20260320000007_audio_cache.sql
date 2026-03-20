CREATE TABLE IF NOT EXISTS public.bird_audio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bird_name TEXT NOT NULL,
  audience TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (bird_name, audience)
);
ALTER TABLE public.bird_audio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_audio" ON public.bird_audio FOR SELECT USING (true);
CREATE POLICY "service_write_audio" ON public.bird_audio FOR ALL USING (true);
