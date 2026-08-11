CREATE POLICY "Users manage own repair photos"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'repair-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'repair-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Owners read repair photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'repair-photos' AND public.has_role(auth.uid(), 'owner'));