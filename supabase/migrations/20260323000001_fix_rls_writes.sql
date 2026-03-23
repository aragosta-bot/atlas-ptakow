-- Fix: restrict all write operations to service_role only
-- bird_content
DROP POLICY IF EXISTS "service_write" ON public.bird_content;
CREATE POLICY "service_write" ON public.bird_content
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_update" ON public.bird_content
  FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY "service_delete" ON public.bird_content
  FOR DELETE USING (auth.role() = 'service_role');

-- bird_audio  
DROP POLICY IF EXISTS "service_write_audio" ON public.bird_audio;
CREATE POLICY "service_write_audio" ON public.bird_audio
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_update_audio" ON public.bird_audio
  FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY "service_delete_audio" ON public.bird_audio
  FOR DELETE USING (auth.role() = 'service_role');
