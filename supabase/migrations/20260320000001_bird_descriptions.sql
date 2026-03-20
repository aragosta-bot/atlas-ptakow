CREATE TABLE public.bird_descriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bird_name TEXT UNIQUE NOT NULL,
  description_child TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.bird_descriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON public.bird_descriptions FOR SELECT USING (true);
CREATE POLICY "service_insert" ON public.bird_descriptions FOR INSERT WITH CHECK (true);
