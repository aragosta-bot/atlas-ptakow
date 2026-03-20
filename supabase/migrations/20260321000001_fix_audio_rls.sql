DROP POLICY IF EXISTS "service_write_audio" ON public.bird_audio;
CREATE POLICY "service_write_audio" ON public.bird_audio FOR ALL USING (true) WITH CHECK (true);
