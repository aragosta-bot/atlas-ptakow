INSERT INTO storage.buckets (id, name, public) VALUES ('bird-audio', 'bird-audio', true);
CREATE POLICY "public_read_audio" ON storage.objects FOR SELECT USING (bucket_id = 'bird-audio');
CREATE POLICY "service_insert_audio" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'bird-audio');
