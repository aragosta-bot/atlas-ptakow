CREATE TABLE public.bird_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bird_name TEXT NOT NULL,
  latin_name TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('przedszkolak', 'szkolny', 'dorosly')),
  description TEXT,
  audio_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (bird_name, audience)
);
ALTER TABLE public.bird_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON public.bird_content FOR SELECT USING (true);
CREATE POLICY "service_write" ON public.bird_content FOR ALL USING (true);
